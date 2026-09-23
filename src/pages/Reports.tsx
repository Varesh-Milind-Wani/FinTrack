import { BarChart3, CalendarDays, Lock, ShieldCheck, TrendingDown, TrendingUp, Unlock } from "lucide-react";
import { useMemo } from "react";
import type { UserAccount } from "../types/finance";
import { formatCurrency } from "../utils/money";
import { getMonthKey, getMonthLabel } from "../utils/monthLocks";

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

const Reports = ({ user, onToggleMonthLock }: Props) => {
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

  const totals = useMemo(() => reports.reduce(
    (total, report) => ({
      profit: total.profit + report.profit,
      loss: total.loss + report.loss,
      transactions: total.transactions + report.transactions,
    }),
    { profit: 0, loss: 0, transactions: 0 },
  ), [reports]);

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

      <div className="reports-table-card">
        <div className="reports-table-title"><div><h3>Monthly ledger</h3><p>Lock a completed month to prevent any changes to its transaction records.</p></div><ShieldCheck size={20} /></div>
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
            {reports.map((report) => {
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
                      onClick={() => onToggleMonthLock(report.monthKey)}
                    >
                      {locked ? <><Unlock size={15} /> Unlock month</> : <><Lock size={15} /> Lock month</>}
                    </button>
                  </td>
                </tr>
              );
            })}
            {reports.length === 0 && (
              <tr><td colSpan={7} className="reports-empty">No transactions are available for a monthly report yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
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
