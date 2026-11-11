import { Fragment, useDeferredValue, useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";
import { ChartNoAxesCombined, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, CircleDollarSign, Landmark, Pencil, Plus, Search, SlidersHorizontal, TrendingDown, TrendingUp, Trash2, Wallet, X } from "lucide-react";
import type { Investment, InvestmentType, UserAccount } from "../types/finance";
import { formatCurrency } from "../utils/money";
import { usePersistentState } from "../hooks/usePersistentState";
import { useAppDialog } from "../components/AppDialog";
import { getMonthKey, getMonthLabel } from "../utils/monthLocks";

const EChartsChart = (ReactECharts as unknown as { default?: typeof ReactECharts }).default ?? ReactECharts;
// Keep each chart page readable and responsive even for very large portfolios.
const HOLDING_COMPARISON_PAGE_SIZE = 25;
const HOLDINGS_PAGE_SIZE = 20;
const EMPTY_INVESTMENTS: Investment[] = [];

interface Props { user: UserAccount; onSave: (updatedUser: UserAccount) => void; }

const TYPE_LABELS: Record<InvestmentType, string> = { stocks: "Stocks", mutual_fund: "Mutual Fund", crypto: "Crypto", gold: "Gold", real_estate: "Real Estate", fd: "Fixed Deposit", other: "Other" };
const TYPE_COLORS: Record<InvestmentType, string> = { stocks: "#60a5fa", mutual_fund: "#34d399", crypto: "#fbbf24", gold: "#facc15", real_estate: "#a78bfa", fd: "#22d3ee", other: "#94a3b8" };
const emptyForm = (): Omit<Investment, "id"> => ({ name: "", marketSymbol: "", type: "stocks", amount: 0, currentValue: 0, quantity: 1, isClosed: false, entryPrice: undefined, exitPrice: undefined, date: new Date().toISOString().split("T")[0], note: "" });
const getInvestmentValue = (item: Investment) => item.isClosed && item.exitPrice != null
  ? item.exitPrice * (item.quantity ?? 1)
  : item.currentValue;
const getInvestmentPnl = (item: Investment) => (item.positionSide === "short" ? item.amount - getInvestmentValue(item) : getInvestmentValue(item) - item.amount);
const getFixedDepositMaturityValue = (principal: number, annualRate: number, years: number, months: number) => {
  const totalMonths = years * 12 + months;
  if (principal <= 0 || annualRate < 0 || totalMonths <= 0) return 0;
  // Indian fixed deposits commonly compound quarterly. Fractional quarters
  // support terms such as six months without rounding the entered duration.
  return principal * Math.pow(1 + annualRate / 400, totalMonths / 3);
};
const addCalendarMonths = (date: Date, months: number) => {
  const result = new Date(date);
  const day = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  result.setDate(Math.min(day, new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate()));
  return result;
};
const getFixedDepositMaturityDate = (item: Investment) => {
  if (item.type !== "fd" || item.durationYears == null && item.durationMonths == null) return null;
  const parts = item.date.slice(0, 10).split("-").map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return null;
  const startDate = new Date(parts[0], parts[1] - 1, parts[2]);
  if (!Number.isFinite(startDate.getTime())) return null;
  const months = Math.max(0, (item.durationYears ?? 0) * 12 + (item.durationMonths ?? 0));
  return addCalendarMonths(startDate, months);
};
const getFixedDepositRemainingTerm = (maturityDate: Date, today = new Date()) => {
  const end = new Date(maturityDate.getFullYear(), maturityDate.getMonth(), maturityDate.getDate());
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (end <= start) return "Matured";
  let months = (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth();
  let anniversary = addCalendarMonths(start, months);
  if (anniversary > end) {
    months -= 1;
    anniversary = addCalendarMonths(start, months);
  }
  const days = Math.round((end.getTime() - anniversary.getTime()) / 86_400_000);
  const years = Math.floor(months / 12);
  const remainderMonths = months % 12;
  const parts = [
    years ? `${years} ${years === 1 ? "year" : "years"}` : "",
    remainderMonths ? `${remainderMonths} ${remainderMonths === 1 ? "month" : "months"}` : "",
    days ? `${days} ${days === 1 ? "day" : "days"}` : "",
  ].filter(Boolean);
  return `${parts.join(" ")} remaining`;
};

const InvestmentPage = ({ user, onSave }: Props) => {
  const { alert: showAlert, confirm: showConfirm } = useAppDialog();
  const investments = user.investments ?? EMPTY_INVESTMENTS;
  const [showModal, setShowModal] = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  const [comparisonSearch, setComparisonSearch] = useState("");
  const deferredComparisonSearch = useDeferredValue(comparisonSearch);
  const [holdingsSearch, setHoldingsSearch] = useState("");
  const deferredHoldingsSearch = useDeferredValue(holdingsSearch);
  const [comparisonPage, setComparisonPage] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [editing, setEditing] = useState<Investment | null>(null);
  const [withdrawalOnlyEdit, setWithdrawalOnlyEdit] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [filterType, setFilterType] = usePersistentState<InvestmentType | "all">("investments.assetType", "all");
  const [filterStatus, setFilterStatus] = usePersistentState<"all" | "open" | "closed">("investments.status", "all");
  const [expandedInvestmentId, setExpandedInvestmentId] = useState<string | null>(null);
  const filtered = useMemo(() => investments.filter((item) => {
    const matchesType = filterType === "all" || item.type === filterType;
    const matchesStatus = filterStatus === "all" || (filterStatus === "closed" ? item.isClosed === true : item.isClosed !== true);
    const query = deferredHoldingsSearch.trim().toLocaleLowerCase();
    const matchesSearch = !query || [item.name, item.marketSymbol ?? "", TYPE_LABELS[item.type], item.note]
      .some((value) => value.toLocaleLowerCase().includes(query));
    return matchesType && matchesStatus && matchesSearch;
  }), [investments, filterType, filterStatus, deferredHoldingsSearch]);
  const stats = useMemo(() => {
    const summary = filtered.reduce((totals, item) => {
      const value = getInvestmentValue(item);
      const pnl = getInvestmentPnl(item);
      totals.historicalInvested += item.amount;
      if (item.isClosed) {
        totals.closedCount += 1;
        totals.realizedPnl += pnl;
      } else {
        totals.openCount += 1;
        totals.totalInvested += item.amount;
        totals.openMarketValue += item.currentValue;
        totals.unrealizedPnl += pnl;
        if (item.type === "stocks") totals.openStockPnl += pnl;
        else totals.notionalProfit += pnl;
      }
      return totals;
    }, { historicalInvested: 0, closedCount: 0, realizedPnl: 0, openCount: 0, totalInvested: 0, openMarketValue: 0, unrealizedPnl: 0, openStockPnl: 0, notionalProfit: 0 });
    const { totalInvested, openMarketValue, realizedPnl, unrealizedPnl, historicalInvested, openCount, closedCount, openStockPnl, notionalProfit } = summary;
    const portfolioValue = openMarketValue;
    const pnl = realizedPnl + unrealizedPnl;
    return {
      totalInvested,
      totalCapitalUsed: historicalInvested,
      openMarketValue,
      portfolioValue,
      pnl,
      realizedPnl,
      unrealizedPnl,
      openStockPnl,
      notionalProfit,
      pnlPct: historicalInvested ? (pnl / historicalInvested) * 100 : 0,
      openCount,
      closedCount,
    };
  }, [filtered]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / HOLDINGS_PAGE_SIZE));
  const visiblePage = Math.min(currentPage, pageCount);
  const pageInvestments = useMemo(() => filtered.slice((visiblePage - 1) * HOLDINGS_PAGE_SIZE, visiblePage * HOLDINGS_PAGE_SIZE), [filtered, visiblePage]);
  const comparisonMatches = useMemo(() => {
    const query = deferredComparisonSearch.trim().toLocaleLowerCase();
    if (!query) return filtered;
    return filtered.filter((item) =>
      item.name.toLocaleLowerCase().includes(query)
      || item.note.toLocaleLowerCase().includes(query)
      || TYPE_LABELS[item.type].toLocaleLowerCase().includes(query)
    );
  }, [deferredComparisonSearch, filtered]);
  const comparisonPageCount = Math.max(1, Math.ceil(comparisonMatches.length / HOLDING_COMPARISON_PAGE_SIZE));
  const visibleComparisonPage = Math.min(comparisonPage, comparisonPageCount - 1);
  const comparisonChartHoldings = comparisonMatches.slice(
    visibleComparisonPage * HOLDING_COMPARISON_PAGE_SIZE,
    (visibleComparisonPage + 1) * HOLDING_COMPARISON_PAGE_SIZE,
  );
  const hasComparisonLoss = comparisonChartHoldings.some((item) => getInvestmentValue(item) < item.amount);
  const performanceChartOption = useMemo(() => ({
    backgroundColor: "transparent",
    grid: { left: 12, right: 24, top: 32, bottom: 12, containLabel: true },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      backgroundColor: "#111722",
      borderColor: "#29364b",
      textStyle: { color: "#e8edf5" },
      formatter: (params: unknown) => {
        const rows = (Array.isArray(params) ? params : [params]) as Array<{ seriesName: string; name: string; value: number }>;
        const name = rows[0]?.name ?? "";
        return [name, ...rows
          .filter((row) => Number(row.value) > 0)
          .map((row) => `${row.seriesName}: ${formatCurrency(Number(row.value) || 0, user.currency ?? "INR")}`)].join("<br />");
      },
    },
    legend: { top: 0, textStyle: { color: "#9aa5ba", fontSize: 11 } },
    xAxis: {
      type: "value",
      axisLabel: { color: "#71809a", formatter: (value: string | number) => formatCurrency(Number(value) || 0, user.currency ?? "INR") },
      splitLine: { lineStyle: { color: "rgba(148, 163, 184, .08)" } },
    },
      yAxis: {
      type: "category",
      data: comparisonChartHoldings.map((item) => item.name),
      axisLabel: { color: "#cbd5e1", width: 140, overflow: "truncate" },
      axisLine: { lineStyle: { color: "#263246" } },
    },
    series: [
      { name: "Invested", type: "bar", data: comparisonChartHoldings.map((item) => item.amount), itemStyle: { color: "#4f8fff", borderRadius: [0, 4, 4, 0] }, barMaxWidth: 14 },
      {
        name: "Current / exit value",
        type: "bar",
        stack: "holding-value",
        data: comparisonChartHoldings.map((item) => getInvestmentValue(item) >= item.amount ? getInvestmentValue(item) : 0),
        itemStyle: { color: "#20c997", borderRadius: [0, 4, 4, 0] },
        barMaxWidth: 14,
      },
      ...(hasComparisonLoss ? [{
        name: "Below invested",
        type: "bar",
        stack: "holding-value",
        data: comparisonChartHoldings.map((item) => getInvestmentValue(item) < item.amount ? getInvestmentValue(item) : 0),
        itemStyle: { color: "#ff4d6d", borderRadius: [0, 4, 4, 0] },
        barMaxWidth: 14,
      }] : []),
    ],
  }), [comparisonChartHoldings, hasComparisonLoss, user.currency]);
  const fmt = (value: number) => formatCurrency(value, user.currency ?? "INR");
  const openInvestedByType = filtered.reduce<Partial<Record<InvestmentType, number>>>((totals, item) => {
    if (!item.isClosed) totals[item.type] = (totals[item.type] ?? 0) + item.amount;
    return totals;
  }, {});
  const openInvestedBreakdown = (Object.entries(openInvestedByType) as [InvestmentType, number][])
    .filter(([, amount]) => amount > 0)
    .map(([type, amount]) => `${TYPE_LABELS[type]} ${fmt(amount)}`)
    .join(" · ");
  const lockedMonths = user.lockedMonths ?? [];
  const isInvestmentMonthLocked = (item: Pick<Investment, "date">) => lockedMonths.includes(getMonthKey(item.date));
  const openAdd = () => { setEditing(null); setWithdrawalOnlyEdit(false); setForm(emptyForm()); setShowModal(true); };
  const openEdit = (item: Investment) => {
    const monthLocked = isInvestmentMonthLocked(item);
    if (monthLocked && !(item.isClosed && !item.withdrawalRecorded)) {
      void showAlert(`${getMonthLabel(getMonthKey(item.date))} is locked. Unlock that month in Reports before editing this investment.`, "Month locked");
      return;
    }
    const quantity = item.quantity ?? 1;
    setEditing(item);
    setWithdrawalOnlyEdit(monthLocked);
    setForm({ ...item, withdrawalRecorded: Boolean(item.withdrawalRecorded), quantity, entryPrice: item.entryPrice ?? item.amount / quantity, date: item.date.split("T")[0] });
    setShowModal(true);
  };
  const save = () => {
    if (withdrawalOnlyEdit && editing) {
      const original = investments.find((item) => item.id === editing.id);
      if (!original || !original.isClosed || original.withdrawalRecorded || !isInvestmentMonthLocked(original)) {
        void showAlert("This locked investment can only be updated to record its sale proceeds as a withdrawal.", "Investment locked");
        return;
      }

      const existingSale = (user.withdrawals ?? []).find((entry) => entry.sourceInvestmentId === original.id);
      const withdrawal = {
        id: existingSale?.id ?? crypto.randomUUID(),
        date: `${original.date.split("T")[0]}T12:00:00`,
        amount: getInvestmentValue(original),
        method: "investment" as const,
        sourceInvestmentId: original.id,
        note: `Investment sale · ${original.name.trim()}`,
        status: "completed" as const,
      };
      onSave({
        ...user,
        investments: investments.map((item) => item.id === original.id ? { ...item, withdrawalRecorded: Boolean(form.withdrawalRecorded) } : item),
        withdrawals: form.withdrawalRecorded
          ? [withdrawal, ...(user.withdrawals ?? []).filter((entry) => entry.sourceInvestmentId !== original.id)]
          : (user.withdrawals ?? []).filter((entry) => entry.sourceInvestmentId !== original.id),
      });
      setShowModal(false);
      setWithdrawalOnlyEdit(false);
      setCurrentPage(1);
      return;
    }
    if (editing) {
      const lockedMonth = [editing.date, form.date].find((date) => lockedMonths.includes(getMonthKey(date)));
      if (lockedMonth) {
        void showAlert(`${getMonthLabel(getMonthKey(lockedMonth))} is locked. Unlock that month in Reports before editing this investment.`, "Month locked");
        return;
      }
    }
    const quantity = form.quantity || 1;
    const directPnlMode = form.directPnl != null;
    const amount = directPnlMode ? form.amount : quantity * (form.entryPrice ?? 0);
    const fixedDepositMaturityValue = getFixedDepositMaturityValue(amount, form.annualInterestRate ?? 0, form.durationYears ?? 0, form.durationMonths ?? 0);
    if (form.type === "fd" && (!Number.isFinite(form.annualInterestRate) || (form.annualInterestRate ?? -1) < 0 || (form.durationYears ?? 0) * 12 + (form.durationMonths ?? 0) <= 0)) {
      void showAlert("Enter an annual interest rate and a fixed deposit tenure greater than zero.", "Fixed deposit details required");
      return;
    }
    const currentValue = form.type === "fd" && !form.isClosed
      ? fixedDepositMaturityValue
      : directPnlMode ? Math.max(0, amount + (form.directPnl ?? 0)) : form.exitPrice != null ? form.exitPrice * quantity : form.currentValue;
    if (!form.name.trim() || (!directPnlMode && (amount <= 0 || quantity <= 0 || (form.isClosed && (!form.exitPrice || form.exitPrice <= 0)) || (form.exitPrice != null && form.exitPrice < 0)))) return;
    const investmentId = editing?.id ?? crypto.randomUUID();
    const existingSale = (user.withdrawals ?? []).find((entry) => entry.sourceInvestmentId === investmentId);
    const savedForm = {
      ...form,
      amount,
      quantity,
      currentValue,
    };
    const next = editing ? investments.map((item) => item.id === editing.id ? { ...editing, ...savedForm } : item) : [{ id: investmentId, ...savedForm }, ...investments];
    const otherWithdrawals = (user.withdrawals ?? []).filter((entry) => entry.sourceInvestmentId !== investmentId);
    const saleWithdrawal = form.isClosed && form.withdrawalRecorded ? {
      id: existingSale?.id ?? crypto.randomUUID(),
      date: `${form.date}T12:00:00`,
      amount: currentValue,
      method: "investment" as const,
      sourceInvestmentId: investmentId,
      note: `Investment sale · ${form.name.trim()}`,
      status: "completed" as const,
    } : null;
    onSave({ ...user, investments: next, withdrawals: saleWithdrawal ? [saleWithdrawal, ...otherWithdrawals] : otherWithdrawals });
    setShowModal(false);
    setWithdrawalOnlyEdit(false);
    setCurrentPage(1);
  };
  const remove = async (id: string) => {
    const item = investments.find((investment) => investment.id === id);
    if (item && isInvestmentMonthLocked(item)) {
      await showAlert(`${getMonthLabel(getMonthKey(item.date))} is locked. Unlock that month in Reports before deleting this investment.`, "Month locked");
      return;
    }
    if (await showConfirm("Delete this investment?", "Delete investment")) {
      onSave({
        ...user,
        investments: investments.filter((item) => item.id !== id),
        withdrawals: (user.withdrawals ?? []).filter((entry) => entry.sourceInvestmentId !== id),
      });
      setCurrentPage(1);
    }
  };

  return <div className="page-content investment-page">
    <div className="page-heading investment-heading"><div><span className="eyebrow">WEALTH MANAGEMENT</span><h1>Investment portfolio</h1><p>See your holdings, performance, and long-term growth in one place.</p></div><div className="investment-heading-actions"><button type="button" className="secondary-button investment-comparison-button" onClick={() => setShowComparison(true)}><ChartNoAxesCombined size={16} /> Holdings comparison</button><button className="primary-button investment-add-button" onClick={openAdd}><Plus size={17} /> Add investment</button></div></div>
    <div className="investment-summary-context"><strong>Portfolio summary</strong><span>Based on {filtered.length} matching {filtered.length === 1 ? "holding" : "holdings"}</span></div>
    <div className="investment-summary-grid">
      <Summary label="Currently invested" value={fmt(stats.totalInvested)} detail={openInvestedBreakdown ? `${stats.openCount} open · ${openInvestedBreakdown}` : `${stats.openCount} open ${stats.openCount === 1 ? "holding" : "holdings"}`} icon={<Wallet size={19} />} kind="invested" />
      <Summary label="Portfolio value" value={fmt(stats.portfolioValue)} detail={`${fmt(stats.totalInvested)} invested · ${stats.unrealizedPnl >= 0 ? "+" : "−"}${fmt(Math.abs(stats.unrealizedPnl))} combined open P&L`} icon={<Landmark size={19} />} kind="value" />
      <Summary label="Closed P&L" value={`${stats.realizedPnl >= 0 ? "+" : ""}${fmt(stats.realizedPnl)}`} detail={`${stats.closedCount} closed ${stats.closedCount === 1 ? "holding" : "holdings"} only`} icon={stats.realizedPnl >= 0 ? <TrendingUp size={19} /> : <TrendingDown size={19} />} kind={stats.realizedPnl >= 0 ? "gain" : "loss"} />
      <Summary label="Open P&L" value={`${stats.openStockPnl >= 0 ? "+" : "−"}${fmt(Math.abs(stats.openStockPnl))}`} detail="Unrealized P&L on open stock holdings" icon={stats.openStockPnl >= 0 ? <TrendingUp size={19} /> : <TrendingDown size={19} />} kind={stats.openStockPnl >= 0 ? "gain" : "loss"} />
      <Summary label="Notional Profit" value={`${stats.notionalProfit >= 0 ? "+" : "−"}${fmt(Math.abs(stats.notionalProfit))}`} detail="Open Fixed Deposits and other non-stock holdings; excluded from Open P&L" icon={stats.notionalProfit >= 0 ? <TrendingUp size={19} /> : <TrendingDown size={19} />} kind={stats.notionalProfit >= 0 ? "gain" : "loss"} />
      <Summary label="Portfolio ROI" value={`${stats.pnlPct >= 0 ? "+" : ""}${stats.pnlPct.toFixed(1)}%`} detail="Return on all capital invested" icon={<ChartNoAxesCombined size={19} />} kind={stats.pnl >= 0 ? "roi-gain" : "roi-loss"} />
      <Summary label="Total amount invested" value={fmt(stats.totalCapitalUsed)} detail="Original purchase capital · open + closed" icon={<CircleDollarSign size={19} />} kind="invested" />
    </div>
    <section className="investment-filter-panel">
      <div className="investment-filter-heading"><span className="investment-filter-heading-icon"><SlidersHorizontal size={17} /></span><div><span className="eyebrow">PORTFOLIO FILTERS</span><p>Refine your holdings</p></div></div>
      <div className="investment-filter-controls">
        <div className="investment-filter-group" role="group" aria-label="Filter by asset type"><span className="investment-filter-label">Asset type</span><div className="investment-filter-chips">{(["all", ...Object.keys(TYPE_LABELS)] as (InvestmentType | "all")[]).map((type) => <button type="button" key={type} aria-pressed={filterType === type} onClick={() => { setFilterType(type); setComparisonPage(0); setCurrentPage(1); }} className={filterType === type ? "investment-filter active" : "investment-filter"}>{type === "all" ? "All types" : TYPE_LABELS[type]}</button>)}</div></div>
        <div className="investment-filter-group" role="group" aria-label="Filter by position status"><span className="investment-filter-label">Position status</span><div className="investment-filter-chips">{(["all", "open", "closed"] as const).map((status) => <button type="button" key={status} aria-pressed={filterStatus === status} onClick={() => { setFilterStatus(status); setComparisonPage(0); setCurrentPage(1); }} className={filterStatus === status ? "investment-filter active" : "investment-filter"}>{status === "all" ? "All positions" : status === "open" ? "Open" : "Closed"}</button>)}</div></div>
      </div>
    </section>
    <section className="investment-holdings-card"><div className="investment-holdings-header"><div><h3>Portfolio holdings</h3></div><div className="search-box investment-holdings-search shared-black-search"><Search size={16} className="search-icon" /><input type="search" aria-label="Search portfolio holdings by name, symbol, type, or note" placeholder="Search" value={holdingsSearch} onChange={(event) => { setHoldingsSearch(event.target.value); setCurrentPage(1); }} /></div></div><div className="investment-table-scroll"><table className="investment-table"><thead><tr><th>Name</th><th>Type</th><th>Status</th><th>Quantity</th><th>Date</th><th>Invested</th><th>Current / exit value</th><th>P&amp;L</th><th>Return</th><th>Withdrawal</th><th>Note</th><th className="investment-actions-heading">Actions</th></tr></thead><tbody>{filtered.length === 0 ? <tr><td colSpan={12} className="investment-empty"><Wallet size={32} /><p>{investments.length === 0 ? <>No investments yet. Click <strong>Add investment</strong> to get started.</> : "No holdings match your search and filters."}</p></td></tr> : pageInvestments.map((item) => {
      const displayedValue = getInvestmentValue(item);
      const pnl = getInvestmentPnl(item);
      const pct = item.amount ? pnl / item.amount * 100 : 0;
      const positive = pnl >= 0;
      const isExpanded = expandedInvestmentId === item.id;
      const date = new Date(item.date);
      const maturityDate = getFixedDepositMaturityDate(item);
      const fdRemainingTerm = maturityDate ? getFixedDepositRemainingTerm(maturityDate) : null;
      const fdMaturityDateLabel = maturityDate?.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

      return <Fragment key={item.id}>
        <tr>
          <td className="investment-name">{item.name}</td>
          <td><span className="investment-type-badge" style={{ color: TYPE_COLORS[item.type], borderColor: `${TYPE_COLORS[item.type]}55`, backgroundColor: `${TYPE_COLORS[item.type]}16` }}>{TYPE_LABELS[item.type]}</span></td>
          <td><span className={`investment-status-badge ${item.isClosed ? "closed" : "open"}`}>{item.isClosed ? "Closed" : "Open"}</span></td>
          <td>{item.quantity ?? 1}</td>
          <td className="investment-date">{date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</td>
          <td className="investment-money">{fmt(item.amount)}</td>
          <td className="investment-money">{fmt(displayedValue)}{item.type === "fd" && fdRemainingTerm && <small className="investment-fd-term">{fdRemainingTerm} · matures {fdMaturityDateLabel}</small>}</td>
          <td className={positive ? "investment-positive" : "investment-negative"}>{positive ? "+" : ""}{fmt(pnl)}{item.type === "fd" && <small className="investment-fd-pnl-caption">{fdRemainingTerm === "Matured" ? "Net P&L at maturity" : "Projected net P&L"}</small>}</td>
          <td className={positive ? "investment-positive" : "investment-negative"}>{positive ? "+" : ""}{pct.toFixed(2)}%</td>
          <td>{item.isClosed ? item.withdrawalRecorded ? <span className="investment-withdrawal-status recorded">{fmt(getInvestmentValue(item))}<small>Full sale proceeds</small></span> : <span className="investment-withdrawal-status">Not recorded</span> : <span className="investment-withdrawal-status unavailable">—</span>}</td>
          <td className="investment-note">{item.note || "—"}</td>
          <td><div className="investment-actions">
            <button type="button" className="action-button" onClick={() => openEdit(item)} title="Edit investment" aria-label={`Edit ${item.name}`}><Pencil size={14} /></button>
            <button type="button" className="action-button delete" onClick={() => remove(item.id)} title="Delete investment" aria-label={`Delete ${item.name}`}><Trash2 size={14} /></button>
            <button type="button" className="action-button expand" onClick={() => setExpandedInvestmentId(isExpanded ? null : item.id)} title={isExpanded ? "Hide investment details" : "Show investment details"} aria-label={isExpanded ? "Hide investment details" : `Show details for ${item.name}`} aria-expanded={isExpanded}>{isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button>
          </div></td>
        </tr>
        <tr className={`investment-detail-row ${isExpanded ? "is-expanded" : ""}`}>
          <td colSpan={12}>
            <div className="investment-detail-disclosure" aria-hidden={!isExpanded}>
              <div className="investment-detail-disclosure-inner">
                <section className="investment-details" aria-label={`${item.name} investment details`}>
                  <div className="investment-details-heading">
                    <div><span>PORTFOLIO HOLDING</span><strong>{item.name}</strong></div>
                    <span>{date.toLocaleDateString("en-IN", { dateStyle: "full" })}</span>
                  </div>
                  <dl className="investment-details-grid">
                    <div><dt>Asset class</dt><dd>{TYPE_LABELS[item.type]}</dd></div>
                    <div><dt>Position status</dt><dd>{item.isClosed ? "Closed · exited" : "Open · holding"}</dd></div>
                    {item.positionSide && <div><dt>Position side</dt><dd>{item.positionSide.toUpperCase()}</dd></div>}
                    <div><dt>Quantity</dt><dd>{item.quantity ?? 1}</dd></div>
                    <div><dt>Amount invested</dt><dd>{fmt(item.amount)}</dd></div>
                    <div><dt>{item.isClosed ? "Exit proceeds" : "Current value"}</dt><dd>{fmt(displayedValue)}</dd></div>
                    {item.type === "fd" && <>
                      <div><dt>Annual interest rate</dt><dd>{item.annualInterestRate?.toFixed(2) ?? "Not set"}%</dd></div>
                      <div><dt>Fixed deposit tenure</dt><dd>{[(item.durationYears ?? 0) ? `${item.durationYears} ${(item.durationYears ?? 0) === 1 ? "year" : "years"}` : "", (item.durationMonths ?? 0) ? `${item.durationMonths} ${(item.durationMonths ?? 0) === 1 ? "month" : "months"}` : ""].filter(Boolean).join(" ") || "Not set"}</dd></div>
                      <div><dt>Maturity date</dt><dd>{fdMaturityDateLabel ?? "Not set"}{fdRemainingTerm && fdRemainingTerm !== "Matured" ? ` · ${fdRemainingTerm}` : fdRemainingTerm === "Matured" ? " · Matured" : ""}</dd></div>
                    </>}
                    <div><dt>Entry price</dt><dd>{item.entryPrice != null ? fmt(item.entryPrice) : "Not set"}</dd></div>
                    <div><dt>Exit price</dt><dd>{item.exitPrice != null ? fmt(item.exitPrice) : "Not set"}</dd></div>
                    <div><dt>{item.type === "fd" && fdRemainingTerm !== "Matured" ? "Projected net P&L at maturity" : "Net profit / loss"}</dt><dd className={positive ? "investment-positive" : "investment-negative"}>{positive ? "+" : "−"}{fmt(Math.abs(pnl))}</dd></div>
                    <div><dt>Return</dt><dd className={positive ? "investment-positive" : "investment-negative"}>{positive ? "+" : ""}{pct.toFixed(2)}%</dd></div>
                    <div className="investment-details-note"><dt>Note</dt><dd>{item.note || "No note added"}</dd></div>
                  </dl>
                </section>
              </div>
            </div>
          </td>
        </tr>
      </Fragment>;
    })}</tbody></table></div>
      {filtered.length > HOLDINGS_PAGE_SIZE && <div className="enterprise-table-footer">
        <div className="footer-stats">
          <span>Showing <strong>{filtered.length ? `${(visiblePage - 1) * HOLDINGS_PAGE_SIZE + 1}–${Math.min(visiblePage * HOLDINGS_PAGE_SIZE, filtered.length)}` : 0}</strong> of <strong>{filtered.length}</strong> investments</span>
          <span className="page-size-label">20 per page</span>
        </div>
        {filtered.length > 0 && <nav className="transaction-pagination" aria-label="Investment pages">
          <button type="button" className="pagination-button" onClick={() => setCurrentPage((page) => Math.max(1, Math.min(page, pageCount) - 1))} disabled={visiblePage <= 1} aria-label="Previous investment page"><ChevronLeft size={15} /> Previous</button>
          <span>Page <strong>{visiblePage}</strong> of <strong>{pageCount}</strong></span>
          <button type="button" className="pagination-button" onClick={() => setCurrentPage((page) => Math.min(pageCount, Math.min(page, pageCount) + 1))} disabled={visiblePage >= pageCount} aria-label="Next investment page">Next <ChevronRight size={15} /></button>
        </nav>}
      </div>}
    </section>
    {showComparison && <div className="modal-overlay holding-comparison-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowComparison(false); }} onKeyDown={(event) => { if (event.key === "Escape") setShowComparison(false); }}>
      <section className="transaction-modal holding-comparison-modal" role="dialog" aria-modal="true" aria-labelledby="holding-comparison-title">
        <header className="modal-header">
          <div className="modal-header-text">
            <span className="eyebrow">PORTFOLIO ANALYSIS</span>
            <h2 id="holding-comparison-title">Holdings comparison</h2>
            <p>Compare invested capital with current or exit value. Asset and position filters from the page apply here.</p>
          </div>
          <button type="button" className="close-button" onClick={() => setShowComparison(false)} aria-label="Close holdings comparison"><X size={18} /></button>
        </header>
        <div className="holding-comparison-controls">
          <label className="holding-comparison-search">
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              value={comparisonSearch}
              onChange={(event) => { setComparisonSearch(event.target.value); setComparisonPage(0); }}
              placeholder="Search"
              aria-label="Search holdings comparison"
            />
            {comparisonSearch && <button type="button" onClick={() => { setComparisonSearch(""); setComparisonPage(0); }} aria-label="Clear search"><X size={14} /></button>}
          </label>
          <span>{comparisonMatches.length.toLocaleString()} matching {comparisonMatches.length === 1 ? "holding" : "holdings"}</span>
        </div>
        {comparisonMatches.length ? <>
          <div className="holding-comparison-chart">
            <EChartsChart option={performanceChartOption} style={{ height: Math.max(280, Math.min(520, comparisonChartHoldings.length * 36)), width: "100%" }} notMerge lazyUpdate />
          </div>
          <div className="holding-comparison-pagination">
            <span>Showing {visibleComparisonPage * HOLDING_COMPARISON_PAGE_SIZE + 1}–{Math.min((visibleComparisonPage + 1) * HOLDING_COMPARISON_PAGE_SIZE, comparisonMatches.length)} of {comparisonMatches.length.toLocaleString()}</span>
            <div>
              <button type="button" className="secondary-button" onClick={() => setComparisonPage((page) => Math.max(0, page - 1))} disabled={visibleComparisonPage === 0}>Previous</button>
              <span>Page {visibleComparisonPage + 1} of {comparisonPageCount}</span>
              <button type="button" className="secondary-button" onClick={() => setComparisonPage((page) => Math.min(comparisonPageCount - 1, page + 1))} disabled={visibleComparisonPage >= comparisonPageCount - 1}>Next</button>
            </div>
          </div>
        </> : <div className="holding-comparison-empty"><ChartNoAxesCombined size={26} /><strong>No matching holdings</strong><span>Try another search or change the asset and position filters.</span></div>}
      </section>
    </div>}
    {showModal && <InvestmentModal editing={editing} form={form} currency={user.currency ?? "INR"} setForm={setForm} withdrawalOnlyEdit={withdrawalOnlyEdit} onClose={() => { setShowModal(false); setWithdrawalOnlyEdit(false); }} onSave={save} />}
  </div>;
};

const Summary = ({ label, value, detail, icon, kind }: { label: string; value: string; detail: string; icon: React.ReactNode; kind: string }) => <div className={`investment-summary-card ${kind}`}><div className="investment-summary-top"><span>{label}</span><div className="investment-summary-icon">{icon}</div></div><strong>{value}</strong><small>{detail}</small></div>;

const InvestmentModal = ({ editing, form, currency, setForm, withdrawalOnlyEdit, onClose, onSave }: { editing: Investment | null; form: Omit<Investment, "id">; currency: string; setForm: React.Dispatch<React.SetStateAction<Omit<Investment, "id">>>; withdrawalOnlyEdit: boolean; onClose: () => void; onSave: () => void }) => {
  const quantity = form.quantity ?? 1;
  const fixedDepositMode = form.type === "fd";
  const directPnlMode = form.directPnl != null;
  const investmentAmount = directPnlMode ? form.amount : quantity * (form.entryPrice ?? 0);
  const fixedDepositMaturityValue = getFixedDepositMaturityValue(investmentAmount, form.annualInterestRate ?? 0, form.durationYears ?? 0, form.durationMonths ?? 0);
  const exitValue = directPnlMode ? Math.max(0, investmentAmount + (form.directPnl ?? 0)) : form.exitPrice != null ? form.exitPrice * quantity : form.currentValue;
  const realizedPnl = exitValue - investmentAmount;

  return <div className="modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <form
      className="transaction-modal investment-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="investment-modal-title"
      onSubmit={(event) => { event.preventDefault(); onSave(); }}
    >
      <div className="modal-header">
        <div className="modal-header-text">
          <span className="eyebrow">{editing ? "EDIT INVESTMENT" : "NEW INVESTMENT"}</span>
          <h2 id="investment-modal-title">{editing ? "Edit investment" : "Add investment"}</h2>
          <p>{withdrawalOnlyEdit ? "This month is locked. Only recording the sale proceeds as a withdrawal is allowed." : "Record your holding and track its purchase and sale prices."}</p>
        </div>
        <button type="button" className="close-button" onClick={onClose} aria-label="Close dialog"><X size={18} /></button>
      </div>

      <div className="modal-body">
        <fieldset className="form-grid investment-edit-fields" disabled={withdrawalOnlyEdit}>
          {!fixedDepositMode && <div className="investment-direct-pnl-control" style={{ gridColumn: "1 / -1" }}>
            <label className="investment-closed-toggle">
            <input type="checkbox" checked={directPnlMode} onChange={(event) => setForm((current) => event.target.checked
              ? { ...current, directPnl: 0, entryPrice: undefined, exitPrice: undefined }
              : { ...current, directPnl: undefined })} />
              <span><strong>Enter profit / loss directly</strong><small>Use this when you know the result but don’t have the entry and exit prices.</small></span>
            </label>
          </div>}
          <label>
            Investment name
            <input required value={form.name} placeholder="e.g. Reliance Industries" onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
          </label>
          <label>
            Asset type
            <select value={form.type} onChange={(event) => setForm((current) => {
              const type = event.target.value as InvestmentType;
              return { ...current, type, ...(type === "fd" ? { directPnl: undefined } : {}) };
            })}>
              {Object.entries(TYPE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
          {!fixedDepositMode && <label>
            Market symbol <span className="muted">(optional, for volatility)</span>
            <input value={form.marketSymbol ?? ""} placeholder="e.g. NSE:RELIANCE" onChange={(event) => setForm((current) => ({ ...current, marketSymbol: event.target.value.toUpperCase() }))} />
          </label>}
          <label>
            Quantity
            <input type="number" min="0.000001" step="any" inputMode="decimal" required={!directPnlMode} disabled={directPnlMode} value={form.quantity ?? 1} onChange={(event) => setForm((current) => {
              const nextQuantity = Number(event.target.value);
              return { ...current, quantity: nextQuantity, currentValue: current.exitPrice != null ? current.exitPrice * nextQuantity : current.currentValue };
            })} />
          </label>
          <label>
            <span className="investment-label-row"><span>Entry price</span><span className="investment-field-hint">Per unit at purchase</span></span>
            <input type="number" min="0.01" step="any" inputMode="decimal" required={!directPnlMode} disabled={directPnlMode} value={form.entryPrice ?? ""} placeholder="Enter price per unit" onChange={(event) => setForm((current) => ({ ...current, entryPrice: event.target.value === "" ? undefined : Number(event.target.value) }))} />
          </label>
          <label>
            <span className="investment-label-row"><span>Amount invested</span><span className="investment-field-hint">Quantity × entry price</span></span>
            <input type="number" min="0" step="any" required={!directPnlMode} value={investmentAmount || ""} placeholder={directPnlMode ? "Optional in direct mode" : "Calculated automatically"} readOnly={!directPnlMode} aria-readonly={!directPnlMode} onChange={(event) => setForm((current) => ({ ...current, amount: Number(event.target.value) }))} />
          </label>
          {fixedDepositMode && <div className="investment-fixed-deposit-fields">
            <label>
              Annual interest rate (%)
              <input type="number" min="0" step="0.01" inputMode="decimal" required value={form.annualInterestRate ?? ""} placeholder="e.g. 7.25" onChange={(event) => setForm((current) => ({ ...current, annualInterestRate: event.target.value === "" ? undefined : Number(event.target.value) }))} />
            </label>
            <label>
              Duration (years)
              <input type="number" min="0" step="1" inputMode="numeric" value={form.durationYears ?? 0} onChange={(event) => setForm((current) => ({ ...current, durationYears: Number(event.target.value) || 0 }))} />
            </label>
            <label>
              Duration (months)
              <input type="number" min="0" max="11" step="1" inputMode="numeric" value={form.durationMonths ?? 0} onChange={(event) => setForm((current) => ({ ...current, durationMonths: Math.min(11, Math.max(0, Number(event.target.value) || 0)) }))} />
            </label>
            <div className="investment-fixed-deposit-preview" aria-live="polite">
              <span>Estimated maturity value</span>
              <strong>{formatCurrency(fixedDepositMaturityValue, currency)}</strong>
              <small>Quarterly compounding · based on your entered rate and tenure</small>
            </div>
          </div>}
          {directPnlMode && !fixedDepositMode && <label>
            Profit / loss
            <input type="number" step="any" value={form.directPnl ?? 0} onChange={(event) => setForm((current) => ({ ...current, directPnl: Number(event.target.value) }))} />
            <span className="investment-field-hint">Enter a positive amount for profit or a negative amount for loss.</span>
          </label>}
          {!fixedDepositMode && <label>
            Current value
            <input
              type="number"
              min="0"
              step="any"
              value={fixedDepositMode && !form.isClosed ? fixedDepositMaturityValue || "" : form.exitPrice != null ? form.exitPrice * quantity : form.currentValue || ""}
              placeholder={fixedDepositMode ? "Calculated from rate and tenure" : form.exitPrice != null ? "Calculated from exit price × quantity" : "Enter current value"}
              readOnly={fixedDepositMode || directPnlMode || form.exitPrice != null}
              aria-readonly={fixedDepositMode || directPnlMode || form.exitPrice != null}
              onChange={(event) => setForm((current) => ({ ...current, currentValue: Number(event.target.value) }))}
            />
          </label>}
          <label>
            <span className="investment-label-row"><span>Exit price</span><span className="investment-field-hint">Per unit when sold</span></span>
            <input type="number" min="0" step="any" inputMode="decimal" required={Boolean(form.isClosed) && !directPnlMode} disabled={directPnlMode} value={form.exitPrice ?? ""} placeholder={form.isClosed ? "Required to close position" : "Optional"} onChange={(event) => setForm((current) => {
              const exitPrice = event.target.value === "" ? undefined : Number(event.target.value);
              return { ...current, exitPrice, currentValue: exitPrice != null ? exitPrice * (current.quantity ?? 1) : current.currentValue };
            })} />
          </label>
          <label>
            Date
            <input type="date" value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} />
          </label>
          <label className="investment-note-field">
            <span className="investment-label-row"><span>Note</span><span className="investment-field-hint">Optional</span></span>
            <input value={form.note} placeholder="e.g. Long-term holding" onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} />
          </label>
        </fieldset>
        <div className="investment-closed-control">
          <label className="investment-closed-toggle">
            <input type="checkbox" disabled={withdrawalOnlyEdit} checked={Boolean(form.isClosed)} onChange={(event) => setForm((current) => ({ ...current, isClosed: event.target.checked, withdrawalRecorded: event.target.checked ? current.withdrawalRecorded : false }))} />
            <span><strong>Closed position</strong><small>Mark this investment as exited or sold.</small></span>
          </label>
          {form.isClosed && <label className="investment-closed-toggle investment-withdrawal-toggle">
            <input type="checkbox" checked={Boolean(form.withdrawalRecorded)} onChange={(event) => setForm((current) => ({ ...current, withdrawalRecorded: event.target.checked }))} />
            <span><strong>Record as withdrawal</strong><small>Add these sale proceeds to the Withdrawals page.</small></span>
          </label>}
          {(form.isClosed || directPnlMode) && (
            <div className={`investment-realized-result ${realizedPnl >= 0 ? "positive" : "negative"}`} aria-live="polite">
              <span>Realized profit / loss</span>
              <strong>{realizedPnl >= 0 ? "+" : "−"}{formatCurrency(Math.abs(realizedPnl), currency)}</strong>
              <small>{form.exitPrice != null ? "Exit price × quantity − amount invested" : "Exit value − amount invested"}</small>
            </div>
          )}
        </div>
      </div>

      <div className="modal-footer">
        <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
        <button type="submit" className="primary-button"><Check size={15} /> {withdrawalOnlyEdit ? "Record withdrawal" : editing ? "Save changes" : "Add investment"}</button>
      </div>
    </form>
  </div>
};

export default InvestmentPage;
