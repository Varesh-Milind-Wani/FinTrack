import { useMemo, useState } from "react";
import { Activity, BarChart3, CalendarDays, ChevronLeft, ChevronRight, TrendingDown, TrendingUp } from "lucide-react";
import ReactECharts from "echarts-for-react";
import type { UserAccount } from "../types/finance";
import { formatCurrency, getCurrencyRateDate } from "../utils/money";
import { getMonthKey, getMonthLabel } from "../utils/monthLocks";

interface Props { user: UserAccount }
type Week = { key: string; start: Date; end: Date; profit: number; loss: number; costs: number; transactions: number };
const PAGE_SIZE = 10;

const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const parseDate = (value: string) => {
  const date = value.length === 10 ? new Date(`${value}T00:00:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) return date;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};
const dateRange = (start: Date, end: Date) => `${start.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })} – ${end.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`;

const WeeklyAnalysis = ({ user }: Props) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedMonth, setSelectedMonth] = useState("all");
  const monthOptions = useMemo(() => [...new Set(user.transactions.map((transaction) => getMonthKey(transaction.date)))].sort((left, right) => right.localeCompare(left)), [user.transactions]);
  const weeks = useMemo(() => {
    const grouped = new Map<string, Week>();
    user.transactions.forEach((transaction) => {
      if (selectedMonth !== "all" && getMonthKey(transaction.date) !== selectedMonth) return;
      const date = parseDate(transaction.date);
      if (Number.isNaN(date.getTime())) return;
      const start = new Date(date);
      start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
      const key = dateKey(start);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      const week = grouped.get(key) ?? { key, start, end, profit: 0, loss: 0, costs: 0, transactions: 0 };
      const cost = Math.max(0, transaction.costAmount ?? 0);
      const net = transaction.type === "profit" ? transaction.amount : -transaction.amount;
      const gross = net + cost;
      if (gross >= 0) week.profit += gross; else week.loss += Math.abs(gross);
      week.costs += cost;
      week.transactions += 1;
      grouped.set(key, week);
    });
    const recordedWeeks = [...grouped.values()].sort((left, right) => left.key.localeCompare(right.key));
    if (!recordedWeeks.length) return recordedWeeks;
    const completeWeeks: Week[] = [];
    for (let start = new Date(recordedWeeks[0].start); start <= recordedWeeks[recordedWeeks.length - 1].start; start.setDate(start.getDate() + 7)) {
      const key = dateKey(start);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      completeWeeks.push(grouped.get(key) ?? { key, start: new Date(start), end, profit: 0, loss: 0, costs: 0, transactions: 0 });
    }
    return completeWeeks;
  }, [user.transactions, selectedMonth]);
  const pageCount = Math.max(1, Math.ceil(weeks.length / PAGE_SIZE));
  const visiblePage = Math.min(currentPage, pageCount);
  const pageWeeks = [...weeks].reverse().slice((visiblePage - 1) * PAGE_SIZE, visiblePage * PAGE_SIZE);
  const cumulativeNet = useMemo(() => {
    let runningTotal = 0;
    return weeks.map((week) => {
      const weeklyNet = week.profit - week.loss - week.costs;
      runningTotal += weeklyNet;
      return runningTotal;
    });
  }, [weeks]);
  const chartOption = useMemo(() => ({
    animationDuration: 500,
    grid: { left: 62, right: 28, top: 30, bottom: 72 },
    tooltip: { trigger: "axis", backgroundColor: "#111827", borderColor: "#293449", textStyle: { color: "#f4f7fb" }, formatter: (params: unknown) => { const point = (Array.isArray(params) ? params[0] : null) as { dataIndex?: number; value?: number } | null; const index = point?.dataIndex ?? -1; const week = weeks[index]; const weeklyNet = week ? week.profit - week.loss - week.costs : 0; return week ? `${dateRange(week.start, week.end)}<br/>Weekly net: <strong>${formatCurrency(weeklyNet, user.currency)}</strong><br/>Cumulative net: <strong>${formatCurrency(point?.value ?? 0, user.currency)}</strong>` : ""; } },
    xAxis: { type: "category", boundaryGap: false, data: weeks.map((_, index) => `Week ${index + 1}`), axisLine: { lineStyle: { color: "#293449" } }, axisTick: { show: false }, axisLabel: { color: "#8292ad", hideOverlap: true, interval: "auto" } },
    yAxis: { type: "value", scale: true, axisLabel: { color: "#8292ad", formatter: (value: number) => formatCurrency(value, user.currency) }, splitLine: { lineStyle: { color: "rgba(130,146,173,.13)" } } },
    dataZoom: weeks.length > 24 ? [{ type: "inside", zoomOnMouseWheel: true }, { type: "slider", height: 18, bottom: 12, borderColor: "#293449", fillerColor: "rgba(48,112,235,.18)", textStyle: { color: "#8292ad" } }] : [],
    series: [{ name: "Cumulative net after costs", type: "line", smooth: 0.28, showSymbol: weeks.length <= 40, symbolSize: 7, connectNulls: false, data: cumulativeNet, lineStyle: { width: 3, color: "#36a3ff" }, itemStyle: { color: "#36a3ff", borderColor: "#0b111b", borderWidth: 2 }, areaStyle: { color: "rgba(54,163,255,.13)" }, markLine: { silent: true, symbol: "none", lineStyle: { color: "#6b7890", type: "dashed" }, data: [{ yAxis: 0 }] } }],
  }), [weeks, user.currency, user.displayCurrency, getCurrencyRateDate(), cumulativeNet]);
  const totals = weeks.reduce((sum, week) => ({ profit: sum.profit + week.profit, loss: sum.loss + week.loss, costs: sum.costs + week.costs, transactions: sum.transactions + week.transactions }), { profit: 0, loss: 0, costs: 0, transactions: 0 });

  return <div className="page-content weekly-analysis-page">
    <div className="page-heading reports-heading"><div><span className="eyebrow">PERFORMANCE REPORTS</span><h1>Weekly Analysis</h1><p>Review every recorded week with its date range, trading activity, costs, and net performance.</p></div><div className="reports-heading-badge"><CalendarDays size={17} /><span>{weeks.length} weeks tracked</span></div></div>
    <div className="report-summary-grid">
      <div className="report-summary-card profit"><div className="report-summary-top"><span>Profit before costs</span><div className="report-summary-icon"><TrendingUp size={19} /></div></div><strong>{formatCurrency(totals.profit, user.currency)}</strong><small>{totals.transactions} transactions recorded</small></div>
      <div className="report-summary-card loss"><div className="report-summary-top"><span>Loss before costs</span><div className="report-summary-icon"><TrendingDown size={19} /></div></div><strong>{formatCurrency(totals.loss, user.currency)}</strong><small>All recorded losing trades</small></div>
      <div className={`report-summary-card ${totals.profit - totals.loss - totals.costs >= 0 ? "net-positive" : "net-negative"}`}><div className="report-summary-top"><span>Net after costs</span><div className="report-summary-icon"><BarChart3 size={19} /></div></div><strong>{formatCurrency(totals.profit - totals.loss - totals.costs, user.currency)}</strong><small>All weeks shown</small></div>
      <div className="report-summary-card cost"><div className="report-summary-top"><span>Trading costs</span><div className="report-summary-icon"><Activity size={19} /></div></div><strong>{formatCurrency(totals.costs, user.currency)}</strong><small>Recorded on trade transactions</small></div>
    </div>
    <section className="reports-table-card weekly-all-card">
      <div className="reports-table-title"><div><h3>Weekly performance</h3><p>The chart shows cumulative net after trading costs. Personal expenses stay separate in Expense tracker.</p></div><BarChart3 size={20} /></div>
      <div className="weekly-month-filter"><label htmlFor="weekly-analysis-month">Filter by month</label><select id="weekly-analysis-month" value={selectedMonth} onChange={(event) => { setSelectedMonth(event.target.value); setCurrentPage(1); }}><option value="all">All months</option>{monthOptions.map((month) => <option key={month} value={month}>{getMonthLabel(month)}</option>)}</select><span>{selectedMonth === "all" ? "Showing all recorded months" : `Showing ${getMonthLabel(selectedMonth)}`}</span></div>
      {weeks.length ? <>
        <div className="weekly-line-chart"><ReactECharts option={chartOption} notMerge lazyUpdate style={{ height: 360, width: "100%" }} /></div>
        <div className="reports-table-scroll"><table className="reports-table weekly-all-table"><thead><tr><th>Week</th><th>Date range</th><th>Transactions</th><th>Profit before costs</th><th>Loss before costs</th><th>Trading costs</th><th>Weekly net after costs</th><th>Cumulative net after costs</th></tr></thead><tbody>
          {pageWeeks.map((week) => { const weekIndex = weeks.findIndex((item) => item.key === week.key); const index = weekIndex + 1; const net = week.profit - week.loss - week.costs; return <tr key={week.key}><td><strong>Week {index}</strong></td><td>{dateRange(week.start, week.end)}</td><td><span className="report-transaction-count">{week.transactions}</span></td><td className="report-profit">+{formatCurrency(week.profit, user.currency)}</td><td className="report-loss">-{formatCurrency(week.loss, user.currency)}</td><td className="report-cost">-{formatCurrency(week.costs, user.currency)}</td><td className={net >= 0 ? "report-profit" : "report-loss"}>{formatCurrency(net, user.currency)}</td><td className={cumulativeNet[weekIndex] >= 0 ? "report-profit" : "report-loss"}>{formatCurrency(cumulativeNet[weekIndex] ?? 0, user.currency)}</td></tr>; })}
        </tbody></table></div>
        {weeks.length > PAGE_SIZE && <div className="enterprise-table-footer"><div className="footer-stats"><span>Showing <strong>{(visiblePage - 1) * PAGE_SIZE + 1}–{Math.min(visiblePage * PAGE_SIZE, weeks.length)}</strong> of <strong>{weeks.length}</strong> weeks</span><span className="page-size-label">{PAGE_SIZE} per page</span></div><nav className="transaction-pagination" aria-label="Weekly analysis pages"><button type="button" className="pagination-button" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={visiblePage <= 1} aria-label="Previous weekly page"><ChevronLeft size={15} /> Previous</button><span>Page <strong>{visiblePage}</strong> of <strong>{pageCount}</strong></span><button type="button" className="pagination-button" onClick={() => setCurrentPage((page) => Math.min(pageCount, page + 1))} disabled={visiblePage >= pageCount} aria-label="Next weekly page">Next <ChevronRight size={15} /></button></nav></div>}
      </> : <p className="reports-empty">No transactions are available for weekly analysis yet.</p>}
    </section>
  </div>;
};

export default WeeklyAnalysis;
