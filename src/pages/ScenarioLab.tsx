import { useMemo, useState } from "react";
import { Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, CircleHelp, Dices, ShieldAlert } from "lucide-react";

import type { Transaction, UserAccount } from "../types/finance";
import { formatCurrency } from "../utils/money";
import { calculateCurrentBalance } from "../utils/balance";

const MAX_SIMULATION_COUNT = 1000;
const SIMULATION_WORK_BUDGET = 2_000_000;
const MIN_SIMULATION_COUNT = 50;
const HORIZONS = [
  { months: 1, label: "1 month" },
  { months: 3, label: "3 months" },
  { months: 6, label: "6 months" },
  { months: 12, label: "1 year" },
  { months: 36, label: "3 years" },
  { months: 60, label: "5 years" },
  { months: 120, label: "10 years" },
  { months: 180, label: "15 years" },
  { months: 240, label: "20 years" },
] as const;
const DRAWDOWN_LIMITS = [10, 20, 30] as const;
type DrawdownLimit = (typeof DRAWDOWN_LIMITS)[number];

type ScenarioResult = {
  id: "historical" | "recent" | "clustered" | "stationary" | "stress";
  label: string;
  description: string;
  sourceCount: number;
  points: Array<{ step: number; p10: number; median: number; p90: number }>;
  endingBalances: number[];
  maxDrawdowns: number[];
  belowStartProbability: number;
  drawdownProbability: number;
  ruinProbability: number;
};

type Simulation = {
  startingCapital: number;
  horizonMonths: number;
  projectedTrades: number;
  tradesPerMonth: number;
  historyMonths: number;
  pathCount: number;
  scenarios: ScenarioResult[];
};

const signedResult = (transaction: Transaction) =>
  transaction.type === "profit" ? Math.abs(transaction.amount) : -Math.abs(transaction.amount);

const grossSignedResult = (transaction: Transaction) => {
  const netResult = signedResult(transaction);
  const costs = Math.max(0, Number(transaction.costAmount) || 0);
  const grossMagnitude = Math.abs(Number(transaction.grossAmount) || Math.abs(netResult) + costs);
  const grossDirection = Math.sign(netResult + costs) || (transaction.type === "profit" ? 1 : -1);
  return grossMagnitude * grossDirection;
};

const quantile = (values: number[], fraction: number) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
};

