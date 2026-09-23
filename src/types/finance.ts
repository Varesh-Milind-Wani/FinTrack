export type TransactionType = "profit" | "loss";

export type InvestmentType = "stocks" | "mutual_fund" | "crypto" | "gold" | "real_estate" | "fd" | "other";

export interface Investment {
  id: string;
  name: string;
  type: InvestmentType;
  amount: number;          // Amount invested
  currentValue: number;    // Current market value
  date: string;            // Date of investment
  note: string;
}

export interface Withdrawal {
  id: string;
  date: string;
  amount: number;
  method: "bank" | "crypto" | "cash" | "other";
  note: string;
  status: "pending" | "completed" | "cancelled";
}

export interface Expense {
  id: string;
  name: string;
  category: string;
  amount: number;
  date: string;
  note: string;
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
  /** Calendar months (YYYY-MM) whose transactions can no longer be changed. */
  lockedMonths?: string[];
  /** Tracks manual balance adjustments */
  currentBalance?: number;
  /** Persistent rebalance offset applied on top of transaction performance. */
  balanceAdjustment?: number;
  /** Withdrawal history */
  withdrawals?: Withdrawal[];
  /** Investment portfolio */
  investments?: Investment[];
  /** Expenses recorded separately from trading activity. */
  expenses?: Expense[];
  /** When true, investment total is added to balance across the entire app */
  investmentIncluded?: boolean;
  /** Enables the dedicated expense tracker and includes its total in balance. */
  expenseTrackingEnabled?: boolean;
  /** Whether the default cost amount is locked */
  costLocked?: boolean;
}
