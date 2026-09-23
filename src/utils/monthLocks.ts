import type { Transaction } from "../types/finance";

export const getMonthKey = (dateValue: string | Date): string => {
  const date = new Date(dateValue);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
};

export const getMonthLabel = (monthKey: string): string => {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });
};

export const isTransactionMonthLocked = (
  transaction: Pick<Transaction, "date">,
  lockedMonths: string[] = [],
): boolean => lockedMonths.includes(getMonthKey(transaction.date));
