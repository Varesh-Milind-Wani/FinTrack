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

interface Props {
  user: UserAccount;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onEdit: (transaction: Transaction) => void;
  onImport?: (transactions: Transaction[]) => void;
}

const Transactions = ({
  user,
  onAdd,
  onDelete,
  onEdit,
  onImport,
}: Props) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const transactions = await importFinanceFromExcel(file);
      if (onImport) {
        onImport(transactions);
      }
      alert(`Successfully imported ${transactions.length} transactions!`);
    } catch (error) {
      alert(`Import failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <div className="page-content">
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