const createRandom = (seedValue: number) => {
  let seed = seedValue || 0x6d2b79f5;
  return () => {
    seed += 0x6d2b79f5;
    let value = seed;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

const makePath = (points: ScenarioResult["points"], key: "p10" | "median" | "p90", x: (step: number) => number, y: (value: number) => number) =>
  points.map((point, index) => `${index ? "L" : "M"}${x(point.step).toFixed(1)},${y(point[key]).toFixed(1)}`).join(" ");

const ScenarioLab = ({ user }: { user: UserAccount }) => {
  const [horizonMonths, setHorizonMonths] = useState(12);
  const [tradeFrequencyInput, setTradeFrequencyInput] = useState("");
  const [isTradeFrequencyFocused, setIsTradeFrequencyFocused] = useState(false);
  const [drawdownLimit, setDrawdownLimit] = useState<DrawdownLimit>(20);
  const [includeCosts, setIncludeCosts] = useState(true);
  const [lossStressPct, setLossStressPct] = useState(25);
  const [winHaircutPct, setWinHaircutPct] = useState(10);
  const [chartMode, setChartMode] = useState<"balance" | "change">("balance");
  const [hoveredMonth, setHoveredMonth] = useState<number | null>(null);
  const money = (value: number) => formatCurrency(value, user.currency);

  const historyFrequency = useMemo(() => {
    const dates = user.transactions
      .filter((transaction) => (transaction.type === "profit" || transaction.type === "loss")
        && Number.isFinite(Date.parse(transaction.date))
        && Date.parse(transaction.date) <= Date.now()
        && Number.isFinite(transaction.amount)
        && transaction.amount >= 0)
      .map((transaction) => new Date(transaction.date))
      .sort((a, b) => a.getTime() - b.getTime());
    if (!dates.length) return { count: 0, months: 0, rate: 1 };
    const months = Math.max(1, (dates[dates.length - 1].getFullYear() - dates[0].getFullYear()) * 12
      + dates[dates.length - 1].getMonth() - dates[0].getMonth() + 1);
    return { count: dates.length, months, rate: dates.length / months };
  }, [user.transactions]);
  const requestedTradeRate = tradeFrequencyInput.trim() ? Number(tradeFrequencyInput) : historyFrequency.rate;
  const tradesPerMonth = Number.isFinite(requestedTradeRate) ? Math.min(100, Math.max(.1, requestedTradeRate)) : historyFrequency.rate;

  const simulation = useMemo<Simulation>(() => {
    const transactions = user.transactions
      .filter((transaction) => (transaction.type === "profit" || transaction.type === "loss")
        && Number.isFinite(Date.parse(transaction.date))
        && Date.parse(transaction.date) <= Date.now()
        && Number.isFinite(transaction.amount)
        && transaction.amount >= 0)
      .slice()
      .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
    const outcomes = transactions.map((transaction) => includeCosts ? signedResult(transaction) : grossSignedResult(transaction));
    const startingCapital = Number.isFinite(user.startingBalance) ? calculateCurrentBalance(user) : 0;
    const projectedTrades = Math.max(1, Math.round(tradesPerMonth * horizonMonths));
    const pathCount = Math.min(MAX_SIMULATION_COUNT, Math.max(MIN_SIMULATION_COUNT,
      Math.floor(SIMULATION_WORK_BUDGET / Math.max(1, projectedTrades * 5))));
    let seed = 2166136261;
    for (const transaction of user.transactions) {
      const signature = `${transaction.id}:${transaction.type}:${transaction.amount};`;
      for (let index = 0; index < signature.length; index += 1) {
        seed ^= signature.charCodeAt(index);
        seed = Math.imul(seed, 16777619);
      }
    }

    const recentOutcomes = outcomes.slice(-Math.min(20, outcomes.length));
    const buildScenario = (
      id: ScenarioResult["id"], label: string, description: string, sample: number[], seedOffset: number, blockSize = 1, stationary = false,
    ): ScenarioResult => {
      const monthlyBalances: number[][] = Array.from({ length: horizonMonths }, () => []);
      const endingBalances: number[] = [];
      const maxDrawdowns: number[] = [];
      let belowStartCount = 0;
      let drawdownCount = 0;
      let ruinCount = 0;
      if (sample.length) {
        const random = createRandom(seed + seedOffset);
        for (let pathIndex = 0; pathIndex < pathCount; pathIndex += 1) {
          let balance = startingCapital;
          let peak = startingCapital;
          let maxDrawdown = 0;
          let reachedZero = balance <= 0;
          let completedTrades = 0;
          const blockState = { index: 0, remaining: 0 };
          for (let month = 1; month <= horizonMonths; month += 1) {
            const monthTradeTarget = Math.round(tradesPerMonth * month);
            const tradesThisMonth = monthTradeTarget - completedTrades;
            for (let trade = 0; trade < tradesThisMonth; trade += 1) {
              if (stationary) {
                if (blockState.remaining === 0 || random() < 1 / blockSize) {
                  blockState.index = Math.floor(random() * sample.length);
                  blockState.remaining = 1;
                } else {
                  blockState.index = (blockState.index + 1) % sample.length;
                }
              } else if (blockState.remaining === 0) {
                blockState.index = Math.floor(random() * sample.length);
                blockState.remaining = blockSize;
              }
              balance += sample[blockState.index % sample.length];
              if (!stationary) {
                blockState.index += 1;
                blockState.remaining -= 1;
              }
              completedTrades += 1;
              peak = Math.max(peak, balance);
              if (balance <= 0) reachedZero = true;
              if (peak > 0) maxDrawdown = Math.max(maxDrawdown, (peak - balance) / peak * 100);
            }
            monthlyBalances[month - 1].push(balance);
          }
          endingBalances.push(balance);
          maxDrawdowns.push(maxDrawdown);
          if (balance < startingCapital) belowStartCount += 1;
          if (maxDrawdown >= drawdownLimit) drawdownCount += 1;
          if (reachedZero) ruinCount += 1;
        }
      }
      const points: ScenarioResult["points"] = [{ step: 0, p10: startingCapital, median: startingCapital, p90: startingCapital },
        ...monthlyBalances.map((balancesAtMonth, index) => ({
          step: index + 1,
          p10: balancesAtMonth.length ? quantile(balancesAtMonth, .1) : startingCapital,
          median: balancesAtMonth.length ? quantile(balancesAtMonth, .5) : startingCapital,
          p90: balancesAtMonth.length ? quantile(balancesAtMonth, .9) : startingCapital,
        }))];
      return {
        id, label, description, sourceCount: sample.length, points, endingBalances, maxDrawdowns,
        belowStartProbability: endingBalances.length ? belowStartCount / endingBalances.length * 100 : 0,
        drawdownProbability: maxDrawdowns.length ? drawdownCount / maxDrawdowns.length * 100 : 0,
        ruinProbability: endingBalances.length ? ruinCount / endingBalances.length * 100 : 0,
      };
    };
    const blockSize = Math.min(3, Math.max(1, outcomes.length));
    return {
      startingCapital,
      horizonMonths,
      projectedTrades,
      tradesPerMonth,
      historyMonths: historyFrequency.months,
      pathCount,
      scenarios: [
        buildScenario("historical", "All-history mix", "Draw single results from the full saved history.", outcomes, 101),
        buildScenario("recent", "Recent-results mix", `Draw single results from the latest ${recentOutcomes.length} trades.`, recentOutcomes, 202),
        buildScenario("clustered", "Three-trade blocks", `Resample consecutive blocks of ${blockSize} saved outcomes to retain short streaks.`, outcomes, 303, blockSize),
        buildScenario("stationary", "Stationary bootstrap", "Use random-length circular blocks averaging three trades to retain serial dependence.", outcomes, 404, 3, true),
        buildScenario("stress", "User-defined stress", `Losses +${lossStressPct}% · wins reduced ${winHaircutPct}%.`, outcomes.map((outcome) => outcome < 0 ? outcome * (1 + lossStressPct / 100) : outcome * (1 - winHaircutPct / 100)), 505),
      ],
    };
  }, [user.startingBalance, user.transactions, horizonMonths, tradesPerMonth, historyFrequency.months, drawdownLimit, includeCosts, lossStressPct, winHaircutPct]);

  const historicalScenario = simulation.scenarios[0];

  const chart = useMemo(() => {
    const width = 1000;
    const height = 300;
    const pad = { left: 78, right: 24, top: 20, bottom: 34 };
    const offset = chartMode === "change" ? simulation.startingCapital : 0;
    const displayValue = (value: number) => value - offset;
    const allValues = simulation.scenarios.flatMap((scenario) => scenario.points.flatMap((point) => [displayValue(point.p10), displayValue(point.p90)]));
    let min = Math.min(...allValues, displayValue(simulation.startingCapital));
    let max = Math.max(...allValues, displayValue(simulation.startingCapital));
    if (max === min) { max += 1; min -= 1; }
    const span = max - min;
    min -= span * .08;
    max += span * .08;
    const x = (step: number) => pad.left + step / horizonMonths * (width - pad.left - pad.right);
    const y = (value: number) => pad.top + (max - value) / (max - min) * (height - pad.top - pad.bottom);
    const historicalPoints = historicalScenario.points;
    const upper = makePath(historicalPoints, "p90", x, (value) => y(displayValue(value)));
    const lowerReverse = [...historicalPoints].reverse().map((point) => `L${x(point.step).toFixed(1)},${y(displayValue(point.p10)).toFixed(1)}`).join(" ");
    return {
      width, height, pad, min, max, offset,
      medians: simulation.scenarios.map((scenario) => ({ id: scenario.id, path: makePath(scenario.points, "median", x, (value) => y(displayValue(value))) })),
      band: `${upper} ${lowerReverse} Z`,
      ticks: Array.from({ length: 5 }, (_, index) => min + (max - min) * index / 4),
      xTicks: [...new Set([0, Math.round(horizonMonths / 4), Math.round(horizonMonths / 2), Math.round(horizonMonths * .75), horizonMonths])],
      x, y,
    };
  }, [horizonMonths, simulation, historicalScenario, chartMode]);

  const activeMonth = hoveredMonth == null ? null : Math.min(horizonMonths, Math.max(0, hoveredMonth));
  const activePoint = activeMonth == null ? null : historicalScenario.points[activeMonth];

  const getScenarioStats = (scenario: ScenarioResult) => ({
    p10: scenario.endingBalances.length ? quantile(scenario.endingBalances, .1) : null,
    median: scenario.endingBalances.length ? quantile(scenario.endingBalances, .5) : null,
    p90: scenario.endingBalances.length ? quantile(scenario.endingBalances, .9) : null,
    medianDrawdown: scenario.maxDrawdowns.length ? quantile(scenario.maxDrawdowns, .5) : null,
    drawdownP90: scenario.maxDrawdowns.length ? quantile(scenario.maxDrawdowns, .9) : null,
    worstDecilePnl: scenario.endingBalances.length
      ? [...scenario.endingBalances].sort((a, b) => a - b).slice(0, Math.max(1, Math.ceil(scenario.endingBalances.length * .1))).reduce((sum, balance) => sum + balance, 0) / Math.max(1, Math.ceil(scenario.endingBalances.length * .1)) - simulation.startingCapital
      : null,
  });
  const historicalStats = getScenarioStats(historicalScenario);

  return (
    <div className="page-content scenario-lab-page">
      <header className="scenario-lab-header">
        <div className="scenario-lab-title"><span className="eyebrow">RISK RESEARCH · HISTORICAL RESAMPLING</span><h1>Scenario Lab</h1><p>Explore how your recorded trade outcomes could combine across a future sequence.</p></div>
        <div className="scenario-lab-controls">
          <label><span>Projection horizon</span><select value={horizonMonths} onChange={(event) => setHorizonMonths(Number(event.target.value))}>{HORIZONS.map(({ months, label }) => <option key={months} value={months}>{label}</option>)}</select></label>
          <label className="scenario-lab-frequency"><span>Trades per month</span><input type="text" inputMode="decimal" value={isTradeFrequencyFocused ? tradeFrequencyInput : tradeFrequencyInput || tradesPerMonth.toFixed(1)} onFocus={() => { setIsTradeFrequencyFocused(true); if (!tradeFrequencyInput) setTradeFrequencyInput(tradesPerMonth.toFixed(1)); }} onChange={(event) => setTradeFrequencyInput(event.target.value.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1"))} onBlur={() => { const value = Number(tradeFrequencyInput); setTradeFrequencyInput(tradeFrequencyInput && Number.isFinite(value) ? String(Math.min(100, Math.max(.1, value))) : ""); setIsTradeFrequencyFocused(false); }} aria-label="Projected trades per month" aria-describedby="scenario-frequency-help" /><small id="scenario-frequency-help">{tradeFrequencyInput ? "Custom pace" : historyFrequency.count ? `Based on ${historyFrequency.count} trades in ${historyFrequency.months} calendar months` : "Set a pace to run a projection"}</small></label>
          <label><span>Drawdown threshold</span><select value={drawdownLimit} onChange={(event) => setDrawdownLimit(Number(event.target.value) as DrawdownLimit)}>{DRAWDOWN_LIMITS.map((value) => <option key={value} value={value}>{value}% from peak</option>)}</select></label>
          <div className="scenario-lab-average-rate"><span>Your historical average</span><strong>{historyFrequency.count ? historyFrequency.rate.toFixed(1) : "—"}<small> trades / month</small></strong><small>{historyFrequency.count ? `${historyFrequency.count} trades · ${historyFrequency.months} calendar months` : "No saved trades yet"}</small></div>
          {tradeFrequencyInput && <button type="button" className="scenario-lab-reset-pace" onClick={() => setTradeFrequencyInput("")}>Use historical pace</button>}
        </div>
      </header>

      <section className="scenario-lab-assumptions" aria-label="Simulation assumptions">
        <div className="scenario-lab-assumptions-heading"><span className="eyebrow">MODEL ASSUMPTIONS</span><strong>Adjust downside sensitivity</strong><small>Stress settings change only the stress-test model; saved trades remain untouched.</small></div>
        <label className="scenario-lab-cost-toggle"><input type="checkbox" checked={includeCosts} onChange={(event) => setIncludeCosts(event.target.checked)} /><span>Use after-cost outcomes</span><small>{includeCosts ? "Recorded costs included" : "Use gross trade results"}</small></label>
        <label className="scenario-lab-stress-control"><span>Increase losses <b>{lossStressPct}%</b></span><input type="range" min="0" max="100" step="5" value={lossStressPct} onChange={(event) => setLossStressPct(Number(event.target.value))} /><small>Apply to losing outcomes in stress model</small></label>
        <label className="scenario-lab-stress-control"><span>Reduce wins <b>{winHaircutPct}%</b></span><input type="range" min="0" max="100" step="5" value={winHaircutPct} onChange={(event) => setWinHaircutPct(Number(event.target.value))} /><small>Apply to profitable outcomes in stress model</small></label>
      </section>

      <section className="scenario-lab-overview" aria-label="Simulation summary">
        <div className="scenario-lab-overview-icon"><Dices size={20} /></div>
        <div><strong>{simulation.pathCount.toLocaleString()} simulated paths per model</strong><span>{HORIZONS.find((item) => item.months === horizonMonths)?.label} · about {simulation.projectedTrades.toLocaleString()} trades at {simulation.tradesPerMonth.toFixed(1)} per month · {historicalScenario.sourceCount} saved outcomes sampled.</span></div>
        <div className="scenario-lab-capital"><span>Current trading balance</span><strong>{money(simulation.startingCapital)}</strong></div>
      </section>

      {historicalScenario.sourceCount < 5 ? (
        <section className="scenario-lab-empty"><CircleHelp size={21} /><div><h2>More trade history needed</h2><p>Record at least 5 completed profit or loss transactions to build a resampling scenario. More historical trades make the range more informative.</p></div></section>
      ) : <>
        {historicalScenario.sourceCount < 20 && <div className="scenario-lab-sample-warning"><AlertTriangle size={16} /><span>Early sample: only {historicalScenario.sourceCount} saved outcomes are available. The recent and clustered scenarios use this same small history and may be unstable.</span></div>}
        <section className="scenario-lab-metrics" aria-label="Scenario outcome metrics">
          <article><span><Activity size={15} /> Typical ending balance</span><strong>{money(historicalStats.median!)}</strong><small>Median · all-history mix</small></article>
          <article><span><ArrowDownRight size={15} /> Lower outcome range</span><strong className="negative">{money(historicalStats.p10!)}</strong><small>10th percentile · all-history mix</small></article>
          <article><span><ArrowUpRight size={15} /> Upper outcome range</span><strong className="positive">{money(historicalStats.p90!)}</strong><small>90th percentile · all-history mix</small></article>
          <article><span><ShieldAlert size={15} /> Drawdown threshold crossed</span><strong className={historicalScenario.drawdownProbability > 20 ? "negative" : "neutral"}>{historicalScenario.drawdownProbability.toFixed(1)}%</strong><small>{drawdownLimit}% peak-to-trough · all-history mix</small></article>
          <article><span><ArrowDownRight size={15} /> Expected shortfall</span><strong className={historicalStats.worstDecilePnl != null && historicalStats.worstDecilePnl < 0 ? "negative" : "positive"}>{historicalStats.worstDecilePnl == null ? "—" : money(historicalStats.worstDecilePnl)}</strong><small>Average P&amp;L in the worst 10% of paths</small></article>
          <article><span><ShieldAlert size={15} /> Balance depletion risk</span><strong className={historicalScenario.ruinProbability > 0 ? "negative" : "positive"}>{historicalScenario.ruinProbability.toFixed(1)}%</strong><small>Paths that reached zero or below</small></article>
          <article><span><Activity size={15} /> 90th percentile max drawdown</span><strong className="neutral">{historicalStats.drawdownP90 == null ? "—" : `${historicalStats.drawdownP90.toFixed(1)}%`}</strong><small>Peak-to-trough across simulated paths</small></article>
        </section>

        <section className="scenario-lab-chart-card">
          <header><div><span className="eyebrow">SIMULATED EQUITY RANGE</span><h2>Compare possible balance paths</h2><p>All-history range is shaded; each line shows a scenario median.</p></div><span className="scenario-lab-chart-legend"><i /> All-history 10th–90th <b className="historical" /> All-history <b className="recent" /> Recent <b className="clustered" /> Fixed blocks <b className="stationary" /> Stationary <b className="stress" /> Stress</span></header>
          <div className="scenario-lab-chart-wrap">
            <div className="scenario-lab-chart-tools"><div className="scenario-lab-chart-mode" role="group" aria-label="Chart values"><button type="button" className={chartMode === "balance" ? "active" : ""} onClick={() => setChartMode("balance")}>Balance</button><button type="button" className={chartMode === "change" ? "active" : ""} onClick={() => setChartMode("change")}>Change</button></div><span>{chartMode === "balance" ? "Projected balance" : "Gain or loss from today"}</span></div>
            <svg viewBox={`0 0 ${chart.width} ${chart.height}`} preserveAspectRatio="none" role="img" aria-label={`Three bootstrap scenarios over ${HORIZONS.find((item) => item.months === horizonMonths)?.label}. All-history median ending balance ${money(historicalStats.median!)}.`} onMouseMove={(event) => { const bounds = event.currentTarget.getBoundingClientRect(); const relativeX = (event.clientX - bounds.left) / bounds.width * chart.width; const plotWidth = chart.width - chart.pad.left - chart.pad.right; setHoveredMonth(Math.round((relativeX - chart.pad.left) / plotWidth * horizonMonths)); }} onMouseLeave={() => setHoveredMonth(null)}>
              {chart.ticks.map((tick, index) => <g key={index}><line x1={chart.pad.left} x2={chart.width - chart.pad.right} y1={chart.y(tick)} y2={chart.y(tick)} className="scenario-lab-gridline" /><text x={chart.pad.left - 10} y={chart.y(tick) + 4} textAnchor="end" className="scenario-lab-axis-label">{money(tick)}</text></g>)}
              <path d={chart.band} className="scenario-lab-range-band" />
              {chart.medians.map((line) => <path key={line.id} d={line.path} className={`scenario-lab-median-line ${line.id}`} />)}
              <line x1={chart.pad.left} x2={chart.width - chart.pad.right} y1={chart.y(chartMode === "balance" ? simulation.startingCapital : 0)} y2={chart.y(chartMode === "balance" ? simulation.startingCapital : 0)} className="scenario-lab-start-line" />
              {activeMonth != null && <><line x1={chart.x(activeMonth)} x2={chart.x(activeMonth)} y1={chart.pad.top} y2={chart.height - chart.pad.bottom} className="scenario-lab-crosshair" /><circle cx={chart.x(activeMonth)} cy={chart.y(activePoint!.median - chart.offset)} r="4" className="scenario-lab-hover-dot" /></>}
              {chart.xTicks.map((step) => <text key={step} x={chart.x(step)} y={chart.height - 8} textAnchor="middle" className="scenario-lab-axis-label">{step === 0 ? "Start" : step % 12 === 0 ? `${step / 12} yr` : `${step} mo`}</text>)}
            </svg>
            {activePoint && <div className="scenario-lab-chart-tooltip" aria-live="polite"><strong>{activeMonth === 0 ? "Starting point" : `Month ${activeMonth}`}</strong><span>10th percentile <b>{money(activePoint.p10 - chart.offset)}</b></span><span>Median <b>{money(activePoint.median - chart.offset)}</b></span><span>90th percentile <b>{money(activePoint.p90 - chart.offset)}</b></span></div>}
          </div>
        </section>

        <section className="scenario-lab-comparison" aria-label="Scenario comparison">
          <header><div><span className="eyebrow">SENSITIVITY CHECK</span><h2>How the assumptions change the range</h2></div><small>Each row runs {simulation.pathCount.toLocaleString()} paths</small></header>
          <div className="scenario-lab-comparison-list">{simulation.scenarios.map((scenario) => {
            const stats = getScenarioStats(scenario);
            return <article key={scenario.id} className={`scenario-lab-comparison-row ${scenario.id}`}>
              <div className="scenario-lab-comparison-name"><strong>{scenario.label}</strong><span>{scenario.description}</span></div>
              <div><small>Median ending</small><strong>{stats.median == null ? "—" : money(stats.median)}</strong></div>
              <div><small>10th percentile</small><strong className="negative">{stats.p10 == null ? "—" : money(stats.p10)}</strong></div>
              <div><small>Drawdown ≥ {drawdownLimit}%</small><strong>{scenario.drawdownProbability.toFixed(1)}%</strong></div>
              <div><small>End below start</small><strong>{scenario.belowStartProbability.toFixed(1)}%</strong></div>
              <div><small>Reached zero</small><strong>{scenario.ruinProbability.toFixed(1)}%</strong></div>
            </article>;
          })}</div>
        </section>
      </>}

      <section className="scenario-lab-method" aria-label="Simulation method">
        <header><div><span className="eyebrow">SIMULATION METHOD</span><h2>How one scenario happens</h2></div><span>Same saved data · different sampling rules</span></header>
        <ol>
          <li><b>Start at your current trading balance.</b> Investments are excluded; this uses the trading ledger balance.</li>
          <li><b>Pick a recorded outcome.</b> Use after-cost P&amp;L or estimated gross results. Outcomes may repeat because the historical methods sample with replacement.</li>
          <li><b>Set a trading pace and time horizon.</b> The default pace uses your recorded trade count divided by the calendar months covered by your history. You can adjust it. This projects about {simulation.projectedTrades.toLocaleString()} trades across {HORIZONS.find((item) => item.months === horizonMonths)?.label}.</li>
          <li><b>Repeat the path {simulation.pathCount.toLocaleString()} times per model.</b> Percentiles summarize ending balances; drawdown and zero-balance hits are tracked trade by trade.</li>
        </ol>
        <div className="scenario-lab-method-scenarios">
          <p><strong>All-history mix:</strong> each pick can be any saved outcome; trade order is ignored.</p>
          <p><strong>Recent-results mix:</strong> each pick comes only from the latest 20 saved outcomes (or all available if fewer).</p>
          <p><strong>Three-trade blocks:</strong> picks are consecutive blocks sampled circularly from history, retaining short win/loss streaks in each block.</p>
          <p><strong>Stationary bootstrap:</strong> uses circular blocks with random lengths averaging three trades, so streak lengths vary while retaining short-run dependence.</p>
          <p><strong>User-defined stress:</strong> replays history with your selected loss increase and win reduction; it is a sensitivity test, not a market forecast.</p>
        </div>
        <p className="scenario-lab-caveat">These are historical resampling scenarios, not guaranteed forecasts or probabilities of what will happen. They use fixed cash P&amp;L amounts and do not model changing position size, compounding, external cash flows, liquidity, or future market conditions. The depletion metric flags paths crossing zero but continues them mathematically; it does not model broker margin or liquidation rules. Long horizons amplify model uncertainty and should be read as a range of possibilities.</p>
      </section>
    </div>
  );
};

export default ScenarioLab;
