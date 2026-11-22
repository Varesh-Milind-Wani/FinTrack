import { Activity, BriefcaseBusiness, ChartPie, CircleDollarSign, TrendingDown, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import type { Investment, InvestmentType, UserAccount } from "../types/finance";
import { formatCurrency } from "../utils/money";

const EMPTY_INVESTMENTS: Investment[] = [];
const TYPE_LABELS: Record<InvestmentType, string> = {
  stocks: "Stocks", mutual_fund: "Mutual funds", crypto: "Crypto", gold: "Gold",
  real_estate: "Real estate", fd: "Fixed deposits", other: "Other",
};
const investmentValue = (item: Investment) => item.isClosed && item.exitPrice != null
  ? item.exitPrice * (item.quantity ?? 1)
  : item.currentValue;
const investmentPnl = (item: Investment) => item.positionSide === "short"
  ? item.amount - investmentValue(item)
  : investmentValue(item) - item.amount;
const normalizeAssetKey = (value: string) => value.trim().toLocaleLowerCase().replace(/[^a-z0-9]/g, "");

const DiversificationAnalysis = ({ user }: { user: UserAccount }) => {
  const [activeTab, setActiveTab] = useState<"all" | InvestmentType | "other">("all");
  const data = useMemo(() => {
    const investments = user.investments ?? EMPTY_INVESTMENTS;
    const stocks = investments.filter((item) => item.type === "stocks");
    const stockCost = stocks.reduce((sum, item) => sum + item.amount, 0);
    const stockPnlValues = stocks.map(investmentPnl);
    const stockProfit = stockPnlValues.reduce((sum, pnl) => sum + (pnl > 0 ? pnl : 0), 0);
    const stockLoss = stockPnlValues.reduce((sum, pnl) => sum + (pnl < 0 ? pnl : 0), 0);
    // Investments are summarized from holdings, separately from trade records.
    // Exclude investment-category rows and records linked to a holding order or
    // to a stock by its symbol / instrument, without dropping ordinary equity trades.
    const investmentOrderIds = new Set(investments.map((item) => item.sourceOrderId).filter((id): id is string => Boolean(id)));
    const stockKeys = new Set(stocks.flatMap((item) => [item.name, item.marketSymbol ?? ""])
      .map(normalizeAssetKey).filter((key) => key.length >= 3));
    const trades = (user.transactions ?? []).filter((item) => {
      const category = String(item.category ?? "").trim().toLocaleLowerCase();
      if (["investment", "stock", "stocks"].includes(category)) return false;
      if ((item.sourceOrderIds ?? []).some((id) => investmentOrderIds.has(id))) return false;
      const instrument = normalizeAssetKey(item.instrument ?? "");
      return !instrument || !stockKeys.has(instrument);
    });
    // Saved transaction amounts are already net of their recorded costs.
    // Keep profit and loss separate so the page shows both actual totals.
    const tradeProfit = trades.filter((item) => item.type === "profit").reduce((sum, item) => sum + item.amount, 0);
    const tradeLoss = trades.filter((item) => item.type === "loss").reduce((sum, item) => sum + item.amount, 0);
    const tradeCosts = trades.reduce((sum, item) => sum + (item.costAmount ?? 0), 0);
    const byType = (Object.keys(TYPE_LABELS) as InvestmentType[]).map((type) => ({
      type,
      value: investments.filter((item) => item.type === type && !item.isClosed).reduce((sum, item) => sum + item.currentValue, 0),
      count: investments.filter((item) => item.type === type && !item.isClosed).length,
    })).filter((item) => item.count > 0);
    const portfolioValue = byType.reduce((sum, item) => sum + item.value, 0);
    return { stocks, stockCost, stockProfit, stockLoss, stockNet: stockProfit + stockLoss, trades, tradeProfit, tradeLoss, tradeNet: tradeProfit - tradeLoss, tradeCosts, byType, portfolioValue };
  }, [user.investments, user.transactions]);
  const money = (value: number) => formatCurrency(Math.abs(value), user.currency);
  const visibleAllocation = data.byType.filter((item) => activeTab === "all" || activeTab === "other"
    ? activeTab === "all" || !["stocks", "mutual_fund"].includes(item.type)
    : item.type === activeTab);
  const largestHoldingClass = data.byType.reduce((largest, item) => item.value > largest.value ? item : largest, { type: "stocks" as InvestmentType, value: 0, count: 0 });

  return <div className="page-content diversification-page">
    <header className="page-heading diversification-heading">
      <div><span className="eyebrow">PORTFOLIO MIX</span><h1>Diversification Analysis</h1>
        <p>See how your investments are spread across asset classes.</p></div>
      <div className="diversification-total"><ChartPie size={18} /><span>Open investment value</span><strong>{money(data.portfolioValue)}</strong></div>
    </header>

    <nav className="diversification-tabs" aria-label="Filter investment allocation">
      {([ ["all", "All"], ["stocks", "Stocks"], ["mutual_fund", "Mutual Funds"], ["other", "Other Assets"] ] as const).map(([key, label]) => <button key={key} type="button" className={activeTab === key ? "active" : ""} aria-pressed={activeTab === key} onClick={() => setActiveTab(key)}>{label}</button>)}
    </nav>

    <div className="diversification-overview" aria-label="Portfolio overview">
      <article><span>Open investment value</span><strong>{money(data.portfolioValue)}</strong></article>
      <article><span>Asset classes</span><strong>{data.byType.length}</strong></article>
      <article><span>Largest allocation</span><strong>{data.byType.length ? TYPE_LABELS[largestHoldingClass.type] : "—"}</strong></article>
    </div>

    <section className="diversification-allocation" aria-labelledby="allocation-title">
      <div className="diversification-section-heading"><div className="diversification-section-icon mix"><ChartPie size={18} /></div><div><h2 id="allocation-title">Investment allocation</h2><p>Current value across your open holdings.</p></div></div>
      {visibleAllocation.length ? <div className="diversification-allocation-list">{visibleAllocation.map((item) => {
        const share = data.portfolioValue > 0 ? item.value / data.portfolioValue * 100 : 0;
        return <div className="diversification-allocation-row" key={item.type}><div className="diversification-allocation-label"><strong>{TYPE_LABELS[item.type]}</strong><span>{item.count} {item.count === 1 ? "holding" : "holdings"}</span></div><div className="diversification-track" role="img" aria-label={`${TYPE_LABELS[item.type]}: ${share.toFixed(1)}%`}><span style={{ width: `${share}%` }} /></div><strong className="diversification-share">{share.toFixed(1)}%</strong><span className="diversification-allocation-value">{money(item.value)}</span></div>;
      })}</div> : <div className="diversification-empty">No holdings in this category yet.</div>}
    </section>

    <section className="diversification-section" aria-labelledby="stocks-analysis-title">
      <div className="diversification-section-heading"><div className="diversification-section-icon stock"><BriefcaseBusiness size={18} /></div><div><h2 id="stocks-analysis-title">Stock portfolio</h2><p>Stock holdings only. Cost is the recorded purchase basis.</p></div><span className="diversification-count">{data.stocks.length} {data.stocks.length === 1 ? "holding" : "holdings"}</span></div>
      <div className="diversification-card-grid">
        <SummaryCard label="Net stock P&L" value={data.stockNet} currency={user.currency} detail="Stock profit less stock loss only" icon={data.stockNet >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />} tone={data.stockNet >= 0 ? "positive" : "negative"} />
        <SummaryCard label="Stock net profit" value={data.stockProfit} currency={user.currency} detail="Gains across recorded stock holdings" icon={<TrendingUp size={18} />} tone="positive" />
        <SummaryCard label="Stock net loss" value={data.stockLoss} currency={user.currency} detail="Losses across recorded stock holdings" icon={<TrendingDown size={18} />} tone="negative" />
        <SummaryCard label="Stock cost basis" value={data.stockCost} currency={user.currency} detail="Total recorded amount invested in stocks" icon={<CircleDollarSign size={18} />} tone="neutral" />
      </div>
    </section>

    <section className="diversification-section" aria-labelledby="trades-analysis-title">
      <div className="diversification-section-heading"><div className="diversification-section-icon trade"><Activity size={18} /></div><div><h2 id="trades-analysis-title">Trade performance</h2><p>Trade P&amp;L is calculated separately; investment category and stock linked records are excluded.</p></div><span className="diversification-count">{data.trades.length} {data.trades.length === 1 ? "trade" : "trades"}</span></div>
      <div className="diversification-card-grid">
        <SummaryCard label="Net trade P&L" value={data.tradeNet} currency={user.currency} detail="Trade profit less trade loss only" icon={data.tradeNet >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />} tone={data.tradeNet >= 0 ? "positive" : "negative"} />
        <SummaryCard label="Net trade profit" value={data.tradeProfit} currency={user.currency} detail="Recorded profit transactions after costs" icon={<TrendingUp size={18} />} tone="positive" />
        <SummaryCard label="Net trade loss" value={-data.tradeLoss} currency={user.currency} detail="Recorded loss transactions after costs" icon={<TrendingDown size={18} />} tone="negative" />
        <SummaryCard label="Trade costs" value={data.tradeCosts} currency={user.currency} detail="Recorded brokerage and other trade charges" icon={<CircleDollarSign size={18} />} tone="cost" />
      </div>
    </section>

  </div>;
};

const SummaryCard = ({ label, value, currency, detail, icon, tone }: { label: string; value: number; currency: string; detail: string; icon: React.ReactNode; tone: "positive" | "negative" | "neutral" | "cost" }) => (
  <article className={`diversification-metric ${tone}`}><div className="diversification-metric-top"><span>{label}</span><i>{icon}</i></div><strong>{value < 0 ? "−" : tone === "positive" ? "+" : ""}{formatCurrency(Math.abs(value), currency)}</strong><small>{detail}</small></article>
);

export default DiversificationAnalysis;
