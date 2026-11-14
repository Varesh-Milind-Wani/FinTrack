import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import Highcharts from "highcharts";
import { lazy, Suspense } from "react";
import HighchartsStock from "highcharts/highstock";
import "highcharts/modules/accessibility";
import HighchartsReact from "highcharts-react-official";
import type { HighchartsReactRefObject } from "highcharts-react-official";
import ReactECharts from "echarts-for-react";
import type { EChartsInstance } from "echarts-for-react";
import {
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  Search,
  ArrowDownUp,
  BellRing,
  ArrowRight,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";

import StatCard from "../components/StatCard";
import ChartPanel from "../components/ChartPanel";
const ChartFullscreenModal = lazy(() => import("../components/ChartFullscreenModal"));

import type { InvestmentType, UserAccount } from "../types/finance";
import { formatCurrency } from "../utils/money";
import { calculateBalanceStats, getAuthoritativeBalance } from "../utils/balance";
import { usePersistentState } from "../hooks/usePersistentState";
import { groupCandles } from "../utils/candleGrouping";
import { getWeekdayOutlook } from "../utils/weekdayNotifications";

const HighchartsStockChart =
  (HighchartsReact as unknown as {
    default?: typeof HighchartsReact;
  }).default ?? HighchartsReact;

const EChartsChart =
  (ReactECharts as unknown as {
    default?: typeof ReactECharts;
  }).default ?? ReactECharts;

const chartRangeOptions = [
  { type: "day", count: 1, label: "1 day" },
  { type: "week", count: 1, label: "1 week" },
  { type: "month", count: 1, label: "1 month" },
  { type: "month", count: 3, label: "3 months" },
  { type: "month", count: 6, label: "6 months" },
  { type: "year", count: 1, label: "1 year" },
  { type: "year", count: 3, label: "3 years" },
  { type: "year", count: 5, label: "5 years" },
  { type: "year", count: 10, label: "10 years" },
  { type: "all", count: 0, label: "All" },
] as const;

const dashboardPerformancePeriods = [
  { value: "all", label: "All Time" },
  { value: "1m", label: "Last Month" },
  { value: "3m", label: "Last 3 Months" },
  { value: "6m", label: "Last 6 Months" },
  { value: "1y", label: "Last Year" },
] as const;

const INVESTMENT_TYPE_LABELS: Record<InvestmentType, string> = {
  stocks: "Stocks",
  mutual_fund: "Mutual Funds",
  crypto: "Crypto",
  gold: "Gold",
  real_estate: "Real Estate",
  fd: "Fixed Deposit",
  other: "Other",
};
const INVESTMENT_TYPE_OPTIONS: InvestmentType[] = ["stocks", "mutual_fund", "crypto", "gold", "real_estate", "fd", "other"];

const ChartRangeDropdown = ({
  value,
  onChange,
}: {
  value: number;
  onChange: (index: number) => void;
}) => (
  <label className="chart-range-dropdown" onClick={(event) => event.stopPropagation()}>
    <span>Range</span>
    <select
      value={value}
      aria-label="Candle interval"
      onChange={(event) => {
        const index = Number(event.target.value);
        onChange(index);
      }}
    >
      {chartRangeOptions.map((option, index) => (
        <option key={`${option.type}-${option.count}`} value={index}>{option.label}</option>
      ))}
    </select>
  </label>
);

const formatDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const applyCandleInterval = (chart: Highcharts.Chart | undefined, sourceData: readonly unknown[], intervalIndex: number) => {
  if (!chart) return;
  const candleSeries = chart.series.find((series) => series.type === "candlestick");
  if (!candleSeries) return;
  candleSeries.setData(groupCandles(sourceData, intervalIndex) as never[], false, false, false);
  chart.xAxis[0]?.setExtremes(undefined, undefined, false, false);
  chart.redraw();
};

const subtractCalendarMonths = (date: Date, months: number) => {
  const result = new Date(date);
  const day = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() - months);
  result.setDate(Math.min(day, new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate()));
  return result;
};

const parseLocalDate = (value: string) => {
  try {
    // If it's an ISO string with timezone (ends with Z or +/-HH:MM), parse directly
    if (value.includes("T")) {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) {
        return date;
      }
    }
    
    // For YYYY-MM-DD format without time, treat as midnight local time
    if (value.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const date = new Date(`${value}T00:00:00`);
      if (!Number.isNaN(date.getTime())) {
        return date;
      }
    }
    
    return null;
  } catch {
    return null;
  }
};

const getTimeGreeting = (hour: number) => {
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  if (hour >= 17 && hour < 22) return "Good evening";
  return "Good night";
};

const createDailySeries = (
  startDate: Date,
  endDate: Date,
  dayTotals: Record<string, number>,
  startingValue: number,
  currentBalance: number
) => {
  const points: Array<[number, number]> = [];
  const cursor = new Date(
    startDate.getFullYear(),
    startDate.getMonth(),
    startDate.getDate()
  );
  const finalDate = new Date(
    endDate.getFullYear(),
    endDate.getMonth(),
    endDate.getDate()
  );
  let runningValue = startingValue;

  while (cursor <= finalDate) {
    const dayKey = formatDateKey(cursor);
    runningValue += dayTotals[dayKey] ?? 0;
    points.push([cursor.getTime(), runningValue]);
    cursor.setDate(cursor.getDate() + 1);
  }

  // Ensure the last point matches currentBalance
  if (points.length > 0) {
    points[points.length - 1][1] = currentBalance;
  }

  return points;
};

interface Props {
  user: UserAccount;
  onAdd: () => void;
  onOpenNotifications: () => void;
}

