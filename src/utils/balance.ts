import type { UserAccount } from '../types/finance';

/**
 * Total current value of all investments.
 * Returns 0 if investmentIncluded is off or no investments exist.
 */
export const getInvestmentTotal = (user: UserAccount): number => {
  if (!user.investmentIncluded) return 0;
  return (user.investments ?? []).reduce((sum, inv) => sum + inv.currentValue, 0);
};

export const getExpenseTotal = (user: UserAccount): number => {
  if (!user.expenseTrackingEnabled) return 0;
  return (user.expenses ?? []).reduce((sum, expense) => sum + expense.amount, 0);
};

/**
 * Calculate current trading balance from net transaction amounts plus any
 * manual rebalance saved in Settings.
 */
export const calculateCurrentBalance = (user: UserAccount): number => {
  const totalProfit = user.transactions
    .filter(t => t.type === "profit")
    .reduce((sum, t) => sum + t.amount, 0);

  const totalLoss = user.transactions
    .filter(t => t.type === "loss")
    .reduce((sum, t) => sum + t.amount, 0);

  return user.startingBalance + totalProfit - totalLoss - getExpenseTotal(user) + (user.balanceAdjustment ?? 0);
};

/**
 * Get the authoritative current balance used across ALL pages.
 * - Respects manual balance override from Settings.
 * - Adds investment total when investmentIncluded toggle is ON.
 */
export const getAuthoritativeBalance = (user: UserAccount): number => {
  // Base trading balance: manual override or calculated from transactions
  const tradingBalance =
    user.currentBalance !== undefined &&
    user.currentBalance !== null &&
    user.currentBalance >= 0
      ? user.currentBalance
      : calculateCurrentBalance(user);

  // Add investment total if toggle is ON
  return tradingBalance + getInvestmentTotal(user);
};

/**
 * Calculate comprehensive balance statistics used by Dashboard and other pages.
 */
export const calculateBalanceStats = (user: UserAccount) => {
  const totalProfit = user.transactions
    .filter(t => t.type === "profit")
    .reduce((sum, t) => sum + t.amount, 0);

  const totalLoss = user.transactions
    .filter(t => t.type === "loss")
    .reduce((sum, t) => sum + t.amount, 0);

  const currentBalance = getAuthoritativeBalance(user);
  const netPerformance = currentBalance - user.startingBalance;

  return {
    totalProfit,
    totalLoss,
    currentBalance,
    netPerformance,
    startingBalance: user.startingBalance,
    investmentTotal: getInvestmentTotal(user),
  };
};
