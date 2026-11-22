import { useMemo } from "react";
import { ChartNoAxesCombined, Equal } from "lucide-react";
import type { InvestmentType, UserAccount } from "../types/finance";
import { formatCurrency } from "../utils/money";
import { usePersistentState } from "../hooks/usePersistentState";

const ASSETS: { type: InvestmentType; label: string }[] = [
  { type: "stocks", label: "Stocks" }, { type: "mutual_fund", label: "Mutual funds" },
  { type: "crypto", label: "Crypto" }, { type: "gold", label: "Gold" },
  { type: "real_estate", label: "Real estate" }, { type: "fd", label: "Fixed deposits" },
  { type: "other", label: "Other" },
];

const RebalancePlanner = ({ user }: { user: UserAccount }) => {
  const [targets, setTargets] = usePersistentState<Record<InvestmentType, number>>("investments.targetAllocation", () => ({ stocks: 14.29, mutual_fund: 14.29, crypto: 14.29, gold: 14.29, real_estate: 14.29, fd: 14.29, other: 14.26 }));
  const [tolerance, setTolerance] = usePersistentState<number>("investments.rebalanceTolerance", 5);
  const [planMode, setPlanMode] = usePersistentState<"rebalance" | "contribution">("investments.rebalanceMode", "rebalance");
  const [contribution, setContribution] = usePersistentState<number>("investments.rebalanceContribution", 0);
  const [onlyOutsideBand, setOnlyOutsideBand] = usePersistentState<boolean>("investments.onlyOutsideBand", true);
  const [minimumTrade, setMinimumTrade] = usePersistentState<number>("investments.rebalanceMinimumTrade", 0);
  const [estimatedCostBps, setEstimatedCostBps] = usePersistentState<number>("investments.rebalanceCostBps", 0);
  const portfolio = useMemo(() => {
    const values = (user.investments ?? []).filter((item) => !item.isClosed).reduce<Record<InvestmentType, number>>((result, item) => {
      result[item.type] += item.currentValue;
      return result;
    }, { stocks: 0, mutual_fund: 0, crypto: 0, gold: 0, real_estate: 0, fd: 0, other: 0 });
    return { values, total: Object.values(values).reduce((sum, value) => sum + value, 0) };
  }, [user.investments]);
  const targetTotal = ASSETS.reduce((sum, asset) => sum + (Number(targets[asset.type]) || 0), 0);
  const targetsValid = Math.abs(targetTotal - 100) < 0.01;
  const fmt = (value: number) => formatCurrency(Math.abs(value), user.currency ?? "INR");
  const baseRows = ASSETS.map(({ type, label }) => {
    const currentValue = portfolio.values[type];
    const currentShare = portfolio.total > 0 ? currentValue / portfolio.total * 100 : 0;
    const target = Math.max(0, Math.min(100, Number(targets[type]) || 0));
    const difference = portfolio.total * target / 100 - currentValue;
    return { type, label, currentValue, currentShare, target, difference };
  });
  const contributionRate = Math.max(0, Math.min(1000, estimatedCostBps)) / 10_000;
  const contributionTargets = baseRows.map((row) => ({
    type: row.type,
    weight: Math.max(0, row.target - (onlyOutsideBand ? tolerance : 0)),
    eligible: targetsValid && (onlyOutsideBand
      ? row.currentShare < Math.max(0, row.target - tolerance)
      : row.currentShare <= row.target + 0.0001),
  }));
  const eligibleTargetWeight = contributionTargets.filter((item) => item.eligible).reduce((sum, item) => sum + item.weight, 0) / 100;
  const eligibleCurrentValue = baseRows.filter((row) => contributionTargets.find((item) => item.type === row.type)?.eligible).reduce((sum, row) => sum + row.currentValue, 0);
  const availableInvestmentBudget = contribution / (1 + contributionRate);
  const desiredContributionInvestment = portfolio.total <= 0 || eligibleTargetWeight >= 0.999999
    ? availableInvestmentBudget
    : eligibleTargetWeight > 0 && eligibleTargetWeight < 1
      ? Math.max(0, (eligibleTargetWeight * portfolio.total - eligibleCurrentValue) / (1 - eligibleTargetWeight))
      : 0;
  const plannedContributionInvestment = Math.min(availableInvestmentBudget, desiredContributionInvestment);
  const contributionNeeds = baseRows.map((row) => {
    const targetInfo = contributionTargets.find((item) => item.type === row.type)!;
    return {
      type: row.type,
      need: !targetInfo.eligible ? 0 : portfolio.total <= 0 || eligibleTargetWeight >= 0.999999
        ? eligibleTargetWeight > 0 ? plannedContributionInvestment * targetInfo.weight / 100 / eligibleTargetWeight : 0
        : Math.max(0, targetInfo.weight / 100 * (portfolio.total + desiredContributionInvestment) - row.currentValue),
    };
  });
  const totalContributionNeed = contributionNeeds.reduce((sum, row) => sum + row.need, 0);
  const contributionScale = totalContributionNeed > 0 ? Math.min(1, plannedContributionInvestment / totalContributionNeed) : 0;
  const plannedRows = baseRows.map((row) => {
    const grossContributionAllocation = planMode === "contribution"
      ? (contributionNeeds.find((item) => item.type === row.type)?.need ?? 0) * contributionScale
      : 0;
    const contributionAllocation = grossContributionAllocation >= minimumTrade ? grossContributionAllocation : 0;
    return { ...row, contributionAllocation };
  });
  const allocatedContribution = plannedRows.reduce((sum, row) => sum + row.contributionAllocation, 0);
  const rows = plannedRows.map((row) => {
    const projectedPortfolioValue = portfolio.total + (planMode === "contribution" ? allocatedContribution : 0);
    const projectedShare = projectedPortfolioValue > 0 ? (row.currentValue + row.contributionAllocation) / projectedPortfolioValue * 100 : row.currentShare;
    const drift = targetTotal > 0 ? row.target - (planMode === "contribution" ? projectedShare : row.currentShare) : 0;
    const withinBand = Math.abs(drift) <= tolerance;
    const actionDifference = onlyOutsideBand && Math.abs(row.target - row.currentShare) <= tolerance ? 0 : row.difference;
    const tradeEstimate = targetsValid && Math.abs(actionDifference) >= minimumTrade ? actionDifference : 0;
    return { ...row, projectedShare, drift, withinBand, actionDifference, tradeEstimate };
  });
  const deployAmount = targetsValid ? planMode === "contribution" ? rows.reduce((sum, row) => sum + row.contributionAllocation, 0) : rows.reduce((sum, row) => sum + Math.max(0, row.tradeEstimate), 0) : 0;
  const reduceAmount = targetsValid && planMode === "rebalance" ? rows.reduce((sum, row) => sum + Math.max(0, -row.tradeEstimate), 0) : 0;
  const grossTurnover = deployAmount + reduceAmount;
  const estimatedTradingCost = grossTurnover * Math.max(0, estimatedCostBps) / 10_000;
  const unallocatedCash = planMode === "contribution" ? Math.max(0, contribution - allocatedContribution - estimatedTradingCost) : 0;
  const netFundingRequired = planMode === "contribution" ? contribution : deployAmount - reduceAmount + estimatedTradingCost;
  const concentration = portfolio.total > 0 ? rows.reduce((sum, row) => sum + (row.currentShare / 100) ** 2, 0) * 10000 : 0;
  const effectiveAssetClasses = concentration > 0 ? 10000 / concentration : 0;
  const setEqualTargets = () => {
    const held = ASSETS.filter(({ type }) => portfolio.values[type] > 0).map(({ type }) => type);
    const included = held.length ? held : ASSETS.map(({ type }) => type);
    const share = 100 / included.length;
    setTargets(Object.fromEntries(ASSETS.map(({ type }) => [type, included.includes(type) ? share : 0])) as Record<InvestmentType, number>);
  };
  const useCurrentMix = () => {
    if (!portfolio.total) { setEqualTargets(); return; }
    const next = {} as Record<InvestmentType, number>;
    let assigned = 0;
    ASSETS.forEach(({ type }, index) => {
      const weight = index === ASSETS.length - 1 ? 100 - assigned : portfolio.values[type] / portfolio.total * 100;
      next[type] = weight;
      assigned += weight;
    });
    setTargets(next);
  };
  const normalizeTargets = () => {
    if (targetTotal <= 0) { setEqualTargets(); return; }
    const next = {} as Record<InvestmentType, number>;
    let assigned = 0;
    ASSETS.forEach(({ type }, index) => {
      const weight = index === ASSETS.length - 1 ? 100 - assigned : (Number(targets[type]) || 0) / targetTotal * 100;
      next[type] = weight;
      assigned += weight;
    });
    setTargets(next);
  };
  const topCurrentClass = rows.reduce((top, row) => row.currentShare > top.currentShare ? row : top, rows[0]);
  const largestUnderweight = rows.filter((row) => row.drift > tolerance).sort((a, b) => b.drift - a.drift)[0];
  const largestOverweight = rows.filter((row) => row.drift < -tolerance).sort((a, b) => a.drift - b.drift)[0];
  const insight = !portfolio.total
    ? { tone: "neutral", title: "Add holdings to start", text: "Once open investments are recorded, this planner can compare your current portfolio with the target mix." }
    : !targetsValid
      ? { tone: "warning", title: "Complete the target mix", text: `Your targets currently add up to ${targetTotal.toFixed(1)}%. Adjust the weights to total 100% before using the estimated reallocation amounts.` }
      : largestUnderweight && largestOverweight
        ? { tone: "warning", title: `Review ${largestUnderweight.label} and ${largestOverweight.label}`, text: planMode === "contribution" ? `${largestUnderweight.label} is ${largestUnderweight.drift.toFixed(1)} percentage points below target. This scenario allocates ${fmt(largestUnderweight.contributionAllocation)} to it; ${fmt(unallocatedCash)} remains in cash.` : `${largestUnderweight.label} is ${largestUnderweight.drift.toFixed(1)} points below target while ${largestOverweight.label} is ${Math.abs(largestOverweight.drift).toFixed(1)} points above. Estimated buy/sell values are ${fmt(Math.max(0, largestUnderweight.tradeEstimate))} and ${fmt(Math.abs(Math.min(0, largestOverweight.tradeEstimate)))}.` }
        : largestUnderweight || largestOverweight
          ? { tone: "warning", title: `Review ${largestUnderweight?.label ?? largestOverweight?.label}`, text: planMode === "contribution" ? largestUnderweight ? `${largestUnderweight.label} is ${largestUnderweight.drift.toFixed(1)} points below target. This scenario allocates ${fmt(largestUnderweight.contributionAllocation)} to it.` : "The portfolio has overweight classes but no underweight class outside the band. A contribution-only plan cannot reduce existing positions." : largestUnderweight ? `${largestUnderweight.label} is ${largestUnderweight.drift.toFixed(1)} points below target; estimated buy value is ${fmt(Math.max(0, largestUnderweight.tradeEstimate))}.` : `${largestOverweight!.label} is ${Math.abs(largestOverweight!.drift).toFixed(1)} points above target; estimated sell value is ${fmt(Math.abs(Math.min(0, largestOverweight!.tradeEstimate)))}.` }
        : topCurrentClass.currentShare >= 70
          ? { tone: "warning", title: `High concentration in ${topCurrentClass.label}`, text: `${topCurrentClass.label} represents ${topCurrentClass.currentShare.toFixed(1)}% of your open portfolio. Review whether this concentration matches your intended target mix.` }
          : { tone: "positive", title: "Portfolio is within your tolerance bands", text: "No asset class currently exceeds the selected drift tolerance. Review the portfolio again when valuations or targets change." };

  return <main className="page-content rebalance-page">
    <header className="page-heading rebalance-page-heading"><div><span className="eyebrow">PORTFOLIO TOOLS</span><h1>Rebalancing Planner</h1><p>Compare your current investment mix with your target allocation.</p></div><div className="rebalance-total"><ChartNoAxesCombined size={19} /><span>Open portfolio value</span><strong>{fmt(portfolio.total)}</strong></div></header>
    <section className="rebalance-panel" aria-labelledby="rebalance-title">
      <div className="rebalance-step"><span className="rebalance-step-number">1</span><div className="rebalance-step-body"><strong>Choose a plan</strong><div className="rebalance-mode-toggle" role="group" aria-label="Rebalancing method"><button type="button" className={planMode === "rebalance" ? "active" : ""} aria-pressed={planMode === "rebalance"} onClick={() => setPlanMode("rebalance")}>Rebalance existing holdings</button><button type="button" className={planMode === "contribution" ? "active" : ""} aria-pressed={planMode === "contribution"} onClick={() => setPlanMode("contribution")}>Invest new money</button></div>{planMode === "contribution" && <label className="rebalance-contribution-field">Contribution amount ({user.currency})<input aria-label="Planned contribution amount" type="number" min="0" step="1000" value={contribution} onChange={(event) => { const amount = Number(event.target.value); setContribution(Number.isFinite(amount) ? Math.max(0, amount) : 0); }} /></label>}</div></div>
      <header className="rebalance-heading"><div><span className="eyebrow">STEP 2 · SET TARGETS</span><h2 id="rebalance-title">Target portfolio mix</h2><p>Set a percentage for each asset class. The total must equal 100%.</p></div><div className="rebalance-header-actions"><button type="button" className="secondary-button" onClick={useCurrentMix}>Use current mix</button><button type="button" className="secondary-button" disabled={targetsValid} onClick={normalizeTargets}>Normalize to 100%</button><button type="button" className="secondary-button rebalance-equal-button" onClick={setEqualTargets}><Equal size={16} /> Equalize held assets</button></div></header>
      <details className="rebalance-advanced"><summary>Advanced assumptions <span>Drift band, minimum trade, and estimated costs</span></summary><div className="rebalance-control-row"><label>Drift tolerance <input aria-label="Drift tolerance percentage points" type="number" min="0" max="25" step="0.5" value={tolerance} onChange={(event) => setTolerance(Math.max(0, Math.min(25, Number(event.target.value) || 0)))} /> pp</label><label>Minimum trade ({user.currency}) <input aria-label="Minimum trade amount" type="number" min="0" step="100" value={minimumTrade} onChange={(event) => { const amount = Number(event.target.value); setMinimumTrade(Number.isFinite(amount) ? Math.max(0, amount) : 0); }} /></label><label>Cost assumption <input aria-label="Estimated trading cost in basis points" type="number" min="0" max="1000" step="1" value={estimatedCostBps} onChange={(event) => setEstimatedCostBps(Math.max(0, Math.min(1000, Number(event.target.value) || 0)))} /> bps</label><label className="rebalance-band-toggle"><input type="checkbox" checked={onlyOutsideBand} onChange={(event) => setOnlyOutsideBand(event.target.checked)} /> Only recommend trades outside band</label><span>{rows.filter((row) => row.withinBand).length} of {rows.length} classes within band</span></div><div className="rebalance-advanced-stats"><span>Asset-class HHI <strong>{portfolio.total ? concentration.toFixed(0) : "—"}</strong></span><span>Effective asset classes <strong>{effectiveAssetClasses ? effectiveAssetClasses.toFixed(1) : "—"}</strong></span><small>HHI uses asset-class weights only; higher values indicate greater concentration.</small></div></details>
      <div className={`rebalance-status ${targetsValid ? "ready" : "needs-input"}`} role="status"><span>Target total</span><strong className={targetsValid ? "valid" : "invalid"}>{targetTotal.toFixed(1)}%</strong><small>{targetsValid ? "Targets are ready. Review the suggested amounts below." : targetTotal < 100 ? `${(100 - targetTotal).toFixed(1)}% left to assign. Estimates are paused until targets total 100%.` : `${(targetTotal - 100).toFixed(1)}% over target. Reduce targets to 100% to continue.`}</small></div>
      <div className="rebalance-results-heading"><span className="rebalance-step-number">3</span><div><strong>Review your plan</strong><small>Estimates update when you change a target or assumption.</small></div></div>
      <div className="rebalance-kpis">
        <article><span>Suggested buys</span><strong>{targetsValid ? fmt(deployAmount) : "—"}</strong><small>{planMode === "contribution" ? "Allocated from contribution" : "To underweight classes"}</small></article>
        <article><span>Suggested sells</span><strong>{targetsValid ? fmt(reduceAmount) : "—"}</strong><small>{planMode === "contribution" ? "No sales in this plan" : "From overweight classes"}</small></article>
        <article><span>Net cash required</span><strong>{targetsValid ? `${netFundingRequired < 0 ? "-" : ""}${fmt(netFundingRequired)}` : "—"}</strong><small>{planMode === "contribution" ? "Planned contribution" : netFundingRequired > 0 ? "Cash needed after cost estimate" : "Expected proceeds after cost estimate"}</small></article>
        <article><span>Estimated trading costs</span><strong>{targetsValid ? fmt(estimatedTradingCost) : "—"}</strong><small>{targetsValid ? `Gross turnover ${fmt(grossTurnover)}` : "Available when targets total 100%"}</small></article>
      </div>
      <aside className={`rebalance-insight ${insight.tone}`} aria-live="polite"><span className="rebalance-insight-label">SUGGESTION</span><strong>{insight.title}</strong><p>{insight.text}</p></aside>
      <div className="rebalance-chart-legend"><span><i className="current" /> Current weight</span><span><i className="target" /> Target weight</span>{planMode === "contribution" && <span><i className="projected" /> Projected weight</span>}</div>
      <div className="rebalance-table-head"><span>Asset class</span><span>Current weight</span><span>Target weight</span><span>{planMode === "contribution" ? "Projected drift" : "Drift"}</span><span>{planMode === "contribution" ? "Contribution split" : "Value to shift"}</span></div>
      <div className="rebalance-list">{rows.map(({ type, label, currentValue, currentShare, projectedShare, target, tradeEstimate, contributionAllocation, drift, withinBand }) => <article className={`rebalance-row ${withinBand ? "within-band" : "outside-band"}`} key={type}>
        <strong>{label}<small>{fmt(currentValue)} current value</small></strong>
        <div className="rebalance-current"><span>{currentShare.toFixed(1)}%{planMode === "contribution" && contribution > 0 && <small> → {projectedShare.toFixed(1)}% projected</small>}</span><div className="rebalance-track"><i style={{ width: `${Math.min(100, currentShare)}%` }} /><b style={{ left: `${Math.min(100, target)}%` }} />{planMode === "contribution" && <em style={{ left: `${Math.min(100, projectedShare)}%` }} />}</div></div>
        <label><span className="sr-only">Target percentage for {label}</span><input type="number" min="0" max="100" step="0.1" value={targets[type]} onChange={(event) => setTargets((previous) => ({ ...previous, [type]: Math.max(0, Math.min(100, Number(event.target.value) || 0)) }))} /><span>%</span></label>
        <span className={`rebalance-drift ${drift > 0 ? "underweight" : drift < 0 ? "overweight" : "balanced"}`}>{drift > 0 ? "+" : ""}{drift.toFixed(1)} pp <small>{withinBand ? "Within band" : drift > 0 ? "Underweight" : "Overweight"}</small></span>
        <strong className={`rebalance-gap ${planMode === "contribution" ? "buy" : tradeEstimate > 0 ? "buy" : tradeEstimate < 0 ? "sell" : "even"}`}>{targetsValid ? planMode === "contribution" ? fmt(contributionAllocation) : `${tradeEstimate > 0 ? "+" : tradeEstimate < 0 ? "−" : ""}${fmt(tradeEstimate)}` : "—"}</strong>
      </article>)}</div>
      <p className="rebalance-note">{planMode === "contribution" && contribution > 0 ? `Unallocated cash in this scenario: ${fmt(unallocatedCash)}. ` : ""}Cost estimates use the user-entered basis-point assumption and are not broker quotes. Target edits are saved on this device. Estimates use saved valuations and exclude taxes, lot selection, liquidity and execution constraints. This planner does not place trades.</p>
    </section>
  </main>;
};

export default RebalancePlanner;
