import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Search,
  Trash2,
  ListFilter,
} from "lucide-react";
import { Fragment, useDeferredValue, useEffect, useMemo, useState } from "react";
import type { Transaction } from "../types/finance";
import { calculateCurrentBalance } from "../utils/balance";
import { formatCurrency } from "../utils/money";
import { usePersistentState } from "../hooks/usePersistentState";

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
  const pageSize = 20;
  const [search, setSearch] = usePersistentState("transactions.search", "");
  const deferredSearch = useDeferredValue(search);
  const [expandedTransactionId, setExpandedTransactionId] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = usePersistentState<"newest" | "oldest">("transactions.sortOrder", "newest");
  const [typeFilter, setTypeFilter] = usePersistentState<"all" | "profit" | "loss">("transactions.typeFilter", "all");
  const [currentPage, setCurrentPage] = useState(1);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const expirations = transactions
      .map((transaction) => Date.parse(transaction.createdAt ?? "") + 24 * 60 * 60 * 1000)
      .filter((expiry) => Number.isFinite(expiry) && expiry > now);
    if (expirations.length === 0) return;
    const timer = window.setTimeout(() => setNow(Date.now()), Math.max(0, Math.min(...expirations) - now));
    return () => window.clearTimeout(timer);
  }, [transactions, now]);

  // Calculate running trading balance from transactions only. Investments are
  // portfolio assets, not individual trade entries, so they must not shift rows.
  const tradingBalance = useMemo(
    () => calculateCurrentBalance(user),
    [transactions, user.startingBalance, user.expenses, user.expenseTrackingEnabled, user.balanceAdjustment],
  );
  const transactionsWithBalance = useMemo(() => {
    const sorted = transactions.map((transaction) => ({
      transaction,
      timestamp: Date.parse(transaction.date),
    })).sort((left, right) => left.timestamp - right.timestamp);
    const { totalProfit, totalLoss } = transactions.reduce((totals, transaction) => {
      if (transaction.type === "profit") totals.totalProfit += transaction.amount;
      else if (transaction.type === "loss") totals.totalLoss += transaction.amount;
      return totals;
    }, { totalProfit: 0, totalLoss: 0 });

    // Derive the trading-only baseline from the same balance used on save.
    const effectiveStartingBalance = tradingBalance - totalProfit + totalLoss;

    let runningBalance = effectiveStartingBalance;
    return sorted.map(({ transaction }) => ({
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
  }, [transactions, tradingBalance]);

  const filteredTransactions = useMemo(() => {
    const value = deferredSearch.trim().toLocaleLowerCase();

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
  }, [transactionsWithBalance, deferredSearch, sortOrder, typeFilter]);
  const pageCount = Math.max(1, Math.ceil(filteredTransactions.length / pageSize));
  const visiblePage = Math.min(currentPage, pageCount);
  const pageTransactions = useMemo(() => {
    const start = (visiblePage - 1) * pageSize;
    return filteredTransactions.slice(start, start + pageSize);
  }, [filteredTransactions, visiblePage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [transactions, search, typeFilter, sortOrder]);

  return (
    <div className="enterprise-table-container">
      <div className="enterprise-table-toolbar">
        <div className="search-box shared-black-search">
          <Search size={16} className="search-icon" />
          <input
            aria-label="Search transactions by category or note"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
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
              <th>Trade Direction</th>
              <th>Category</th>
              <th className="transaction-note-column">Notes</th>
              <th className="numeric-cell">Trades</th>
              <th className="numeric-cell">Gross</th>
              <th className="numeric-cell">Cost</th>
              <th className="numeric-cell">Net Amount</th>
              <th className="numeric-cell">Return</th>
              <th className="numeric-cell">Balance</th>
              <th className="action-column">Actions</th>
            </tr>
          </thead>

          <tbody>
            {pageTransactions.map((transaction) => {
              const date = new Date(transaction.date);
              const isProfit = transaction.type === "profit";
              const createdAt = Date.parse(transaction.createdAt ?? "");
              const isNew = Number.isFinite(createdAt) && createdAt <= now && now < createdAt + 24 * 60 * 60 * 1000;
              const tradesCount = isProfit ? transaction.profitTradeCount : transaction.lossTradeCount;
              const investedAmount = transaction.entryPrice != null && transaction.quantity != null
                && Number.isFinite(transaction.entryPrice) && Number.isFinite(transaction.quantity)
                && transaction.entryPrice > 0 && transaction.quantity > 0
                ? transaction.entryPrice * transaction.quantity
                : null;
              const calculatedReturnPercent = investedAmount != null && Number.isFinite(investedAmount) && investedAmount > 0
                && transaction.exitPrice != null && Number.isFinite(transaction.exitPrice) && transaction.exitPrice >= 0
                && Number.isFinite(transaction.amount)
                ? ((isProfit ? transaction.amount : -transaction.amount) / investedAmount) * 100
                : null;
              const returnPercent = calculatedReturnPercent != null && Number.isFinite(calculatedReturnPercent) ? calculatedReturnPercent : null;
              const explicitTradeType = transaction.note.trim().match(/^(?:profit|loss)\s+trade$/i)?.[0];
              const tradeType = transaction.optionType
                ?? explicitTradeType
                ?? (transaction.instrument ? "Instrument Trade" : "—");
              const isExpanded = expandedTransactionId === transaction.id;

              return (
                <Fragment key={transaction.id}>
                <tr>
                  <td>
                    <div className="table-date-cell">
                      <div className="table-date-heading">
                        <span className="date-main">
                          {date.toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                        {isNew && <span className="tx-new-badge" aria-label="Added within the last 24 hours">NEW</span>}
                      </div>
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

                  <td><span className={`trade-type-pill${transaction.optionType ? ` ${transaction.optionType.toLowerCase()}` : ""}`}>{tradeType}</span></td>

                  <td>
                    <span className="table-category">{transaction.category}</span>
                  </td>

                  <td className="transaction-note-column">
                    <span className="transaction-note-preview" title={transaction.note || undefined}>
                      {transaction.note || "—"}
                    </span>
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

                  <td className={`numeric-cell transaction-return ${returnPercent == null ? "unavailable" : returnPercent > 0 ? "profit" : returnPercent < 0 ? "loss" : "zero"}`} title={returnPercent == null ? "Return is shown when entry price, exit price, and quantity are recorded." : `Net P&L divided by invested amount (${formatCurrency(investedAmount!, user.currency)}).`}>
                    {returnPercent == null ? "—" : `${returnPercent > 0 ? "+" : returnPercent < 0 ? "−" : ""}${Math.abs(returnPercent).toFixed(2)}%`}
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

                      <button
                        className="table-btn-icon expand"
                        type="button"
                        onClick={() => setExpandedTransactionId(isExpanded ? null : transaction.id)}
                        title={isExpanded ? "Hide transaction details" : "Show transaction details"}
                        aria-label={isExpanded ? "Hide transaction details" : "Show transaction details"}
                        aria-expanded={isExpanded}
                      >
                        {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                      </button>
                    </div>
                  </td>
                </tr>
                <tr className={`transaction-detail-row ${isExpanded ? "is-expanded" : ""}`}>
                  <td colSpan={12}>
                    <div className="transaction-detail-disclosure" aria-hidden={!isExpanded}>
                      <div className="transaction-detail-disclosure-inner">
                        <section className={`transaction-details ${isProfit ? "profit" : "loss"}`} aria-label="Transaction details">
                          <div className="transaction-details-heading">
                            <div className="transaction-details-title">
                              <span>TRADE BREAKDOWN</span>
                              <strong>Transaction details</strong>
                            </div>
                            <span>{date.toLocaleString("en-IN", { dateStyle: "full", timeStyle: "short" })}</span>
                          </div>
                          <dl className="transaction-details-grid">
                            <div><dt>Type</dt><dd>{isProfit ? "Profit" : "Loss"}</dd></div>
                            <div><dt>Category</dt><dd>{transaction.category}</dd></div>
                            <div><dt>Option type</dt><dd>{transaction.optionType ?? "Not specified"}</dd></div>
                            {transaction.instrument && <div><dt>Instrument</dt><dd>{transaction.instrument}{transaction.strikePrice ? ` ${transaction.strikePrice}` : ""}{transaction.optionType ? ` ${transaction.optionType}` : ""}</dd></div>}
                            {transaction.expiryDate && <div><dt>Expiry</dt><dd>{transaction.expiryDate}</dd></div>}
                            <div><dt>Price</dt><dd>{formatCurrency(transaction.price ?? 0, user.currency)}</dd></div>
                            <div><dt>Gross amount</dt><dd>{formatCurrency(transaction.grossAmount ?? transaction.price ?? 0, user.currency)}</dd></div>
                            <div><dt>Cost</dt><dd>{formatCurrency(transaction.costAmount ?? 0, user.currency)}</dd></div>
                            {transaction.brokerageAmount != null && <div><dt>Brokerage</dt><dd>{formatCurrency(transaction.brokerageAmount, user.currency)}</dd></div>}
                            {transaction.otherChargesAmount != null && <div><dt>Other charges</dt><dd>{formatCurrency(transaction.otherChargesAmount, user.currency)}</dd></div>}
                            {transaction.chargesBasis && <div><dt>Charges basis</dt><dd>{transaction.chargesBasis === "estimated" ? "Estimated" : "Manually entered"}</dd></div>}
                            <div><dt>Net amount</dt><dd>{isProfit ? "+" : "−"}{formatCurrency(transaction.amount, user.currency)}</dd></div>
                            <div><dt>Balance after transaction</dt><dd>{formatCurrency(transaction.balance, user.currency)}</dd></div>
                            {tradesCount !== undefined && <div><dt>Trade count</dt><dd>{tradesCount}</dd></div>}
                            {transaction.confidenceLevel !== undefined && <div><dt>Confidence</dt><dd>{transaction.confidenceLevel}%</dd></div>}
                            {transaction.plannedRiskAmount != null && transaction.plannedRiskAmount > 0 && <><div><dt>Planned risk</dt><dd>{formatCurrency(transaction.plannedRiskAmount, user.currency)}</dd></div><div><dt>Outcome in R</dt><dd>{((isProfit ? transaction.amount : -transaction.amount) / transaction.plannedRiskAmount).toFixed(2)}R</dd></div></>}
                            <div className="transaction-details-note"><dt>Note</dt><dd>{transaction.note || "—"}</dd></div>
                          </dl>
                        </section>
                      </div>
                    </div>
                  </td>
                </tr>
                </Fragment>
              );
            })}

            {filteredTransactions.length === 0 && (
              <tr>
                <td colSpan={12} className="table-empty-state">
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

      {filteredTransactions.length > pageSize && <div className="enterprise-table-footer">
        <div className="footer-stats">
          <span>Showing <strong>{filteredTransactions.length ? (visiblePage - 1) * pageSize + 1 : 0}–{Math.min(visiblePage * pageSize, filteredTransactions.length)}</strong> of <strong>{filteredTransactions.length}</strong> filtered records ({transactions.length} total)</span>
          <span className="page-size-label">20 per page</span>
        </div>
        {filteredTransactions.length > 0 && <nav className="transaction-pagination" aria-label="Transaction pages">
          <button type="button" className="pagination-button" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={visiblePage <= 1} aria-label="Previous page"><ChevronLeft size={15}/> Previous</button>
          <span>Page <strong>{visiblePage}</strong> of <strong>{pageCount}</strong></span>
          <button type="button" className="pagination-button" onClick={() => setCurrentPage((page) => Math.min(pageCount, page + 1))} disabled={visiblePage >= pageCount} aria-label="Next page">Next <ChevronRight size={15}/></button>
        </nav>}
      </div>}
    </div>
  );
};

export default TransactionTable;
