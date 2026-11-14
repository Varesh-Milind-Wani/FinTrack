import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Highcharts from "highcharts";
import HighchartsReact from "highcharts-react-official";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CircleHelp,
  Gauge,
  ListChecks,
  ShieldCheck,
  Target,
  TrendingDown,
  X,
} from "lucide-react";

import type { Transaction, UserAccount } from "../types/finance";
import { formatCurrency } from "../utils/money";

const WINDOW_SIZE = 10;
const ClassicHighchartsChart = (HighchartsReact as unknown as { default?: typeof HighchartsReact }).default ?? HighchartsReact;
const SIGNAL_RANGES = [
  { value: "last10", label: "Last 10 trades" },
  { value: "1m", label: "Last 1 month" },
  { value: "3m", label: "Last 3 months" },
  { value: "6m", label: "Last 6 months" },
  { value: "1y", label: "Last 1 year" },
  { value: "3y", label: "Last 3 years" },
  { value: "5y", label: "Last 5 years" },
  { value: "10y", label: "Last 10 years" },
  { value: "all", label: "All history" },
] as const;
type SignalRange = (typeof SIGNAL_RANGES)[number]["value"];
type ConfidenceRange = "last10" | "all";

type SignalTone = "warning" | "positive" | "steady";

const signedPnl = (trade: Transaction) => (trade.type === "profit" ? 1 : -1) * Math.abs(trade.amount);

const formatDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : new Intl.DateTimeFormat(undefined, { day: "2-digit", month: "short", year: "numeric" }).format(date);
};

const subtractPeriod = (date: Date, amount: number, unit: "months" | "years") => {
  const result = new Date(date);
  const day = result.getDate();
  result.setDate(1);
  if (unit === "months") result.setMonth(result.getMonth() - amount);
  else result.setFullYear(result.getFullYear() - amount);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(day, lastDay));
  return result;
};

const selectTradesForRange = (trades: Transaction[], range: SignalRange, now: Date) => {
  if (range === "last10") return trades.slice(-WINDOW_SIZE);
  if (range === "all") return trades;
  const amount = Number.parseInt(range, 10);
  const cutoff = subtractPeriod(now, amount, range.endsWith("m") ? "months" : "years");
  cutoff.setHours(0, 0, 0, 0);
  return trades.filter((trade) => Date.parse(trade.date) >= cutoff.getTime());
};

