import {
  Download,
  Plus,
  Upload,
} from "lucide-react";
import { useRef, useState } from "react";
import type {
  Transaction,
  UserAccount,
} from "../types/finance";
import TransactionTable from "../components/TransactionTable";
import { exportFinanceToExcel, importFinanceFromExcel } from "../utils/excel";
import type { FinanceImport } from "../utils/excel";
import { useAppDialog } from "../components/AppDialog";

interface Props {
  user: UserAccount;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onEdit: (transaction: Transaction) => void;
  onImport?: (backup: FinanceImport) => { imported: number; skipped: number; otherRecords: number; weekendSkipped?: number };
}

const Transactions = ({
  user,
  onAdd,
  onDelete,
  onEdit,
  onImport,
}: Props) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { alert: showAlert } = useAppDialog();
  const [importing, setImporting] = useState(false);

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const backup = await importFinanceFromExcel(file);
      const result = onImport?.(backup) ?? {
        imported: backup.transactions.length,
        skipped: 0,
        otherRecords: 0,
        weekendSkipped: 0,
      };
      const skippedDetails = [
        result.skipped > 0 ? `${result.skipped} skipped because their month is locked` : "",
        (result.weekendSkipped ?? 0) > 0 ? `${result.weekendSkipped} skipped because transactions cannot be dated on Saturday or Sunday` : "",
      ].filter(Boolean).join(". ");
      await showAlert(
        skippedDetails
          ? `Restored ${result.imported} transactions and ${result.otherRecords} other finance records. ${skippedDetails}. ${result.skipped > 0 ? "Unlock the month in Reports to import locked transactions." : ""}`
          : `Successfully restored ${result.imported} transactions and ${result.otherRecords} other finance records.`,
        "Import complete",
      );
    } catch (error) {
      await showAlert(`Import failed: ${error instanceof Error ? error.message : "Unknown error"}`, "Import failed");
    } finally {
      setImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <div className="page-content transactions-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            LEDGER
          </span>

          <h1>
            Transaction records
          </h1>

          <p>
            View and manage all your
            finance records.
          </p>
        </div>

        <div className="heading-actions">
          <button
            className="secondary-button"
            onClick={handleImportClick}
            disabled={importing}
          >
            <Upload size={17} />
            {importing ? "Importing..." : "Import Excel"}
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileChange}
            style={{ display: "none" }}
            aria-label="Import Excel file"
          />

          <button
            className="secondary-button"
            onClick={() =>
              exportFinanceToExcel(user)
            }
          >
            <Download size={17} />
            Export Excel
          </button>

          <button
            className="primary-button"
            onClick={onAdd}
          >
            <Plus size={17} />
            Add transaction
          </button>
        </div>
      </div>

      <TransactionTable
        transactions={
          user.transactions
        }
        onDelete={onDelete}
        onEdit={onEdit}
        user={user}
      />
    </div>
  );
};

export default Transactions;
