import type { UserAccount } from "../types/finance";

const BACKUP_APP = "FinTrack";
const BACKUP_VERSION = 1;
const USERS_KEY = "fintrack_users";
const SESSION_KEY = "fintrack_current_user";
const CURRENT_USER_KEY = "fintrack_current_user_profile";
const STORAGE_CHANGE_EVENT = "fintrack-storage-updated";
const MAX_BACKUP_SIZE = 50 * 1024 * 1024;

type ApplicationBackup = {
  app: typeof BACKUP_APP;
  formatVersion: typeof BACKUP_VERSION;
  exportedAt: string;
  localStorage: Record<string, string>;
};

export type ValidatedApplicationBackup = {
  backup: ApplicationBackup;
  users: UserAccount[];
  recordCounts: { accounts: number; transactions: number; investments: number; expenses: number; incomes: number; withdrawals: number };
};

const isApplicationStorageKey = (key: string) => key.startsWith("fintrack_") || key.startsWith("fintrack:");

export const createApplicationBackup = (): ApplicationBackup => {
  const localStorage: Record<string, string> = {};
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key && isApplicationStorageKey(key)) {
      const value = window.localStorage.getItem(key);
      if (value !== null) localStorage[key] = value;
    }
  }
  if (!localStorage[USERS_KEY]) throw new Error("No saved FinTrack account data was found in this browser.");
  return { app: BACKUP_APP, formatVersion: BACKUP_VERSION, exportedAt: new Date().toISOString(), localStorage };
};

export const validateApplicationBackup = (value: unknown): ValidatedApplicationBackup => {
  if (!value || typeof value !== "object") throw new Error("This file is not a valid FinTrack backup.");
  const candidate = value as Partial<ApplicationBackup>;
  if (candidate.app !== BACKUP_APP) throw new Error("This backup was not created by FinTrack.");
  if (candidate.formatVersion !== BACKUP_VERSION) throw new Error("This backup version is not supported by this version of FinTrack.");
  if (!candidate.localStorage || typeof candidate.localStorage !== "object" || Array.isArray(candidate.localStorage)) {
    throw new Error("The backup is missing its application data.");
  }
  const entries = candidate.localStorage as Record<string, unknown>;
  const rawUsers = entries[USERS_KEY];
  if (typeof rawUsers !== "string") throw new Error("The backup does not contain account data.");

  let parsedUsers: unknown;
  try { parsedUsers = JSON.parse(rawUsers); }
  catch { throw new Error("The account data in this backup is damaged."); }
  if (!Array.isArray(parsedUsers) || parsedUsers.length === 0) throw new Error("The backup contains no accounts to restore.");

  const users = parsedUsers.map((entry, index) => {
    if (!entry || typeof entry !== "object") throw new Error(`Account ${index + 1} is invalid.`);
    const user = entry as Partial<UserAccount>;
    if (typeof user.id !== "string" || !user.id.trim() || typeof user.email !== "string") throw new Error(`Account ${index + 1} is missing its ID or email.`);
    for (const field of ["transactions", "investments", "expenses", "incomes", "withdrawals", "defaultCostSchedules"] as const) {
      if (user[field] !== undefined && !Array.isArray(user[field])) throw new Error(`Account ${index + 1} has invalid ${field} data.`);
    }
    if (!Array.isArray(user.transactions)) throw new Error(`Account ${index + 1} has no valid transaction list.`);
    const recordLists = [
      ["transactions", user.transactions, (item: Record<string, unknown>) => typeof item.id === "string" && typeof item.date === "string" && (item.type === "profit" || item.type === "loss") && Number.isFinite(item.amount)],
      ["investments", user.investments ?? [], (item: Record<string, unknown>) => typeof item.id === "string" && typeof item.name === "string" && Number.isFinite(item.amount) && Number.isFinite(item.currentValue)],
      ["expenses", user.expenses ?? [], (item: Record<string, unknown>) => typeof item.id === "string" && typeof item.name === "string" && typeof item.date === "string" && Number.isFinite(item.amount)],
      ["incomes", user.incomes ?? [], (item: Record<string, unknown>) => typeof item.id === "string" && typeof item.source === "string" && typeof item.date === "string" && Number.isFinite(item.amount)],
      ["withdrawals", user.withdrawals ?? [], (item: Record<string, unknown>) => typeof item.id === "string" && typeof item.date === "string" && Number.isFinite(item.amount)],
      ["default cost schedules", user.defaultCostSchedules ?? [], (item: Record<string, unknown>) => typeof item.id === "string" && typeof item.name === "string" && typeof item.startDate === "string" && Number.isFinite(item.amount)],
    ] as const;
    for (const [label, records, isValidRecord] of recordLists) {
      if (records.some((record) => !record || typeof record !== "object" || !isValidRecord(record as unknown as Record<string, unknown>))) {
        throw new Error(`Account ${index + 1} contains invalid ${label}.`);
      }
    }
    return user as UserAccount;
  });
  if (new Set(users.map((user) => user.id)).size !== users.length) throw new Error("The backup contains duplicate account IDs.");

  for (const [key, item] of Object.entries(entries)) {
    if (!isApplicationStorageKey(key) || typeof item !== "string") throw new Error("The backup contains invalid application storage entries.");
  }

  const transactions = users.reduce((total, user) => total + user.transactions.length, 0);
  const investments = users.reduce((total, user) => total + (user.investments?.length ?? 0), 0);
  const expenses = users.reduce((total, user) => total + (user.expenses?.length ?? 0), 0);
  const incomes = users.reduce((total, user) => total + (user.incomes?.length ?? 0), 0);
  const withdrawals = users.reduce((total, user) => total + (user.withdrawals?.length ?? 0), 0);
  return {
    backup: { app: BACKUP_APP, formatVersion: BACKUP_VERSION, exportedAt: typeof candidate.exportedAt === "string" ? candidate.exportedAt : "", localStorage: entries as Record<string, string> },
    users,
    recordCounts: { accounts: users.length, transactions, investments, expenses, incomes, withdrawals },
  };
};

