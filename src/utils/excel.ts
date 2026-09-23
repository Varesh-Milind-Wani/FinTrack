import * as XLSX from "xlsx";
import type { DefaultCostSchedule, Expense, Investment, Transaction, UserAccount, Withdrawal } from "../types/finance";

export interface FinanceImport {
  transactions: Transaction[];
  investments: Investment[];
  expenses: Expense[];
  withdrawals: Withdrawal[];
  defaultCostSchedules: DefaultCostSchedule[];
  lockedMonths: string[];
  settings?: Pick<UserAccount, "startingBalance" | "startingBalanceLocked" | "currency" | "defaultCostAmount" | "expenseIncludedByDefault" | "currentBalance" | "balanceAdjustment" | "investmentIncluded" | "expenseTrackingEnabled" | "costLocked">;
}

type ExcelRow = Record<string, unknown>;

const getCellValue = (row: ExcelRow, column: string): unknown => {
  const exactValue = row[column];
  if (exactValue !== undefined) return exactValue;

  const matchingColumn = Object.keys(row).find(
    (key) => key.trim().toLowerCase() === column.toLowerCase(),
  );
  return matchingColumn ? row[matchingColumn] : undefined;
};

const toNumber = (value: unknown): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;

  const parsed = Number(value.replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const toBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string" && typeof value !== "number") return undefined;

  const normalized = String(value).trim().toLowerCase();
  if (["true", "yes", "1"].includes(normalized)) return true;
  if (["false", "no", "0"].includes(normalized)) return false;
  return undefined;
};

const parseTransactionDate = (dateValue: unknown, timeValue: unknown): Date | null => {
  let year: number;
  let month: number;
  let day: number;

  if (dateValue instanceof Date && !Number.isNaN(dateValue.getTime())) {
    year = dateValue.getFullYear();
    month = dateValue.getMonth();
    day = dateValue.getDate();
  } else if (typeof dateValue === "number") {
    const excelDate = XLSX.SSF.parse_date_code(dateValue);
    if (!excelDate) return null;
    year = excelDate.y;
    month = excelDate.m - 1;
    day = excelDate.d;
  } else if (typeof dateValue === "string") {
    const value = dateValue.trim();
    // The current export includes an ISO timestamp to preserve the exact
    // instant, timezone offset, and any milliseconds without ambiguity.
    if (value.includes("T") && !timeValue) {
      const timestamp = new Date(value);
      return Number.isNaN(timestamp.getTime()) ? null : timestamp;
    }
    // FinTrack exports dates as en-IN: DD/MM/YYYY. Parse it explicitly instead
    // of relying on the browser, which treats it as MM/DD/YYYY or rejects it.
    const indianDate = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    const isoDate = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);

    if (indianDate) {
      day = Number(indianDate[1]);
      month = Number(indianDate[2]) - 1;
      year = Number(indianDate[3]);
    } else if (isoDate) {
      year = Number(isoDate[1]);
      month = Number(isoDate[2]) - 1;
      day = Number(isoDate[3]);
    } else {
      const parsedDate = new Date(value);
      if (Number.isNaN(parsedDate.getTime())) return null;
      year = parsedDate.getFullYear();
      month = parsedDate.getMonth();
      day = parsedDate.getDate();
    }
  } else {
    return null;
  }

  let hours = 0;
  let minutes = 0;
  let seconds = 0;
  if (timeValue instanceof Date && !Number.isNaN(timeValue.getTime())) {
    hours = timeValue.getHours();
    minutes = timeValue.getMinutes();
    seconds = timeValue.getSeconds();
  } else if (typeof timeValue === "number") {
    const totalSeconds = Math.round((timeValue % 1) * 24 * 60 * 60);
    hours = Math.floor(totalSeconds / 3600) % 24;
    minutes = Math.floor((totalSeconds % 3600) / 60);
    seconds = totalSeconds % 60;
  } else if (typeof timeValue === "string" && timeValue.trim()) {
    const time = timeValue.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?$/);
    if (!time) return null;
    hours = Number(time[1]);
    minutes = Number(time[2]);
    seconds = Number(time[3] ?? 0);
    const meridiem = time[4]?.toLowerCase();
    if (meridiem) {
      if (hours < 1 || hours > 12) return null;
      hours = (hours % 12) + (meridiem === "pm" ? 12 : 0);
    }
  }

  if (hours > 23 || minutes > 59 || seconds > 59) return null;

  const date = new Date(year, month, day, hours, minutes, seconds);
  return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day
    ? date
    : null;
};

