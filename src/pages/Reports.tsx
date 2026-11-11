import { BarChart3, CalendarDays, ChevronLeft, ChevronRight, Lock, Search, ShieldCheck, TrendingDown, TrendingUp, Unlock, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { UserAccount } from "../types/finance";
import { formatCurrency } from "../utils/money";
import { getMonthKey, getMonthLabel } from "../utils/monthLocks";
import { verifyBalancePin } from "../utils/balancePin";

interface Props {
  user: UserAccount;
  onToggleMonthLock: (monthKey: string) => void;
}

type MonthlyReport = {
  monthKey: string;
  profit: number;
  loss: number;
  transactions: number;
};

const REPORT_PAGE_SIZE = 20;

const Reports = ({ user, onToggleMonthLock }: Props) => {
  const [unlockMonthKey, setUnlockMonthKey] = useState<string | null>(null);
  const [unlockPin, setUnlockPin] = useState("");
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [pinNotice, setPinNotice] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [search, setSearch] = useState("");
  const reports = useMemo(() => {
    const byMonth = new Map<string, MonthlyReport>();

    user.transactions.forEach((transaction) => {
      const monthKey = getMonthKey(transaction.date);
      const current = byMonth.get(monthKey) ?? {
        monthKey,
        profit: 0,
        loss: 0,
        transactions: 0,
      };

      if (transaction.type === "profit") current.profit += transaction.amount;
      else current.loss += transaction.amount;
      current.transactions += 1;
      byMonth.set(monthKey, current);
    });

    return [...byMonth.values()].sort((left, right) => right.monthKey.localeCompare(left.monthKey));
  }, [user.transactions]);
  const filteredReports = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return reports;
    return reports.filter((report) => {
      const locked = user.lockedMonths?.includes(report.monthKey) ?? false;
      const net = report.profit - report.loss;
      return [
        report.monthKey,
        getMonthLabel(report.monthKey),
        String(report.transactions),
        String(report.profit),
        String(report.loss),
        String(net),
        formatCurrency(report.profit, user.currency),
        formatCurrency(report.loss, user.currency),
        formatCurrency(net, user.currency),
        locked ? "locked period secured" : "open for changes",
      ].join(" ").toLocaleLowerCase().includes(query);
    });
  }, [reports, search, user.lockedMonths, user.currency]);
  const pageCount = Math.max(1, Math.ceil(filteredReports.length / REPORT_PAGE_SIZE));
  const visiblePage = Math.min(currentPage, pageCount);
  const pageReports = filteredReports.slice((visiblePage - 1) * REPORT_PAGE_SIZE, visiblePage * REPORT_PAGE_SIZE);

  useEffect(() => setCurrentPage(1), [user.transactions, search]);

  const totals = useMemo(() => reports.reduce(
    (total, report) => ({
      profit: total.profit + report.profit,
      loss: total.loss + report.loss,
      transactions: total.transactions + report.transactions,
    }),
    { profit: 0, loss: 0, transactions: 0 },
  ), [reports]);

  const handleMonthLockClick = (monthKey: string, locked: boolean) => {
    setPinNotice(null);
    if (!locked) {
      onToggleMonthLock(monthKey);
      return;
    }
    if (!user.startingBalancePasswordHash || !user.startingBalancePasswordSalt) {
      setPinNotice("Set a starting balance PIN in Settings before unlocking a month.");
      return;
    }
    setUnlockMonthKey(monthKey);
    setUnlockPin("");
    setUnlockError(null);
  };

  const handleUnlockMonth = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!/^\d{4}$/.test(unlockPin)) {
      setUnlockError("Enter your 4-digit PIN.");
      return;
    }
    try {
      if (!(await verifyBalancePin(unlockPin, user))) {
        setUnlockError("Incorrect PIN. Please try again.");
        return;
      }
      if (unlockMonthKey) onToggleMonthLock(unlockMonthKey);
      setUnlockMonthKey(null);
      setUnlockPin("");
      setUnlockError(null);
    } catch {
      setUnlockError("PIN verification is unavailable in this browser.");
    }
  };

  return (
    <div className="page-content reports-page">
      <div className="page-heading reports-heading">
        <div>
          <span className="eyebrow">MONTHLY REPORTS</span>
          <h1>Monthly performance</h1>
          <p>Review profit and loss by month, then lock completed months to protect their records.</p>
        </div>
        <div className="reports-heading-badge"><CalendarDays size={17} /><span>{reports.length} months tracked</span></div>
      </div>

      <div className="report-summary-grid">
        <ReportSummary label="Total profit" value={formatCurrency(totals.profit, user.currency)} detail={`${totals.transactions} transactions recorded`} icon={<TrendingUp size={19} />} kind="profit" />
        <ReportSummary label="Total loss" value={formatCurrency(totals.loss, user.currency)} detail="All recorded losing trades" icon={<TrendingDown size={19} />} kind="loss" />
        <ReportSummary label="Net performance" value={formatCurrency(totals.profit - totals.loss, user.currency)} detail={totals.profit >= totals.loss ? "Positive overall performance" : "Review your monthly results"} icon={<BarChart3 size={19} />} kind={totals.profit >= totals.loss ? "net-positive" : "net-negative"} />
      </div>

      <div className="reports-lock-notice">
        <Lock size={18} />
        <span>Locked months cannot have transactions added, edited, deleted, or imported until unlocked.</span>
      </div>
      {pinNotice && <div className="error-message reports-pin-notice" role="alert">{pinNotice}</div>}

      <div className="reports-table-card">
        <div className="reports-table-title"><div><h3>Monthly ledger</h3><p>Lock a completed month to prevent any changes to its transaction records.</p></div><ShieldCheck size={20} /></div>
        <div className="reports-search-toolbar">
          <div className="search-box shared-black-search">
            <Search size={16} className="search-icon" />
            <input aria-label="Search monthly reports" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search" />
          </div>
          <span>{filteredReports.length} {filteredReports.length === 1 ? "month" : "months"}</span>
        </div>
        <div className="reports-table-scroll">
        <table className="reports-table">
          <thead>
            <tr>
              <th>Month</th>
              <th>Transactions</th>
              <th>Profit</th>
              <th>Loss</th>
              <th>Net P&amp;L</th>
              <th>Status</th>
              <th aria-label="Month lock action" />
            </tr>
          </thead>
          <tbody>
            {pageReports.map((report) => {
              const locked = user.lockedMonths?.includes(report.monthKey) ?? false;
              const net = report.profit - report.loss;
              return (
                <tr key={report.monthKey}>
                  <td><div className="report-month"><span>{getMonthLabel(report.monthKey)}</span><small>{locked ? "Period secured" : "Open for changes"}</small></div></td>
                  <td><span className="report-transaction-count">{report.transactions}</span></td>
                  <td className="report-profit">+{formatCurrency(report.profit, user.currency)}</td>
                  <td className="report-loss">-{formatCurrency(report.loss, user.currency)}</td>
                  <td className={net >= 0 ? "report-profit" : "report-loss"}>{formatCurrency(net, user.currency)}</td>
                  <td>
                    <span className={locked ? "month-status locked" : "month-status open"}>
                      {locked ? <Lock size={13} /> : <Unlock size={13} />}
                      {locked ? "Locked" : "Open"}
                    </span>
                  </td>
                  <td>
                    <button
                      className={locked ? "secondary-button report-lock-button" : "primary-button report-lock-button"}
                      onClick={() => handleMonthLockClick(report.monthKey, locked)}
                    >
                      {locked ? <><Unlock size={15} /> Unlock month</> : <><Lock size={15} /> Lock month</>}
                    </button>
                  </td>
                </tr>
              );
            })}
            {filteredReports.length === 0 && (
              <tr><td colSpan={7} className="reports-empty">{reports.length ? "No monthly reports match your search." : "No transactions are available for a monthly report yet."}</td></tr>
            )}
          </tbody>
        </table>
        </div>
        {filteredReports.length > REPORT_PAGE_SIZE && <div className="enterprise-table-footer">
          <div className="footer-stats">
            <span>Showing <strong>{(visiblePage - 1) * REPORT_PAGE_SIZE + 1}–{Math.min(visiblePage * REPORT_PAGE_SIZE, filteredReports.length)}</strong> of <strong>{filteredReports.length}</strong> months</span>
            <span className="page-size-label">{REPORT_PAGE_SIZE} per page</span>
          </div>
          <nav className="transaction-pagination" aria-label="Monthly report pages">
            <button type="button" className="pagination-button" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={visiblePage <= 1} aria-label="Previous report page"><ChevronLeft size={15} /> Previous</button>
            <span>Page <strong>{visiblePage}</strong> of <strong>{pageCount}</strong></span>
            <button type="button" className="pagination-button" onClick={() => setCurrentPage((page) => Math.min(pageCount, page + 1))} disabled={visiblePage >= pageCount} aria-label="Next report page">Next <ChevronRight size={15} /></button>
          </nav>
        </div>}
      </div>
      {unlockMonthKey && (
        <div className="modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setUnlockMonthKey(null); }}>
          <form className="transaction-modal month-unlock-modal" role="dialog" aria-modal="true" aria-labelledby="month-unlock-title" onSubmit={(event) => void handleUnlockMonth(event)}>
            <div className="modal-header">
              <div>
                <span className="eyebrow">PIN REQUIRED</span>
                <h2 id="month-unlock-title">Unlock {getMonthLabel(unlockMonthKey)}?</h2>
                <p>Enter your starting balance PIN to reopen this month.</p>
              </div>
              <button type="button" className="close-button" aria-label="Close dialog" onClick={() => setUnlockMonthKey(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <label className="month-unlock-pin-label">
                4-digit PIN
                <input autoFocus type="password" inputMode="numeric" pattern="[0-9]*" maxLength={4} autoComplete="current-password" value={unlockPin} onChange={(event) => { setUnlockPin(event.target.value.replace(/\D/g, "").slice(0, 4)); setUnlockError(null); }} placeholder="Enter your PIN" />
              </label>
              {unlockError && <div className="error-message" role="alert">{unlockError}</div>}
            </div>
            <div className="modal-footer">
              <button type="button" className="secondary-button" onClick={() => setUnlockMonthKey(null)}>Cancel</button>
              <button type="submit" className="primary-button"><Unlock size={15} /> Unlock month</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

const ReportSummary = ({ label, value, detail, icon, kind }: { label: string; value: string; detail: string; icon: React.ReactNode; kind: string }) => (
  <div className={`report-summary-card ${kind}`}>
    <div className="report-summary-top"><span>{label}</span><div className="report-summary-icon">{icon}</div></div>
    <strong>{value}</strong><small>{detail}</small>
  </div>
);

export default Reports;
