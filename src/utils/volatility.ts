/** Price-history based realized volatility helpers. Values returned are annualized percentages. */
export interface OhlcBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface VolatilityPoint {
  date: string;
  annualizedPercent: number;
}

export interface DailyMovementPoint {
  date: string;
  percent: number;
}

export interface DailyPnlMovementPoint {
  date: string;
  previousClose: number;
  currentClose: number;
  absoluteMovement: number;
  percent: number;
  direction: "up" | "down" | "unchanged";
}

export interface PnlObservation {
  date: string;
  type: "profit" | "loss";
  amount: number;
}

export interface WeightedSeries {
  symbol: string;
  weight: number;
  bars: OhlcBar[];
}

export interface TradePriceObservation {
  date: string;
  entryPrice?: number;
  exitPrice?: number;
  positionSide?: "long" | "short";
}

export interface TradeMoveDispersion {
  /** Standard deviation of signed per-trade log returns, expressed as percent. Not annualized. */
  percent: number;
  tradeCount: number;
}

export interface SessionChange {
  current: number;
  previous: number;
  percent: number | null;
}

export type VolatilityInterval = "daily" | "weekly" | "monthly";

/** Uses saved entry/exit prices only. This is a trade-sample measure, not market-session volatility. */
export function calculateTradeMoveDispersion(trades: TradePriceObservation[]): TradeMoveDispersion | null {
  const returns = trades.flatMap((trade) => {
    // Old imports can contain numeric strings even though the current type is numeric.
    const entryPrice = Number(trade.entryPrice);
    const exitPrice = Number(trade.exitPrice);
    if (!Number.isFinite(entryPrice) || !Number.isFinite(exitPrice) || entryPrice <= 0 || exitPrice <= 0) return [];
    const direction = trade.positionSide === "short" ? -1 : 1;
    const value = direction * Math.log(exitPrice / entryPrice);
    return Number.isFinite(value) ? [value] : [];
  });
  if (returns.length < 2) return null;
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1);
  const percent = Math.sqrt(variance) * 100;
  return Number.isFinite(percent) ? { percent, tradeCount: returns.length } : null;
}

const validBar = (bar: OhlcBar) => Boolean(bar.date)
  && [bar.open, bar.high, bar.low, bar.close].every((price) => Number.isFinite(price) && price > 0)
  && bar.high >= Math.max(bar.open, bar.close, bar.low)
  && bar.low <= Math.min(bar.open, bar.close, bar.high);

/** Absolute close-to-close daily price movement as a percentage of the prior close. */
export function calculateDailyMovement(bars: OhlcBar[]): DailyMovementPoint[] {
  const unique = new Map<string, OhlcBar>();
  for (const bar of bars) if (bar && typeof bar.date === "string" && bar.date && validBar(bar)) unique.set(bar.date, bar);
  const sorted = [...unique.values()].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.slice(1).flatMap((bar, index) => {
    const previousClose = sorted[index].close;
    const percent = Math.abs(bar.close - previousClose) / previousClose * 100;
    return Number.isFinite(percent) ? [{ date: bar.date, percent }] : [];
  });
}

/** Equal-weight average of daily movement percentages on sessions shared by the symbols. */
export function aggregateDailyMovement(series: Array<Pick<WeightedSeries, "symbol" | "bars">>): DailyMovementPoint[] {
  if (!series.length) return [];
  const perSymbol = series.map(({ bars }) => calculateDailyMovement(bars));
  if (perSymbol.some((points) => points.length === 0)) return [];
  const maps = perSymbol.map((points) => new Map(points.map((point) => [point.date, point.percent])));
  const commonDates = [...maps[0].keys()].filter((date) => maps.every((values) => values.has(date))).sort();
  return commonDates.map((date) => ({
    date,
    percent: maps.reduce((sum, values) => sum + (values.get(date) ?? 0), 0) / maps.length,
  }));
}

/**
 * Daily realized P&L movement relative to the preceding recorded P&L close.
 * Amounts are signed by transaction type; zero prior closes are skipped because
 * a percentage relative to zero is undefined. Negative P&L closes use their
 * absolute value as the denominator so volatility remains non-negative.
 */
