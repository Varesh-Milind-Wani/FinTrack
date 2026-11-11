import { useMemo, useState } from "react";
import { Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, CircleHelp, Dices, ShieldAlert } from "lucide-react";

import type { Transaction, UserAccount } from "../types/finance";
import { formatCurrency } from "../utils/money";
import { calculateCurrentBalance } from "../utils/balance";

const SIMULATION_COUNT = 1000;
const HORIZONS = [25, 50, 100] as const;
const DRAWDOWN_LIMITS = [10, 20, 30] as const;
type Horizon = (typeof HORIZONS)[number];
type DrawdownLimit = (typeof DRAWDOWN_LIMITS)[number];

type ScenarioResult = {
  id: "historical" | "recent" | "clustered";
  label: string;
  description: string;
  sourceCount: number;
  points: Array<{ step: number; p10: number; median: number; p90: number }>;
  endingBalances: number[];
  maxDrawdowns: number[];
  belowStartProbability: number;
  drawdownProbability: number;
};

type Simulation = { startingCapital: number; scenarios: ScenarioResult[] };

const signedResult = (transaction: Transaction) =>
  transaction.type === "profit" ? Math.abs(transaction.amount) : -Math.abs(transaction.amount);

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
  const [horizon, setHorizon] = useState<Horizon>(50);
  const [drawdownLimit, setDrawdownLimit] = useState<DrawdownLimit>(20);
  const money = (value: number) => formatCurrency(value, user.currency);

  const simulation = useMemo<Simulation>(() => {
    const outcomes = user.transactions
      .filter((transaction) => (transaction.type === "profit" || transaction.type === "loss")
        && Number.isFinite(Date.parse(transaction.date))
        && Date.parse(transaction.date) <= Date.now()
        && Number.isFinite(transaction.amount)
        && transaction.amount >= 0)
      .slice()
      .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
      .map(signedResult);
    const startingCapital = Number.isFinite(user.startingBalance) ? calculateCurrentBalance(user) : 0;
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
      id: ScenarioResult["id"], label: string, description: string, sample: number[], seedOffset: number, blockSize = 1,
    ): ScenarioResult => {
      const points: ScenarioResult["points"] = [{ step: 0, p10: startingCapital, median: startingCapital, p90: startingCapital }];
      const endingBalances: number[] = [];
      const maxDrawdowns: number[] = [];
      let belowStartCount = 0;
      let drawdownCount = 0;
      if (sample.length) {
        const random = createRandom(seed + seedOffset);
        const paths: number[][] = Array.from({ length: SIMULATION_COUNT }, () => [startingCapital]);
        const blockState = Array.from({ length: SIMULATION_COUNT }, () => ({ index: 0, remaining: 0 }));
        for (let step = 1; step <= horizon; step += 1) {
          const balancesAtStep = new Array<number>(SIMULATION_COUNT);
          for (let pathIndex = 0; pathIndex < SIMULATION_COUNT; pathIndex += 1) {
            const prior = paths[pathIndex][step - 1];
            const state = blockState[pathIndex];
            if (state.remaining === 0) {
              state.index = Math.floor(random() * sample.length);
              state.remaining = blockSize;
            }
            const outcome = sample[state.index % sample.length];
            state.index += 1;
            state.remaining -= 1;
            const next = prior + outcome;
            paths[pathIndex].push(next);
            balancesAtStep[pathIndex] = next;
          }
          points.push({ step, p10: quantile(balancesAtStep, .1), median: quantile(balancesAtStep, .5), p90: quantile(balancesAtStep, .9) });
        }
        for (const path of paths) {
          const ending = path[path.length - 1];
          endingBalances.push(ending);
          if (ending < startingCapital) belowStartCount += 1;
          let peak = path[0];
          let maxDrawdown = 0;
          for (const balance of path) {
            peak = Math.max(peak, balance);
            if (peak > 0) maxDrawdown = Math.max(maxDrawdown, (peak - balance) / peak * 100);
          }
          maxDrawdowns.push(maxDrawdown);
          if (maxDrawdown >= drawdownLimit) drawdownCount += 1;
        }
      }
      return {
        id, label, description, sourceCount: sample.length, points, endingBalances, maxDrawdowns,
        belowStartProbability: endingBalances.length ? belowStartCount / endingBalances.length * 100 : 0,
        drawdownProbability: maxDrawdowns.length ? drawdownCount / maxDrawdowns.length * 100 : 0,
      };
    };
    const blockSize = Math.min(3, Math.max(1, outcomes.length));
    return {
      startingCapital,
      scenarios: [
        buildScenario("historical", "All-history mix", "Draw single results from the full saved history.", outcomes, 101),
        buildScenario("recent", "Recent-results mix", `Draw single results from the latest ${recentOutcomes.length} trades.`, recentOutcomes, 202),
        buildScenario("clustered", "Three-trade blocks", `Resample consecutive blocks of ${blockSize} saved outcomes to retain short streaks.`, outcomes, 303, blockSize),
      ],
    };
  }, [user.startingBalance, user.transactions, horizon, drawdownLimit]);

  const historicalScenario = simulation.scenarios[0];

  const chart = useMemo(() => {
    const width = 1000;
    const height = 300;
    const pad = { left: 78, right: 24, top: 20, bottom: 34 };
    const allValues = simulation.scenarios.flatMap((scenario) => scenario.points.flatMap((point) => [point.p10, point.p90]));
    let min = Math.min(...allValues, simulation.startingCapital);
    let max = Math.max(...allValues, simulation.startingCapital);
    if (max === min) { max += 1; min -= 1; }
    const span = max - min;
    min -= span * .08;
    max += span * .08;
    const x = (step: number) => pad.left + step / horizon * (width - pad.left - pad.right);
    const y = (value: number) => pad.top + (max - value) / (max - min) * (height - pad.top - pad.bottom);
    const historicalPoints = historicalScenario.points;
    const upper = makePath(historicalPoints, "p90", x, y);
    const lowerReverse = [...historicalPoints].reverse().map((point) => `L${x(point.step).toFixed(1)},${y(point.p10).toFixed(1)}`).join(" ");
    return {
      width, height, pad, min, max,
      medians: simulation.scenarios.map((scenario) => ({ id: scenario.id, path: makePath(scenario.points, "median", x, y) })),
      band: `${upper} ${lowerReverse} Z`,
      ticks: Array.from({ length: 5 }, (_, index) => min + (max - min) * index / 4),
      xTicks: [0, Math.round(horizon / 4), Math.round(horizon / 2), Math.round(horizon * .75), horizon],
      x, y,
    };
  }, [horizon, simulation, historicalScenario]);

  const getScenarioStats = (scenario: ScenarioResult) => ({
    p10: scenario.endingBalances.length ? quantile(scenario.endingBalances, .1) : null,
    median: scenario.endingBalances.length ? quantile(scenario.endingBalances, .5) : null,
    p90: scenario.endingBalances.length ? quantile(scenario.endingBalances, .9) : null,
    medianDrawdown: scenario.maxDrawdowns.length ? quantile(scenario.maxDrawdowns, .5) : null,
  });
  const historicalStats = getScenarioStats(historicalScenario);

  return (
    <div className="page-content scenario-lab-page">
      <header className="scenario-lab-header">
        <div className="scenario-lab-title"><span className="eyebrow">RISK RESEARCH · HISTORICAL RESAMPLING</span><h1>Scenario Lab</h1><p>Explore how your recorded trade outcomes could combine across a future sequence.</p></div>
        <div className="scenario-lab-controls">
          <label><span>Trades in each path</span><select value={horizon} onChange={(event) => setHorizon(Number(event.target.value) as Horizon)}>{HORIZONS.map((value) => <option key={value} value={value}>{value} trades</option>)}</select></label>
          <label><span>Drawdown threshold</span><select value={drawdownLimit} onChange={(event) => setDrawdownLimit(Number(event.target.value) as DrawdownLimit)}>{DRAWDOWN_LIMITS.map((value) => <option key={value} value={value}>{value}% from peak</option>)}</select></label>
        </div>
      </header>

      <section className="scenario-lab-overview" aria-label="Simulation summary">
        <div className="scenario-lab-overview-icon"><Dices size={20} /></div>
        <div><strong>{SIMULATION_COUNT.toLocaleString()} paths per scenario</strong><span>Three models · {horizon} trades per path · based on {historicalScenario.sourceCount} saved profit and loss outcomes.</span></div>
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
        </section>

        <section className="scenario-lab-chart-card">
          <header><div><span className="eyebrow">SIMULATED EQUITY RANGE</span><h2>Compare possible balance paths</h2><p>All-history range is shaded; each line shows a scenario median.</p></div><span className="scenario-lab-chart-legend"><i /> All-history 10th–90th <b className="historical" /> All-history <b className="recent" /> Recent <b className="clustered" /> Blocks</span></header>
          <div className="scenario-lab-chart-wrap">
            <svg viewBox={`0 0 ${chart.width} ${chart.height}`} preserveAspectRatio="none" role="img" aria-label={`Three bootstrap scenarios over ${horizon} trades. All-history median ending balance ${money(historicalStats.median!)}.`}>
              {chart.ticks.map((tick, index) => <g key={index}><line x1={chart.pad.left} x2={chart.width - chart.pad.right} y1={chart.y(tick)} y2={chart.y(tick)} className="scenario-lab-gridline" /><text x={chart.pad.left - 10} y={chart.y(tick) + 4} textAnchor="end" className="scenario-lab-axis-label">{money(tick)}</text></g>)}
              <path d={chart.band} className="scenario-lab-range-band" />
              {chart.medians.map((line) => <path key={line.id} d={line.path} className={`scenario-lab-median-line ${line.id}`} />)}
              <line x1={chart.pad.left} x2={chart.width - chart.pad.right} y1={chart.y(simulation.startingCapital)} y2={chart.y(simulation.startingCapital)} className="scenario-lab-start-line" />
              {chart.xTicks.map((step) => <text key={step} x={chart.x(step)} y={chart.height - 8} textAnchor="middle" className="scenario-lab-axis-label">{step === 0 ? "Start" : `${step} trades`}</text>)}
            </svg>
          </div>
        </section>

        <section className="scenario-lab-comparison" aria-label="Scenario comparison">
          <header><div><span className="eyebrow">SENSITIVITY CHECK</span><h2>How the assumptions change the range</h2></div><small>Each row runs {SIMULATION_COUNT.toLocaleString()} paths</small></header>
          <div className="scenario-lab-comparison-list">{simulation.scenarios.map((scenario) => {
            const stats = getScenarioStats(scenario);
            return <article key={scenario.id} className={`scenario-lab-comparison-row ${scenario.id}`}>
              <div className="scenario-lab-comparison-name"><strong>{scenario.label}</strong><span>{scenario.description}</span></div>
              <div><small>Median ending</small><strong>{stats.median == null ? "—" : money(stats.median)}</strong></div>
              <div><small>10th percentile</small><strong className="negative">{stats.p10 == null ? "—" : money(stats.p10)}</strong></div>
              <div><small>Drawdown ≥ {drawdownLimit}%</small><strong>{scenario.drawdownProbability.toFixed(1)}%</strong></div>
              <div><small>End below start</small><strong>{scenario.belowStartProbability.toFixed(1)}%</strong></div>
            </article>;
          })}</div>
        </section>
      </>}

      <section className="scenario-lab-method" aria-label="Simulation method">
        <header><div><span className="eyebrow">SIMULATION METHOD</span><h2>How one scenario happens</h2></div><span>Same saved data · different sampling rules</span></header>
        <ol>
          <li><b>Start at your current trading balance.</b> Investments are excluded; this uses the trading ledger balance.</li>
          <li><b>Pick a historical outcome.</b> A saved profit adds its amount; a saved loss subtracts its amount. A result can be selected again because sampling is with replacement.</li>
          <li><b>Repeat for {horizon} trades.</b> The selected outcomes are added in sequence. This creates one hypothetical balance path.</li>
          <li><b>Repeat 1,000 times per scenario.</b> The 10th, 50th (median), and 90th percentiles summarize the ending balances. Drawdown counts paths whose largest peak-to-trough fall reaches your chosen threshold.</li>
        </ol>
        <div className="scenario-lab-method-scenarios">
          <p><strong>All-history mix:</strong> each pick can be any saved outcome; trade order is ignored.</p>
          <p><strong>Recent-results mix:</strong> each pick comes only from the latest 20 saved outcomes (or all available if fewer).</p>
          <p><strong>Three-trade blocks:</strong> picks are consecutive blocks sampled circularly from history, retaining short win/loss streaks in each block.</p>
        </div>
        <p className="scenario-lab-caveat">These are scenario frequencies under explicit resampling assumptions, not real-world probabilities or forecasts. They assume future outcomes resemble the selected history and do not model changing trade size, external cash flows, future costs, liquidity, or market conditions. Transaction amounts are treated as fixed cash P&amp;L.</p>
      </section>
    </div>
  );
};

export default ScenarioLab;
