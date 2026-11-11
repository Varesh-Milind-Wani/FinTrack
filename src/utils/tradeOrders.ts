export interface DetectedOrder {
  id: string;
  source: string;
  raw: string;
  orderId?: string;
  instrument: string;
  strike: string;
  optionType: "CE" | "PE" | "";
  expiry: string;
  date: string;
  side: "BUY" | "SELL";
  status: string;
  filled: string;
  requested: string;
  price: string;
  include: boolean;
  issue: string;
  possibleDuplicateOf?: string;
}

interface OcrWord { text: string; bbox: { x0: number; y0: number; x1: number; y1: number }; }
interface OcrPage { text: string; blocks?: Array<{ paragraphs: Array<{ lines: Array<{ words: OcrWord[] }> }> }> | null; }

/** Rebuild table rows from word coordinates so prices in adjacent OCR blocks remain with the order row. */
export const getOcrLayoutText = (page: OcrPage) => {
  const words = (page.blocks ?? []).flatMap((block) => block.paragraphs.flatMap((paragraph) => paragraph.lines.flatMap((line) => line.words)))
    .filter((word) => word.text.trim())
    .map((word) => ({ ...word, centerY: (word.bbox.y0 + word.bbox.y1) / 2, height: word.bbox.y1 - word.bbox.y0 }));
  if (!words.length) return page.text;
  const ordered = [...words].sort((a, b) => a.centerY - b.centerY || a.bbox.x0 - b.bbox.x0);
  const rows: Array<{ centerY: number; height: number; words: typeof ordered }> = [];
  for (const word of ordered) {
    const maxDistance = Math.max(5, Math.min(18, word.height * 0.55));
    const row = rows.find((candidate) => Math.abs(candidate.centerY - word.centerY) <= maxDistance);
    if (row) {
      row.words.push(word);
      row.centerY = row.words.reduce((total, token) => total + token.centerY, 0) / row.words.length;
      row.height = Math.max(row.height, word.height);
    } else rows.push({ centerY: word.centerY, height: word.height, words: [word] });
  }
  return rows.sort((a, b) => a.centerY - b.centerY)
    .map((row) => row.words.sort((a, b) => a.bbox.x0 - b.bbox.x0).map((word) => word.text).join(" "))
    .join("\n");
};