const TradeSignal = ({ user }: { user: UserAccount }) => {
  const currency = user.currency;
  const money = useCallback((value: number) => formatCurrency(value, currency), [currency]);
  const [fearGreedRange, setFearGreedRange] = useState<SignalRange>("last10");
  const [confidenceRange, setConfidenceRange] = useState<ConfidenceRange>("last10");
  const [tradesDialogOpen, setTradesDialogOpen] = useState(false);
  const [fearGreedChartOpen, setFearGreedChartOpen] = useState(false);
  useEffect(() => {
    if (!fearGreedChartOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setFearGreedChartOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [fearGreedChartOpen]);

  const analysis = useMemo(() => {
    const now = new Date();
    const eligible = user.transactions
      .filter((trade) => (trade.type === "profit" || trade.type === "loss")
        && Number.isFinite(Date.parse(trade.date))
        && Date.parse(trade.date) <= now.getTime()
        && Number.isFinite(trade.amount))
      .slice()
      .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
    const latestTrades = eligible.slice(-WINDOW_SIZE);
    const trades = selectTradesForRange(eligible, fearGreedRange, now);
    // The Fear & Greed period is the shared analysis window for all trade
    // performance metrics on this page.
    const fearGreedTrades = trades;
    const windowLabel = SIGNAL_RANGES.find((item) => item.value === fearGreedRange)?.label ?? "Last 10 trades";
    const fearGreedWindowLabel = SIGNAL_RANGES.find((item) => item.value === fearGreedRange)?.label ?? "Last 10 trades";
    const wins = trades.filter((trade) => trade.type === "profit");
    const losses = trades.filter((trade) => trade.type === "loss");
    const winTotal = wins.reduce((total, trade) => total + Math.abs(trade.amount), 0);
    const lossTotal = losses.reduce((total, trade) => total + Math.abs(trade.amount), 0);
    const net = winTotal - lossTotal;
    const winRate = trades.length ? (wins.length / trades.length) * 100 : 0;
    const averageWin = wins.length ? winTotal / wins.length : 0;
    const averageLoss = losses.length ? lossTotal / losses.length : 0;
    const expectancy = trades.length ? net / trades.length : 0;
    const rawProfitFactor = lossTotal > 0 ? winTotal / lossTotal : winTotal > 0 ? Infinity : 0;
    const profitFactor = Number.isFinite(rawProfitFactor) ? rawProfitFactor : winTotal > 0 ? 2 : 0;
    const profitFactorLabel = lossTotal > 0 ? rawProfitFactor.toFixed(2) : winTotal > 0 ? "∞" : "N/A";
    let currentStreakType: Transaction["type"] | null = null;
    let currentStreak = 0;
    for (let index = trades.length - 1; index >= 0; index -= 1) {
      const type = trades[index].type;
      if (currentStreakType && currentStreakType !== type) break;
      currentStreakType = type;
      currentStreak += 1;
    }
    let longestLossStreak = 0;
    let lossRun = 0;
    let longestWinStreak = 0;
    let winRun = 0;
    let cumulative = 0;
    let peak = 0;
    let maxDrawdown = 0;
    trades.forEach((trade) => {
      lossRun = trade.type === "loss" ? lossRun + 1 : 0;
      winRun = trade.type === "profit" ? winRun + 1 : 0;
      longestLossStreak = Math.max(longestLossStreak, lossRun);
      longestWinStreak = Math.max(longestWinStreak, winRun);
      cumulative += signedPnl(trade);
      peak = Math.max(peak, cumulative);
      maxDrawdown = Math.max(maxDrawdown, peak - cumulative);
    });
    const lastThree = trades.slice(-3);
    const lastThreeNet = lastThree.reduce((sum, trade) => sum + signedPnl(trade), 0);
    const lastThreeWins = lastThree.filter((trade) => trade.type === "profit").length;
    const payoffRatio = averageLoss > 0 ? averageWin / averageLoss : averageWin > 0 ? Infinity : 0;
    const payoffLabel = averageLoss > 0 ? payoffRatio.toFixed(2) : averageWin > 0 ? "∞" : "N/A";
    const confidenceTrades = confidenceRange === "last10" ? latestTrades : eligible;
    const trackedConfidence = confidenceTrades.filter((trade) => Number.isFinite(trade.confidenceLevel)
      && (trade.confidenceLevel ?? -1) >= 0
      && (trade.confidenceLevel ?? 101) <= 100);
    const averageConfidence = trackedConfidence.length
      ? trackedConfidence.reduce((total, trade) => total + (trade.confidenceLevel ?? 0), 0) / trackedConfidence.length
      : null;
    const confidenceWins = confidenceTrades.filter((trade) => trade.type === "profit");
    const confidenceLosses = confidenceTrades.filter((trade) => trade.type === "loss");
    const confidenceWinRate = confidenceTrades.length ? confidenceWins.length / confidenceTrades.length * 100 : 0;
    const confidenceWinTotal = confidenceWins.reduce((sum, trade) => sum + Math.abs(trade.amount), 0);
    const confidenceLossTotal = confidenceLosses.reduce((sum, trade) => sum + Math.abs(trade.amount), 0);
    const confidenceProfitFactor = confidenceLossTotal > 0
      ? confidenceWinTotal / confidenceLossTotal
      : confidenceWinTotal > 0 ? 2 : 0;
    const confidenceRecentTrades = confidenceTrades.slice(-3);
    const confidenceRecentWinRate = confidenceRecentTrades.length
      ? confidenceRecentTrades.filter((trade) => trade.type === "profit").length / confidenceRecentTrades.length * 100
      : 50;
    const performanceConfidence = confidenceTrades.length
      ? Math.round(confidenceWinRate * .4 + Math.min(100, confidenceProfitFactor * 50) * .4 + confidenceRecentWinRate * .2)
      : null;
    const confidenceIndex = performanceConfidence == null ? null : Math.round(averageConfidence == null
      ? performanceConfidence
      : averageConfidence * .4 + performanceConfidence * .6);
    const recordedCosts = trades.reduce((total, trade) => {
      const cost = trade.costAmount ?? ((trade.brokerageAmount ?? 0) + (trade.otherChargesAmount ?? 0));
      return total + (Number.isFinite(cost) ? Math.abs(cost) : 0);
    }, 0);
    const feeRecords = trades.filter((trade) => trade.costAmount != null || trade.brokerageAmount != null || trade.otherChargesAmount != null).length;

    // Break-even rows have no positive or negative outcome, so leave them out
    // of the win-rate denominator and the profit/loss score.
    const fearWins = fearGreedTrades.filter((trade) => trade.type === "profit" && Math.abs(trade.amount) > 0);
    const fearLosses = fearGreedTrades.filter((trade) => trade.type === "loss" && Math.abs(trade.amount) > 0);
    const fearWinTotal = fearWins.reduce((sum, trade) => sum + Math.abs(trade.amount), 0);
    const fearLossTotal = fearLosses.reduce((sum, trade) => sum + Math.abs(trade.amount), 0);
    const fearOutcomeCount = fearWins.length + fearLosses.length;
    const fearWinRate = fearOutcomeCount ? fearWins.length / fearOutcomeCount * 100 : 0;
    const fearTotalPnl = fearWinTotal + fearLossTotal;
    const fearWinAmountShare = fearTotalPnl > 0 ? fearWinTotal / fearTotalPnl * 100 : 0;
    // 0 means every recorded result is a loss, 100 means every result is a
    // win. Equal weighting balances win frequency with the size of outcomes.
    const fearGreedScore = fearOutcomeCount
      ? Math.round((fearWinRate + fearWinAmountShare) / 2)
      : null;
    const fearGreedLabel = fearGreedScore == null
      ? "No data"
      : fearOutcomeCount < 5 ? "Early read"
      : fearGreedScore < 25 ? "Extreme fear"
        : fearGreedScore < 45 ? "Fear"
          : fearGreedScore <= 55 ? "Neutral"
            : fearGreedScore < 75 ? "Greed" : "Extreme greed";

    let tone: SignalTone;
    let title: string;
    let message: string;
    let recommendation: string;
    if (trades.length < 5 && currentStreak < 3) {
      tone = "steady";
      title = "Building a reliable read";
      message = `${trades.length} ${fearGreedRange === "last10" ? `of the ${WINDOW_SIZE} trades in this window` : `completed trades in ${windowLabel.toLowerCase()}`}. Treat this as an early indication and avoid forcing trades to fill the history.`;
      recommendation = `Only ${trades.length} trades are recorded. Keep the next trade small. Decide your entry, exit, and maximum loss before you trade.`;
    } else if (currentStreakType === "loss" && currentStreak >= 3) {
      tone = "warning";
      title = "Pause and review the recent sequence";
      message = `Your latest ${currentStreak} trades are losses. This window is ${money(net)} net with a ${profitFactorLabel} profit factor.`;
      recommendation = `You've had ${currentStreak} losses in a row. Take a break. Don't trade to win the money back. Set your exit and maximum loss before your next trade.`;
    } else if (currentStreakType === "loss" && currentStreak >= 2) {
      tone = "warning";
      title = "Check the setup after consecutive losses";
      message = `Your latest ${currentStreak} trades are losses. The selected sample is ${money(net)} net.`;
      recommendation = "You've had two losses in a row. Check your setup and decide where to exit before trading again. Keep your trade size the same or smaller.";
    } else if (net < 0 || profitFactor < 1) {
      tone = "warning";
      title = "Recent performance is below breakeven";
      message = `${windowLabel} returned ${money(net)} net. Winners total ${money(winTotal)} against ${money(lossTotal)} in losses.`;
      recommendation = averageWin === 0 && averageLoss > 0
        ? "There are no wins in this group of trades. Keep the next trade small, decide when to exit first, and don't add to a losing trade."
        : averageWin > 0 && averageLoss > averageWin * 1.25
          ? `Your average loss is ${money(averageLoss)}; your average win is ${money(averageWin)}. Use a smaller trade and decide when to exit before you enter.`
          : `These trades are down ${money(Math.abs(net))}. Follow your plan, decide when to exit first, and don't trade just to win the money back.`;
    } else if (net > 0 && profitFactor >= 1.2) {
      tone = "positive";
      title = "Recent performance is constructive";
      message = `${windowLabel} returned ${money(net)} net with a ${profitFactorLabel} profit factor. Past results do not guarantee future outcomes.`;
      recommendation = "Stick to your usual trade size. Decide when to exit before you enter, and don't take bigger trades just because you won recently.";
    } else {
      tone = "steady";
      title = "No clear edge in this window yet";
      message = `This window is near breakeven. Win rate is ${winRate.toFixed(1)}% and expectancy is ${money(expectancy)} per trade.`;
      recommendation = "Before trading, know why you're entering, when you'll exit, and how much you could lose. Wait if any of these are unclear.";
    }

    return {
      trades,
      windowLabel,
      wins: wins.length,
      losses: losses.length,
      winTotal,
      lossTotal,
      net,
      winRate,
      profitFactorLabel,
      averageWin,
      averageLoss,
      expectancy,
      payoffLabel,
      currentStreakType,
      currentStreak,
      longestLossStreak,
      longestWinStreak,
      lastThreeNet,
      lastThreeWins,
      maxDrawdown,
      averageConfidence,
      confidenceIndex,
      trackedConfidenceCount: trackedConfidence.length,
      confidenceTradeCount: confidenceTrades.length,
      confidenceRangeLabel: confidenceRange === "last10" ? "Last 10 trades" : "All time",
      recordedCosts,
      feeRecords,
      fearGreedScore,
      fearGreedLabel,
      fearGreedWindowLabel,
      fearGreedTrades,
      fearOutcomeCount,
      fearWins,
      fearLosses,
      fearWinTotal,
      fearLossTotal,
      tone,
      title,
      message,
      recommendation,
    };
  }, [user.transactions, money, fearGreedRange, confidenceRange]);

  const scoreTone = analysis.fearGreedScore == null ? "neutral" : analysis.fearGreedScore < 45 ? "fear" : analysis.fearGreedScore > 55 ? "greed" : "neutral";

  const fearGreedChartOptions = useMemo<Highcharts.Options>(() => {
    const qualifyingTrades = analysis.fearGreedTrades.filter((trade) => Math.abs(trade.amount) > 0);
    const scorePoints: Array<[number, number]> = [];
    const winRatePoints: Array<[number, number]> = [];
    const winSharePoints: Array<[number, number]> = [];
    qualifyingTrades.forEach((trade, index) => {
      const sample = fearGreedRange === "last10"
        ? qualifyingTrades.slice(Math.max(0, index - WINDOW_SIZE + 1), index + 1)
        : qualifyingTrades.slice(0, index + 1);
      const wins = sample.filter((item) => item.type === "profit");
      const totalWins = wins.reduce((sum, item) => sum + Math.abs(item.amount), 0);
      const totalLosses = sample.filter((item) => item.type === "loss").reduce((sum, item) => sum + Math.abs(item.amount), 0);
      const totalPnl = totalWins + totalLosses;
      const winRate = sample.length ? wins.length / sample.length * 100 : 0;
      const winShare = totalPnl ? totalWins / totalPnl * 100 : 0;
      const timestamp = Date.parse(trade.date);
      scorePoints.push([timestamp, Math.round((winRate + winShare) / 2)]);
      winRatePoints.push([timestamp, winRate]);
      winSharePoints.push([timestamp, winShare]);
    });
    return {
      chart: { type: "line", backgroundColor: "transparent", height: 480, zooming: { type: "x" } },
      title: { text: undefined },
      xAxis: { type: "datetime", title: { text: "Trade date" } },
      yAxis: { min: 0, max: 100, tickInterval: 20, title: { text: "Score (%)" } },
      tooltip: { shared: true, xDateFormat: "%e %b %Y", valueSuffix: "%", valueDecimals: 1 },
      legend: { enabled: true },
      credits: { enabled: false },
      plotOptions: { series: { marker: { enabled: qualifyingTrades.length <= 40, radius: 3 } } },
      series: [
        { type: "line", name: "Personal outcome index", data: scorePoints, color: "#22d3a6", lineWidth: 3 },
        { type: "line", name: "Win rate", data: winRatePoints, color: "#5b7cff" },
        { type: "line", name: "Winning P&L share", data: winSharePoints, color: "#f6c453" },
      ],
    };
  }, [analysis.fearGreedTrades, fearGreedRange]);

  return (
    <div className="trade-signal-page">
      <header className="trade-signal-header">
        <div>
          <span className="eyebrow">TRADE INTELLIGENCE / SIGNAL DESK</span>
          <h1>Trade Signal</h1>
          <p>Personal performance insights from your saved completed trades.</p>
        </div>
        <div className="trade-signal-header-actions">
          <div className="trade-signal-window"><Activity size={16} /><span>ANALYSIS WINDOW</span><strong>{analysis.trades.length} trades</strong></div>
          <button type="button" className="trade-signal-view-trades" onClick={() => setTradesDialogOpen(true)}><ListChecks size={16} /> View analyzed trades <span>{analysis.trades.length}</span></button>
        </div>
      </header>

      <section className={`trade-signal-callout ${analysis.tone}`}>
        <div className="trade-signal-callout-copy">
          <span className="trade-signal-kicker"><ShieldCheck size={14} /> PERSONAL TRADE READ</span>
          <h2>{analysis.title}</h2>
          <p>{analysis.message}</p>
          <div className="trade-signal-action"><strong>Next trade focus</strong><span>{analysis.recommendation}</span></div>
        </div>
      </section>

      <section className="trade-signal-indices-section" aria-label="Personal trading indices">
        <header className="trade-signal-indices-heading">
          <div><span className="eyebrow">YOUR TRADE RESULTS</span><h2>Your trading results</h2><p>Based on the trades you recorded.</p></div>
        </header>
        <div className="trade-signal-index-grid">
          <article className={`trade-signal-index-panel trade-signal-sentiment-panel ${scoreTone} trade-signal-index-clickable`} role="button" tabIndex={0} aria-label="Open personal outcome index chart" onClick={() => setFearGreedChartOpen(true)} onKeyDown={(event) => { if ((event.target as HTMLElement).closest("select, option, button, input, label")) return; if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setFearGreedChartOpen(true); } }}>
            <div className="trade-signal-index-panel-heading"><div><span className="eyebrow">FEAR &amp; GREED</span><h3>Personal outcome index</h3></div><label className="trade-signal-fear-period-filter" onClick={(event) => event.stopPropagation()}><span>Fear &amp; Greed period</span><select value={fearGreedRange} onChange={(event) => setFearGreedRange(event.target.value as SignalRange)} aria-label="Fear and Greed analysis period">{SIGNAL_RANGES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label></div>
            <span className="trade-signal-index-period">{analysis.fearGreedWindowLabel}</span>
            <div className="trade-signal-fear-display">
              <svg width="240" height="150" viewBox="0 0 180 112" role="img" aria-label={`Personal Fear and Greed score ${analysis.fearGreedScore ?? "not available"} out of 100: ${analysis.fearGreedLabel}`}>
                <defs><linearGradient id="trade-signal-spectrum" x1="0" y1="1" x2="1" y2="0"><stop offset="0%" stopColor="#fb5265" /><stop offset="48%" stopColor="#f6c453" /><stop offset="100%" stopColor="#22d3a6" /></linearGradient></defs>
                <path d="M 10 96 A 80 80 0 0 1 170 96" fill="none" stroke="url(#trade-signal-spectrum)" strokeWidth="10" strokeLinecap="round" />
                {analysis.fearGreedScore != null && <circle cx={10 + 80 * (1 - Math.cos(Math.PI * analysis.fearGreedScore / 100))} cy={96 - 80 * Math.sin(Math.PI * analysis.fearGreedScore / 100)} r="6" fill="#f7fbff" stroke="#182235" strokeWidth="3" />}
                <text x="90" y="69" textAnchor="middle" className="fear-greed-number">{analysis.fearGreedScore ?? "—"}</text>
                <text x="90" y="88" textAnchor="middle" className="fear-greed-word">{analysis.fearGreedLabel}</text>
              </svg>
              <div className="trade-signal-fear-summary"><strong>{analysis.fearGreedLabel}</strong><span>{analysis.fearGreedScore == null ? "No profit or loss results" : `Score ${analysis.fearGreedScore} / 100`}</span><small>{analysis.fearOutcomeCount} results: {analysis.fearWins.length} wins and {analysis.fearLosses.length} losses. Net P&amp;L: {money(analysis.fearWinTotal - analysis.fearLossTotal)}.</small><small>Score uses win rate and share of total P&amp;L from wins.</small></div>
            </div>
          </article>
          <article className="trade-signal-index-panel trade-signal-confidence-panel">
            <div className="trade-signal-index-panel-heading"><div><span className="eyebrow">CONFIDENCE INDEX</span><h3>Confidence backed by results</h3></div>
              <label className="trade-signal-confidence-filter"><span>Based on</span><select value={confidenceRange} onChange={(event) => setConfidenceRange(event.target.value as ConfidenceRange)} aria-label="Confidence index period"><option value="last10">Last 10 trades</option><option value="all">All time</option></select></label>
            </div>
            <div className="trade-signal-confidence-score-row"><strong className={analysis.confidenceIndex == null ? "unavailable" : analysis.confidenceIndex >= 60 ? "positive" : analysis.confidenceIndex >= 40 ? "neutral" : "negative"}>{analysis.confidenceIndex == null ? "—" : analysis.confidenceIndex}</strong><div><b>{analysis.confidenceIndex == null ? "No trades to score" : analysis.confidenceIndex >= 60 ? "Positive outcome signal" : analysis.confidenceIndex >= 40 ? "Mixed outcome evidence" : "Low outcome signal"}</b><span>{analysis.confidenceTradeCount} completed {analysis.confidenceTradeCount === 1 ? "trade" : "trades"} included</span></div></div>
            <div className="trade-signal-confidence-meter" role="meter" aria-label="Confidence index" aria-valuemin={0} aria-valuemax={100} aria-valuenow={analysis.confidenceIndex ?? 0}><span style={{ width: `${analysis.confidenceIndex ?? 0}%` }} /></div>
            <div className="trade-signal-confidence-meta"><span>{analysis.trackedConfidenceCount ? `${analysis.trackedConfidenceCount} saved ratings blended at 40%` : "No saved ratings; score uses trade outcomes only"}</span><small>Outcome score: 40% win rate · 40% capped profit factor · 20% recent win rate</small></div>
          </article>
        </div>
      </section>
      <section className="trade-signal-metric-grid" aria-label="Recent trade performance">
        <Metric icon={<Activity />} label="Net P&L" value={money(analysis.net)} tone={analysis.net >= 0 ? "positive" : "negative"} detail={`${money(analysis.winTotal)} gains · ${money(analysis.lossTotal)} losses · ${analysis.windowLabel}`} />
        <Metric icon={<Target />} label="Win rate" value={`${analysis.winRate.toFixed(1)}%`} tone={analysis.winRate >= 50 ? "positive" : "negative"} detail={`${analysis.wins} wins · ${analysis.losses} losses · ${analysis.windowLabel}`} />
        <Metric icon={<BarChart3 />} label="Profit factor" value={analysis.profitFactorLabel} tone={analysis.profitFactorLabel === "∞" || Number(analysis.profitFactorLabel) >= 1 ? "positive" : "negative"} detail={`Gross winning P&L ÷ gross losing P&L · ${analysis.windowLabel}`} />
        <Metric icon={<Gauge />} label="Expectancy / trade" value={money(analysis.expectancy)} tone={analysis.expectancy >= 0 ? "positive" : "negative"} detail={`Average realized result per transaction · ${analysis.windowLabel}`} />
        <Metric icon={<ArrowUpRight />} label="Average win" value={money(analysis.averageWin)} tone="positive" detail={analysis.wins ? `Across ${analysis.wins} winning trades · ${analysis.windowLabel}` : `No winning trades · ${analysis.windowLabel}`} />
        <Metric icon={<ArrowDownRight />} label="Average loss" value={money(analysis.averageLoss)} tone="negative" detail={analysis.losses ? `Across ${analysis.losses} losing trades · ${analysis.windowLabel}` : `No losing trades · ${analysis.windowLabel}`} />
        <Metric icon={<Target />} label="Win / loss size" value={analysis.payoffLabel} tone={analysis.averageWin >= analysis.averageLoss ? "positive" : "negative"} detail={`Average win divided by average loss · ${analysis.windowLabel}`} />
        <Metric icon={<TrendingDown />} label="Peak-to-trough drawdown" value={money(analysis.maxDrawdown)} tone={analysis.maxDrawdown > 0 ? "negative" : "positive"} detail={`Within ${analysis.windowLabel.toLowerCase()}`} />
      </section>

      <section className="trade-signal-insights-grid">
        <article className="trade-signal-insight-card trade-signal-momentum">
          <div className="trade-signal-card-title"><div><span className="eyebrow">SHORT-TERM MOMENTUM</span><h3>Last three trades</h3></div><Activity size={18} /></div>
          <strong className={analysis.lastThreeNet >= 0 ? "positive" : "negative"}>{money(analysis.lastThreeNet)}</strong>
          <p>{analysis.lastThreeWins} of {Math.min(3, analysis.trades.length)} profitable · {analysis.currentStreak ? `${analysis.currentStreak} ${analysis.currentStreakType} in a row` : "No active streak"}</p>
          <div className="trade-signal-outcome-strip" aria-label="Recent trade outcomes">
            {analysis.trades.slice(-10).map((trade) => <span key={trade.id} className={trade.type} title={`${formatDate(trade.date)} · ${trade.type} · ${money(signedPnl(trade))}`} />)}
          </div>
          <small>Oldest to newest · each mark is one saved transaction</small>
        </article>
        <article className="trade-signal-insight-card">
          <div className="trade-signal-card-title"><div><span className="eyebrow">PROCESS &amp; RISK</span><h3>Consistency check</h3></div><AlertTriangle size={18} /></div>
          <dl className="trade-signal-data-list">
            <div><dt>Longest winning run</dt><dd>{analysis.longestWinStreak} trades</dd></div>
            <div><dt>Longest losing run</dt><dd>{analysis.longestLossStreak} trades</dd></div>
            <div><dt>Current streak</dt><dd>{analysis.currentStreak ? `${analysis.currentStreak} ${analysis.currentStreakType} trades` : "None"}</dd></div>
            <div><dt>Recorded costs</dt><dd>{analysis.feeRecords ? money(analysis.recordedCosts) : "Not recorded"}</dd></div>
            <div><dt>Confidence ({analysis.confidenceRangeLabel})</dt><dd>{analysis.confidenceIndex == null ? "Not available" : `${analysis.confidenceIndex}/100 · ${analysis.trackedConfidenceCount} saved ratings`}</dd></div>
          </dl>
        </article>
      </section>

      {/* The full audit table is available on demand to keep the signal overview focused. */}
      {/*
        <div className="trade-signal-card-title"><div><span className="eyebrow">AUDITABLE WINDOW</span><h3>Trades included in this signal</h3><p>All calculations above use these records only, newest first.</p></div><span className="trade-signal-count">{analysis.trades.length} / 10</span></div>
        {analysis.trades.length ? <div className="trade-signal-table-wrap"><table className="trade-signal-table"><thead><tr><th>Date</th><th>Result</th><th>Direction</th><th>Entry</th><th>Exit</th><th>Quantity</th><th>Realized P&amp;L</th><th>Note</th></tr></thead><tbody>{analysis.trades.slice().reverse().map((trade) => <tr key={trade.id}><td>{formatDate(trade.date)}</td><td><span className={`trade-signal-result ${trade.type}`}>{trade.type === "profit" ? "Profit" : "Loss"}</span></td><td>{trade.optionType ?? "—"}</td><td>{trade.entryPrice == null ? "—" : money(trade.entryPrice)}</td><td>{trade.exitPrice == null ? "—" : money(trade.exitPrice)}</td><td>{trade.quantity ?? "—"}</td><td className={trade.type === "profit" ? "positive" : "negative"}>{money(signedPnl(trade))}</td><td className="trade-signal-note" title={trade.note}>{trade.note || "—"}</td></tr>)}</tbody></table></div> : <p className="trade-signal-empty"><CalendarDays size={16} /> Add or import completed transactions to build your trade signal.</p>}
      */}

      {fearGreedChartOpen && <div className="fear-greed-chart-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setFearGreedChartOpen(false); }}>
        <section className="fear-greed-chart-dialog" role="dialog" aria-modal="true" aria-labelledby="fear-greed-chart-title">
          <header><div><span className="eyebrow">PERSONAL OUTCOME INDEX</span><h2 id="fear-greed-chart-title">Fear &amp; Greed performance</h2><p>{analysis.fearGreedWindowLabel} · {analysis.fearOutcomeCount} profit and loss results · classic chart</p></div><button type="button" aria-label="Close outcome index chart" onClick={() => setFearGreedChartOpen(false)}><X size={18} /></button></header>
          <div className="fear-greed-chart-summary"><article><span>Current score</span><strong>{analysis.fearGreedScore ?? "—"}<small>/100</small></strong></article><article><span>Classification</span><strong>{analysis.fearGreedLabel}</strong></article><article><span>Net P&amp;L</span><strong>{money(analysis.fearWinTotal - analysis.fearLossTotal)}</strong></article><article><span>Wins · losses</span><strong>{analysis.fearWins.length} · {analysis.fearLosses.length}</strong></article></div>
          {analysis.fearOutcomeCount ? <div className="fear-greed-chart-host"><ClassicHighchartsChart highcharts={Highcharts} options={fearGreedChartOptions} /></div> : <div className="fear-greed-chart-empty">No profit or loss results in this period.</div>}
          <p className="fear-greed-chart-note">The index is the average of win rate and the share of total profit and loss represented by winning trades. For “Last 10 trades,” each point uses a rolling window of up to 10 results.</p>
        </section>
      </div>}
      {tradesDialogOpen && <TradeHistoryDialog
        trades={analysis.trades}
        rangeLabel={analysis.windowLabel}
        onClose={() => setTradesDialogOpen(false)}
        money={money}
      />}
    </div>
  );
};

const Metric = ({ icon, label, value, tone, detail }: { icon: ReactNode; label: string; value: string; tone: "positive" | "negative"; detail: string }) => (
  <article className="trade-signal-metric-card">
    <div className="trade-signal-metric-heading"><span>{icon}</span><small>{label}</small></div>
    <strong className={tone}>{value}</strong>
    <p>{detail}</p>
  </article>
);

const TradeHistoryDialog = ({
  trades,
  rangeLabel,
  onClose,
  money,
}: {
  trades: Transaction[];
  rangeLabel: string;
  onClose: () => void;
  money: (value: number) => string;
}) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const newestFirst = useMemo(() => trades.slice().reverse(), [trades]);

  return (
    <div className="trade-signal-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="trade-signal-dialog" role="dialog" aria-modal="true" aria-labelledby="trade-signal-dialog-title">
        <header><div><span className="eyebrow">AUDITABLE TRADE DATA</span><h2 id="trade-signal-dialog-title">Trades analyzed</h2><p>{rangeLabel} · {trades.length} completed {trades.length === 1 ? "trade" : "trades"} used in these insights</p></div><button type="button" aria-label="Close trade history" onClick={onClose}><X size={18} /></button></header>
        {newestFirst.length ? <div className="trade-signal-table-wrap"><table className="trade-signal-table"><thead><tr><th>Date</th><th>Result</th><th>Direction</th><th>Entry</th><th>Exit</th><th>Quantity</th><th>Realized P&amp;L</th><th>Note</th></tr></thead><tbody>{newestFirst.map((trade) => <tr key={trade.id}><td>{formatDate(trade.date)}</td><td><span className={`trade-signal-result ${trade.type}`}>{trade.type === "profit" ? "Profit" : "Loss"}</span></td><td>{trade.optionType ?? "—"}</td><td>{trade.entryPrice == null ? "—" : money(trade.entryPrice)}</td><td>{trade.exitPrice == null ? "—" : money(trade.exitPrice)}</td><td>{trade.quantity ?? "—"}</td><td className={trade.type === "profit" ? "positive" : "negative"}>{money(signedPnl(trade))}</td><td className="trade-signal-note" title={trade.note}>{trade.note || "—"}</td></tr>)}</tbody></table></div> : <p className="trade-signal-empty"><CircleHelp size={16} /> No completed trades are available for this period.</p>}
        <footer><span>Showing the latest {newestFirst.length} trades (maximum 10)</span></footer>
      </section>
    </div>
  );
};

export default TradeSignal;
