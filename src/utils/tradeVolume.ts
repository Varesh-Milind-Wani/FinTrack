import type { Transaction } from "../types/finance";

export interface TradeVolumeSummary {
  total: number;
  transactionCount: number;
}

export interface DailyTradeVolume {
  date: string;
  total: number;
}

interface DatedTradeVolume extends DailyTradeVolume {
  sizedTurnover: number;
  unsizedProfit: number;
  unsizedLoss: number;
}

function getTradeVolumeAmount(transaction: Transaction): number | null {
  const entryPrice = Number(transaction.entryPrice);
  const exitPrice = Number(transaction.exitPrice);
  const quantity = Number(transaction.quantity);
  const hasRoundTripPrices = Number.isFinite(entryPrice) && entryPrice > 0
    && Number.isFinite(exitPrice) && exitPrice > 0
    && Number.isFinite(quantity) && quantity > 0;
  // Trade volume is executed notional (entry + exit turnover).
  const amount = hasRoundTripPrices ? (entryPrice + exitPrice) * quantity : null;
  return amount != null && Number.isFinite(amount) && amount >= 0 ? amount : null;
}

/** Uses turnover for sized trades and twice the gross P&L amount for unsized trades. */
export function calculateTradeVolume(transactions: Transaction[]): TradeVolumeSummary {
  const days = calculateDailyTradeVolume(transactions);
  const transactionCount = transactions.filter((transaction) => {
    if (!transaction.date) return false;
    const parsedDate = transaction.date.includes("T")
      ? new Date(transaction.date)
      : new Date(`${transaction.date}T00:00:00`);
    if (Number.isNaN(parsedDate.getTime())) return false;
    if (getTradeVolumeAmount(transaction) != null) return true;
    return Number.isFinite(Number(transaction.grossAmount ?? transaction.amount));
  }).length;
  return days.reduce<TradeVolumeSummary>((summary, day) => {
    summary.total += day.total;
    return summary;
  }, { total: 0, transactionCount });
}

/** Daily transaction turnover, with a P&L-based fallback for unsized trades. */
export function calculateDailyTradeVolume(transactions: Transaction[]): DailyTradeVolume[] {
  const byDate = new Map<string, DatedTradeVolume>();
  for (const transaction of transactions) {
    if (!transaction.date) continue;
    const parsedDate = transaction.date.includes("T")
      ? new Date(transaction.date)
      : new Date(`${transaction.date}T00:00:00`);
    if (Number.isNaN(parsedDate.getTime())) continue;
    const date = `${parsedDate.getFullYear()}-${String(parsedDate.getMonth() + 1).padStart(2, "0")}-${String(parsedDate.getDate()).padStart(2, "0")}`;
    const daily = byDate.get(date) ?? { date, total: 0, sizedTurnover: 0, unsizedProfit: 0, unsizedLoss: 0 };
    const turnover = getTradeVolumeAmount(transaction);
    if (turnover != null) {
      daily.sizedTurnover += turnover;
    } else {
      const pnl = Math.abs(Number(transaction.grossAmount ?? transaction.amount));
      if (!Number.isFinite(pnl)) continue;
      if (transaction.type === "profit") daily.unsizedProfit += pnl;
      else daily.unsizedLoss += pnl;
    }
    daily.total = daily.sizedTurnover + 2 * (daily.unsizedProfit + daily.unsizedLoss);
    byDate.set(date, daily);
  }
  return [...byDate.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(({ date, total }) => ({ date, total }));
}
