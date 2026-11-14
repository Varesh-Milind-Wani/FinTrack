import * as XLSX from "xlsx";

import {
  createApplicationBackup,
  validateApplicationBackup,
  type ValidatedApplicationBackup,
} from "./applicationBackup";
import type { UserAccount } from "../types/finance";

const STORAGE_SHEET = "Full App Data";
const MAX_CELL_CHARACTERS = 30_000;
const MAX_BACKUP_SIZE = 50 * 1024 * 1024;

const workbookRowsForRecords = (users: UserAccount[], field: keyof UserAccount) => {
  const rows = users.flatMap((user) => {
    const records = user[field];
    if (!Array.isArray(records)) return [];
    return records.map((record) => ({
      "Account ID": user.id,
      "Account Name": user.name,
      ...(record as unknown as Record<string, unknown>),
    }));
  });
  return rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [
    key,
    value && typeof value === "object" ? JSON.stringify(value) : value,
  ])));
};

const addJsonSheet = (workbook: XLSX.WorkBook, name: string, rows: Record<string, unknown>[]) => {
  const worksheet = rows.length ? XLSX.utils.json_to_sheet(rows) : XLSX.utils.aoa_to_sheet([["No records"]]);
  XLSX.utils.book_append_sheet(workbook, worksheet, name);
};

export const exportApplicationBackupExcel = () => {
  const backup = createApplicationBackup();
  const validated = validateApplicationBackup(backup);
  const costSchedules = validated.users.reduce((count, user) => count + (user.defaultCostSchedules?.length ?? 0), 0);
  const storageKeys = Object.keys(backup.localStorage).length;
  const workbook = XLSX.utils.book_new();
  const overview = [
    ["FinTrack full application backup", ""],
    ["Application", backup.app],
    ["Format version", backup.formatVersion],
    ["Exported at (ISO)", backup.exportedAt],
    ["Accounts", validated.recordCounts.accounts],
    ["Trades", validated.recordCounts.transactions],
    ["Investments", validated.recordCounts.investments],
    ["Expenses", validated.recordCounts.expenses],
    ["Income entries", validated.recordCounts.incomes],
    ["Withdrawals", validated.recordCounts.withdrawals],
    ["Cost schedules", costSchedules],
    ["Complete app storage keys", storageKeys],
    ["Restore instructions", `Import this workbook in FinTrack Settings. The “${STORAGE_SHEET}” sheet stores the complete, exact application backup, including all accounts, records, preferences, and saved views.`],
  ];
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(overview), "Overview");

  const accountRows = validated.users.map((user) => ({
    "Account ID": user.id,
    Name: user.name,
    Email: user.email,
    Currency: user.currency,
    "Starting Balance": user.startingBalance,
    "Current Balance": user.currentBalance ?? "",
    "Created At": user.createdAt,
    "Trades": user.transactions.length,
    "Investments": user.investments?.length ?? 0,
    "Expenses": user.expenses?.length ?? 0,
    "Income Entries": user.incomes?.length ?? 0,
    "Withdrawals": user.withdrawals?.length ?? 0,
  }));
  addJsonSheet(workbook, "Accounts", accountRows);
  addJsonSheet(workbook, "Trades", workbookRowsForRecords(validated.users, "transactions"));
  addJsonSheet(workbook, "Investments", workbookRowsForRecords(validated.users, "investments"));
  addJsonSheet(workbook, "Expenses", workbookRowsForRecords(validated.users, "expenses"));
  addJsonSheet(workbook, "Income", workbookRowsForRecords(validated.users, "incomes"));
  addJsonSheet(workbook, "Withdrawals", workbookRowsForRecords(validated.users, "withdrawals"));
  addJsonSheet(workbook, "Cost Schedules", workbookRowsForRecords(validated.users, "defaultCostSchedules"));

  const accountSettings = validated.users.flatMap((user) => Object.entries(user)
    .filter(([, value]) => !Array.isArray(value))
    .map(([setting, value]) => ({
      "Account ID": user.id,
      "Account Name": user.name,
      Setting: setting,
      Value: value && typeof value === "object" ? JSON.stringify(value) : value,
    })));
  addJsonSheet(workbook, "Account Settings", accountSettings);

  const storageRows = Object.entries(backup.localStorage).flatMap(([key, value]) => {
    const totalParts = Math.max(1, Math.ceil(value.length / MAX_CELL_CHARACTERS));
    return Array.from({ length: totalParts }, (_, index) => ({
      "Storage Key": key,
      Part: index + 1,
      "Total Parts": totalParts,
      Data: value.slice(index * MAX_CELL_CHARACTERS, (index + 1) * MAX_CELL_CHARACTERS),
    }));
  });
  addJsonSheet(workbook, STORAGE_SHEET, storageRows);

  // Match the Transactions export's default workbook output. The raw backup
  // sheet already contains every storage value, so ZIP compression only made
  // this full export look unexpectedly smaller beside that workbook.
  XLSX.writeFile(workbook, `fintrack-full-backup-${new Date().toISOString().slice(0, 10)}.xlsx`, { compression: false });
  return { ...validated.recordCounts, costSchedules, storageKeys };
};

export const readApplicationBackupExcelFile = async (file: File): Promise<ValidatedApplicationBackup> => {
  if (file.size > MAX_BACKUP_SIZE) throw new Error("Backup files must be 50 MB or smaller.");
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", raw: true });
  const worksheet = workbook.Sheets[STORAGE_SHEET];
  if (!worksheet) throw new Error(`This workbook is missing its “${STORAGE_SHEET}” full-backup sheet.`);

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: "", raw: true });
  if (!rows.length) throw new Error("The workbook contains no full application data to restore.");
  const chunks = new Map<string, Map<number, string>>();
  const expectedParts = new Map<string, number>();
  rows.forEach((row, index) => {
    const key = String(row["Storage Key"] ?? "");
    const part = Number(row.Part);
    const total = Number(row["Total Parts"]);
    const data = row.Data;
    if (!key || !Number.isInteger(part) || part < 1 || !Number.isInteger(total) || total < 1 || part > total || typeof data !== "string") {
      throw new Error(`Full application data row ${index + 2} is invalid.`);
    }
    if (expectedParts.has(key) && expectedParts.get(key) !== total) throw new Error(`The workbook contains inconsistent chunks for “${key}”.`);
    const keyChunks = chunks.get(key) ?? new Map<number, string>();
    if (keyChunks.has(part)) throw new Error(`The workbook contains a duplicate data chunk for “${key}”.`);
    keyChunks.set(part, data);
    chunks.set(key, keyChunks);
    expectedParts.set(key, total);
  });

  const localStorage: Record<string, string> = {};
  chunks.forEach((parts, key) => {
    const total = expectedParts.get(key)!;
    if (parts.size !== total) throw new Error(`The workbook is missing one or more data chunks for “${key}”.`);
    localStorage[key] = Array.from({ length: total }, (_, index) => parts.get(index + 1)!).join("");
  });
  return validateApplicationBackup({
    app: "FinTrack",
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    localStorage,
  });
};
