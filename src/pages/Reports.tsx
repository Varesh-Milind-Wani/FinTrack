import { BarChart3, CalendarDays, ChevronLeft, ChevronRight, DollarSign, Lock, Search, ShieldCheck, TrendingDown, TrendingUp, Unlock, X } from "lucide-react";
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

type CostRecord = { id: string; date: string; amount: number; note: string; category: string };

const REPORT_PAGE_SIZE = 20;

const Reports = ({ user, onToggleMonthLock }: Props) => {
  const [unlockMonthKey, setUnlockMonthKey] = useState<string | null>(null);
  const [unlockPin, setUnlockPin] = useState("");
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [pinNotice, setPinNotice] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [search, setSearch] = useState("");
  const [costHistoryOpen, setCostHistoryOpen] = useState(false);
  const [costSearch, setCostSearch] = useState("");
  const costRecords = useMemo<CostRecord[]>(() => user.transactions
    .filter((transaction) => (transaction.costAmount ?? 0) > 0)
    .map((transaction) => ({ id: transaction.id, date: transaction.date, amount: transaction.costAmount ?? 0, note: transaction.note || "Transaction cost", category: transaction.category || "Uncategorized" }))
    .sort((left, right) => right.date.localeCompare(left.date)), [user.transactions]);
  const visibleCostRecords = useMemo(() => {
    const query = costSearch.trim().toLocaleLowerCase();
    if (!query) return costRecords;
    return costRecords.filter((record) => [record.date, record.note, record.category, String(record.amount), formatCurrency(record.amount, user.currency)].join(" ").toLocaleLowerCase().includes(query));
  }, [costRecords, costSearch, user.currency]);
  const costGroups = useMemo(() => {
    const groups = new Map<string, { monthKey: string; total: number; records: CostRecord[] }>();
    visibleCostRecords.forEach((record) => {
      const monthKey = getMonthKey(record.date);
      const group = groups.get(monthKey) ?? { monthKey, total: 0, records: [] };
      group.total += record.amount;
      group.records.push(record);
      groups.set(monthKey, group);
    });
    return [...groups.values()].sort((left, right) => right.monthKey.localeCompare(left.monthKey));
  }, [visibleCostRecords]);
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

      const netSigned = transaction.type === "profit" ? transaction.amount : -transaction.amount;
      const grossSigned = netSigned + (transaction.costAmount ?? 0);
      if (grossSigned >= 0) current.profit += grossSigned;
      else current.loss += Math.abs(grossSigned);
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
  const totalCosts = useMemo(() => costRecords.reduce((sum, record) => sum + record.amount, 0), [costRecords]);

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
          <p>Review monthly profit and loss before transaction costs, track costs separately, and lock completed months.</p>
        </div>
        <div className="reports-heading-badge"><CalendarDays size={17} /><span>{reports.length} months tracked</span></div>
      </div>

      <div className="report-summary-grid">
        <ReportSummary label="Total profit" value={formatCurrency(totals.profit, user.currency)} detail={`${totals.transactions} transactions recorded`} icon={<TrendingUp size={19} />} kind="profit" />
        <ReportSummary label="Total loss" value={formatCurrency(totals.loss, user.currency)} detail="All recorded losing trades" icon={<TrendingDown size={19} />} kind="loss" />
        <ReportSummary label="Net performance" value={formatCurrency(totals.profit - totals.loss, user.currency)} detail="Before transaction costs" icon={<BarChart3 size={19} />} kind={totals.profit >= totals.loss ? "net-positive" : "net-negative"} />
        <ReportSummary label="Transaction costs" value={formatCurrency(totalCosts, user.currency)} detail={`${costRecords.length} transactions with recorded costs · View history`} icon={<DollarSign size={19} />} kind="cost" onClick={() => setCostHistoryOpen(true)} />
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
              <th>Profit before costs</th>
              <th>Loss before costs</th>
              <th>Net before costs</th>
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
      {costHistoryOpen && (
        <div className="modal-overlay reports-cost-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setCostHistoryOpen(false); }}>
          <section className="transaction-modal reports-cost-modal" role="dialog" aria-modal="true" aria-labelledby="reports-cost-title">
            <div className="modal-header reports-cost-heading"><div><span className="eyebrow">TRANSACTION COSTS</span><h2 id="reports-cost-title">Cost history</h2><p><span>{costRecords.length} records</span><i /> <span>Total <strong>{formatCurrency(totalCosts, user.currency)}</strong></span></p></div><button type="button" className="close-button" aria-label="Close cost history" onClick={() => setCostHistoryOpen(false)}><X size={18} /></button></div>
            <div className="reports-cost-toolbar">
              <div className="reports-cost-search"><Search size={17} /><input aria-label="Search cost history" value={costSearch} onChange={(event) => setCostSearch(event.target.value)} placeholder="Search date, category, or transaction" />{costSearch && <button type="button" aria-label="Clear cost history search" onClick={() => setCostSearch("")}>Clear</button>}</div>
              <span className="reports-cost-result-count">{visibleCostRecords.length} records across {costGroups.length} {costGroups.length === 1 ? "month" : "months"}</span>
            </div>
            <div className="reports-cost-list">
              {costGroups.map((group) => <section className="reports-cost-month" key={group.monthKey}>
                <header><div className="reports-cost-month-label"><span className="reports-cost-month-marker" /><div><strong>{getMonthLabel(group.monthKey)}</strong><span>{group.records.length} {group.records.length === 1 ? "transaction" : "transactions"}</span></div></div><div className="reports-cost-month-total"><small>MONTH TOTAL</small><b>{formatCurrency(group.total, user.currency)}</b></div></header>
                {group.records.map((record) => <article key={record.id}><div className="reports-cost-date"><strong>{formatDate(record.date)}</strong><span>{record.note} <i /> {record.category}</span></div><b>{formatCurrency(record.amount, user.currency)}</b></article>)}
              </section>)}
              {visibleCostRecords.length === 0 && <p className="reports-cost-empty">{costRecords.length ? "No cost records match your search." : "No transaction costs have been recorded yet."}</p>}
            </div>
          </section>
        </div>
      )}
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

const formatDate = (date: string) => new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" }).format(new Date(`${date.slice(0, 10)}T00:00:00`));

const ReportSummary = ({ label, value, detail, icon, kind, onClick }: { label: string; value: string; detail: string; icon: React.ReactNode; kind: string; onClick?: () => void }) => (
  <div className={`report-summary-card ${kind}${onClick ? " clickable" : ""}`} onClick={onClick} onKeyDown={onClick ? (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onClick(); } } : undefined} role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined}>
    <div className="report-summary-top"><span>{label}</span><div className="report-summary-icon">{icon}</div></div>
    <strong>{value}</strong><small>{detail}</small>
  </div>
);

export default Reports;