export function calculateDailyPnlVolatility(observations: PnlObservation[]): DailyPnlMovementPoint[] {
  const dailyNet = new Map<string, number>();
  for (const observation of observations) {
    if (!observation || typeof observation.date !== "string" || !observation.date.trim()) continue;
    const parsedDate = observation.date.includes("T")
      ? new Date(observation.date)
      : new Date(`${observation.date}T00:00:00`);
    if (Number.isNaN(parsedDate.getTime())) continue;
    const date = `${parsedDate.getFullYear()}-${String(parsedDate.getMonth() + 1).padStart(2, "0")}-${String(parsedDate.getDate()).padStart(2, "0")}`;
    const amount = Number(observation.amount);
    if (!Number.isFinite(amount) || amount < 0 || (observation.type !== "profit" && observation.type !== "loss")) continue;
    const signedAmount = observation.type === "profit" ? amount : -amount;
    dailyNet.set(date, (dailyNet.get(date) ?? 0) + signedAmount);
  }

  let closingPnl = 0;
  const points: DailyPnlMovementPoint[] = [];
  for (const [date, movement] of [...dailyNet.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const previousClose = closingPnl;
    closingPnl += movement;
    if (previousClose === 0) continue;
    const absoluteMovement = Math.abs(movement);
    const percent = absoluteMovement / Math.abs(previousClose) * 100;
    if (!Number.isFinite(percent)) continue;
    points.push({
      date,
      previousClose,
      currentClose: closingPnl,
      absoluteMovement,
      percent,
      direction: movement > 0 ? "up" : movement < 0 ? "down" : "unchanged",
    });
  }
  return points;
}

/** Rolling sample standard deviation of daily log returns, annualized with 252 sessions. */
function resampleBars(bars: OhlcBar[], interval: VolatilityInterval): OhlcBar[] {
  const unique = new Map<string, OhlcBar>();
  for (const bar of bars) if (bar && typeof bar.date === "string" && bar.date) unique.set(bar.date, bar);
  const sorted = [...unique.values()].sort((a, b) => a.date.localeCompare(b.date));
  if (interval === "daily") return sorted;
  const groups = new Map<string, OhlcBar[]>();
  for (const bar of sorted) {
    if (!validBar(bar)) continue;
    const date = new Date(`${bar.date}T00:00:00Z`);
    if (!Number.isFinite(date.getTime())) continue;
    let key = bar.date.slice(0, 7);
    if (interval === "weekly") {
      const monday = new Date(date);
      monday.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
      key = monday.toISOString().slice(0, 10);
    }
    groups.set(key, [...(groups.get(key) ?? []), bar]);
  }
  return [...groups.values()].map((periodBars) => ({
    date: periodBars.at(-1)!.date,
    open: periodBars[0].open,
    high: Math.max(...periodBars.map((bar) => bar.high)),
    low: Math.min(...periodBars.map((bar) => bar.low)),
    close: periodBars.at(-1)!.close,
  })).sort((a, b) => a.date.localeCompare(b.date));
}

export function calculateAnnualizedVolatility(bars: OhlcBar[], returnWindow = 30, interval: VolatilityInterval = "daily"): VolatilityPoint[] {
  if (!Number.isInteger(returnWindow) || returnWindow < 2) return [];
  const observations = resampleBars(bars, interval);
  const returns: Array<{ date: string; value: number }> = [];
  let previousClose: number | null = null;
  for (const bar of observations) {
    if (!validBar(bar)) {
      previousClose = null;
      continue;
    }
    if (previousClose != null) {
      const value = Math.log(bar.close / previousClose);
      if (Number.isFinite(value)) returns.push({ date: bar.date, value });
    }
    previousClose = bar.close;
  }
  const points: VolatilityPoint[] = [];
  for (let end = returnWindow - 1; end < returns.length; end += 1) {
    const window = returns.slice(end - returnWindow + 1, end + 1).map((point) => point.value);
    const mean = window.reduce((sum, value) => sum + value, 0) / window.length;
    const variance = window.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (window.length - 1);
    const sessionsPerYear = interval === "daily" ? 252 : interval === "weekly" ? 52 : 12;
    const annualizedPercent = Math.sqrt(variance) * Math.sqrt(sessionsPerYear) * 100;
    if (Number.isFinite(annualizedPercent)) points.push({ date: returns[end].date, annualizedPercent });
  }
  return points;
}

/** Combines instruments only on sessions present in every series; weights are normalized. */
export function aggregateVolatility(series: WeightedSeries[], returnWindow = 30, interval: VolatilityInterval = "daily"): VolatilityPoint[] {
  if (!series.length || series.some((entry) => !Number.isFinite(entry.weight) || entry.weight < 0)) return [];
  const totalWeight = series.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight <= 0) return [];
  const perInstrument = series.map((entry) => ({
    weight: entry.weight / totalWeight,
    points: calculateAnnualizedVolatility(entry.bars, returnWindow, interval),
  }));
  if (perInstrument.some((entry) => entry.points.length === 0)) return [];
  const maps = perInstrument.map((entry) => new Map(entry.points.map((point) => [point.date, point.annualizedPercent])));
  const commonDates = [...maps[0].keys()].filter((date) => maps.every((values) => values.has(date))).sort();
  return commonDates.map((date) => ({
    date,
    annualizedPercent: maps.reduce((sum, values, index) => sum + (values.get(date) ?? 0) * perInstrument[index].weight, 0),
  }));
}

export function compareLatestSessions(points: VolatilityPoint[]): SessionChange | null {
  if (points.length < 2) return null;
  const previous = points.at(-2)!.annualizedPercent;
  const current = points.at(-1)!.annualizedPercent;
  if (![current, previous].every(Number.isFinite)) return null;
  return { current, previous, percent: previous === 0 ? (current === 0 ? 0 : null) : ((current - previous) / previous) * 100 };
}

/** Historical rank from 0 to 100, using only observations before the current session. */
export function historicalPercentile(points: VolatilityPoint[], historyLimit = 252): number | null {
  if (points.length < 2) return null;
  const current = points.at(-1)!.annualizedPercent;
  const history = points.slice(Math.max(0, points.length - historyLimit - 1), -1).map((point) => point.annualizedPercent);
  if (!Number.isFinite(current) || !history.length) return null;
  return Math.round((history.filter((value) => value <= current).length / history.length) * 100);
}
