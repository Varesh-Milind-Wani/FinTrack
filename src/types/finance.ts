export type TransactionType = "profit" | "loss";

export type InvestmentType = "stocks" | "mutual_fund" | "crypto" | "gold" | "real_estate" | "fd" | "other";

export interface Investment {
  id: string;
  name: string;
  /** Exchange/provider symbol used to retrieve historical market prices. */
  marketSymbol?: string;
  /** Latest per-unit market quote returned by the configured quote proxy. */
  marketPrice?: number;
  marketPriceUpdatedAt?: string;
  type: InvestmentType;
  amount: number;          // Amount invested
  currentValue: number;    // Current market value
  /** Number of units held (defaults to 1 for existing records). */
  quantity?: number;
  /** True after the position has been exited. */
  isClosed?: boolean;
  /** True when the proceeds from a closed position were recorded as a withdrawal. */
  withdrawalRecorded?: boolean;
  /** Broker order ID used to create an imported open position. */
  sourceOrderId?: string;
  /** Direction of an imported open trade position. */
  positionSide?: "long" | "short";
  /** Per-unit purchase price, when applicable. */
  entryPrice?: number;
  /** Per-unit sale price, when the holding has been exited. */
  exitPrice?: number;
  /** Annual fixed deposit interest rate, expressed as a percentage. */
  annualInterestRate?: number;
  /** Fixed deposit tenure. Months are stored separately in the range 0–11. */
  durationYears?: number;
  durationMonths?: number;
  /** Optional directly entered realized/unrealized P&L when prices are unknown. */
  directPnl?: number;
  date: string;            // Date of investment
  note: string;
}

export interface Withdrawal {
  id: string;
  date: string;
  amount: number;
  method: "bank" | "crypto" | "cash" | "other" | "investment";
  /** Links sale proceeds to the exited portfolio holding. */
  sourceInvestmentId?: string;
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

export interface IncomeEntry {
  id: string;
  source: string;
  category: string;
  amount: number;
  date: string;
  note: string;
}

export interface Transaction {
  id: string;
  date: string;
  /** When this ledger record was first created; used for the temporary NEW badge. */
  createdAt?: string;
  type: TransactionType;
  amount: number;
  /** Original amount before applying a default cost. */
  grossAmount?: number;
  /** Cost applied when this transaction was calculated. */
  costAmount?: number;
  /** Fee breakdown when provided by the user or source document. */
  brokerageAmount?: number;
  otherChargesAmount?: number;
  /** Whether the saved cost is an estimate or manually entered amount. */
  chargesBasis?: "estimated" | "manual";
  price: number;
  /** Optional trade sizing details used to calculate realised P&L. */
  entryPrice?: number;
  exitPrice?: number;
  quantity?: number;
  /** Direction of the position when price returns are analyzed. */
  positionSide?: "long" | "short";
  /** Option contract type for derivatives. */
  optionType?: "CE" | "PE";
  /** Underlying, strike, and expiry captured during trade import. */
  instrument?: string;
  strikePrice?: number;
  expiryDate?: string;
  /** Broker order IDs retained for provenance and duplicate import checks. */
  sourceOrderIds?: string[];
  category: string;
  note: string;
  /** Number of profit trades (1–5). */
  profitTradeCount?: number;
  /** Number of loss trades (1–5). */
  lossTradeCount?: number;
  /** Confidence level for this trade (1-100) */
  confidenceLevel?: number;
  /** Planned loss amount if the initial trade risk is realized. */
  plannedRiskAmount?: number;
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
  startingBalancePasswordHash?: string;
  startingBalancePasswordSalt?: string;
  currency: string;
  defaultCostAmount: number;
  /** Optional daily net-loss warning threshold. Zero or undefined disables it. */
  dailyLossLimit?: number;
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
  /** Income recorded separately from trading activity. */
  incomes?: IncomeEntry[];
  /** When true, investment total is added to balance across the entire app */
  investmentIncluded?: boolean;
  /** Enables the dedicated expense tracker and includes its total in balance. */
  expenseTrackingEnabled?: boolean;
  /** Whether the default cost amount is locked */
  costLocked?: boolean;
}