export const restoreApplicationBackup = (validated: ValidatedApplicationBackup) => {
  const nextValues = { ...validated.backup.localStorage };
  const requestedSessionId = nextValues[SESSION_KEY];
  const activeUser = validated.users.find((user) => user.id === requestedSessionId) ?? validated.users[0];
  nextValues[USERS_KEY] = JSON.stringify(validated.users);
  nextValues[SESSION_KEY] = activeUser.id;
  nextValues[CURRENT_USER_KEY] = JSON.stringify(activeUser);

  const existingKeys: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key && isApplicationStorageKey(key)) existingKeys.push(key);
  }
  const previous = new Map(existingKeys.map((key) => [key, window.localStorage.getItem(key)]));
  try {
    existingKeys.forEach((key) => window.localStorage.removeItem(key));
    Object.entries(nextValues).forEach(([key, item]) => window.localStorage.setItem(key, item));
  } catch (error) {
    for (const key of [...existingKeys, ...Object.keys(nextValues)]) {
      try {
        const oldValue = previous.get(key);
        if (oldValue === undefined || oldValue === null) window.localStorage.removeItem(key);
        else window.localStorage.setItem(key, oldValue);
      } catch { /* Best-effort rollback if storage itself is unavailable. */ }
    }
    throw error instanceof DOMException && error.name === "QuotaExceededError"
      ? new Error("There is not enough browser storage to restore this backup. Your existing data has been kept.")
      : new Error("The backup could not be restored. Your existing data has been kept.");
  }
  window.dispatchEvent(new Event(STORAGE_CHANGE_EVENT));
};

export const readApplicationBackupFile = async (file: File): Promise<ValidatedApplicationBackup> => {
  if (file.size > MAX_BACKUP_SIZE) throw new Error("Backup files must be 50 MB or smaller.");
  let parsed: unknown;
  try { parsed = JSON.parse(await file.text()); }
  catch { throw new Error("Could not read this file as a valid JSON backup."); }
  return validateApplicationBackup(parsed);
};
