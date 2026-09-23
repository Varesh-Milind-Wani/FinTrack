import * as XLSX from "xlsx";
import type { UserAccount, Transaction } from "../types/finance";

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
  }));

  const workbook = XLSX.utils.book_new();

  const summarySheet =
    XLSX.utils.aoa_to_sheet(summaryData);

  const transactionSheet =
    XLSX.utils.json_to_sheet(transactionData);

  summarySheet["!cols"] = [
    { wch: 25 },
    { wch: 35 },
  ];

  transactionSheet["!cols"] = [
    { wch: 38 },
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
  ];

  XLSX.utils.book_append_sheet(
    workbook,
    summarySheet,
    "Summary"
  );

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

export const importFinanceFromExcel = (file: File): Promise<Transaction[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const transactionSheet = workbook.Sheets["Transactions"];

        if (!transactionSheet) {
          reject(new Error("Transactions sheet not found in Excel file"));
          return;
        }

        const rows = XLSX.utils.sheet_to_json(transactionSheet);
        const transactions: Transaction[] = [];

        rows.forEach((row: any) => {
          try {
            // Parse date and time
            let date: Date;
            if (row.Date && row.Time) {
              // Try to parse "DD/MM/YYYY" and "HH:MM:SS AM/PM"
              const dateStr = row.Date;
              const timeStr = row.Time;
              date = new Date(`${dateStr} ${timeStr}`);
              
              // If parsing fails, try ISO format
              if (Number.isNaN(date.getTime())) {
                date = new Date(row.Date);
              }
            } else if (row.Date) {
              date = new Date(row.Date);
            } else {
              console.warn("Skipping row without date:", row);
              return;
            }

            if (Number.isNaN(date.getTime())) {
              console.warn("Invalid date in row:", row);
              return;
            }

            const transaction: Transaction = {
              id: row["Transaction ID"] || crypto.randomUUID(),
              date: date.toISOString(),
              type: (row.Type?.toLowerCase() === "profit" ? "profit" : "loss") as "profit" | "loss",
              amount: Number(row["Net Amount"] || row["Signed Amount"] || 0),
              grossAmount: Number(row["Gross Amount"] || 0),
              costAmount: Number(row["Cost Amount"] || 0),
              price: Number(row.Price || 0),
              category: row.Category || "Other",
              note: row.Note || "",
              profitTradeCount: row.Type?.toLowerCase() === "profit" ? Number(row.Trades || 0) : undefined,
              lossTradeCount: row.Type?.toLowerCase() === "loss" ? Number(row.Trades || 0) : undefined,
            };

            transactions.push(transaction);
          } catch (error) {
            console.warn("Error processing row:", row, error);
          }
        });

        resolve(transactions);
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
