export type CandleInterval = {
  unit: "day" | "week" | "month" | "year";
  count: number;
};

export const CANDLE_INTERVALS: CandleInterval[] = [
  { unit: "day", count: 1 },
  { unit: "week", count: 1 },
  { unit: "month", count: 1 },
  { unit: "month", count: 3 },
  { unit: "month", count: 6 },
  { unit: "year", count: 1 },
  { unit: "year", count: 3 },
  { unit: "year", count: 5 },
  { unit: "year", count: 10 },
  { unit: "month", count: 3 },
];

export type OhlcCandle = [number, number, number, number, number];

const getBucketStart = (timestamp: number, interval: CandleInterval): number => {
  const date = new Date(timestamp);
  if (interval.unit === "day") {
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  }
  if (interval.unit === "week") {
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    return date.getTime();
  }
  if (interval.unit === "month") {
    const absoluteMonth = date.getFullYear() * 12 + date.getMonth();
    const startMonth = Math.floor(absoluteMonth / interval.count) * interval.count;
    return new Date(Math.floor(startMonth / 12), startMonth % 12, 1).getTime();
  }
  const startYear = Math.floor(date.getFullYear() / interval.count) * interval.count;
  return new Date(startYear, 0, 1).getTime();
};

/** Return the complete local-calendar interval represented by a grouped candle. */
export const getCandleWindow = (timestamp: number, intervalIndex: number) => {
  const interval = CANDLE_INTERVALS[intervalIndex] ?? CANDLE_INTERVALS[CANDLE_INTERVALS.length - 1];
  const start = getBucketStart(timestamp, interval);
  const endExclusive = new Date(start);
  if (interval.unit === "day") endExclusive.setDate(endExclusive.getDate() + interval.count);
  else if (interval.unit === "week") endExclusive.setDate(endExclusive.getDate() + 7 * interval.count);
  else if (interval.unit === "month") endExclusive.setMonth(endExclusive.getMonth() + interval.count);
  else endExclusive.setFullYear(endExclusive.getFullYear() + interval.count);
  return { start, end: endExclusive.getTime() - 60_000 };
};

/** Group chronological OHLC points while preserving first open, highest high, lowest low and last close. */
export const groupCandles = (source: readonly unknown[], intervalIndex: number): OhlcCandle[] => {
  const interval = CANDLE_INTERVALS[intervalIndex] ?? CANDLE_INTERVALS[CANDLE_INTERVALS.length - 1];
  const buckets = new Map<number, OhlcCandle>();

  source.forEach((rawPoint) => {
    if (!Array.isArray(rawPoint) || rawPoint.length < 5) return;
    const [timestamp, open, high, low, close] = rawPoint.map(Number);
    if (![timestamp, open, high, low, close].every(Number.isFinite)) return;
    const bucketStart = getBucketStart(timestamp, interval);
    const current = buckets.get(bucketStart);
    if (current) {
      current[2] = Math.max(current[2], high);
      current[3] = Math.min(current[3], low);
      current[4] = close;
    } else {
      buckets.set(bucketStart, [bucketStart, open, high, low, close]);
    }
  });

  return [...buckets.values()].sort((left, right) => left[0] - right[0]);
};
