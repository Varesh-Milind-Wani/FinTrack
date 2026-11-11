export interface ExtractedTradeFields {
  instrument?: string;
  strikePrice?: number;
  optionType?: "CE" | "PE";
  expiryDate?: string;
  tradeDate?: string;
  entryPrice?: number;
  exitPrice?: number;
  quantity?: number;
  confidence: "review" | "low";
}

const clean = (value: string) => value.replace(/[₹,]/g, "").trim();
const validDate = (day: number, month: number, year: number) => {
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    : undefined;
};
const monthNumber = (value: string) => {
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const index = months.findIndex((month) => month === value.slice(0, 3).toLowerCase());
  return index < 0 ? undefined : index + 1;
};

/** Conservative extraction: absent or ambiguous values are left for review. */
export const extractTradeFields = (source: string): ExtractedTradeFields => {
  const text = source.replace(/[‐‑‒–—]/g, "-");
  const upper = text.toUpperCase();
  const instrumentMatch = upper.match(/\b(BANK\s*NIFTY|NIFTY\s*BANK|FIN\s*NIFTY|MIDCP\s*NIFTY|NIFTY|SENSEX|BANKEX)\b/);
  const instrument = instrumentMatch?.[1].replace(/\s+/g, " ");
  const optionType = /\bCE\b|\bCALL\b/.test(upper) ? "CE" : /\bPE\b|\bPUT\b/.test(upper) ? "PE" : undefined;
  const afterInstrument = instrumentMatch ? upper.slice(instrumentMatch.index! + instrumentMatch[0].length) : upper;
  const strikeMatch = afterInstrument.match(/\b(\d{4,6})\b/);

  const datePatterns: Array<[RegExp, (match: RegExpMatchArray) => string | undefined]> = [
    [/\b(\d{1,2})[\/-](\d{1,2})[\/-](20\d{2})\b/, (m) => validDate(Number(m[1]), Number(m[2]), Number(m[3]))],
    [/\b(\d{1,2})\s+([A-Z]{3,9})\s+(20\d{2})\b/i, (m) => { const month = monthNumber(m[2]); return month ? validDate(Number(m[1]), month, Number(m[3])) : undefined; }],
    [/\b([A-Z]{3,9})\s+(\d{1,2}),?\s+(20\d{2})\b/i, (m) => { const month = monthNumber(m[1]); return month ? validDate(Number(m[2]), month, Number(m[3])) : undefined; }],
  ];
  const labeledDates = (label: RegExp) => text.split(/\r?\n/).flatMap((line) => {
    if (!label.test(line)) return [];
    return datePatterns.flatMap(([pattern, convert]) => [...line.matchAll(new RegExp(pattern.source, "gi"))]
      .map((match) => convert(match as unknown as RegExpMatchArray)).filter((value): value is string => Boolean(value)));
  });
  const expiryDates = [...new Set(labeledDates(/\b(?:expiry|expiration|exp\.?\s*date)\b/i))];
  const orderDates = [...new Set(labeledDates(/\b(?:order|trade|execution)\s*date\b/i))];

  const quantityMatches = [...text.matchAll(/(?:filled\s*(?:qty|quantity)?|executed\s*(?:qty|quantity)?|qty|quantity)\s*[:#-]?\s*(\d{1,8})\b/gi)].map((match) => Number(match[1]));
  const filledSlash = [...text.matchAll(/\b(\d{1,8})\s*\/\s*\d{1,8}\b/g)].map((match) => Number(match[1]));
  const quantities = [...new Set([...quantityMatches, ...filledSlash].filter((number) => number > 0))];

  const sidePrices = new Map<string, number[]>();
  for (const line of text.split(/\r?\n/)) {
    const side = /\bBUY\b/i.test(line) ? "BUY" : /\bSELL\b/i.test(line) ? "SELL" : null;
    if (!side || /CANCELLED|REJECTED/i.test(line)) continue;
    const labelled = line.match(/(?:avg(?:erage)?\s*(?:exec(?:ution)?\s*)?price|fill(?:ed)?\s*price|price)\s*[:@-]?\s*₹?\s*(\d+(?:\.\d+)?)/i);
    if (labelled) sidePrices.set(side, [...(sidePrices.get(side) ?? []), Number(clean(labelled[1]))]);
  }
  const onePrice = (values?: number[]) => values?.length && new Set(values).size === 1 ? values[0] : undefined;
  const buyPrice = onePrice(sidePrices.get("BUY"));
  const sellPrice = onePrice(sidePrices.get("SELL"));

  const fieldCount = [instrument, optionType, strikeMatch, expiryDates.length === 1, quantities.length === 1, buyPrice, sellPrice].filter(Boolean).length;
  return {
    instrument,
    strikePrice: strikeMatch ? Number(strikeMatch[1]) : undefined,
    optionType,
    expiryDate: expiryDates.length === 1 ? expiryDates[0] : undefined,
    tradeDate: orderDates.length === 1 ? orderDates[0] : undefined,
    entryPrice: buyPrice,
    exitPrice: sellPrice,
    quantity: quantities.length === 1 ? quantities[0] : undefined,
    confidence: fieldCount >= 5 ? "review" : "low",
  };
};
