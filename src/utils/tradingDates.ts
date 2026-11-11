export const WEEKEND_TRANSACTION_ERROR = "You cannot add a transaction on Saturday or Sunday. Choose a weekday.";

/** Validates a date or local datetime using the user's local calendar day. */
export function getTransactionDateValidationError(value: string): string | null {
  if (!value) return "Enter a valid transaction date and time.";
  const includesTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
  if (includesTimezone) {
    const instant = new Date(value);
    if (Number.isNaN(instant.getTime())) return "Enter a valid transaction date and time.";
    const dayOfWeek = instant.getDay();
    return dayOfWeek === 0 || dayOfWeek === 6 ? WEEKEND_TRANSACTION_ERROR : null;
  }
  const parts = value.slice(0, 10).split("-").map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part))) return "Enter a valid transaction date and time.";
  const [year, month, day] = parts;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return "Enter a valid transaction date and time.";
  const dayOfWeek = date.getDay();
  return dayOfWeek === 0 || dayOfWeek === 6 ? WEEKEND_TRANSACTION_ERROR : null;
}
