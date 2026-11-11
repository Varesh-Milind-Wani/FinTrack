import type { UserAccount } from '../types/finance';

/**
 * Total current value of all investments.
 * Returns 0 if investmentIncluded is off or no investments exist.
 */
export const getInvestmentTotal = (user: UserAccount): number => {
  if (!user.investmentIncluded) return 0;
  return (user.investments ?? []).reduce((sum, inv) => sum + (inv.isClosed ? 0 : inv.currentValue), 0);
};

/** Cash proceeds from exited holdings, counted once they leave the portfolio. */
export const getInvestmentProceeds = (user: UserAccount): number => {
  const optedInInvestmentIds = new Set(
    (user.investments ?? [])
      .filter((investment) => investment.isClosed && investment.withdrawalRecorded)
      .map((investment) => investment.id),
  );
  return (user.withdrawals ?? [])
    .filter((entry) => entry.method === "investment"
      && entry.status === "completed"
      && Boolean(entry.sourceInvestmentId && optedInInvestmentIds.has(entry.sourceInvestmentId)))
    .reduce((sum, entry) => sum + entry.amount, 0);
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
  const { totalProfit, totalLoss } = user.transactions.reduce((totals, transaction) => {
    if (transaction.type === "profit") totals.totalProfit += transaction.amount;
    else if (transaction.type === "loss") totals.totalLoss += transaction.amount;
    return totals;
  }, { totalProfit: 0, totalLoss: 0 });

  return user.startingBalance + totalProfit - totalLoss - getExpenseTotal(user) + (user.balanceAdjustment ?? 0);
};

/**
 * Get the authoritative current balance used across ALL pages.
 * - Respects manual balance override from Settings.
 * - Adds open investment holdings when investmentIncluded toggle is ON.
 * Closed investment proceeds remain available in Withdrawals, but are not
 * part of the trading balance or net performance.
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
  const { totalProfit, totalLoss } = user.transactions.reduce((totals, transaction) => {
    if (transaction.type === "profit") totals.totalProfit += transaction.amount;
    else if (transaction.type === "loss") totals.totalLoss += transaction.amount;
    return totals;
  }, { totalProfit: 0, totalLoss: 0 });

  const investmentTotal = getInvestmentTotal(user);
  const hasManualBalance = user.currentBalance != null && user.currentBalance >= 0;
  const currentBalance = (hasManualBalance
    ? (user.currentBalance ?? 0)
    : user.startingBalance + totalProfit - totalLoss - getExpenseTotal(user) + (user.balanceAdjustment ?? 0)) + investmentTotal;
  const netPerformance = currentBalance - user.startingBalance;

  return {
    totalProfit,
    totalLoss,
    currentBalance,
    netPerformance,
    startingBalance: user.startingBalance,
    investmentTotal,
    investmentProceeds: getInvestmentProceeds(user),
  };
};
