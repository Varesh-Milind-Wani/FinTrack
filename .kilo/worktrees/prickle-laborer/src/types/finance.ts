export type TransactionType = "profit" | "loss";

export interface Withdrawal {
  id: string;
  date: string;
  amount: number;
  method: "bank" | "crypto" | "cash" | "other";
  note: string;
  status: "pending" | "completed" | "cancelled";
}

export interface Transaction {
  id: string;
  date: string;
  type: TransactionType;
  amount: number;
  /** Original amount before applying a default cost. */
  grossAmount?: number;
  /** Cost applied when this transaction was calculated. */
  costAmount?: number;
  price: number;
  category: string;
  note: string;
  /** Number of profit trades (1–5). */
  profitTradeCount?: number;
  /** Number of loss trades (1–5). */
  lossTradeCount?: number;
  /** Confidence level for this trade (1-100) */
  confidenceLevel?: number;
  /** Whether confidence tracking is enabled for this trade */
  trackConfidence?: boolean;
}

export interface DefaultCostSchedule {
  id: string;
  startDate: string;
  name: string;
  amount: number;
}

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  password: string;
  startingBalance: number;
  startingBalanceLocked?: boolean;
  currency: string;
  defaultCostAmount: number;
  defaultCostSchedules: DefaultCostSchedule[];
  expenseIncludedByDefault: boolean;
  createdAt: string;
  transactions: Transaction[];
  /** Tracks manual balance adjustments */
  currentBalance?: number;
  /** Withdrawal history */
  withdrawals?: Withdrawal[];
  /** Whether the default cost amount is locked */
  costLocked?: boolean;
}
