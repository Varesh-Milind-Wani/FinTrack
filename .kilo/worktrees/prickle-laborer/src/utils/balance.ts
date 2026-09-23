import type { UserAccount } from '../types/finance';

/**
 * Get the authoritative current balance - respects manual overrides from Settings
 * This should be used by ALL pages for consistent balance display
 */
export const getAuthoritativeBalance = (user: UserAccount): number => {
  // If user has manually set a balance in Settings, use that
  if (user.currentBalance !== undefined && user.currentBalance !== null && user.currentBalance >= 0) {
    return user.currentBalance;
  }
  
  // Otherwise calculate from transactions using net amounts
  return calculateCurrentBalance(user);
};

/**
 * Calculate current balance from transactions only (ignoring manual overrides)
 * Uses net amounts (after costs) for actual balance calculations
 */
export const calculateCurrentBalance = (user: UserAccount): number => {
  // Calculate balance using net amounts (after cost deduction)
  const totalProfit = user.transactions
    .filter((transaction) => transaction.type === "profit")
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  const totalLoss = user.transactions
    .filter((transaction) => transaction.type === "loss")
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  return user.startingBalance + totalProfit - totalLoss;
};

/**
 * Calculate comprehensive balance statistics
 * Uses authoritative balance for consistency across all pages
 */
export const calculateBalanceStats = (user: UserAccount) => {
  // Use net amounts (after cost deduction) for profit/loss totals
  const totalProfit = user.transactions
    .filter((transaction) => transaction.type === "profit")
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  const totalLoss = user.transactions
    .filter((transaction) => transaction.type === "loss")
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  // Get authoritative balance (respects Settings manual override)
  const currentBalance = getAuthoritativeBalance(user);
  const netPerformance = currentBalance - user.startingBalance;

  return {
    totalProfit,
    totalLoss,
    currentBalance,
    netPerformance,
    startingBalance: user.startingBalance,
  };
};