const toIso = (day: number, month: number, year: number) => {
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` : "";
};

export const getOrderReviewIssue = (order: DetectedOrder) => {
  const filled = Number(order.filled), price = Number(order.price);
  if (/CANCELLED|CANCELED|REJECTED/i.test(order.status) && filled === 0) return "Cancelled or rejected; excluded from executed quantity";
  if (!order.include) return order.possibleDuplicateOf ? "Possible duplicate; excluded until reviewed" : "Excluded by user";
  if (!Number.isInteger(filled) || filled <= 0) return "Filled quantity needs review";
  if (!/^(COMPLETE|COMPLETED|EXECUTED|FILLED|PARTIAL|CANCELLED|CANCELED|REJECTED)$/.test(order.status)) return "Order is not confirmed filled";
  if (!Number.isFinite(price) || price <= 0) return "Executed price needs review";
  if (!order.instrument || !order.strike || !order.optionType || !order.expiry) return "Contract identity needs review";
  if (!order.date) return "Order date needs review";
  return "Eligible for FIFO matching";
};

export const detectOrderRows = (text: string): DetectedOrder[] => {
  const rows: DetectedOrder[] = [];
  const contractPattern = /\b(BANK\s*NIFTY|NIFTY\s*BANK|FIN\s*NIFTY|MIDCP\s*NIFTY|NIFTY|SENSEX|BANKEX)\s+(\d{4,6})\s+(CE|PE|CALL|PUT)\b/gi;
  const contracts = [...text.matchAll(contractPattern)].map((match) => ({
    instrument: match[1].replace(/\s+/g, " ").toUpperCase(), strike: match[2],
    optionType: /^(CE|CALL)$/i.test(match[3]) ? "CE" as const : "PE" as const,
  }));
  const uniqueContracts = [...new Map(contracts.map((contract) => [`${contract.instrument}|${contract.strike}|${contract.optionType}`, contract])).values()];
  const soleContract = uniqueContracts.length === 1 ? uniqueContracts[0] : undefined;
  const dateFrom = (line: string, label: RegExp) => {
    const target = line.match(label)?.[1] ?? "";
    let match = target.match(/(\d{1,2})[/-](\d{1,2})[/-](20\d{2})/);
    if (match) return toIso(Number(match[1]), Number(match[2]), Number(match[3]));
    match = target.match(/(\d{1,2})\s+([A-Z]{3})\s+(20\d{2})/i);
    if (match) {
      const month = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"].indexOf(match[2].slice(0,3).toLowerCase()) + 1;
      return month ? toIso(Number(match[1]), month, Number(match[3])) : "";
    }
    return "";
  };
  const expiryLabel = /(?:expiry|exp\.?\s*date)\s*[:#-]?\s*([\w /-]+)/i;
  const documentExpiries = [...new Set(text.split(/\r?\n/).map((line) => dateFrom(line, expiryLabel)).filter(Boolean))];

  const groups: Array<{ source: string; anchor: string; context: string[]; header: string[] }> = [];
  let currentSource = "Attached document";
  let headerLines: string[] = [];
  let active: typeof groups[number] | null = null;
  const finishGroup = () => { if (active) groups.push(active); active = null; };
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^Source:/i.test(line)) {
      finishGroup(); currentSource = line.replace(/^Source:\s*/i, ""); headerLines = []; continue;
    }
    if (/\b(BUY|SELL)\b/i.test(line)) {
      finishGroup();
      active = { source: currentSource, anchor: line, context: [...headerLines, line], header: [...headerLines] };
      headerLines = [];
    } else if (active) active.context.push(line);
    else headerLines.push(line);
  }
  finishGroup();

  for (const group of groups) {
    const line = group.anchor;
    const context = group.context.join(" ");
    const sideMatch = line.match(/\b(BUY|SELL)\b/i);
    if (!sideMatch) continue;
    const statusMatch = context.match(/\b(COMPLETE|COMPLETED|EXECUTED|FILLED|CANCELLED|CANCELED|REJECTED|OPEN|PENDING|PARTIAL)\b/i);
    const status = statusMatch?.[1].toUpperCase() ?? "UNKNOWN";
    const orderId = context.match(/(?:order\s*(?:id|no\.?|#)|orderid)\s*[:#-]?\s*([A-Z0-9-]+)/i)?.[1];
    const labeledRatio = context.match(/(?:filled\s*(?:qty|quantity)?|executed\s*(?:qty|quantity)?|qty|quantity)\s*[:#-]?\s*(\d{1,8})\s*\/\s*(\d{1,8})/i);
    const withoutDates = context.replace(/\b\d{1,2}[/-]\d{1,2}[/-](?:19|20)\d{2}\b/g, " ");
    const ratio = labeledRatio ?? withoutDates.match(/\b(\d{1,8})\s*\/\s*(\d{1,8})\b/);
    const labeledQty = context.match(/(?:filled\s*(?:qty|quantity)?|executed\s*(?:qty|quantity)?|qty|quantity)\s*[:#-]?\s*(\d{1,8})/i);
    const filled = ratio ? ratio[1] : labeledQty ? labeledQty[1] : "";
    const requested = ratio ? ratio[2] : "";
    const labeledPrice = context.match(/avg(?:erage)?\s*(?:exec(?:ution)?\s*)?price\s*[:@-]?\s*₹?\s*(\d+(?:\.\d+)?)/i)
      ?? context.match(/fill(?:ed)?\s*price\s*[:@-]?\s*₹?\s*(\d+(?:\.\d+)?)/i)
      ?? context.match(/\bprice\s*[:@-]?\s*₹?\s*(\d+(?:\.\d+)?)/i);
    const numericValues = [...withoutDates.matchAll(/(?:₹\s*)?(\d+\.\d{1,4})\b/g)].map((m) => m[1]);
    const uniquePrices = [...new Set(numericValues)];
    const price = labeledPrice?.[1] ?? (uniquePrices.length === 1 ? uniquePrices[0] : "");
    const localContract = context.match(new RegExp(contractPattern.source, "i")) ?? group.header.join(" ").match(new RegExp(contractPattern.source, "i"));
    const localInstrument = localContract?.[1].replace(/\s+/g, " ").toUpperCase() ?? soleContract?.instrument ?? "";
    const localStrike = localContract?.[2] ?? soleContract?.strike ?? "";
    const localOption = localContract ? (/^(CE|CALL)$/i.test(localContract[3]) ? "CE" : "PE") : soleContract?.optionType ?? "";
    const expiry = dateFrom(context, expiryLabel) || (documentExpiries.length === 1 ? documentExpiries[0] : "");
    const date = dateFrom(context, /(?:order|trade|execution)\s*date\s*[:#-]?\s*([\w /-]+)/i) || dateFrom(context, /^(.*)$/i);
    const isCancelled = /CANCELLED|CANCELED|REJECTED/i.test(status);
    const qty = Number(filled || 0);
    const issue = isCancelled && qty === 0 ? "Cancelled or rejected; excluded from executed quantity" :
      qty <= 0 ? "Filled quantity not identified" : !price ? "Executed price not identified" :
      !localInstrument || !localStrike || !localOption ? "Contract identity needs review" : "Review OCR values";
    const row: DetectedOrder = { id: crypto.randomUUID(), source: group.source, raw: group.context.join(" · "), orderId,
      instrument: localInstrument, strike: localStrike, optionType: localOption, expiry, date,
      side: sideMatch[1].toUpperCase() as "BUY" | "SELL", status, filled, requested, price,
      include: !(isCancelled && qty === 0), issue };
    const sameId = orderId ? rows.find((previous) => previous.orderId === orderId) : undefined;
    if (sameId) {
      const sameDetails = ["side", "status", "filled", "requested", "price", "instrument", "strike", "optionType", "expiry", "date"]
        .every((key) => row[key as keyof DetectedOrder] === sameId[key as keyof DetectedOrder]);
      if (sameDetails) continue;
      rows.push({ ...row, include: false, possibleDuplicateOf: sameId.id, issue: "Order ID conflict; resolve duplicate row before including" });
    } else rows.push(row);
  }
  return rows.map((row, index) => {
    if (row.orderId || row.possibleDuplicateOf) return row;
    const fingerprintFields: Array<keyof DetectedOrder> = ["side", "status", "filled", "requested", "price", "instrument", "strike", "optionType", "expiry", "date"];
    const complete = [row.price, row.instrument, row.strike, row.optionType, row.expiry, row.date].every(Boolean);
    if (!complete) return row;
    const previous = rows.slice(0, index).find((candidate) => !candidate.orderId && candidate.source !== row.source
      && fingerprintFields.every((key) => candidate[key] === row[key]));
    return previous ? { ...row, possibleDuplicateOf: previous.id, issue: `Possible overlapping duplicate of another source row; compare before including` } : row;
  });
};

export interface MatchedTrade {
  id: string;
  identity: string;
  instrument: string;
  strike: string;
  optionType: "CE" | "PE" | "";
  expiry: string;
  date: string;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  direction: "long" | "short";
  entryOrderId: string;
  exitOrderId: string;
  entryRowId: string;
  exitRowId: string;
  needsIdentityConfirmation: boolean;
}

export const matchDetectedOrders = (orders: DetectedOrder[]) => {
  const matched: MatchedTrade[] = [];
  const lots: Array<{ order: DetectedOrder; remaining: number }> = [];
  const open: Array<{ order: DetectedOrder; remaining: number }> = [];
  const unresolved: DetectedOrder[] = [];
  const included = orders.map((order, index) => ({ order, index })).filter(({ order }) => order.include);
  const allDated = included.every(({ order }) => Boolean(order.date));
  const ordered = (allDated ? included.sort((a, b) => a.order.date.localeCompare(b.order.date) || a.index - b.index) : included)
    .map(({ order }) => order);
  const compatible = (left: DetectedOrder, right: DetectedOrder) =>
    (![left.instrument, right.instrument].every(Boolean) || left.instrument === right.instrument)
    && (![left.strike, right.strike].every(Boolean) || left.strike === right.strike)
    && (!(left.optionType && right.optionType) || left.optionType === right.optionType)
    && (!(left.expiry && right.expiry) || left.expiry === right.expiry);
  for (const order of ordered) {
    const qty = Number(order.filled);
    const completed = /^(COMPLETE|COMPLETED|EXECUTED|FILLED|PARTIAL)$/.test(order.status)
      || (/^(CANCELLED|CANCELED|REJECTED)$/.test(order.status) && qty > 0);
    if (!completed || !Number.isInteger(qty) || qty <= 0) {
      unresolved.push(order);
      continue;
    }
    let remaining = qty;
    while (remaining > 0) {
      const lotIndex = lots.findIndex((candidate) => candidate.order.side !== order.side && compatible(candidate.order, order));
      if (lotIndex < 0) break;
      const lot = lots[lotIndex];
      const matchedQty = Math.min(remaining, lot.remaining);
      const isLong = lot.order.side === "BUY";
      const buy = isLong ? lot.order : order;
      const sell = isLong ? order : lot.order;
      const entryOrder = isLong ? buy : sell;
      const exitOrder = isLong ? sell : buy;
      const instrument = buy.instrument || sell.instrument;
      const strike = buy.strike || sell.strike;
      const optionType = buy.optionType || sell.optionType;
      const expiry = buy.expiry || sell.expiry;
      const needsIdentityConfirmation = !(buy.instrument && sell.instrument && buy.instrument === sell.instrument
        && buy.strike && sell.strike && buy.strike === sell.strike
        && buy.optionType && sell.optionType && buy.optionType === sell.optionType
        && buy.expiry && sell.expiry && buy.expiry === sell.expiry);
      const rowPairId = [lot.order.id, order.id].sort().join("|");
      matched.push({ id: `${rowPairId}|${matchedQty}|${matched.length}`, identity: [instrument, strike, optionType, expiry].join("|"), instrument, strike,
        optionType, expiry, date: order.date || lot.order.date,
        entryPrice: Number(entryOrder.price) || 0,
        exitPrice: Number(exitOrder.price) || 0, quantity: matchedQty,
        direction: isLong ? "long" : "short", entryOrderId: entryOrder.orderId ?? "",
        exitOrderId: exitOrder.orderId ?? "", entryRowId: entryOrder.id, exitRowId: exitOrder.id, needsIdentityConfirmation });
      lot.remaining -= matchedQty; remaining -= matchedQty;
      if (!lot.remaining) lots.splice(lotIndex, 1);
    }
    if (remaining > 0) lots.push({ order, remaining });
  }
  for (const lot of lots) {
    const { order } = lot;
    if (order.instrument && order.strike && order.optionType && order.expiry && order.date && Number(order.price) > 0) open.push(lot);
    else unresolved.push(order);
  }
  return { matched, open, unresolved };
};