export const exportFinanceToExcel = (user: UserAccount) => {
  const totalProfit = user.transactions
    .filter((transaction) => transaction.type === "profit")
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  const totalLoss = user.transactions
    .filter((transaction) => transaction.type === "loss")
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  const currentBalance =
    user.startingBalance + totalProfit - totalLoss;

  const netPerformance = totalProfit - totalLoss;

  const summaryData = [
    ["FINTRACK - FINANCE REPORT"],
    [],
    ["Account Information"],
    ["Name", user.name],
    ["Email", user.email],
    ["Created", new Date(user.createdAt).toLocaleString()],
    [],
    ["Financial Summary"],
    ["Starting Balance", user.startingBalance],
    ["Total Profit", totalProfit],
    ["Total Loss", totalLoss],
    ["Current Balance", currentBalance],
    ["Net Performance", netPerformance],
    [],
    ["Exported At", new Date().toLocaleString()],
  ];

  const transactionData = user.transactions.map((transaction) => ({
    "Transaction ID": transaction.id,
    "Recorded At (ISO)": transaction.date,
    Date: new Date(transaction.date).toLocaleDateString("en-IN"),
    Time: new Date(transaction.date).toLocaleTimeString("en-IN"),
    Type: transaction.type === "profit" ? "Profit" : "Loss",
    Category: transaction.category,
    Note: transaction.note || "-",
    Price: transaction.price || 0,
    "Trades": transaction.type === "profit" ? (transaction.profitTradeCount || 0) : (transaction.lossTradeCount || 0),
    "Gross Amount": transaction.grossAmount || 0,
    "Cost Amount": transaction.costAmount || 0,
    "Net Amount": transaction.amount,
    "Signed Amount":
      transaction.type === "profit"
        ? transaction.amount
        : -transaction.amount,
    "Confidence Level": transaction.confidenceLevel ?? "",
    "Track Confidence": transaction.trackConfidence ?? "",
  }));

  const workbook = XLSX.utils.book_new();

  // A versioned backup sheet preserves every finance field exactly. The other
  // sheets remain easy to read and edit in Excel.
  const backup: FinanceImport = {
    transactions: user.transactions,
    investments: user.investments ?? [],
    expenses: user.expenses ?? [],
    withdrawals: user.withdrawals ?? [],
    defaultCostSchedules: user.defaultCostSchedules ?? [],
    lockedMonths: user.lockedMonths ?? [],
    settings: {
      startingBalance: user.startingBalance,
      startingBalanceLocked: user.startingBalanceLocked,
      currency: user.currency,
      defaultCostAmount: user.defaultCostAmount,
      expenseIncludedByDefault: user.expenseIncludedByDefault,
      currentBalance: user.currentBalance,
      balanceAdjustment: user.balanceAdjustment,
      investmentIncluded: user.investmentIncluded,
      expenseTrackingEnabled: user.expenseTrackingEnabled,
      costLocked: user.costLocked,
    },
  };
  const backupJson = JSON.stringify(backup);
  // Excel limits a cell to 32,767 characters. Split large backups so no
  // transaction history is lost when an account has many records.
  const backupChunks = Array.from(
    { length: Math.ceil(backupJson.length / 30000) },
    (_, index) => ["Data Chunk", index + 1, backupJson.slice(index * 30000, (index + 1) * 30000)],
  );
  const backupSheet = XLSX.utils.aoa_to_sheet([
    ["FINTRACK FULL BACKUP", "Version", "2"],
    ["Exported At", new Date().toISOString()],
    ...backupChunks,
  ]);

  const summarySheet =
    XLSX.utils.aoa_to_sheet(summaryData);

  const transactionSheet =
    XLSX.utils.json_to_sheet(transactionData);
  const investmentSheet = XLSX.utils.json_to_sheet((user.investments ?? []).map((item) => ({
    "Investment ID": item.id, "Recorded At (ISO)": item.date, Name: item.name, Type: item.type,
    "Amount Invested": item.amount, "Current Value": item.currentValue, Note: item.note,
  })));
  const expenseSheet = XLSX.utils.json_to_sheet((user.expenses ?? []).map((item) => ({
    "Expense ID": item.id, "Recorded At (ISO)": item.date, Name: item.name, Category: item.category, Amount: item.amount, Note: item.note,
  })));
  const withdrawalSheet = XLSX.utils.json_to_sheet((user.withdrawals ?? []).map((item) => ({
    "Withdrawal ID": item.id, "Recorded At (ISO)": item.date, Amount: item.amount, Method: item.method, Status: item.status, Note: item.note,
  })));
  const scheduleSheet = XLSX.utils.json_to_sheet((user.defaultCostSchedules ?? []).map((item) => ({
    "Schedule ID": item.id, "Start Date": item.startDate, Name: item.name, Amount: item.amount,
  })));

  summarySheet["!cols"] = [
    { wch: 25 },
    { wch: 35 },
  ];

  transactionSheet["!cols"] = [
    { wch: 38 },
    { wch: 28 },
    { wch: 15 },
    { wch: 13 },
    { wch: 12 },
    { wch: 18 },
    { wch: 35 },
    { wch: 12 },
    { wch: 10 },
    { wch: 15 },
    { wch: 15 },
    { wch: 15 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
  ];

  XLSX.utils.book_append_sheet(
    workbook,
    summarySheet,
    "Summary"
  );
  XLSX.utils.book_append_sheet(workbook, backupSheet, "FinTrack Backup");
  XLSX.utils.book_append_sheet(workbook, investmentSheet, "Investments");
  XLSX.utils.book_append_sheet(workbook, expenseSheet, "Expenses");
  XLSX.utils.book_append_sheet(workbook, withdrawalSheet, "Withdrawals");
  XLSX.utils.book_append_sheet(workbook, scheduleSheet, "Cost Schedules");

  XLSX.utils.book_append_sheet(
    workbook,
    transactionSheet,
    "Transactions"
  );

  const safeName =
    user.name
      .replace(/[^a-z0-9]/gi, "-")
      .toLowerCase() || "user";

  const fileName =
    `FinTrack-${safeName}-${new Date()
      .toISOString()
      .slice(0, 10)}.xlsx`;

  XLSX.writeFile(workbook, fileName);
};

export const importFinanceFromExcel = (file: File): Promise<FinanceImport> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array", cellDates: true });
        const backupSheet = workbook.Sheets["FinTrack Backup"];
        if (backupSheet) {
          const backupRows = XLSX.utils.sheet_to_json<unknown[]>(backupSheet, { header: 1, defval: "" });
          const chunks = backupRows
            .filter((row) => row[0] === "Data Chunk" && typeof row[2] === "string")
            .sort((left, right) => toNumber(left[1]) - toNumber(right[1]));
          const dataRow = backupRows.find((row) => row[0] === "Data");
          const backupJson = chunks.length > 0
            ? chunks.map((row) => String(row[2])).join("")
            : typeof dataRow?.[1] === "string" ? dataRow[1] : null;
          if (backupJson) {
            const backup = JSON.parse(backupJson) as FinanceImport;
            if (Array.isArray(backup.transactions)) {
              resolve({
                transactions: backup.transactions,
                investments: Array.isArray(backup.investments) ? backup.investments : [],
                expenses: Array.isArray(backup.expenses) ? backup.expenses : [],
                withdrawals: Array.isArray(backup.withdrawals) ? backup.withdrawals : [],
                defaultCostSchedules: Array.isArray(backup.defaultCostSchedules) ? backup.defaultCostSchedules : [],
                lockedMonths: Array.isArray(backup.lockedMonths) ? backup.lockedMonths : [],
                settings: backup.settings,
              });
              return;
            }
          }
        }

        const transactionSheet = workbook.Sheets["Transactions"];

        if (!transactionSheet) {
          reject(new Error("Transactions sheet not found in Excel file"));
          return;
        }

        const rows = XLSX.utils.sheet_to_json<ExcelRow>(transactionSheet, {
          defval: "",
          raw: true,
        });
        const transactions: Transaction[] = [];

        rows.forEach((row) => {
          try {
            const stableTimestamp = getCellValue(row, "Recorded At (ISO)");
            const dateValue = stableTimestamp || getCellValue(row, "Date");
            const date = parseTransactionDate(
              dateValue,
              stableTimestamp ? undefined : getCellValue(row, "Time"),
            );

            if (!dateValue) {
              console.warn("Skipping row without date:", row);
              return;
            }

            if (!date) {
              console.warn("Invalid date in row:", row);
              return;
            }

            const typeValue = String(getCellValue(row, "Type") ?? "").trim().toLowerCase();
            const type = typeValue === "profit" ? "profit" : "loss";
            const netAmount = getCellValue(row, "Net Amount");
            const signedAmount = toNumber(getCellValue(row, "Signed Amount"));
            const noteValue = String(getCellValue(row, "Note") ?? "");

            const transaction: Transaction = {
              id: String(getCellValue(row, "Transaction ID") || crypto.randomUUID()),
              date: date.toISOString(),
              type,
              // Amount is stored as a positive value for both profit and loss.
              amount: Math.abs(toNumber(netAmount) || signedAmount),
              grossAmount: toNumber(getCellValue(row, "Gross Amount")),
              costAmount: toNumber(getCellValue(row, "Cost Amount")),
              price: toNumber(getCellValue(row, "Price")),
              category: String(getCellValue(row, "Category") || "Other"),
              note: noteValue.trim() === "-" ? "" : noteValue,
              profitTradeCount: type === "profit" ? toNumber(getCellValue(row, "Trades")) : undefined,
              lossTradeCount: type === "loss" ? toNumber(getCellValue(row, "Trades")) : undefined,
              confidenceLevel: toNumber(getCellValue(row, "Confidence Level")) || undefined,
              trackConfidence: toBoolean(getCellValue(row, "Track Confidence")),
            };

            transactions.push(transaction);
          } catch (error) {
            console.warn("Error processing row:", row, error);
          }
        });

        // Legacy transaction-only exports remain supported.
        resolve({ transactions, investments: [], expenses: [], withdrawals: [], defaultCostSchedules: [], lockedMonths: [] });
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => {
      reject(new Error("Failed to read Excel file"));
    };

    reader.readAsArrayBuffer(file);
  });
};