const Dashboard = ({ user, onAdd, onOpenNotifications }: Props) => {
  const dashboardRef = useRef<HTMLDivElement>(null);
  const [currentHour, setCurrentHour] = useState(() => new Date().getHours());
  const [currentLocalDate, setCurrentLocalDate] = useState(() => formatDateKey(new Date()));
  const [dashboardPeriod, setDashboardPeriod] = usePersistentState<(typeof dashboardPerformancePeriods)[number]["value"]>("dashboard.performancePeriod", "all");
  const [dashboardPerformanceIncludesCosts, setDashboardPerformanceIncludesCosts] = usePersistentState("dashboard.performanceIncludesCosts", true);
  const [portfolioTypeFilter, setPortfolioTypeFilter] = usePersistentState<InvestmentType | "all">("dashboard.portfolioScenarioType", "all");
  const [todayPnlIncludesCosts, setTodayPnlIncludesCosts] = useState(true);
  const [dailyPnlOpen, setDailyPnlOpen] = useState(false);
  const [dailyPnlPage, setDailyPnlPage] = useState(0);
  const [dailyPnlSearch, setDailyPnlSearch] = useState("");
  const [dailyPnlFilter, setDailyPnlFilter] = useState<"all" | "profit" | "loss">("all");
  const [dailyPnlSort, setDailyPnlSort] = useState<"newest" | "oldest">("newest");
  useEffect(() => {
    const refreshDashboardDate = () => {
      setCurrentHour(new Date().getHours());
      setCurrentLocalDate(formatDateKey(new Date()));
    };
    const timer = window.setInterval(refreshDashboardDate, 60_000);
    document.addEventListener("visibilitychange", refreshDashboardDate);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshDashboardDate);
    };
  }, []);
  const weekdayOutlook = useMemo(() => {
    const now = new Date();
    const isTradingWeekday = now.getDay() >= 1 && now.getDay() <= 5;
    // Keep today's outlook visible through 6:59 PM local time. Starting at
    // 7:00 PM, getWeekdayOutlook advances to the next trading weekday.
    if (isTradingWeekday && currentHour < 19) now.setDate(now.getDate() - 1);
    return getWeekdayOutlook(user.transactions, now);
  }, [user.transactions, currentLocalDate, currentHour]);
  const weekdayOutlookIsToday = formatDateKey(weekdayOutlook.date) === currentLocalDate;
  const dailyPnlHistory = useMemo(() => {
    const days = new Map<string, { date: Date; net: number; gross: number; profit: number; loss: number; trades: UserAccount["transactions"] }>();
    user.transactions.forEach((transaction) => {
      if (transaction.type !== "profit" && transaction.type !== "loss") return;
      const date = parseLocalDate(transaction.date);
      if (!date) return;
      const key = formatDateKey(date);
      const day = days.get(key) ?? { date, net: 0, gross: 0, profit: 0, loss: 0, trades: [] };
      const signedNet = transaction.type === "profit" ? transaction.amount : -transaction.amount;
      day.net += signedNet;
      day.gross += signedNet + (transaction.costAmount ?? 0);
      if (transaction.type === "profit") day.profit += transaction.amount;
      else day.loss += transaction.amount;
      day.trades.push(transaction);
      days.set(key, day);
    });
    return [...days.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([key, day]) => ({ key, ...day }));
  }, [user.transactions]);
  const configuredDailyLossLimit = Math.max(0, Number(user.dailyLossLimit) || 0);
  const todayNetPnl = dailyPnlHistory.find((day) => day.key === currentLocalDate)?.net ?? 0;
  const todayLossUsed = Math.max(0, -todayNetPnl);
  const dailyLossLimitProgress = configuredDailyLossLimit > 0
    ? Math.min(100, (todayLossUsed / configuredDailyLossLimit) * 100)
    : 0;
  const dailyLossLimitState = todayLossUsed >= configuredDailyLossLimit
    ? "reached"
    : dailyLossLimitProgress >= 75 ? "approaching" : "within-limit";
  const filteredDailyPnlHistory = useMemo(() => {
    const query = dailyPnlSearch.trim().toLocaleLowerCase();
    return dailyPnlHistory
      .filter((day) => {
        const net = todayPnlIncludesCosts ? day.net : day.gross;
        if (dailyPnlFilter === "profit" && net <= 0) return false;
        if (dailyPnlFilter === "loss" && net >= 0) return false;
        if (!query) return true;
        const searchable = [day.key, day.date.toLocaleDateString(), ...day.trades.flatMap((trade) => [trade.note, trade.category])]
          .join(" ").toLocaleLowerCase();
        return searchable.includes(query);
      })
      .sort((a, b) => dailyPnlSort === "newest" ? b.key.localeCompare(a.key) : a.key.localeCompare(b.key));
  }, [dailyPnlFilter, dailyPnlHistory, dailyPnlSearch, dailyPnlSort, todayPnlIncludesCosts]);
  const dailyPnlSummary = useMemo(() => dailyPnlHistory.reduce((summary, day) => {
    const net = todayPnlIncludesCosts ? day.net : day.gross;
    summary.net += net;
    if (net > 0) summary.profitDays += 1;
    else if (net < 0) summary.lossDays += 1;
    summary.trades += day.trades.length;
    return summary;
  }, { net: 0, profitDays: 0, lossDays: 0, trades: 0 }), [dailyPnlHistory, todayPnlIncludesCosts]);
  const dailyPnlPageSize = 7;
  const dailyPnlPageCount = Math.max(1, Math.ceil(filteredDailyPnlHistory.length / dailyPnlPageSize));
  const visibleDailyPnl = filteredDailyPnlHistory.slice(dailyPnlPage * dailyPnlPageSize, (dailyPnlPage + 1) * dailyPnlPageSize);
  useEffect(() => {
    setDailyPnlPage((page) => Math.min(page, dailyPnlPageCount - 1));
  }, [dailyPnlPageCount]);
  const wealthChartRef = useRef<HighchartsReactRefObject>(null);
  const profitLossChartRef = useRef<EChartsInstance | null>(null);
  const [wealthRange, setWealthRange] = usePersistentState("dashboard.wealthChartRange", 9);
  const [fullscreenChart, setFullscreenChart] = useState<
    | {
        title: string;
        subtitle: string;
        kind: "highcharts" | "stock" | "echarts";
        highchartsOptions?: Highcharts.Options;
        stockOptions?: Highcharts.Options;
        defaultChartMode?: "classic" | "candlestick";
        echartsOption?: Record<string, unknown>;
        timeInOutcome?: { profitPercent: number; lossPercent: number; profitDays: number; lossDays: number; totalDays: number };
      }
    | null
  >(null);
  const [averageTradeChart, setAverageTradeChart] = useState<{
    title: string;
    subtitle: string;
    average: number;
    tradeCount: number;
    options: Highcharts.Options;
  } | null>(null);
  const [peakTradeChart, setPeakTradeChart] = useState<{
    title: string;
    subtitle: string;
    peak: number;
    current: number;
    changeLabel: string;
    changeValue: number;
    tradeCount: number;
    options: Highcharts.Options;
  } | null>(null);
  const closeFullscreenChart = useCallback(() => setFullscreenChart(null), []);

  useEffect(() => {
    if (!peakTradeChart) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPeakTradeChart(null);
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [peakTradeChart]);


  useEffect(() => {
    const timer = window.setInterval(() => setCurrentHour(new Date().getHours()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  // Reflow embedded charts when dashboard panels change size (for example,
  // when the sidebar collapses) so each chart uses its full panel width.
  useEffect(() => {
    const root = dashboardRef.current;
    if (!root || typeof ResizeObserver === "undefined") return;

    const chartContainers = Array.from(root.querySelectorAll<HTMLElement>(".chart-container"));
    if (!chartContainers.length) return;

    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        Highcharts.charts.forEach((chart) => {
          if (!chart || !root.contains(chart.container)) return;

          const host = chart.container.closest<HTMLElement>(".dashboard-overview-chart")
            ?.querySelector<HTMLElement>(".chart-container");
          const width = host?.clientWidth;
          const height = host?.clientHeight;
          if (width && height && (chart.chartWidth !== width || chart.chartHeight !== height)) {
            chart.setSize(width, height, false);
          } else {
            chart.reflow();
          }
        });
        profitLossChartRef.current?.resize();
      });
    });

    chartContainers.forEach((container) => observer.observe(container));
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  const formatMoney = useCallback(
    (value: number) => formatCurrency(value, user.currency),
    [user.currency],
  );
  const dashboardPeriodLabel = dashboardPerformancePeriods.find((period) => period.value === dashboardPeriod)?.label ?? "All Time";

  const stats = useMemo(() => {
    // Use authoritative balance (respects Settings manual override)
    const actualCurrentBalance = getAuthoritativeBalance(user);
    
    const balanceStats = {
      ...calculateBalanceStats(user),
      currentBalance: actualCurrentBalance, // Override with authoritative balance
    };
    
    const profitCount = user.transactions.filter((t) => t.type === "profit").length;
    const lossCount = user.transactions.filter((t) => t.type === "loss").length;
    const totalTrades = profitCount + lossCount;
    const winRate = totalTrades > 0 ? (profitCount / totalTrades) * 100 : 0;
    const avgProfitPerTrade = profitCount > 0 ? balanceStats.totalProfit / profitCount : 0;
    const avgLossPerTrade = lossCount > 0 ? balanceStats.totalLoss / lossCount : 0;

    // Recalculate net performance with actual balance
    const netPerformance = actualCurrentBalance - user.startingBalance;
    // Peak values are based on recorded transactions, so their live result
    // must use the same all-time transaction P&L basis.
    const now = Date.now();
    const transactionNetPnl = user.transactions.reduce((total, transaction) => {
      if (transaction.type !== "profit" && transaction.type !== "loss") return total;
      const timestamp = Date.parse(transaction.date);
      if (!Number.isFinite(timestamp) || timestamp > now || !Number.isFinite(transaction.amount)) return total;
      return total + (transaction.type === "profit" ? transaction.amount : -transaction.amount);
    }, 0);

    // Calculate percentage based on starting balance (ROI)
    const performancePercentage =
      balanceStats.startingBalance > 0
        ? (netPerformance / balanceStats.startingBalance) * 100
        : 0;

    const periodPerformance = (months: number) => {
      const periodEnd = new Date();
      const periodStart = subtractCalendarMonths(periodEnd, months);
      periodStart.setHours(0, 0, 0, 0);
      let net = 0;
      let openingBalance = user.startingBalance;
      let trades = 0;

      user.transactions.forEach((transaction) => {
        if (transaction.type !== "profit" && transaction.type !== "loss") return;
        const timestamp = new Date(transaction.date).getTime();
        if (!Number.isFinite(timestamp)) return;

        const signedAmount = transaction.type === "profit" ? transaction.amount : -transaction.amount;
        if (timestamp < periodStart.getTime()) {
          openingBalance += signedAmount;
        } else if (timestamp <= periodEnd.getTime()) {
          net += signedAmount;
          trades += 1;
        }
      });

      return {
        net,
        trades,
        openingBalance,
        returnPercentage: openingBalance > 0 ? (net / openingBalance) * 100 : null,
      };
    };
    const sixMonthPerformance = periodPerformance(6);
    const oneYearPerformance = periodPerformance(12);

    // Track the highest and lowest cumulative recorded P&L in date order.
    let runningNet = 0;
    let peakProfit = 0;
    let peakLoss = 0;
    [...user.transactions]
      .filter((transaction) => (transaction.type === "profit" || transaction.type === "loss")
        && Number.isFinite(Date.parse(transaction.date))
        && Number.isFinite(transaction.amount)
        && Date.parse(transaction.date) <= now)
      .sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime())
      .forEach((transaction) => {
        runningNet += transaction.type === "profit" ? transaction.amount : -transaction.amount;
        peakProfit = Math.max(peakProfit, runningNet);
        peakLoss = Math.min(peakLoss, runningNet);
      });
    const drawdownFromPeakPercent = peakProfit > 0
      ? Math.max(0, ((peakProfit - transactionNetPnl) / peakProfit) * 100)
      : 0;
    const recoveryFromPeakLossPercent = peakLoss < 0
      ? ((transactionNetPnl - peakLoss) / Math.abs(peakLoss)) * 100
      : 0;

    return {
      ...balanceStats,
      currentBalance: actualCurrentBalance,
      netPerformance,
      transactionNetPnl,
      profitCount,
      lossCount,
      totalTrades,
      winRate,
      avgProfitPerTrade,
      avgLossPerTrade,
      performancePercentage,
      sixMonthPerformance,
      oneYearPerformance,
      peakProfit,
      peakLoss,
      drawdownFromPeakPercent,
      recoveryFromPeakLossPercent,
    };
  }, [user.transactions, user.startingBalance, user.currentBalance, user.defaultCostAmount, user.investmentIncluded, user.investments]);

  const periodStats = useMemo(() => {
    const months = dashboardPerformancePeriods.find((period) => period.value === dashboardPeriod)?.value;
    const monthCount = months === "1m" ? 1 : months === "3m" ? 3 : months === "6m" ? 6 : months === "1y" ? 12 : null;
    const start = monthCount === null ? null : subtractCalendarMonths(new Date(), monthCount);
    if (start) start.setHours(0, 0, 0, 0);
    const startTime = start?.getTime() ?? Number.NEGATIVE_INFINITY;
    const endTime = Date.now();
    let openingBalance = user.startingBalance;
    let grossOpeningBalance = user.startingBalance;
    let totalProfit = 0;
    let totalLoss = 0;
    let grossProfit = 0;
    let grossLoss = 0;
    let profitCount = 0;
    let lossCount = 0;
    let grossProfitCount = 0;
    let grossLossCount = 0;
    const dailyNet = new Map<string, { timestamp: number; signedAmount: number }>();
    const realizedRValues: number[] = [];
    const confidenceBands = [
      { key: "low", label: "Lower confidence", range: "0–39", min: 0, max: 39, count: 0, wins: 0, net: 0, confidenceTotal: 0 },
      { key: "medium", label: "Mid confidence", range: "40–69", min: 40, max: 69, count: 0, wins: 0, net: 0, confidenceTotal: 0 },
      { key: "high", label: "Higher confidence", range: "70–100", min: 70, max: 100, count: 0, wins: 0, net: 0, confidenceTotal: 0 },
    ];

    user.transactions.forEach((transaction) => {
      if (transaction.type !== "profit" && transaction.type !== "loss") return;
      const date = parseLocalDate(transaction.date);
      if (!date) return;
      const timestamp = date?.getTime();
      if (timestamp === undefined || !Number.isFinite(timestamp) || timestamp > endTime) return;
      const signedAmount = transaction.type === "profit" ? transaction.amount : -transaction.amount;
      const grossSignedAmount = signedAmount + (transaction.costAmount ?? 0);
      if (timestamp < startTime) {
        openingBalance += signedAmount;
        grossOpeningBalance += grossSignedAmount;
        return;
      }
      if (Number.isFinite(transaction.confidenceLevel) && transaction.confidenceLevel! >= 0 && transaction.confidenceLevel! <= 100) {
        const band = confidenceBands.find((candidate) => transaction.confidenceLevel! >= candidate.min && transaction.confidenceLevel! <= candidate.max);
        if (band) {
          band.count += 1;
          band.wins += transaction.type === "profit" ? 1 : 0;
          band.net += signedAmount;
          band.confidenceTotal += transaction.confidenceLevel!;
        }
      }
      if (Number.isFinite(transaction.plannedRiskAmount) && transaction.plannedRiskAmount! > 0) {
        realizedRValues.push(signedAmount / transaction.plannedRiskAmount!);
      }
      if (transaction.type === "profit") {
        totalProfit += transaction.amount;
        profitCount += 1;
      } else {
        totalLoss += transaction.amount;
        lossCount += 1;
      }
      if (grossSignedAmount >= 0) {
        grossProfit += grossSignedAmount;
        grossProfitCount += 1;
      } else {
        grossLoss += Math.abs(grossSignedAmount);
        grossLossCount += 1;
      }
      const key = formatDateKey(date);
      const day = dailyNet.get(key) ?? { timestamp, signedAmount: 0 };
      day.signedAmount += signedAmount;
      dailyNet.set(key, day);
    });

    const periodDays = [...dailyNet.values()].sort((left, right) => left.timestamp - right.timestamp);
    let cumulative = 0;
    let peakProfit = 0;
    let peakLoss = 0;
    let maxDrawdown = 0;
    let maxDrawdownPercent: number | null = openingBalance > 0 ? 0 : null;
    for (const day of periodDays) {
      cumulative += day.signedAmount;
      peakProfit = Math.max(peakProfit, cumulative);
      peakLoss = Math.min(peakLoss, cumulative);
      const dailyDrawdown = peakProfit - cumulative;
      maxDrawdown = Math.max(maxDrawdown, dailyDrawdown);
      const peakEquity = openingBalance + peakProfit;
      if (dailyDrawdown > 0 && peakEquity > 0) {
        const drawdownPercent = (dailyDrawdown / peakEquity) * 100;
        maxDrawdownPercent = Math.max(maxDrawdownPercent ?? 0, drawdownPercent);
      }
    }
    const net = totalProfit - totalLoss;
    const totalTrades = profitCount + lossCount;
    const lowConfidenceBand = confidenceBands[0];
    const highConfidenceBand = confidenceBands[2];
    const highLowExpectancyGap = lowConfidenceBand.count >= 5 && highConfidenceBand.count >= 5
      ? highConfidenceBand.net / highConfidenceBand.count - lowConfidenceBand.net / lowConfidenceBand.count
      : null;
    const sortedRValues = [...realizedRValues].sort((a, b) => a - b);
    const positiveR = realizedRValues.filter((value) => value > 0);
    const negativeR = realizedRValues.filter((value) => value < 0);
    const positiveRTotal = positiveR.reduce((sum, value) => sum + value, 0);
    const negativeRTotal = Math.abs(negativeR.reduce((sum, value) => sum + value, 0));
    const rDistribution = [
      { label: "< −2R", count: realizedRValues.filter((value) => value < -2).length, tone: "loss" },
      { label: "−2R to −1R", count: realizedRValues.filter((value) => value >= -2 && value < -1).length, tone: "loss" },
      { label: "−1R to 0", count: realizedRValues.filter((value) => value >= -1 && value < 0).length, tone: "loss" },
      { label: "0R", count: realizedRValues.filter((value) => value === 0).length, tone: "flat" },
      { label: "0 to 1R", count: realizedRValues.filter((value) => value > 0 && value < 1).length, tone: "profit" },
      { label: "1R to 2R", count: realizedRValues.filter((value) => value >= 1 && value <= 2).length, tone: "profit" },
      { label: "> 2R", count: realizedRValues.filter((value) => value > 2).length, tone: "profit" },
    ];
    const maxRBinCount = Math.max(1, ...rDistribution.map((bin) => bin.count));
    return {
      totalProfit,
      totalLoss,
      grossProfit,
      grossLoss,
      grossNet: grossProfit - grossLoss,
      profitCount,
      lossCount,
      grossProfitCount,
      grossLossCount,
      totalTrades,
      winRate: totalTrades > 0 ? (profitCount / totalTrades) * 100 : 0,
      avgProfitPerTrade: profitCount > 0 ? totalProfit / profitCount : 0,
      avgLossPerTrade: lossCount > 0 ? totalLoss / lossCount : 0,
      expectancy: totalTrades > 0 ? net / totalTrades : 0,
      profitFactor: totalTrades === 0 ? null : totalLoss > 0 ? totalProfit / totalLoss : (totalProfit > 0 ? null : 0),
      net,
      returnPercentage: openingBalance > 0 ? (net / openingBalance) * 100 : null,
      grossReturnPercentage: grossOpeningBalance > 0 ? ((grossProfit - grossLoss) / grossOpeningBalance) * 100 : null,
      peakProfit,
      peakLoss,
      maxDrawdown,
      maxDrawdownPercent,
      recoveryFactor: maxDrawdown > 0 ? net / maxDrawdown : null,
      drawdownFromPeakPercent: peakProfit > 0 ? Math.max(0, ((peakProfit - net) / peakProfit) * 100) : 0,
      recoveryFromPeakLossPercent: peakLoss < 0 ? ((net - peakLoss) / Math.abs(peakLoss)) * 100 : 0,
      conviction: {
        bands: confidenceBands.map(({ key, label, range, count, wins, net, confidenceTotal }) => ({
          key,
          label,
          range,
          count,
          wins,
          net,
          avgConfidence: count ? confidenceTotal / count : null,
          winRate: count ? wins / count * 100 : null,
          averageResult: count ? net / count : null,
        })),
        highLowExpectancyGap,
      },
      riskUnits: {
        count: realizedRValues.length,
        total: totalTrades,
        expectancy: realizedRValues.length ? realizedRValues.reduce((sum, value) => sum + value, 0) / realizedRValues.length : null,
        median: sortedRValues.length ? sortedRValues.length % 2 ? sortedRValues[(sortedRValues.length - 1) / 2] : (sortedRValues[sortedRValues.length / 2 - 1] + sortedRValues[sortedRValues.length / 2]) / 2 : null,
        profitFactor: realizedRValues.length ? negativeRTotal > 0 ? positiveRTotal / negativeRTotal : positiveRTotal > 0 ? Number.POSITIVE_INFINITY : 0 : null,
        averageWin: positiveR.length ? positiveRTotal / positiveR.length : null,
        averageLoss: negativeR.length ? negativeR.reduce((sum, value) => sum + value, 0) / negativeR.length : null,
        distribution: rDistribution.map((bin) => ({ ...bin, width: bin.count / maxRBinCount * 100 })),
      },
    };
  }, [dashboardPeriod, user.startingBalance, user.transactions]);

  const openAverageTradeChart = (tradeType: "profit" | "loss") => {
    const months = dashboardPerformancePeriods.find((period) => period.value === dashboardPeriod)?.value;
    const monthCount = months === "1m" ? 1 : months === "3m" ? 3 : months === "6m" ? 6 : months === "1y" ? 12 : null;
    const start = monthCount === null ? null : subtractCalendarMonths(new Date(), monthCount);
    if (start) start.setHours(0, 0, 0, 0);
    const startTime = start?.getTime() ?? Number.NEGATIVE_INFINITY;
    const endTime = Date.now();
    const periodTrades = user.transactions
      .filter((transaction) => transaction.type === "profit" || transaction.type === "loss")
      .map((transaction) => ({ transaction, date: parseLocalDate(transaction.date) }))
      .filter((entry): entry is { transaction: typeof user.transactions[number]; date: Date } => entry.date instanceof Date
        && Number.isFinite(entry.date.getTime()) && entry.date.getTime() >= startTime && entry.date.getTime() <= endTime)
      .sort((left, right) => left.date.getTime() - right.date.getTime());
    const trades = periodTrades.filter(({ transaction }) => transaction.type === tradeType);
    let total = 0;
    const tradeSeries: Array<[number, number]> = [];
    trades.forEach(({ transaction, date }) => {
      const amount = transaction.amount;
      total += amount;
      tradeSeries.push([date.getTime(), amount]);
    });
    const runningAverageSeries = (type: "profit" | "loss"): Array<[number, number]> => {
      let runningTotal = 0;
      let count = 0;
      return periodTrades.flatMap(({ transaction, date }) => {
        if (transaction.type !== type) return [];
        runningTotal += transaction.amount;
        count += 1;
        return [[date.getTime(), runningTotal / count] as [number, number]];
      });
    };
    const averageProfitSeries = runningAverageSeries("profit");
    const averageLossSeries = runningAverageSeries("loss");
    const label = tradeType === "profit" ? "Profit" : "Loss";
    setAverageTradeChart({
      title: `Average ${label} per Trade`,
      subtitle: `${trades.length} ${tradeType === "profit" ? "profitable" : "losing"} trades · ${dashboardPeriodLabel.toLowerCase()} · selected trade amounts vs. average profit and loss`,
      average: trades.length ? total / trades.length : 0,
      tradeCount: trades.length,
      options: {
        chart: { type: "line", backgroundColor: "transparent", height: 580, animation: false, zooming: { type: "x", resetButton: { relativeTo: "plotBox", position: { align: "right", verticalAlign: "top", x: -10, y: 10 } } } },
        title: { text: undefined },
        xAxis: { type: "datetime", title: { text: "Trade date" } },
        yAxis: { title: { text: `Amount (${user.currency})` }, min: 0 },
        tooltip: { shared: true, xDateFormat: "%e %b %Y", valuePrefix: `${user.currency} `, valueDecimals: 2 },
        legend: { enabled: true },
        credits: { enabled: false },
        plotOptions: { series: { animation: false, marker: { enabled: trades.length <= 40, radius: 3 } } },
        series: [
          { type: "line", name: `${label} per trade`, data: tradeSeries, color: tradeType === "profit" ? "#10b981" : "#ef5350" },
          { type: "line", name: "Average profit", data: averageProfitSeries, color: "#5b7cff", lineWidth: 3, marker: { enabled: false } },
          { type: "line", name: "Average loss", data: averageLossSeries, color: "#f59e0b", lineWidth: 3, marker: { enabled: false } },
        ],
      },
    });
  };

  const openPeakTradeChart = (peakType: "profit" | "loss") => {
    const datedTrades = user.transactions
      .filter((transaction) => (transaction.type === "profit" || transaction.type === "loss")
        && Number.isFinite(transaction.amount))
      .map((transaction) => ({ transaction, date: parseLocalDate(transaction.date) }))
      .filter((entry): entry is { transaction: typeof user.transactions[number]; date: Date } => entry.date instanceof Date
        && Number.isFinite(entry.date.getTime()) && entry.date.getTime() <= Date.now())
      .sort((left, right) => left.date.getTime() - right.date.getTime());

    let runningResult = 0;
    let bestPoint: [number, number] | null = null;
    let worstPoint: [number, number] | null = null;
    const cumulativeSeries: Array<[number, number]> = [];
    datedTrades.forEach(({ transaction, date }) => {
      runningResult += transaction.type === "profit" ? transaction.amount : -transaction.amount;
      const point: [number, number] = [date.getTime(), runningResult];
      cumulativeSeries.push(point);
      if (!bestPoint || runningResult > bestPoint[1]) bestPoint = point;
      if (!worstPoint || runningResult < worstPoint[1]) worstPoint = point;
    });

    const selectedPeak = peakType === "profit" ? bestPoint : worstPoint;
    const peak = selectedPeak?.[1] ?? 0;
    const current = cumulativeSeries.at(-1)?.[1] ?? 0;
    const isProfit = peakType === "profit";
    const changeValue = isProfit ? Math.max(0, peak - current) : Math.max(0, current - peak);
    const changeLabel = isProfit ? "Below peak" : "Recovered from low";
    const markerPoint = selectedPeak ? [selectedPeak] : [];

    setPeakTradeChart({
      title: `Peak ${isProfit ? "Profit" : "Loss"} History`,
      subtitle: `All-time cumulative trade result across ${datedTrades.length} recorded ${datedTrades.length === 1 ? "trade" : "trades"}.`,
      peak,
      current,
      changeLabel,
      changeValue,
      tradeCount: datedTrades.length,
      options: {
        chart: { type: "line", backgroundColor: "transparent", height: 500, animation: false, zooming: { type: "x", resetButton: { relativeTo: "plotBox", position: { align: "right", verticalAlign: "top", x: -10, y: 10 } } } },
        title: { text: undefined },
        xAxis: { type: "datetime", title: { text: "Trade date" } },
        yAxis: { title: { text: `Cumulative result (${user.currency})` }, plotLines: [{ value: 0, color: "#718096", width: 1, dashStyle: "ShortDash" }] },
        tooltip: { shared: true, xDateFormat: "%e %b %Y", valuePrefix: `${user.currency} `, valueDecimals: 2 },
        legend: { enabled: true },
        credits: { enabled: false },
        plotOptions: { series: { animation: false, marker: { enabled: datedTrades.length <= 80, radius: 3 } } },
        series: [
          { type: "line", name: "Cumulative trade result", data: cumulativeSeries, color: "#5b7cff", lineWidth: 2 },
          { type: "scatter", name: isProfit ? "Peak profit" : "Peak loss", data: markerPoint, color: isProfit ? "#10b981" : "#ef5350", marker: { enabled: true, radius: 7, symbol: "circle" }, zIndex: 5 },
        ],
      },
    });
  };

  const todayStats = useMemo(() => {
    const todayKey = formatDateKey(new Date());
    let net = 0;
    let gross = 0;
    let trades = 0;
    user.transactions.forEach((transaction) => {
      if (transaction.type !== "profit" && transaction.type !== "loss") return;
      const date = parseLocalDate(transaction.date);
      if (!date || formatDateKey(date) !== todayKey) return;
      const signedNet = transaction.type === "profit" ? transaction.amount : -transaction.amount;
      net += signedNet;
      gross += signedNet + (transaction.costAmount ?? 0);
      trades += 1;
    });
    return { net, gross, trades };
  }, [user.transactions]);

  const portfolioLens = useMemo(() => {
    const openHoldings = (user.investments ?? []).filter((holding) => !holding.isClosed
      && (portfolioTypeFilter === "all" || holding.type === portfolioTypeFilter));
    const exposures = new Map<string, { value: number; holdings: number }>();
    let marketValue = 0;
    openHoldings.forEach((holding) => {
      const value = Number.isFinite(holding.currentValue) ? Math.max(0, holding.currentValue) : 0;
      marketValue += value;
      const row = exposures.get(holding.type) ?? { value: 0, holdings: 0 };
      row.value += value;
      row.holdings += 1;
      exposures.set(holding.type, row);
    });
    const largestHolding = [...openHoldings].sort((a, b) => b.currentValue - a.currentValue)[0] ?? null;
    const largestHoldingValue = largestHolding && Number.isFinite(largestHolding.currentValue)
      ? Math.max(0, largestHolding.currentValue)
      : 0;
    const exposureRows = [...exposures.entries()]
      .map(([type, row]) => ({
        type,
        ...row,
        share: marketValue > 0 ? row.value / marketValue * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value);
    const squaredExposureShares = openHoldings.reduce((sum, holding) => {
      const value = Number.isFinite(holding.currentValue) ? Math.max(0, holding.currentValue) : 0;
      const share = marketValue > 0 ? value / marketValue : 0;
      return sum + share * share;
    }, 0);
    const scenarios = [-10, -5, 0, 5, 10].map((shock) => {
      const change = openHoldings.reduce((sum, holding) => {
        const value = Number.isFinite(holding.currentValue) ? Math.max(0, holding.currentValue) : 0;
        const direction = holding.positionSide === "short" ? -1 : 1;
        return sum + value * (shock / 100) * direction;
      }, 0);
      return { shock, change, resultingValue: Math.max(0, marketValue + change) };
    });
    return {
      openHoldings,
      marketValue,
      exposureRows,
      largestHolding,
      largestHoldingShare: marketValue > 0 ? largestHoldingValue / marketValue * 100 : 0,
      effectiveHoldingCount: squaredExposureShares > 0 ? 1 / squaredExposureShares : 0,
      scenarios,
    };
  }, [user.investments, portfolioTypeFilter]);

  const {
    totalProfit,
    totalLoss,
    currentBalance,
    netPerformance,
    transactionNetPnl,
    oneYearPerformance,
    peakProfit,
    peakLoss,
    drawdownFromPeakPercent,
    recoveryFromPeakLossPercent,
  } = stats;

  const wealthData = useMemo(() => {
    const dailyNet: Record<string, number> = {};
    const dates: Date[] = [];

    user.transactions.forEach((transaction) => {
      const parsedDate = parseLocalDate(transaction.date);

      if (!parsedDate) {
        return;
      }

      dates.push(parsedDate);

      const key = formatDateKey(parsedDate);

      dailyNet[key] = (dailyNet[key] || 0) + (transaction.type === "profit"
        ? transaction.amount
        : -transaction.amount);
    });

    if (!dates.length) {
      const createdAt = parseLocalDate(user.createdAt) ?? new Date();
      return [[createdAt.getTime(), currentBalance]];
    }

    const startDate = new Date(
      Math.min(
        ...dates.map((date) =>
          new Date(
            date.getFullYear(),
            date.getMonth(),
            date.getDate()
          ).getTime()
        ),
        new Date(
          parseLocalDate(user.createdAt)?.getFullYear() ?? dates[0].getFullYear(),
          parseLocalDate(user.createdAt)?.getMonth() ?? dates[0].getMonth(),
          parseLocalDate(user.createdAt)?.getDate() ?? dates[0].getDate()
        ).getTime()
      )
    );
    const endDate = new Date(
      Math.max(
        ...dates.map((date) =>
          new Date(
            date.getFullYear(),
            date.getMonth(),
            date.getDate()
          ).getTime()
        ),
        new Date().setHours(0, 0, 0, 0)
      )
    );

    const effectiveStartingBalance = currentBalance - totalProfit + totalLoss;
    return createDailySeries(startDate, endDate, dailyNet, effectiveStartingBalance, currentBalance);
  }, [user.startingBalance, user.transactions, user.createdAt, currentBalance, totalProfit, totalLoss]);

  const profitLossData = useMemo(() => {
    const dailyTotals: Record<
      string,
      {
        profit: number;
        loss: number;
      }
    > = {};
    const dates: Date[] = [];

    [...user.transactions]
      .slice()
      .sort(
        (left, right) =>
          new Date(left.date).getTime() -
          new Date(right.date).getTime()
      )
      .forEach((transaction) => {
        const parsedDate = parseLocalDate(transaction.date);

        if (!parsedDate) {
          return;
        }

        dates.push(parsedDate);

        const key = formatDateKey(parsedDate);

        if (!dailyTotals[key]) {
          dailyTotals[key] = {
            profit: 0,
            loss: 0,
          };
        }

        // The chart represents gross performance, before saved transaction
        // costs. `type` can flip when costs turn a small gross win into a net
        // loss, so restore the original signed result before classifying it.
        const netSigned = transaction.type === "profit" ? transaction.amount : -transaction.amount;
        const grossSigned = netSigned + (transaction.costAmount ?? 0);
        if (grossSigned > 0) dailyTotals[key].profit += grossSigned;
        else if (grossSigned < 0) dailyTotals[key].loss += Math.abs(grossSigned);
      });

    if (!dates.length) {
      const createdAt = parseLocalDate(user.createdAt) ?? new Date();
      return [
        {
          date: createdAt.getTime(),
          profit: 0,
          loss: 0,
        },
      ];
    }

    const startDate = new Date(
      Math.min(
        ...dates.map((date) =>
          new Date(
            date.getFullYear(),
            date.getMonth(),
            date.getDate()
          ).getTime()
        ),
        new Date(
          parseLocalDate(user.createdAt)?.getFullYear() ?? dates[0].getFullYear(),
          parseLocalDate(user.createdAt)?.getMonth() ?? dates[0].getMonth(),
          parseLocalDate(user.createdAt)?.getDate() ?? dates[0].getDate()
        ).getTime()
      )
    );
    const endDate = new Date(
      Math.max(
        ...dates.map((date) =>
          new Date(
            date.getFullYear(),
            date.getMonth(),
            date.getDate()
          ).getTime()
        ),
        new Date().setHours(0, 0, 0, 0)
      )
    );

    // Plot cumulative profit and cumulative loss as positive totals on the
    // same scale. Net P&L is calculated separately as profit minus loss.
    let cumulativeProfit = 0;
    let cumulativeLoss = 0;
    const result = [];

    const cursor = new Date(
      startDate.getFullYear(),
      startDate.getMonth(),
      startDate.getDate()
    );

    while (cursor <= endDate) {
      const dayKey = formatDateKey(cursor);
      const dayData = dailyTotals[dayKey];

      if (dayData) {
        cumulativeProfit += dayData.profit;
        cumulativeLoss += dayData.loss;
      }

      result.push({
        date: cursor.getTime(),
        profit: cumulativeProfit,
        loss: cumulativeLoss,
      });

      cursor.setDate(cursor.getDate() + 1);
    }

    return result;
  }, [user.createdAt, user.transactions]);

  const candlestickOptions = useMemo<Highcharts.Options>(() => {
    const transactions = [...user.transactions]
      .map((transaction) => ({
        ...transaction,
        parsedDate: parseLocalDate(transaction.date),
      }))
      .filter(
        (
          transaction
        ): transaction is (typeof user.transactions)[number] & {
          parsedDate: Date;
        } => Boolean(transaction.parsedDate)
      )
      .sort(
        (left, right) =>
          left.parsedDate.getTime() -
          right.parsedDate.getTime()
      );

    const makePoint = (
      date: Date,
      open: number,
      high: number,
      low: number,
      close: number
    ): [number, number, number, number, number] => [
      new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate()
      ).getTime(),
      open,
      high,
      low,
      close,
    ];

    if (!transactions.length) {
      const createdAt = parseLocalDate(user.createdAt) ?? new Date();

      return {
        accessibility: {
          enabled: true,
        },
        chart: {
          backgroundColor: "transparent",
          height: 430,
          // Keep enough room for the right-side crosshair price flag so it
          // does not cover the last candle.
          spacing: [14, 84, 22, 20],
          zoomType: undefined,
          panning: { enabled: false },
          zooming: {
            mouseWheel: {
              enabled: false,
            },
          },
        },
        credits: {
          enabled: false,
        },
        title: {
          text: undefined,
        },
        subtitle: {
          text: undefined,
        },
        exporting: {
          enabled: true,
        },
        rangeSelector: {
          selected: 9,
          inputEnabled: false,
          buttonSpacing: 8,
          buttonPosition: { align: "left", x: 0, y: 4 },
          verticalAlign: "top",
          buttonTheme: {
            fill: "#151922",
            stroke: "#2b3340",
            style: {
              color: "#dce3ef",
              fontWeight: "700",
            },
            states: {
              hover: {
                fill: "#1b202b",
                style: {
                  color: "#eef2f8",
                },
              },
              select: {
                fill: "#eef2f8",
                style: {
                  color: "#0f1218",
                },
              },
            },
          },
          buttons: chartRangeOptions.map(({ type, count, label }) => ({
            type,
            ...(count ? { count } : {}),
            text: label,
          })),
        },
        navigator: {
          enabled: false,
          margin: 18,
          height: 72,
        },
        scrollbar: {
          enabled: false,
        },
        xAxis: {
          type: "datetime",
          ordinal: false,
          maxPadding: 0.14,
          lineColor: "#252b36",
          crosshair: {
            width: 1,
            color: "#ffffff",
            dashStyle: "Dash",
            snap: false,
          },
          labels: {
            style: {
              color: "#7f8799",
            },
          },
        },
        yAxis: {
          opposite: true,
          title: {
            text: undefined,
          },
          crosshair: {
            width: 1,
            color: "#ffffff",
            dashStyle: "Dash",
            snap: false,
            label: {
              enabled: false,
              backgroundColor: "#2563eb",
              borderColor: "#60a5fa",
              borderRadius: 4,
              borderWidth: 1,
              padding: 6,
              style: { color: "#ffffff", fontSize: "11px", fontWeight: "700" },
              formatter(value) {
                return formatMoney(value);
              },
            },
          },
          gridLineColor: "#222731",
          labels: {
            style: {
              color: "#7f8799",
            },
            formatter() {
              return formatMoney(Number(this.value));
            },
          },
        },
        tooltip: {
          enabled: false,
          useHTML: true,
          backgroundColor: "#171b22",
          borderColor: "#303744",
          style: {
            color: "#ffffff",
          },
          formatter() {
            return `
              <div style="min-width:180px">
                <div style="font-weight:700;margin-bottom:6px">
                  ${new Date(Number(this.x)).toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </div>
                <div>Open: ${formatMoney(currentBalance)}</div>
                <div>High: ${formatMoney(currentBalance)}</div>
                <div>Low: ${formatMoney(currentBalance)}</div>
                <div>Close: ${formatMoney(currentBalance)}</div>
              </div>
            `;
          },
        },
        plotOptions: {
          candlestick: {
            color: "#673AB7",
            upColor: "#0D9F87",
            lineColor: "#673AB7",
            upLineColor: "#0D9F87",
            states: { hover: { enabled: false } },
          },
        },
        series: [
          {
            type: "candlestick",
            name: "Balance",
            data: [makePoint(createdAt, currentBalance, currentBalance, currentBalance, currentBalance)],
            dataGrouping: { enabled: false },
          },
        ],
      };
    }

    const candles: Array<[number, number, number, number, number]> = [];
    const effectiveStartingBalance = currentBalance - totalProfit + totalLoss;
    let currentDay = formatDateKey(transactions[0].parsedDate);
    let dayStart = new Date(
      transactions[0].parsedDate.getFullYear(),
      transactions[0].parsedDate.getMonth(),
      transactions[0].parsedDate.getDate()
    );
    let runningBalance = effectiveStartingBalance;
    let open = effectiveStartingBalance;
    let high = effectiveStartingBalance;
    let low = effectiveStartingBalance;
    let close = effectiveStartingBalance;

    const commitDay = () => {
      candles.push(
        makePoint(dayStart, open, high, low, close)
      );
    };

    transactions.forEach((transaction) => {
      const transactionDay = formatDateKey(transaction.parsedDate);

      if (transactionDay !== currentDay) {
        commitDay();
        currentDay = transactionDay;
        dayStart = new Date(
          transaction.parsedDate.getFullYear(),
          transaction.parsedDate.getMonth(),
          transaction.parsedDate.getDate()
        );
        open = runningBalance;
        high = runningBalance;
        low = runningBalance;
        close = runningBalance;
      }

      runningBalance +=
        transaction.type === "profit"
          ? transaction.amount
          : -transaction.amount;

      close = runningBalance;
      high = Math.max(high, runningBalance);
      low = Math.min(low, runningBalance);
    });

    commitDay();

    return {
      accessibility: { enabled: true },
      chart: {
        backgroundColor: "transparent",
        height: 430,
        // Reserve a right gutter for the y-axis crosshair label. Without it,
        // the label can sit on top of the final candle near the chart edge.
        spacing: [14, 84, 24, 20],
        style: { fontFamily: "Inter, system-ui, sans-serif" },
        // Keep the embedded dashboard chart static; zooming is available in fullscreen.
        zoomType: undefined,
        panning: { enabled: false },
        zooming: { mouseWheel: { enabled: false } },
        reflow: true,
        resetZoomButton: { theme: { display: "none" } },
      },
      credits: { enabled: false },
      title: { text: undefined },
      subtitle: { text: undefined },
      exporting: { enabled: true },
      rangeSelector: {
        selected: 9,
        inputEnabled: true,
        buttonSpacing: 8,
        buttonPosition: { align: "left", x: 0, y: 4 },
        inputStyle: {
          color: "#e8edf5",
          border: "1px solid #3d4d63",
          backgroundColor: "#191d28",
          borderRadius: "4px",
        },
        labelStyle: {
          color: "#9aa5ba",
        },
        verticalAlign: "top",
        buttonTheme: {
          fill: "rgba(59, 130, 246, 0.1)",
          stroke: "rgba(59, 130, 246, 0.3)",
          r: 6,
          states: {
            hover: { 
              fill: "rgba(59, 130, 246, 0.2)",
              stroke: "rgba(59, 130, 246, 0.5)",
            },
            select: {
              fill: "linear-gradient(135deg, #3b82f6, #60a5fa)",
              stroke: "#3b82f6",
              style: { color: "#ffffff", fontWeight: "700" },
            },
          },
          style: { color: "#9aa5ba", fontWeight: "600", fontFamily: "Inter, sans-serif", fontSize: "11px" },
        },
        buttons: chartRangeOptions.map(({ type, count, label }) => ({
          type,
          ...(count ? { count } : {}),
          text: label,
        })),
      },
      navigator: {
        enabled: false,
        height: 84,
        maskFill: "rgba(59, 130, 246, 0.12)",
        outlineColor: "rgba(59, 130, 246, 0.3)",
        margin: 20,
        handles: { 
          width: 16, 
          borderRadius: 4, 
          backgroundColor: "rgba(59, 130, 246, 0.4)", 
          borderColor: "#3b82f6" 
        },
        series: {
          type: "areaspline",
          fillColor: {
            linearGradient: { x1: 0, x2: 0, y1: 0, y2: 1 },
            stops: [
              [0, "rgba(59, 130, 246, 0.2)"],
              [1, "rgba(59, 130, 246, 0.02)"],
            ],
          },
          color: "#3b82f6",
          lineColor: "#2563eb",
          lineWidth: 1.5,
        },
        xAxis: { lineWidth: 1, lineColor: "rgba(59, 130, 246, 0.2)" },
        yAxis: { lineWidth: 1, lineColor: "rgba(59, 130, 246, 0.2)" },
      },
      scrollbar: { enabled: false },
      xAxis: {
        type: "datetime",
        maxPadding: 0.1,
        ordinal: false,
        lineColor: "rgba(59, 130, 246, 0.2)",
        tickColor: "rgba(59, 130, 246, 0.2)",
        gridLineColor: "rgba(59, 130, 246, 0.08)",
          crosshair: {
            width: 1,
            color: "#ffffff",
            dashStyle: "Dash",
            snap: false,
        },
        labels: { 
          style: { color: "#5e6b80", fontSize: "11px", fontFamily: "Inter, sans-serif", fontWeight: "500" },
          formatter() {
            const date = new Date(Number(this.value));
            return date.toLocaleDateString("en-IN", { month: "short", day: "2-digit" });
          },
        },
      },
      yAxis: {
        opposite: true,
        title: { text: undefined },
        gridLineColor: "rgba(59, 130, 246, 0.08)",
        crosshair: {
          width: 1,
          color: "#ffffff",
          dashStyle: "Dash",
          snap: false,
          label: {
            enabled: false,
            backgroundColor: "#2563eb",
            borderColor: "#60a5fa",
            borderRadius: 4,
            borderWidth: 1,
            padding: 6,
            style: { color: "#ffffff", fontSize: "11px", fontWeight: "700" },
            formatter(value) {
              return formatMoney(value);
            },
          },
        },
        labels: {
          style: { color: "#5e6b80", fontSize: "11px", fontFamily: "Inter, sans-serif", fontWeight: "500" },
          formatter() { return formatMoney(Number(this.value)); },
        },
        // Auto-fit Y axis to actual candle data range
        startOnTick: false,
        endOnTick: false,
        ...(() => {
          // candles = [timestamp, open, high, low, close] — indices 1-4
          if (candles.length === 0) return {};
          const allLows  = candles.map((pt: [number,number,number,number,number]) => pt[3]);
          const allHighs = candles.map((pt: [number,number,number,number,number]) => pt[2]);
          const lo = Math.min(...allLows);
          const hi = Math.max(...allHighs);
          const pad = Math.max((hi - lo) * 0.15, 200);
          return { min: lo - pad, max: hi + pad };
        })(),
      },
      tooltip: {
        enabled: false,
        useHTML: true,
        backgroundColor: "transparent",
        borderWidth: 0,
        shadow: false,
        padding: 0,
        formatter() {
          const p = (this as any).point || this;
          const timestamp = Number(this.x);
          const pointOpen = p.open ?? effectiveStartingBalance;
          const pointHigh = p.high ?? effectiveStartingBalance;
          const pointLow = p.low ?? effectiveStartingBalance;
          const pointClose = p.close ?? effectiveStartingBalance;
          const isUp = pointClose >= pointOpen;
          const changeColor = isUp ? "#10b981" : "#ef4444";
          const changeSign = isUp ? "+" : "";
          const changePercent = pointOpen !== 0 ? ((pointClose - pointOpen) / pointOpen * 100).toFixed(1) : "0.0";
          return `
            <div style="background:rgba(8,9,15,0.98);border:1.5px solid rgba(59,130,246,0.4);border-radius:10px;padding:14px 18px;min-width:240px;box-shadow:0 16px 48px rgba(0,0,0,0.6)">
              <div style="color:#5e6b80;font-size:10px;margin-bottom:12px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase">${new Date(Number(this.x ?? timestamp)).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</div>
              <div style="display:grid;gap:8px;margin-bottom:10px">
                <div style="display:flex;justify-content:space-between;align-items:center"><span style="color:#5e6b80;font-size:11px;font-weight:600">Open</span><span style="color:#e8edf5;font-weight:700;font-size:12px">${formatMoney(pointOpen)}</span></div>
                <div style="display:flex;justify-content:space-between;align-items:center"><span style="color:#5e6b80;font-size:11px;font-weight:600">High</span><span style="color:#10b981;font-weight:700;font-size:12px">${formatMoney(pointHigh)}</span></div>
                <div style="display:flex;justify-content:space-between;align-items:center"><span style="color:#5e6b80;font-size:11px;font-weight:600">Low</span><span style="color:#ef4444;font-weight:700;font-size:12px">${formatMoney(pointLow)}</span></div>
                <div style="border-top:1px solid rgba(59,130,246,0.15);padding-top:8px;display:flex;justify-content:space-between;align-items:center"><span style="color:#5e6b80;font-size:11px;font-weight:600">Close</span><span style="color:${changeColor};font-weight:800;font-size:13px">${formatMoney(pointClose)}</span></div>
              </div>
              <div style="background:rgba(59,130,246,0.08);border-left:2px solid ${changeColor};padding:6px 8px;border-radius:4px;font-size:10px">
                <div style="color:#9aa5ba">Change: <span style="color:${changeColor};font-weight:700">${changeSign}${formatMoney(Math.abs(pointClose - pointOpen))} (${changePercent}%)</span></div>
              </div>
            </div>`;
        },
      },
      plotOptions: {
        candlestick: {
          color: "#673AB7",
          upColor: "#0D9F87",
          lineColor: "#673AB7",
          upLineColor: "#0D9F87",
          states: { hover: { enabled: false } },
          borderRadius: 2,
          lineWidth: 1.5,
        },
      },
      series: [
        {
          type: "candlestick",
          name: "Balance",
          data: candles,
          dataGrouping: { enabled: false },
        },
      ],
    };
  }, [
    formatMoney,
    user.createdAt,
    user.startingBalance,
    user.transactions,
    user.investmentIncluded,
    user.investments,
    currentBalance,
    totalProfit,
    totalLoss,
  ]);

  useEffect(() => {
    const sourceSeries = (candlestickOptions.series as Array<{ type?: string; data?: unknown[] }> | undefined)
      ?.find((series) => series.type === "candlestick");
    applyCandleInterval(wealthChartRef.current?.chart, sourceSeries?.data ?? [], wealthRange);
  }, [candlestickOptions, wealthRange]);

  const wealthOptions: Highcharts.Options = {
    accessibility: { enabled: true },
    chart: {
      type: "areaspline",
      backgroundColor: "transparent",
      height: 300,
      style: { fontFamily: "Inter, system-ui, sans-serif" },
      animation: { duration: 450, easing: "easeOutQuart" } as Highcharts.AnimationOptionsObject,
      // The y-axis is on the right; preserve a clear gutter for currency
      // labels so they never sit on top of the last wealth data point.
      spacing: [8, 72, 14, 12],
      borderRadius: 0,
      zoomType: undefined,
      panning: { enabled: false },
      zooming: { mouseWheel: { enabled: false } },
      reflow: true,
      resetZoomButton: { theme: { display: "none" } },
    },
    title: { text: undefined },
    subtitle: { text: undefined },
    credits: { enabled: false },
    exporting: { 
      enabled: true,
      buttons: {
        contextButton: {
          menuItems: ["downloadPNG", "downloadJPEG", "downloadPDF", "downloadSVG"]
        }
      }
    },
    xAxis: {
      type: "datetime",
      lineColor: "rgba(59, 130, 246, 0.15)",
      tickColor: "rgba(59, 130, 246, 0.15)",
      crosshair: {
        width: 1.5,
        color: "#ffffff",
        dashStyle: "Dash",
      },
      labels: {
        style: { color: "#5e6b80", fontSize: "11px", fontFamily: "Inter, sans-serif", fontWeight: "500" },
        formatter() {
          const date = new Date(Number(this.value));
          return date.toLocaleDateString("en-IN", { month: "short", day: "2-digit" });
        },
      },
      gridLineWidth: 0.8,
      gridLineColor: "rgba(59, 130, 246, 0.06)",
      minorGridLineWidth: 0,
      tickInterval: 7 * 24 * 3600 * 1000,
    },
      yAxis: {
        title: { text: undefined },
        gridLineColor: "rgba(59, 130, 246, 0.12)",
        gridLineWidth: 1,
        crosshair: {
          width: 1,
          color: "#ffffff",
          dashStyle: "Dash",
          snap: false,
          label: {
            enabled: false,
            backgroundColor: "#2563eb",
            borderColor: "#60a5fa",
            borderRadius: 4,
            borderWidth: 1,
            padding: 6,
            style: { color: "#ffffff", fontSize: "11px", fontWeight: "700" },
            formatter(value) {
              return formatMoney(value);
            },
          },
        },
      labels: {
        style: { color: "#5e6b80", fontSize: "12px", fontFamily: "Inter, sans-serif", fontWeight: "600" },
        formatter() { return formatMoney(Number(this.value)); },
      },
      opposite: true,
      // Auto-scale Y axis based on actual data with padding
      startOnTick: false,
      endOnTick: false,
      tickPixelInterval: 60,
      ...(() => {
        const vals = (wealthData as Array<[number, number]>).map(d => d[1]);
        if (vals.length === 0) return {};
        const dataMin = Math.min(...vals);
        const dataMax = Math.max(...vals);
        const padding = (dataMax - dataMin) * 0.15 || 500;
        return { min: dataMin - padding, max: dataMax + padding };
      })(),
    },
    tooltip: {
      enabled: false,
      useHTML: true,
      backgroundColor: "transparent",
      borderWidth: 0,
      shadow: false,
      padding: 0,
      shared: true,
      crosshairs: { width: 1, color: "rgba(96, 165, 250, 0.5)" },
      formatter() {
        const date = new Date(Number(this.x)).toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
        // Get the balance value from the point
        const point = this.points ? this.points[0] : null;
        const value = point ? Number(point.y) : 0;
        const change = value - user.startingBalance;
        const changePercent = user.startingBalance > 0 ? ((change / user.startingBalance) * 100).toFixed(2) : "0";
        const changeColor = change >= 0 ? "#10b981" : "#ef4444";
        const changeIcon = change >= 0 ? "↑" : "↓";
        return `<div style="background:rgba(8,9,15,0.98);border:2px solid rgba(59,130,246,0.6);border-radius:14px;padding:14px 18px;min-width:200px;box-shadow:0 25px 80px rgba(0,0,0,0.9),inset 0 1px 3px rgba(255,255,255,0.15)">
          <div style="color:#5e6b80;font-size:11px;margin-bottom:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase">${date}</div>
          <div style="color:#60a5fa;font-size:20px;font-weight:900;letter-spacing:-0.8px;margin-bottom:10px">${formatMoney(value)}</div>
          <div style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:${changeColor}18;border-radius:10px;border:1.5px solid ${changeColor}40">
            <span style="font-size:16px;color:${changeColor};font-weight:800">${changeIcon}</span>
            <span style="color:${changeColor};font-weight:700;font-size:12px">${formatMoney(Math.abs(change))} (${changePercent}%)</span>
          </div>
        </div>`;
      },
    },
    legend: { enabled: false },
    plotOptions: {
      areaspline: {
        marker: {
          enabled: false,
          radius: 6,
          states: {
            hover: {
              enabled: false,
            },
          },
        },
        fillColor: {
          linearGradient: { x1: 0, x2: 0, y1: 0, y2: 1 },
          stops: [
            [0, "rgba(96, 165, 250, 0.6)"],
            [0.4, "rgba(59, 130, 246, 0.35)"],
            [1, "rgba(59, 130, 246, 0.08)"],
          ],
        },
        stacking: undefined,
        lineWidth: 2.2,
        states: {
          hover: {
            enabled: false,
          },
        },
      },
    },
    series: [
      {
        type: "areaspline",
        name: "Wealth",
        color: "#60a5fa",
        lineWidth: 2.2,
        shadow: {
          color: "rgba(96, 165, 250, 0.5)",
          width: 28,
          offsetX: 0,
          offsetY: 14,
          opacity: 1.1,
        } as Highcharts.ShadowOptionsObject,
        data: wealthData,
      },
    ],
  };

  const profitLossTrendOption = {
    backgroundColor: "transparent",
    animation: { duration: 450, easing: "cubicOut" },
    title: { text: undefined },
    // TradingView-style zoom and pan functionality with better resize handling
    dataZoom: [
      {
        type: 'slider',
        show: false,
        xAxisIndex: [0],
        start: 0,
        end: 100,
        // Prevent zoom reset on resize
        filterMode: 'none'
      },
      {
        type: 'inside',
        xAxisIndex: [0],
        start: 0,
        end: 100,
        zoomOnMouseWheel: false,  // Disable - prevents zoom outside chart
        moveOnMouseMove: false,
        moveOnMouseWheel: false
      }
    ],
    // Better responsive behavior
    responsive: true,
    maintainAspectRatio: false,
    axisPointer: {
      show: false,
      type: "cross",
      triggerOn: "mousemove",
      lineStyle: { color: "#ffffff", type: "dashed", width: 1 },
      crossStyle: { color: "#ffffff", type: "dashed", width: 1 },
      label: { show: false },
    },
    grid: {
      left: 65,
      right: 72,
      top: 10,
      bottom: 38,
      containLabel: true,
      borderColor: "rgba(59, 130, 246, 0.12)",
    },
    legend: {
      top: "bottom",
      icon: "circle",
      itemGap: 28,
      textStyle: { color: "#9aa5ba", fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 700 },
      backgroundColor: "transparent",
      borderColor: "transparent",
      padding: 10,
      inactiveColor: "rgba(94, 107, 128, 0.4)",
    },
    tooltip: {
      show: false,
      trigger: "axis",
      transitionDuration: 0.12,
      axisPointer: { 
        show: false,
        type: "cross", 
        animation: false,
        lineStyle: { color: "#ffffff", type: "dashed", width: 1 },
        crossStyle: { color: "#ffffff", width: 1 },
        label: {
          show: false,
          backgroundColor: "#1d4ed8",
          borderColor: "#60a5fa",
          borderWidth: 1,
          borderRadius: 4,
          padding: [5, 8],
          color: "#ffffff",
        },
      },
      backgroundColor: "transparent",
      borderWidth: 0,
      padding: 0,
      confine: true,
      formatter: (params: unknown) => {
        const items = Array.isArray(params) ? params : [];
        const first = items[0] as { value?: [string | number, number]; axisValue?: string | number };
        const dateValue = first?.value?.[0] ?? first?.axisValue ?? Date.now();
        const date = new Date(Number(dateValue));
        const profit = Number((items[0] as { value?: [string | number, number] } | undefined)?.value?.[1] ?? 0);
        const loss   = Number((items[1] as { value?: [string | number, number] } | undefined)?.value?.[1] ?? 0);
        const net = profit - loss;
        const netColor = net >= 0 ? "#10b981" : "#ef4444";
        return `<div style="background:rgba(8,9,15,0.98);border:2px solid rgba(59,130,246,0.45);border-radius:12px;padding:14px 18px;min-width:220px;box-shadow:0 20px 50px rgba(0,0,0,0.7),inset 0 1px 3px rgba(255,255,255,0.12)">
          <div style="color:#5e6b80;font-size:11px;margin-bottom:3px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase">${date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</div>
          <div style="color:#71809a;font-size:10px;margin-bottom:8px;font-weight:600">Profit and loss before costs</div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;padding:6px 0"><span style="color:#5e6b80;font-size:12px;font-weight:600">Profit</span><span style="color:#10b981;font-weight:700;font-size:13px">${formatMoney(profit)}</span></div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;padding:6px 0"><span style="color:#5e6b80;font-size:12px;font-weight:600">Loss</span><span style="color:#ef4444;font-weight:700;font-size:13px">${formatMoney(loss)}</span></div>
          <div style="border-top:1.5px solid rgba(59,130,246,0.2);padding-top:8px;display:flex;justify-content:space-between;align-items:center"><span style="color:#5e6b80;font-size:11px;font-weight:600">Net P&amp;L before costs</span><span style="color:${netColor};font-weight:800;font-size:13px">${formatMoney(net)}</span></div>
        </div>`;
      },
    },
    xAxis: {
      type: "time",
      splitLine: { show: false },
      axisLine: { lineStyle: { color: "rgba(59, 130, 246, 0.2)", width: 1 } },
      axisLabel: { color: "#5e6b80", fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 600 },
      boundaryGap: false,
      axisPointer: {
        show: false,
        lineStyle: { color: "#ffffff", type: "dashed", width: 1 },
        label: {
          show: false,
          backgroundColor: "#1d4ed8",
          borderColor: "#60a5fa",
          borderWidth: 1,
          borderRadius: 4,
          padding: [5, 8],
          formatter: (params: { value: number }) =>
            new Date(params.value).toLocaleDateString("en-IN", {
              day: "2-digit",
              month: "short",
            }),
        },
      },
    },
    yAxis: {
      type: "value",
      position: "right",
      boundaryGap: [0, "15%"],
      splitLine: { lineStyle: { color: "rgba(59, 130, 246, 0.12)", type: "dashed", width: 1 } },
      axisLabel: { color: "#5e6b80", fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 600, formatter: (value: number) => formatMoney(value) },
      axisLine: { lineStyle: { color: "rgba(59, 130, 246, 0.2)" } },
      axisPointer: {
        show: false,
        lineStyle: { color: "#ffffff", type: "dashed", width: 1 },
        label: {
          show: false,
          backgroundColor: "#1d4ed8",
          borderColor: "#60a5fa",
          borderWidth: 1,
          borderRadius: 4,
          padding: [5, 8],
          formatter: (params: { value: number }) => formatMoney(params.value),
        },
      },
    },
    series: [
      {
        name: "Profit",
        type: "line",
        showSymbol: false,
        smooth: 0.8,
        lineStyle: { width: 2.2, color: "#10b981" },
        itemStyle: { color: "#10b981", borderWidth: 0 },
        areaStyle: {
          color: {
            type: "linear",
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: "rgba(16, 185, 129, 0.4)" },
              { offset: 0.5, color: "rgba(16, 185, 129, 0.2)" },
              { offset: 1, color: "rgba(16, 185, 129, 0.05)" },
            ],
          },
        },
        emphasis: {
          disabled: true,
        },
        data: profitLossData.map((item) => [item.date, item.profit]),
      },
      {
        name: "Loss",
        type: "line",
        showSymbol: false,
        smooth: 0.7,
        lineStyle: { width: 1.8, color: "#ef4444" },
        itemStyle: { color: "#ef4444", borderWidth: 0 },
        areaStyle: {
          color: {
            type: "linear",
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: "rgba(239, 68, 68, 0.35)" },
              { offset: 0.5, color: "rgba(239, 68, 68, 0.18)" },
              { offset: 1, color: "rgba(239, 68, 68, 0.05)" },
            ],
          },
        },
        emphasis: {
          disabled: true,
        },
        data: profitLossData.map((item) => [item.date, item.loss]),
      },
    ],
  };

  return (
    <div className="page-content dashboard-page" ref={dashboardRef}>
      {!user.transactions.length && (
        <div className="storage-info dashboard-intro">
          <div className="storage-icon">+</div>

          <div>
            <strong>You're in. Your dashboard is ready.</strong>

            <p>
              Add your first profit or loss entry to populate the summary cards,
              trend view, and expense breakdown.
            </p>
          </div>

          <button className="primary-button dashboard-intro-button" onClick={onAdd}>
            + Add first transaction
          </button>
        </div>
      )}

      <div className="dashboard-header">
        <div>
          <span className="eyebrow">PERSONAL FINANCE</span>

          <h1>
            {getTimeGreeting(currentHour)}, <span className="dashboard-greeting-name">{user.name.trim()}</span>
            <span
              className="dashboard-live-indicator"
              role="status"
              aria-label="Dashboard active. Data reflects your saved records."
              title="Dashboard active"
            >
              <i aria-hidden="true" />
            </span>
          </h1>

        </div>

        <aside className={`dashboard-weekday-reminder ${weekdayOutlook.status}`} aria-label="Weekday trading reminder">
          <div className="dashboard-weekday-reminder-icon"><BellRing size={17} /></div>
          <div className="dashboard-weekday-reminder-copy">
            <span>{weekdayOutlookIsToday ? "TODAY'S OUTLOOK" : "NEXT TRADING DAY"} · {weekdayOutlook.dayName.toUpperCase()}</span>
            <strong>{weekdayOutlook.status === "caution" ? `A discipline reminder for ${weekdayOutlook.dayName}` : weekdayOutlook.status === "strong" ? `${weekdayOutlook.dayName} has been stronger in your history` : `Your ${weekdayOutlook.dayName} outlook`}</strong>
            <small>{weekdayOutlook.message}</small>
          </div>
          <button type="button" onClick={onOpenNotifications}>Notification center <ArrowRight size={15} /></button>
        </aside>

        <div className="dashboard-actions">
          <label className="dashboard-period-control">
            <span className="sr-only">Dashboard performance period</span>
            <select
              className="period-selector"
              value={dashboardPeriod}
              aria-label="Dashboard performance period"
              onChange={(event) => setDashboardPeriod(event.target.value as typeof dashboardPeriod)}
            >
              {dashboardPerformancePeriods.map((period) => <option key={period.value} value={period.value}>{period.label}</option>)}
            </select>
          </label>

          <button className="secondary-button" onClick={async () => {
            const { exportFinanceToExcel } = await import("../utils/excel");
            exportFinanceToExcel(user);
          }}>
            <Download size={17} />
            Export Excel
          </button>

          <button className="primary-button" onClick={onAdd}>
            + Add today's result
          </button>
        </div>
      </div>

      {configuredDailyLossLimit > 0 && (
        <section className={`dashboard-risk-guard ${dailyLossLimitState}`} aria-label="Daily loss limit status" role="status">
          <div className="dashboard-risk-guard-icon"><ShieldAlert size={18} /></div>
          <div className="dashboard-risk-guard-copy">
            <strong>{dailyLossLimitState === "reached" ? "Daily loss limit reached" : dailyLossLimitState === "approaching" ? "Approaching your daily loss limit" : "Daily loss guard"}</strong>
            <span>{formatCurrency(todayLossUsed, user.currency)} of {formatCurrency(configuredDailyLossLimit, user.currency)} used · Today’s net P&amp;L {formatCurrency(todayNetPnl, user.currency)}</span>
            <div className="dashboard-risk-guard-track" aria-label={`${Math.round(dailyLossLimitProgress)}% of daily loss limit used`}>
              <i style={{ width: `${dailyLossLimitProgress}%` }} />
            </div>
          </div>
          <span className="dashboard-risk-guard-value">{Math.round(dailyLossLimitProgress)}%</span>
        </section>
      )}

      <div className="stats-grid">
        <StatCard
          title="Current balance"
          value={currentBalance}
          formatValue={(value) => formatCurrency(value, user.currency)}
          subtitle={
            `${formatCurrency(Math.abs(netPerformance), user.currency)} ${netPerformance >= 0 ? "above" : "below"} starting balance${user.investmentIncluded && (user.investments ?? []).length > 0 ? " · includes investments" : ""}`
          }
          positive={netPerformance >= 0}
          icon={<Wallet size={19} />}
          colorVariant="blue"
        />

        <StatCard
          title="Total profit"
          value={dashboardPerformanceIncludesCosts ? periodStats.totalProfit : periodStats.grossProfit}
          formatValue={(value) => formatCurrency(value, user.currency)}
          subtitle={`${dashboardPerformanceIncludesCosts ? periodStats.profitCount : periodStats.grossProfitCount} profitable trades · ${dashboardPerformanceIncludesCosts ? "after costs" : "before costs"} · ${dashboardPeriodLabel.toLowerCase()}`}
          positive
          icon={<TrendingUp size={19} />}
          colorVariant="green"
        />

        <StatCard
          title="Total loss"
          value={dashboardPerformanceIncludesCosts ? periodStats.totalLoss : periodStats.grossLoss}
          formatValue={(value) => formatCurrency(value, user.currency)}
          subtitle={`${dashboardPerformanceIncludesCosts ? periodStats.lossCount : periodStats.grossLossCount} losing trades · ${dashboardPerformanceIncludesCosts ? "after costs" : "before costs"} · ${dashboardPeriodLabel.toLowerCase()}`}
          positive={false}
          icon={<TrendingDown size={19} />}
          colorVariant="red"
        />

        <StatCard
          title="Net performance"
          value={dashboardPerformanceIncludesCosts ? periodStats.net : periodStats.grossNet}
          formatValue={(value) => formatCurrency(value, user.currency)}
          subtitle={`${(dashboardPerformanceIncludesCosts ? periodStats.returnPercentage : periodStats.grossReturnPercentage) === null ? "Return unavailable" : `${(dashboardPerformanceIncludesCosts ? periodStats.returnPercentage : periodStats.grossReturnPercentage)! >= 0 ? "+" : ""}${(dashboardPerformanceIncludesCosts ? periodStats.returnPercentage : periodStats.grossReturnPercentage)!.toFixed(1)}% return`} · ${dashboardPerformanceIncludesCosts ? "after costs" : "before costs"} · ${dashboardPeriodLabel}`}
          positive={(dashboardPerformanceIncludesCosts ? periodStats.net : periodStats.grossNet) >= 0}
          icon={<BarChart3 size={19} />}
          colorVariant={(dashboardPerformanceIncludesCosts ? periodStats.net : periodStats.grossNet) >= 0 ? "green" : "amber"}
          headerAction={<label className="dashboard-pnl-cost-toggle" title="Include transaction costs in dashboard performance" onClick={(event) => event.stopPropagation()}><span>Costs</span><input type="checkbox" role="switch" checked={dashboardPerformanceIncludesCosts} onChange={(event) => setDashboardPerformanceIncludesCosts(event.target.checked)} aria-label="Include transaction costs in dashboard performance" /></label>}
        />
      </div>

      <div className="stats-grid" style={{ opacity: 0.9 }}>
        <StatCard
          title="Win Rate"
          value={periodStats.winRate}
          formatValue={(value) => `${value.toFixed(1)}%`}
          subtitle={`${periodStats.profitCount} wins, ${periodStats.lossCount} losses · ${dashboardPeriodLabel.toLowerCase()}`}
          positive={periodStats.winRate >= 50}
          icon={<TrendingUp size={19} />}
          colorVariant="purple"
        />

        <StatCard
          title="Avg Profit/Trade"
          value={periodStats.avgProfitPerTrade}
          formatValue={(value) => formatCurrency(value, user.currency)}
          subtitle={`${periodStats.profitCount} profitable trades · ${dashboardPeriodLabel.toLowerCase()}`}
          positive
          icon={<TrendingUp size={19} />}
          colorVariant="green"
          onClick={() => openAverageTradeChart("profit")}
        />

        <StatCard
          title="Avg Loss/Trade"
          value={periodStats.avgLossPerTrade}
          formatValue={(value) => formatCurrency(value, user.currency)}
          subtitle={`${periodStats.lossCount} losing trades · ${dashboardPeriodLabel.toLowerCase()}`}
          positive={false}
          icon={<TrendingDown size={19} />}
          colorVariant="red"
          onClick={() => openAverageTradeChart("loss")}
        />

        <StatCard
          title="Total Trades"
          value={periodStats.totalTrades}
          formatValue={(value) => value.toFixed(0)}
          subtitle={`${dashboardPeriodLabel} transactions`}
          positive
          icon={<BarChart3 size={19} />}
          colorVariant="blue"
        />
      </div>

      <div className="stats-grid">
        <StatCard
          title="Today P&L"
          value={todayPnlIncludesCosts ? todayStats.net : todayStats.gross}
          formatValue={(value) => formatCurrency(value, user.currency)}
          subtitle={`${todayStats.trades} ${todayStats.trades === 1 ? "trade" : "trades"} today · ${todayPnlIncludesCosts ? "after costs" : "before costs"}`}
          positive={(todayPnlIncludesCosts ? todayStats.net : todayStats.gross) >= 0}
          icon={<CalendarDays size={19} />}
          colorVariant={(todayPnlIncludesCosts ? todayStats.net : todayStats.gross) >= 0 ? "green" : "red"}
          onClick={() => { setDailyPnlPage(0); setDailyPnlOpen(true); }}
          headerAction={(
            <label className="dashboard-pnl-cost-toggle" title="Include transaction costs in Today P&L" onClick={(event) => event.stopPropagation()}>
              <span>Costs</span>
              <input
                type="checkbox"
                role="switch"
                aria-label="Include costs in Today P&L"
                checked={todayPnlIncludesCosts}
                onChange={(event) => setTodayPnlIncludesCosts(event.target.checked)}
              />
            </label>
          )}
        />

        <StatCard
          title="1-Year Performance"
          value={oneYearPerformance.net}
          formatValue={(value) => formatCurrency(value, user.currency)}
          subtitle={`${oneYearPerformance.trades} trades · ${oneYearPerformance.returnPercentage === null ? "return % unavailable (no opening balance)" : `${oneYearPerformance.returnPercentage >= 0 ? "+" : ""}${oneYearPerformance.returnPercentage.toFixed(1)}% vs. opening balance`}`}
          positive={oneYearPerformance.net >= 0}
          icon={<CalendarDays size={19} />}
          colorVariant={oneYearPerformance.net >= 0 ? "green" : "red"}
        />
        <StatCard
          title="Peak Profit"
          value={peakProfit}
          formatValue={(value) => formatCurrency(value, user.currency)}
          valueCaption="Peak profit"
          secondaryLabel="All-time trade result"
          secondaryValue={formatCurrency(transactionNetPnl, user.currency)}
          subtitle={peakProfit > 0
            ? `${formatCurrency(Math.max(0, peakProfit - transactionNetPnl), user.currency)} below best · ${drawdownFromPeakPercent.toFixed(1)}% of best profit erased`
            : "No profit recorded yet"}
          positive={drawdownFromPeakPercent === 0}
          icon={<TrendingUp size={19} />}
          colorVariant="green"
          onClick={() => openPeakTradeChart("profit")}
        />

        <StatCard
          title="Peak Loss"
          value={peakLoss}
          formatValue={(value) => formatCurrency(value, user.currency)}
          valueCaption="Peak loss"
          secondaryLabel="All-time trade result"
          secondaryValue={formatCurrency(transactionNetPnl, user.currency)}
          subtitle={peakLoss < 0
            ? `Up ${formatCurrency(Math.max(0, transactionNetPnl - peakLoss), user.currency)} from worst · ${recoveryFromPeakLossPercent.toFixed(1)}% recovered`
            : "No losses recorded yet"}
          positive={recoveryFromPeakLossPercent > 0}
          icon={<TrendingDown size={19} />}
          colorVariant="red"
          onClick={() => openPeakTradeChart("loss")}
        />
      </div>

      <div className="charts-two-column dashboard-chart-grid">
        <ChartPanel
          className="dashboard-overview-chart"
          title="Wealth Chart"
          subtitle="Your wealth over time, built from profits and losses"
          onClick={() =>
            setFullscreenChart({
              title: "Wealth Chart",
              subtitle: "Your wealth over time, built from profits and losses",
              kind: "highcharts",
              highchartsOptions: wealthOptions,
              stockOptions: candlestickOptions,
              defaultChartMode: "candlestick",
            })
          }
        >
          <ChartRangeDropdown value={wealthRange} onChange={setWealthRange} />
          <HighchartsStockChart
            ref={wealthChartRef}
            highcharts={HighchartsStock}
            constructorType="stockChart"
            options={candlestickOptions}
          />
        </ChartPanel>

        <section className="dashboard-risk-snapshot" aria-label="Selected-period risk and return metrics">
          <div className="dashboard-risk-heading"><div><span>RISK &amp; RETURN</span><h2>Performance quality</h2><p>Trade-level results for {dashboardPeriodLabel.toLowerCase()}</p></div><small>Based on saved transactions</small></div>
          <div className="dashboard-risk-metrics">
            <article title="Total profitable transaction results divided by total losing transaction results for the selected period.">
              <span>Profit factor</span>
              <strong>{periodStats.profitFactor == null ? (periodStats.totalTrades ? "∞" : "—") : periodStats.profitFactor.toFixed(2)}</strong>
              <small>{periodStats.profitFactor == null ? (periodStats.totalTrades ? "No losses recorded in this period" : "No trades in this period") : "Net gains per unit of net losses"}</small>
            </article>
            <article title="Average signed P&amp;L per recorded transaction in the selected period.">
              <span>Expectancy per trade</span>
              <strong className={periodStats.expectancy >= 0 ? "positive" : "negative"}>{periodStats.totalTrades ? formatCurrency(periodStats.expectancy, user.currency) : "—"}</strong>
              <small>{periodStats.totalTrades ? `Average net result across ${periodStats.totalTrades} trades` : "No trades in this period"}</small>
            </article>
            <article title="Largest daily decline from a previous high-water mark during the selected period.">
              <span>Maximum drawdown</span>
              <strong className={periodStats.maxDrawdown > 0 ? "negative" : "positive"}>{periodStats.totalTrades ? formatCurrency(periodStats.maxDrawdown, user.currency) : "—"}</strong>
              <small>{!periodStats.totalTrades ? "No trades in this period" : periodStats.maxDrawdownPercent == null ? "Peak-equity percentage unavailable" : `${periodStats.maxDrawdownPercent.toFixed(2)}% of peak equity`}</small>
            </article>
            <article title="Selected-period net result divided by maximum drawdown. This describes how net gains compare with the largest recorded decline.">
              <span>Recovery factor</span>
              <strong className={periodStats.recoveryFactor == null ? "neutral" : periodStats.recoveryFactor >= 0 ? "positive" : "negative"}>{periodStats.recoveryFactor == null ? "—" : `${periodStats.recoveryFactor.toFixed(2)}×`}</strong>
              <small>{periodStats.recoveryFactor == null ? "No drawdown recorded in this period" : "Net result ÷ maximum drawdown"}</small>
            </article>
          </div>
        </section>

        {(user.investments ?? []).some((holding) => !holding.isClosed) && <section className="dashboard-portfolio-lens" aria-label="Portfolio exposure and scenario analysis">
          <div className="dashboard-portfolio-lens-heading">
            <div><span>PORTFOLIO ANALYTICS</span><h2>Portfolio mix &amp; what-if scenarios</h2><p>{portfolioTypeFilter === "all" ? "Open positions and estimated value changes" : `${INVESTMENT_TYPE_LABELS[portfolioTypeFilter]} holdings and estimated value changes`}</p></div>
            <div className="dashboard-portfolio-heading-controls">
              <label className="dashboard-portfolio-type-filter"><span>Asset type</span><select value={portfolioTypeFilter} onChange={(event) => setPortfolioTypeFilter(event.target.value as InvestmentType | "all")} aria-label="Filter portfolio scenarios by asset type">
                <option value="all">All asset types</option>
                {INVESTMENT_TYPE_OPTIONS.map((type) => <option key={type} value={type}>{INVESTMENT_TYPE_LABELS[type]}</option>)}
              </select></label>
              <div className="dashboard-portfolio-total"><small>{portfolioTypeFilter === "all" ? "All open holdings · saved values" : `${INVESTMENT_TYPE_LABELS[portfolioTypeFilter]} · saved values`}</small><strong>{formatCurrency(portfolioLens.marketValue, user.currency)}</strong></div>
            </div>
          </div>
          <div className="dashboard-portfolio-lens-grid">
            <div className="dashboard-exposure-panel">
              <div className="dashboard-exposure-title"><strong>Portfolio mix</strong><span>{portfolioLens.openHoldings.length} open {portfolioLens.openHoldings.length === 1 ? "holding" : "holdings"}</span></div>
              {portfolioLens.openHoldings.length === 0 && <p className="dashboard-portfolio-filter-empty">No open holdings for this asset type.</p>}
              {portfolioLens.exposureRows.map((row) => <div className="dashboard-exposure-row" key={row.type}>
                <div><span>{INVESTMENT_TYPE_LABELS[row.type as InvestmentType] ?? row.type.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())}</span><b>{formatCurrency(row.value, user.currency)} <small>{row.share.toFixed(1)}%</small></b></div>
                <i aria-hidden="true"><span style={{ width: `${Math.min(100, row.share)}%` }} /></i>
              </div>)}
              <div className="dashboard-exposure-insights">
                <article><span>Largest position</span><strong>{portfolioLens.largestHolding?.name ?? "—"}</strong><small>{portfolioLens.largestHoldingShare.toFixed(1)}% of open value</small></article>
                <article title="A value-weighted estimate of how evenly your current portfolio is spread. Higher values mean a more even spread."><span>Diversification equivalent</span><strong>{portfolioLens.effectiveHoldingCount.toFixed(1)} equal-sized holdings</strong><small>Higher means value is spread more evenly</small></article>
              </div>
            </div>
            <div className="dashboard-scenario-panel">
              <div className="dashboard-exposure-title"><strong>Estimated value after a move</strong><span>What-if scenarios</span></div>
              <p>See how your saved total changes if all open positions move by the same percentage.</p>
              <div className="dashboard-scenario-grid">{portfolioLens.scenarios.map((scenario) => <article className={scenario.shock < 0 ? "down" : scenario.shock > 0 ? "up" : "base"} key={scenario.shock}>
                <span>{scenario.shock > 0 ? "+" : ""}{scenario.shock}%</span>
                <strong>{scenario.shock === 0 ? formatCurrency(scenario.resultingValue, user.currency) : `${scenario.change > 0 ? "+" : "−"}${formatCurrency(Math.abs(scenario.change), user.currency)}`}</strong>
                <small>{scenario.shock === 0 ? "Current value" : `Value after shock: ${formatCurrency(scenario.resultingValue, user.currency)}`}</small>
              </article>)}</div>
              <small className="dashboard-scenario-note">Illustrative only: applies one uniform shock to saved values; it is not a forecast and does not model asset-specific behavior, fees, or liquidity.</small>
            </div>
          </div>
        </section>}



        <section className="dashboard-conviction" aria-label="Confidence level outcomes">
          <div className="dashboard-conviction-heading"><div><span>DECISION QUALITY</span><h2>Confidence and outcomes</h2><p>Compare saved confidence ratings with realized results · {dashboardPeriodLabel}</p></div><small>{periodStats.conviction.bands.reduce((sum, band) => sum + band.count, 0)} rated records</small></div>
          <div className="dashboard-conviction-summary">
            <article>
              <span>High vs. low average net result</span>
              <strong className={periodStats.conviction.highLowExpectancyGap == null ? "neutral" : periodStats.conviction.highLowExpectancyGap >= 0 ? "positive" : "negative"}>{periodStats.conviction.highLowExpectancyGap == null ? "Need more data" : `${periodStats.conviction.highLowExpectancyGap >= 0 ? "+" : ""}${formatCurrency(periodStats.conviction.highLowExpectancyGap, user.currency)} / record`}</strong>
              <small>{periodStats.conviction.highLowExpectancyGap == null ? "Need at least 5 records in both confidence bands" : "Per-record average · higher confidence minus lower confidence"}</small>
            </article>
            <div className="dashboard-conviction-legend"><span><i className="outcome" /> Realized win rate</span><span><i className="confidence" /> Average saved confidence</span></div>
          </div>
          <div className="dashboard-conviction-bands">
            {periodStats.conviction.bands.map((band) => <article key={band.key}>
              <div className="dashboard-conviction-band-label"><strong>{band.label}</strong><small>{band.range} score</small></div>
              <div className="dashboard-conviction-band-visual">
                <div className="dashboard-conviction-track" role="img" aria-label={band.count ? `${band.label}: ${band.winRate!.toFixed(1)} percent realized win rate and ${band.avgConfidence!.toFixed(1)} average saved confidence rating` : `${band.label}: no rated records`}>
                  <span className="outcome" style={{ width: `${band.winRate ?? 0}%` }} />
                  {band.avgConfidence != null && <i className="confidence" style={{ left: `${band.avgConfidence}%` }} />}
                </div>
                <div className="dashboard-conviction-band-values">
                  <b>{band.winRate == null ? "—" : `${band.winRate.toFixed(1)}% realized wins`}</b>
                  <span>{band.avgConfidence == null ? "No ratings" : `${band.avgConfidence.toFixed(0)} avg rating`}</span>
                  <span className={band.winRate == null || band.avgConfidence == null ? "rating-gap neutral" : `rating-gap ${band.winRate - band.avgConfidence >= 0 ? "positive" : "negative"}`}>
                    {band.winRate == null || band.avgConfidence == null ? "Rating gap —" : `Rating gap ${band.winRate - band.avgConfidence >= 0 ? "+" : "−"}${Math.abs(band.winRate - band.avgConfidence).toFixed(0)} pts`}
                  </span>
                </div>
              </div>
              <div className="dashboard-conviction-band-result"><strong className={band.averageResult == null ? "neutral" : band.averageResult >= 0 ? "positive" : "negative"}>{band.averageResult == null ? "—" : formatCurrency(band.averageResult, user.currency)}</strong><span>avg net / record</span><small>{band.count} {band.count === 1 ? "record" : "records"}{band.count > 0 && band.count < 5 ? " · early sample" : ""}</small></div>
            </article>)}
          </div>
          <p className="dashboard-conviction-note">Confidence is a subjective decision rating, not a probability. Rating gap compares realized win rate with the average rating for context only; it is not a calibration score. Bands with fewer than 5 records are early samples.</p>
        </section>

        {periodStats.riskUnits.count > 0 && <section className="dashboard-risk-unit-lab" aria-label="Risk-normalized trade performance">
          <div className="dashboard-risk-unit-heading"><div><span>RISK-NORMALIZED PERFORMANCE</span><h2>R-multiple lab</h2><p>Measure trade outcomes against the amount you planned to risk · {dashboardPeriodLabel}</p></div><small>{periodStats.riskUnits.count} of {periodStats.riskUnits.total} records risk-tagged</small></div>
          <>
            <div className="dashboard-risk-unit-metrics">
              <article><span>Expectancy</span><strong className={periodStats.riskUnits.expectancy! >= 0 ? "positive" : "negative"}>{periodStats.riskUnits.expectancy! >= 0 ? "+" : ""}{periodStats.riskUnits.expectancy!.toFixed(2)}R</strong><small>Average net result per risk-tagged record</small></article>
              <article><span>Median outcome</span><strong className={periodStats.riskUnits.median! >= 0 ? "positive" : "negative"}>{periodStats.riskUnits.median! >= 0 ? "+" : ""}{periodStats.riskUnits.median!.toFixed(2)}R</strong><small>Middle outcome · less affected by outliers</small></article>
              <article><span>R profit factor</span><strong>{periodStats.riskUnits.profitFactor === Number.POSITIVE_INFINITY ? "∞" : periodStats.riskUnits.profitFactor!.toFixed(2)}</strong><small>Sum of winning R ÷ absolute losing R</small></article>
              <article><span>Average win / loss</span><strong>{periodStats.riskUnits.averageWin == null ? "—" : `+${periodStats.riskUnits.averageWin.toFixed(2)}R`} / {periodStats.riskUnits.averageLoss == null ? "—" : `${periodStats.riskUnits.averageLoss.toFixed(2)}R`}</strong><small>Average winning R · average losing R</small></article>
              <article><span>Risk data coverage</span><strong>{periodStats.riskUnits.total ? `${(periodStats.riskUnits.count / periodStats.riskUnits.total * 100).toFixed(0)}%` : "—"}</strong><small>{periodStats.riskUnits.count} of {periodStats.riskUnits.total} records include planned risk</small></article>
            </div>
            <div className="dashboard-r-distribution">
              <div className="dashboard-r-distribution-heading"><strong>Realized outcome distribution</strong><span>Each record = net P&amp;L ÷ planned risk</span></div>
              <div className="dashboard-r-bins">{periodStats.riskUnits.distribution.map((bin) => <div className="dashboard-r-bin" key={bin.label}>
                <div className="dashboard-r-bin-bar"><span className={bin.tone} style={{ height: `${bin.width}%` }} /></div>
                <b>{bin.count}</b><small>{bin.label}</small>
              </div>)}</div>
            </div>
          </>
          <p className="dashboard-risk-unit-note">R-multiple normalizes gains and losses by each trade’s own planned risk, so differently sized records can be compared. It is only as reliable as the risk amounts entered; it does not infer stops or assume a risk amount for older trades.</p>
        </section>}

        <ChartPanel
          className="dashboard-overview-chart"
          title="Profit & Loss Trend"
          subtitle="How profit and loss move over time"
          onClick={() =>
            setFullscreenChart({
              title: "Profit & Loss Trend",
              subtitle: "How profit and loss move over time",
              kind: "echarts",
              echartsOption: profitLossTrendOption,
              timeInOutcome: (() => {
                const profitDays = dailyPnlHistory.filter((day) => day.gross > 0).length;
                const lossDays = dailyPnlHistory.filter((day) => day.gross < 0).length;
                const totalDays = profitDays + lossDays;
                return {
                  profitPercent: totalDays ? (profitDays / totalDays) * 100 : 0,
                  lossPercent: totalDays ? (lossDays / totalDays) * 100 : 0,
                  profitDays,
                  lossDays,
                  totalDays,
                };
              })(),
            })
          }
        >
          <div className="dashboard-profit-loss-chart">
            <EChartsChart
              option={profitLossTrendOption}
              onChartReady={(instance) => {
                profitLossChartRef.current = instance;
                requestAnimationFrame(() => instance.resize());
              }}
              style={{ height: 300, width: "100%" }}
              notMerge
              lazyUpdate
            />
          </div>
        </ChartPanel>
      </div>

      {fullscreenChart && (
        <Suspense fallback={null}>
        <ChartFullscreenModal
          open
          title={fullscreenChart.title}
          subtitle={fullscreenChart.subtitle}
          kind={fullscreenChart.kind}
          highchartsOptions={fullscreenChart.highchartsOptions}
          stockOptions={fullscreenChart.stockOptions}
          defaultChartMode={fullscreenChart.defaultChartMode}
          drawingStorageKey={`${user.id}.wealth`}
          echartsOption={fullscreenChart.echartsOption}
          timeInOutcome={fullscreenChart.timeInOutcome}
          onClose={closeFullscreenChart}
        />
        </Suspense>
      )}
      {averageTradeChart && (
        <div className="average-trade-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setAverageTradeChart(null); }}>
          <section className="average-trade-dialog" role="dialog" aria-modal="true" aria-labelledby="average-trade-dialog-title">
            <header>
              <div><span className="eyebrow">TRADE PERFORMANCE</span><h2 id="average-trade-dialog-title">{averageTradeChart.title}</h2><p>{averageTradeChart.subtitle}</p></div>
              <button type="button" aria-label="Close average trade chart" onClick={() => setAverageTradeChart(null)}><X size={19} /></button>
            </header>
            <div className="average-trade-dialog-summary">
              <article><span>Average per trade</span><strong>{formatCurrency(averageTradeChart.average, user.currency)}</strong></article>
              <article><span>Trades in period</span><strong>{averageTradeChart.tradeCount}</strong></article>
            </div>
            {averageTradeChart.tradeCount ? (
              <div className="average-trade-dialog-chart"><HighchartsStockChart highcharts={Highcharts} options={averageTradeChart.options} allowChartUpdate={false} /></div>
            ) : (
              <div className="average-trade-dialog-empty">No matching trades in this period.</div>
            )}
          </section>
        </div>
      )}
      {peakTradeChart && (
        <div className="peak-trade-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setPeakTradeChart(null); }}>
          <section className="peak-trade-dialog" role="dialog" aria-modal="true" aria-labelledby="peak-trade-dialog-title">
            <header>
              <div><span className="eyebrow">ALL-TIME PERFORMANCE</span><h2 id="peak-trade-dialog-title">{peakTradeChart.title}</h2><p>{peakTradeChart.subtitle}</p></div>
              <button type="button" aria-label="Close peak performance chart" onClick={() => setPeakTradeChart(null)}><X size={19} /></button>
            </header>
            <div className="peak-trade-dialog-summary">
              <article><span>{peakTradeChart.title.replace(" History", "")}</span><strong className={peakTradeChart.title.includes("Profit") ? "profit" : "loss"}>{formatCurrency(peakTradeChart.peak, user.currency)}</strong></article>
              <article><span>All-time trade result</span><strong>{formatCurrency(peakTradeChart.current, user.currency)}</strong></article>
              <article><span>{peakTradeChart.changeLabel}</span><strong>{formatCurrency(peakTradeChart.changeValue, user.currency)}</strong><small>{Math.abs(peakTradeChart.peak) > 0 ? `${(peakTradeChart.changeValue / Math.abs(peakTradeChart.peak) * 100).toFixed(1)}%` : "0.0%"} of peak value</small></article>
              <article><span>Recorded trades</span><strong>{peakTradeChart.tradeCount}</strong></article>
            </div>
            {peakTradeChart.tradeCount ? (
              <div className="peak-trade-dialog-chart"><HighchartsStockChart highcharts={Highcharts} options={peakTradeChart.options} allowChartUpdate={false} /></div>
            ) : (
              <div className="peak-trade-dialog-empty">No recorded trades to chart yet.</div>
            )}
          </section>
        </div>
      )}
      {dailyPnlOpen && (
        <div className="daily-pnl-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDailyPnlOpen(false); }}>
          <section className="daily-pnl-dialog" role="dialog" aria-modal="true" aria-labelledby="daily-pnl-dialog-title">
            <header>
              <div><span className="eyebrow">PERFORMANCE HISTORY</span><h2 id="daily-pnl-dialog-title">Daily profit &amp; loss</h2><p>Every recorded trading day, with the trades that make up its result.</p></div>
              <div className="daily-pnl-header-actions">
                <label className="daily-pnl-cost-control"><span>Include costs</span><input type="checkbox" role="switch" checked={todayPnlIncludesCosts} onChange={(event) => { setTodayPnlIncludesCosts(event.target.checked); setDailyPnlPage(0); }} /></label>
                <button type="button" aria-label="Close daily P&L history" onClick={() => setDailyPnlOpen(false)}><X size={19} /></button>
              </div>
            </header>
            {dailyPnlHistory.length ? <>
              <div className="daily-pnl-summary-strip" aria-label="All-time daily performance summary">
                <article><span>Net P&amp;L</span><strong className={dailyPnlSummary.net >= 0 ? "profit" : "loss"}>{formatCurrency(dailyPnlSummary.net, user.currency)}</strong><small>{todayPnlIncludesCosts ? "After costs" : "Before costs"}</small></article>
                <article><span>Trading days</span><strong>{dailyPnlHistory.length}</strong><small>{dailyPnlSummary.trades} recorded trades</small></article>
                <article><span>Profitable days</span><strong className="profit">{dailyPnlSummary.profitDays}</strong><small>{dailyPnlSummary.profitDays + dailyPnlSummary.lossDays ? `${Math.round(dailyPnlSummary.profitDays / (dailyPnlSummary.profitDays + dailyPnlSummary.lossDays) * 100)}% of active days` : "No active days"}</small></article>
                <article><span>Losing days</span><strong className="loss">{dailyPnlSummary.lossDays}</strong><small>Daily net below zero</small></article>
              </div>
              <div className="daily-pnl-history-tools">
                <label className="daily-pnl-search"><Search size={16} /><input type="search" value={dailyPnlSearch} onChange={(event) => { setDailyPnlSearch(event.target.value); setDailyPnlPage(0); }} placeholder="Search notes, categories, or dates" aria-label="Search daily P&L history" /></label>
                <div className="daily-pnl-filter-group" role="group" aria-label="Filter daily results">
                  {(["all", "profit", "loss"] as const).map((filter) => <button key={filter} type="button" className={dailyPnlFilter === filter ? "active" : ""} aria-pressed={dailyPnlFilter === filter} onClick={() => { setDailyPnlFilter(filter); setDailyPnlPage(0); }}>{filter === "all" ? "All days" : filter === "profit" ? "Profitable" : "Losing"}</button>)}
                </div>
                <label className="daily-pnl-sort"><ArrowDownUp size={14} /><select value={dailyPnlSort} onChange={(event) => { setDailyPnlSort(event.target.value as "newest" | "oldest"); setDailyPnlPage(0); }} aria-label="Sort trading days"><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label>
              </div>
              <div className="daily-pnl-dialog-list">
                {visibleDailyPnl.length ? visibleDailyPnl.map((day) => <article className="daily-pnl-day" key={day.key}>
                  <div className="daily-pnl-day-heading">
                    <div className="daily-pnl-day-copy">
                      <strong>{day.date.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</strong>
                      <div className="daily-pnl-day-summary">
                        <span>{day.trades.length} {day.trades.length === 1 ? "trade" : "trades"}</span>
                        <span className="daily-pnl-positive">Profit {formatCurrency(day.profit, user.currency)}</span>
                        <span className="daily-pnl-negative">Loss {formatCurrency(day.loss, user.currency)}</span>
                      </div>
                    </div>
                    <div className="daily-pnl-day-result"><small>{todayPnlIncludesCosts ? "NET AFTER COSTS" : "NET BEFORE COSTS"}</small><b className={(todayPnlIncludesCosts ? day.net : day.gross) >= 0 ? "profit" : "loss"}>{formatCurrency(todayPnlIncludesCosts ? day.net : day.gross, user.currency)}</b></div>
                  </div>
                  <div className="daily-pnl-trades">{day.trades.map((trade) => {
                    const tradeDate = parseLocalDate(trade.date);
                    const signedAmount = trade.type === "profit" ? trade.amount : -trade.amount;
                    const shownAmount = todayPnlIncludesCosts ? signedAmount : signedAmount + (trade.costAmount ?? 0);
                    return <div className="daily-pnl-trade" key={trade.id}>
                      <span className="daily-pnl-trade-time">{tradeDate?.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</span>
                      <span className="daily-pnl-trade-note">{trade.note?.trim() || trade.category || "Trade"}</span>
                      <small>{trade.category || "Uncategorized"}{(trade.costAmount ?? 0) > 0 ? ` · Costs ${formatCurrency(trade.costAmount ?? 0, user.currency)}` : ""}</small>
                      <b className={shownAmount >= 0 ? "profit" : "loss"}>{formatCurrency(shownAmount, user.currency)}</b>
                    </div>;
                })}</div>
                </article>) : <div className="daily-pnl-empty"><strong>No matching trading days</strong><span>Adjust your search or result filter to see more history.</span><button type="button" onClick={() => { setDailyPnlSearch(""); setDailyPnlFilter("all"); setDailyPnlPage(0); }}>Clear filters</button></div>}
              </div>
              {filteredDailyPnlHistory.length > 0 && <footer className="daily-pnl-pagination">
                <span>Showing {dailyPnlPage * dailyPnlPageSize + 1}–{Math.min((dailyPnlPage + 1) * dailyPnlPageSize, filteredDailyPnlHistory.length)} of {filteredDailyPnlHistory.length} days · {todayPnlIncludesCosts ? "After costs" : "Before costs"}</span>
                <div><button type="button" onClick={() => setDailyPnlPage((page) => Math.max(0, page - 1))} disabled={dailyPnlPage === 0} aria-label="Previous days"><ChevronLeft size={16} /> Previous</button><span>Page {dailyPnlPage + 1} of {dailyPnlPageCount}</span><button type="button" onClick={() => setDailyPnlPage((page) => Math.min(dailyPnlPageCount - 1, page + 1))} disabled={dailyPnlPage >= dailyPnlPageCount - 1} aria-label="Next days">Next <ChevronRight size={16} /></button></div>
              </footer>}
            </> : <div className="daily-pnl-empty">No trading results have been recorded yet.</div>}
          </section>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
