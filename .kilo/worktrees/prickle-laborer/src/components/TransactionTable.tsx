import {
  ArrowDownRight,
  ArrowUpRight,
  Pencil,
  Search,
  Trash2,
  ListFilter,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { Transaction } from "../types/finance";
import { getAuthoritativeBalance } from "../utils/balance";

interface Props {
  transactions: Transaction[];
  onDelete: (id: string) => void;
  onEdit: (transaction: Transaction) => void;
  user: any; // Add user to get authoritative balance
}

const TransactionTable = ({
  transactions,
  onDelete,
  onEdit,
  user,
}: Props) => {
  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] =
    useState<"newest" | "oldest">("newest");
  const [typeFilter, setTypeFilter] = useState<"all" | "profit" | "loss">("all");

  // Calculate running balance for each transaction using authoritative starting point
  const transactionsWithBalance = useMemo(() => {
    const sorted = [...transactions].sort((left, right) => {
      const leftDate = new Date(left.date).getTime();
      const rightDate = new Date(right.date).getTime();
      return leftDate - rightDate;
    });

    // Calculate effective starting balance to ensure final balance matches authoritative balance
    const authoritativeCurrentBalance = getAuthoritativeBalance(user);
    const totalProfit = transactions.filter(t => t.type === 'profit').reduce((sum, t) => sum + t.amount, 0);
    const totalLoss = transactions.filter(t => t.type === 'loss').reduce((sum, t) => sum + t.amount, 0);
    const effectiveStartingBalance = authoritativeCurrentBalance - totalProfit + totalLoss;

    let runningBalance = effectiveStartingBalance;
    return sorted.map((transaction) => ({
      ...transaction,
      balance: (() => {
        const amount = transaction.amount;
        if (transaction.type === 'profit') {
          runningBalance += amount;
        } else {
          runningBalance -= amount;
        }
        return runningBalance;
      })(),
    }));
  }, [transactions, user]);

  const filteredTransactions = useMemo(() => {
    const value = search.toLowerCase();

    return [...transactionsWithBalance]
      .filter((transaction) => {
        if (typeFilter !== "all" && transaction.type !== typeFilter) return false;
        return (
          transaction.category.toLowerCase().includes(value) ||
          transaction.note.toLowerCase().includes(value)
        );
      })
      .sort((left, right) => {
        const leftDate = new Date(left.date).getTime();
        const rightDate = new Date(right.date).getTime();

        return sortOrder === "newest"
          ? rightDate - leftDate
          : leftDate - rightDate;
      });
  }, [transactionsWithBalance, search, sortOrder, typeFilter]);

  return (
    <div className="enterprise-table-container">
      <div className="enterprise-table-toolbar">
        <div className="search-box">
          <Search size={16} className="search-icon" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search category or note..."
          />
        </div>

        <div className="table-filters">
          <div className="filter-group">
            <ListFilter size={16} />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as any)}
            >
              <option value="all">All Types</option>
              <option value="profit">Profit</option>
              <option value="loss">Loss</option>
            </select>
          </div>

          <div className="filter-group">
            <select
              value={sortOrder}
              onChange={(e) =>
                setSortOrder(e.target.value as "newest" | "oldest")
              }
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
            </select>
          </div>
        </div>
      </div>

      <div className="enterprise-table-wrapper">
        <table className="enterprise-table">
          <thead>
            <tr>
              <th>Date / Time</th>
              <th>Type</th>
              <th>Category</th>
              <th>Price</th>
              <th>Trades</th>
              <th>Gross</th>
              <th>Cost</th>
              <th>Net Amount</th>
              <th>Balance</th>
              <th className="action-column">Actions</th>
            </tr>
          </thead>

          <tbody>
            {filteredTransactions.map((transaction) => {
              const date = new Date(transaction.date);
              const isProfit = transaction.type === "profit";
              const tradesCount = isProfit ? transaction.profitTradeCount : transaction.lossTradeCount;

              return (
                <tr key={transaction.id}>
                  <td>
                    <div className="table-date-cell">
                      <span className="date-main">
                        {date.toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                      <span className="time-sub">
                        {date.toLocaleTimeString("en-IN", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </td>

                  <td>
                    <div className={`table-badge ${isProfit ? "profit" : "loss"}`}>
                      {isProfit ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                      {isProfit ? "Profit" : "Loss"}
                    </div>
                  </td>

                  <td>
                    <span className="table-category">{transaction.category}</span>
                    {transaction.note && (
                      <span className="table-note-preview" title={transaction.note}>
                        {transaction.note.length > 25 ? transaction.note.substring(0, 25) + "..." : transaction.note}
                      </span>
                    )}
                  </td>

                  <td className="numeric-cell">
                    ₹{transaction.price?.toLocaleString("en-IN") || "0"}
                  </td>

                  <td className="numeric-cell">
                    {tradesCount ? (
                      <span className="trade-count-pill">{tradesCount}</span>
                    ) : "-"}
                  </td>

                  <td className="numeric-cell text-muted">
                    {transaction.grossAmount ? `₹${transaction.grossAmount.toLocaleString("en-IN")}` : "-"}
                  </td>

                  <td className="numeric-cell text-muted">
                    {transaction.costAmount ? `₹${transaction.costAmount.toLocaleString("en-IN")}` : "-"}
                  </td>

                  <td className={`numeric-cell net-amount ${isProfit ? "profit" : "loss"}`}>
                    {isProfit ? "+" : "-"}₹{transaction.amount.toLocaleString("en-IN")}
                  </td>

                  <td className="numeric-cell balance-cell">
                    <span className="balance-amount">₹{Math.round(transaction.balance).toLocaleString("en-IN")}</span>
                  </td>

                  <td className="action-column">
                    <div className="table-actions">
                      <button
                        className="table-btn-icon edit"
                        onClick={() => onEdit(transaction)}
                        title="Edit transaction"
                      >
                        <Pencil size={15} />
                      </button>

                      <button
                        className="table-btn-icon delete"
                        onClick={() => onDelete(transaction.id)}
                        title="Delete transaction"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}

            {filteredTransactions.length === 0 && (
              <tr>
                <td colSpan={10} className="table-empty-state">
                  <div className="empty-state-content">
                    <Search size={32} />
                    <p>No transactions found matching your criteria.</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="enterprise-table-footer">
        <div className="footer-stats">
          <span>Showing <strong>{filteredTransactions.length}</strong> of <strong>{transactions.length}</strong> records</span>
        </div>
      </div>
    </div>
  );
};

export default TransactionTable;
