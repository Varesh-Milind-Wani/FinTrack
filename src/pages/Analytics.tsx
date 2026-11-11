import { useMemo, useState } from "react";
import Highcharts from "highcharts";
import HighchartsReact from "highcharts-react-official";
import ReactECharts from "echarts-for-react";
import {
  BarChart3,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
  TrendingDown,
  Wallet,
  DollarSign,
  Lock,
  LockOpen,
  Pencil,
  Check,
  CalendarDays,
  RotateCcw,
  BellRing,
  ArrowRight,
} from "lucide-react";

import ChartPanel from "../components/ChartPanel";
import { calculateDailyPnlVolatility } from "../utils/volatility";
import { calculateDailyTradeVolume, calculateTradeVolume } from "../utils/tradeVolume";
import { getWeekdayOutlook } from "../utils/weekdayNotifications";

import type { UserAccount } from "../types/finance";
const CHART_GRID_LINE_COLOR = "rgba(148, 163, 184, 0.08)";

const HighchartsChart =
  (HighchartsReact as unknown as {
    default?: typeof HighchartsReact;
  }).default ?? HighchartsReact;

const EChartsChart =
  (ReactECharts as unknown as {
    default?: typeof ReactECharts;
  }).default ?? ReactECharts;

interface Props {
  user: UserAccount;
  onSave?: (updatedUser: UserAccount) => void;
  onOpenNotifications?: () => void;
}

const formatMoney = (value: number, currency: string = "INR") =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);

const formatPreciseMoney = (value: number, currency: string = "INR") =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);

const formatChartMoney = (value: number, currency: string = "INR") =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 3,
  }).format(Number.isFinite(value) ? value : 0);

const parseLocalDate = (value: string) => {
  const date = value.includes("T")
    ? new Date(value)
    : new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
};

const getDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const WORKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const getEffectiveWorkdayDate = (date: Date) => {
  const effectiveDate = new Date(date);
  if (effectiveDate.getDay() === 6) effectiveDate.setDate(effectiveDate.getDate() - 1);
  if (effectiveDate.getDay() === 0) effectiveDate.setDate(effectiveDate.getDate() + 1);
  return effectiveDate;
};

const Analytics = ({ user, onSave, onOpenNotifications }: Props) => {
  const [isEditingCost, setIsEditingCost] = useState(false);
  const [costInput, setCostInput] = useState(String(user.defaultCostAmount ?? 0));
  const [isCostLocked, setIsCostLocked] = useState(user.costLocked ?? false);
  const [period, setPeriod] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [comparePrevious, setComparePrevious] = useState(false);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [granularity, setGranularity] = useState("month");
  const [selectedWeekday, setSelectedWeekday] = useState<string | null>(null);
  const [selectedWeekdayPage, setSelectedWeekdayPage] = useState(1);
  const dailyPnlVolatilityPoints = useMemo(
    () => calculateDailyPnlVolatility(user.transactions),
    [user.transactions],
  );
  const currentDailyPnlVolatility = dailyPnlVolatilityPoints.at(-1);
  const dailyPnlVolatilityDate = (date: string) => new Intl.DateTimeFormat("en-IN", {
    day: "2-digit", month: "short", year: "numeric", timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
  const dailyVolatilityChartOption = useMemo(() => {
    const points = dailyPnlVolatilityPoints.slice(-30);
    return {
      animation: false,
      grid: { top: 20, right: 10, bottom: 24, left: 42 },
      tooltip: {
        trigger: "axis",
        formatter: (items: Array<{ dataIndex: number }>) => {
          const point = points[items[0]?.dataIndex ?? -1];
          return point ? `${dailyPnlVolatilityDate(point.date)}<br/>${point.direction === "up" ? "P&L up" : point.direction === "down" ? "P&L down" : "Unchanged"}: ${point.percent.toFixed(2)}%` : "";
        },
      },
      xAxis: { type: "category", data: points.map((point) => point.date), boundaryGap: true, axisLabel: { color: "#7f8799", fontSize: 9, formatter: (value: string) => value.slice(5) }, axisLine: { lineStyle: { color: "#303744" } }, axisTick: { show: false } },
      yAxis: { type: "value", min: 0, axisLabel: { color: "#7f8799", fontSize: 9, formatter: (value: number) => `${value}%` }, splitLine: { lineStyle: { color: CHART_GRID_LINE_COLOR } } },
      series: [{
        name: "Daily P&L volatility",
        type: "bar",
        barMaxWidth: 18,
        data: points.map((point) => ({ value: point.percent, itemStyle: { color: point.direction === "up" ? "#22d3a6" : point.direction === "down" ? "#fb5265" : "#94a3b8", borderRadius: [3, 3, 0, 0] } })),
      }],
    };
  }, [dailyPnlVolatilityPoints]);
  const filteredTransactions = useMemo(() => {
    const now = new Date();
    let start: Date | null = null;
    if (period === "today") start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (period === "week") { start = new Date(now); start.setDate(now.getDate() - ((now.getDay() + 6) % 7)); start.setHours(0, 0, 0, 0); }
    if (period === "month") start = new Date(now.getFullYear(), now.getMonth(), 1);
    if (period === "lastMonth") start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    if (period === "3m") start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    if (period === "6m") start = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    if (period === "year") start = new Date(now.getFullYear(), 0, 1);
    const end = period === "lastMonth" ? new Date(now.getFullYear(), now.getMonth(), 1) : null;
    return user.transactions.filter((tx) => {
      const date = parseLocalDate(tx.date);
      return date && (!start || date >= start) && (!end || date < end)
        && (!fromDate || getDateKey(date) >= fromDate) && (!toDate || getDateKey(date) <= toDate)
        && (categoryFilter === "all" || tx.category === categoryFilter)
        && (typeFilter === "all" || tx.type === typeFilter);
    });
  }, [user.transactions, period, fromDate, toDate, categoryFilter, typeFilter]);
  const dailyFinancialRows = useMemo(() => {
    const byDate = new Map<string, { date: string; net: number }>();
    filteredTransactions.forEach((transaction) => {
      const parsed = parseLocalDate(transaction.date);
      if (!parsed) return;
      const date = getDateKey(parsed);
      const row = byDate.get(date) ?? { date, net: 0 };
      row.net += transaction.type === "profit" ? transaction.amount : -transaction.amount;
      byDate.set(date, row);
    });
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredTransactions]);
  const profitableDays = dailyFinancialRows.filter((row) => row.net > 0);
  const losingDays = dailyFinancialRows.filter((row) => row.net < 0);
  const flatDays = dailyFinancialRows.filter((row) => row.net === 0);
  const profitableDayRate = dailyFinancialRows.length
    ? (profitableDays.length / dailyFinancialRows.length) * 100
    : 0;
  const averageGreenDay = profitableDays.length
    ? profitableDays.reduce((sum, row) => sum + row.net, 0) / profitableDays.length
    : null;
  const averageRedDay = losingDays.length
    ? losingDays.reduce((sum, row) => sum + Math.abs(row.net), 0) / losingDays.length
    : null;
  const bestPnlDay = dailyFinancialRows.reduce<(typeof dailyFinancialRows)[number] | null>(
    (best, row) => !best || row.net > best.net ? row : best,
    null,
  );
  const worstPnlDay = dailyFinancialRows.reduce<(typeof dailyFinancialRows)[number] | null>(
    (worst, row) => !worst || row.net < worst.net ? row : worst,
    null,
  );
  const dailyOutcomeRows = useMemo(() => {
    const byDate = new Map<string, { date: string; wins: number; losses: number }>();
    filteredTransactions.forEach((transaction) => {
      const date = parseLocalDate(transaction.date);
      if (!date) return;
      const key = getDateKey(date);
      const row = byDate.get(key) ?? { date: key, wins: 0, losses: 0 };
      if (transaction.type === "profit") row.wins += 1;
      else row.losses += 1;
      byDate.set(key, row);
    });
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-30);
  }, [filteredTransactions]);
  const dailyTradeVolumeRows = useMemo(
    () => calculateDailyTradeVolume(user.transactions),
    [user.transactions],
  );
  const dailyTradeVolumeOption = useMemo(() => ({
    animation: false,
    grid: { top: 28, right: 8, bottom: 24, left: 46 },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (params: unknown) => {
        const points = (Array.isArray(params) ? params : []) as { axisValue?: string; seriesName?: string; value?: number }[];
        const date = points[0]?.axisValue;
        return date ? `<strong>${dailyPnlVolatilityDate(date)}</strong><br/>${points.map((point) => `${point.seriesName}: ${formatMoney(Number(point.value ?? 0), user.currency)}`).join("<br/>")}` : "";
      },
    },
    legend: { top: 0, right: 0, itemWidth: 8, itemHeight: 8, textStyle: { color: "#8995a8", fontSize: 9 } },
    xAxis: { type: "category", data: dailyTradeVolumeRows.map((row) => row.date), axisLabel: { color: "#7f8799", fontSize: 9, interval: Math.max(0, Math.ceil(dailyTradeVolumeRows.length / 6) - 1), formatter: (value: string) => value.slice(5) }, axisLine: { lineStyle: { color: "#303744" } }, axisTick: { show: false } },
    yAxis: { type: "value", axisLabel: { color: "#7f8799", fontSize: 9, formatter: (value: number) => formatMoney(value, user.currency) }, splitLine: { lineStyle: { color: CHART_GRID_LINE_COLOR } } },
    series: [
      { name: "Transaction volume", type: "bar", barMaxWidth: 16, itemStyle: { color: "#4d8dff", borderRadius: [3, 3, 0, 0] }, data: dailyTradeVolumeRows.map((row) => row.total) },
    ],
  }), [dailyTradeVolumeRows, user.currency]);
  const dailyTransactionCostRows = useMemo(() => {
    const byDate = new Map<string, { date: string; total: number }>();
    filteredTransactions.forEach((transaction) => {
      const parsed = parseLocalDate(transaction.date);
      if (!parsed) return;
      const date = getDateKey(parsed);
      const row = byDate.get(date) ?? { date, total: 0 };
      row.total += Math.max(0, transaction.costAmount ?? 0);
      byDate.set(date, row);
    });
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredTransactions]);
  const dailyTransactionCostOption = useMemo(() => ({
    animation: false,
    grid: { top: 28, right: 8, bottom: 24, left: 46 },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (params: unknown) => {
        const points = (Array.isArray(params) ? params : []) as { axisValue?: string; seriesName?: string; value?: number }[];
        const date = points[0]?.axisValue;
        return date ? `<strong>${dailyPnlVolatilityDate(date)}</strong><br/>${points.map((point) => `${point.seriesName}: ${formatMoney(Number(point.value ?? 0), user.currency)}`).join("<br/>")}` : "";
      },
    },
    legend: { top: 0, right: 0, itemWidth: 8, itemHeight: 8, textStyle: { color: "#8995a8", fontSize: 9 } },
    xAxis: { type: "category", data: dailyTransactionCostRows.map((row) => row.date), axisLabel: { color: "#7f8799", fontSize: 9, interval: Math.max(0, Math.ceil(dailyTransactionCostRows.length / 6) - 1), formatter: (value: string) => value.slice(5) }, axisLine: { lineStyle: { color: "#303744" } }, axisTick: { show: false } },
    yAxis: { type: "value", axisLabel: { color: "#7f8799", fontSize: 9, formatter: (value: number) => formatMoney(value, user.currency) }, splitLine: { lineStyle: { color: CHART_GRID_LINE_COLOR } } },
    series: [
      { name: "Transaction costs", type: "bar", barMaxWidth: 16, itemStyle: { color: "#f5a524", borderRadius: [3, 3, 0, 0] }, data: dailyTransactionCostRows.map((row) => row.total) },
    ],
  }), [dailyTransactionCostRows, user.currency]);
  const dailyOutcomeOption = useMemo(() => ({
    animation: false,
    grid: { top: 24, right: 8, bottom: 24, left: 30 },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (params: unknown) => {
        const points = (Array.isArray(params) ? params : []) as { axisValue?: string; seriesName?: string; value?: number }[];
        const date = points[0]?.axisValue;
        return date ? `<strong>${dailyPnlVolatilityDate(date)}</strong><br/>${points.map((point) => `${point.seriesName}: ${Number(point.value ?? 0)}`).join("<br/>")}` : "";
      },
    },
    legend: { top: 0, right: 0, itemWidth: 8, itemHeight: 8, textStyle: { color: "#8995a8", fontSize: 9 } },
    xAxis: { type: "category", data: dailyOutcomeRows.map((row) => row.date), axisLabel: { color: "#7f8799", fontSize: 9, interval: Math.max(0, Math.ceil(dailyOutcomeRows.length / 6) - 1), formatter: (value: string) => value.slice(5) }, axisLine: { lineStyle: { color: "#303744" } }, axisTick: { show: false } },
    yAxis: { type: "value", minInterval: 1, axisLabel: { color: "#7f8799", fontSize: 9 }, splitLine: { lineStyle: { color: CHART_GRID_LINE_COLOR } } },
    series: [
      { name: "Wins", type: "bar", stack: "outcomes", barMaxWidth: 16, itemStyle: { color: "#22d3a6", borderRadius: [3, 3, 0, 0] }, data: dailyOutcomeRows.map((row) => row.wins) },
      { name: "Losses", type: "bar", stack: "outcomes", barMaxWidth: 16, itemStyle: { color: "#fb5265", borderRadius: [3, 3, 0, 0] }, data: dailyOutcomeRows.map((row) => row.losses) },
    ],
  }), [dailyOutcomeRows]);
  const transactionCount = filteredTransactions.length;
  const filteredSummary = useMemo(() => filteredTransactions.reduce((totals, transaction) => {
    if (transaction.type === "profit") {
      totals.totalProfit += transaction.grossAmount ?? transaction.amount;
      totals.netProfitTotal += transaction.amount;
      totals.profitCount += 1;
    } else if (transaction.type === "loss") {
      totals.totalLoss += transaction.grossAmount ?? transaction.amount;
      totals.netLossTotal += transaction.amount;
      totals.lossCount += 1;
    }
    totals.totalCosts += transaction.costAmount ?? 0;
    return totals;
  }, { totalProfit: 0, totalLoss: 0, netProfitTotal: 0, netLossTotal: 0, totalCosts: 0, profitCount: 0, lossCount: 0 }), [filteredTransactions]);
  const { totalProfit, totalLoss, netProfitTotal, netLossTotal, totalCosts, profitCount, lossCount } = filteredSummary;
  const tradeVolumeSummary = useMemo(() => calculateTradeVolume(user.transactions), [user.transactions]);
  const previousPeriodNet = useMemo(() => {
    if ((fromDate || toDate) && period !== "custom") return null;
    const now = new Date();
    let start: Date | null = null;
    let end: Date | null = null;
    if (period === "today") { start = new Date(now.getFullYear(), now.getMonth(), now.getDate()); end = new Date(start); end.setDate(end.getDate() + 1); }
    if (period === "week") { start = new Date(now); start.setDate(now.getDate() - ((now.getDay() + 6) % 7)); start.setHours(0, 0, 0, 0); end = new Date(start); end.setDate(end.getDate() + 7); }
    if (period === "month") { start = new Date(now.getFullYear(), now.getMonth(), 1); end = new Date(now.getFullYear(), now.getMonth() + 1, 1); }
    if (period === "lastMonth") { start = new Date(now.getFullYear(), now.getMonth() - 1, 1); end = new Date(now.getFullYear(), now.getMonth(), 1); }
    if (period === "3m") { start = new Date(now.getFullYear(), now.getMonth() - 2, 1); end = new Date(now.getFullYear(), now.getMonth() + 1, 1); }
    if (period === "6m") { start = new Date(now.getFullYear(), now.getMonth() - 5, 1); end = new Date(now.getFullYear(), now.getMonth() + 1, 1); }
    if (period === "year") { start = new Date(now.getFullYear(), 0, 1); end = new Date(now.getFullYear() + 1, 0, 1); }
    if (period === "custom" && fromDate && toDate) { start = new Date(`${fromDate}T00:00:00`); end = new Date(`${toDate}T00:00:00`); end.setDate(end.getDate() + 1); }
    if (!start || !end) return null;
    const duration = end.getTime() - start.getTime();
    const previousStart = new Date(start.getTime() - duration);
    const previous = user.transactions.filter((tx) => {
      const date = parseLocalDate(tx.date);
      return date && date >= previousStart && date < start!
        && (categoryFilter === "all" || tx.category === categoryFilter)
        && (typeFilter === "all" || tx.type === typeFilter);
    });
    return previous.reduce((sum, tx) => sum + (tx.type === "profit" ? tx.amount : -tx.amount), 0);
  }, [user.transactions, period, fromDate, toDate, categoryFilter, typeFilter]);

  const totalMovement = totalProfit + totalLoss;
  const profitShareRatio = totalMovement > 0 ? (totalProfit / totalMovement) * 100 : 0;
  const handleSaveCost = () => {
    const nextCost = Number(costInput);
    if (!Number.isFinite(nextCost) || nextCost < 0) {
      return;
    }
    if (onSave) {
      onSave({
        ...user,
        defaultCostAmount: nextCost,
        costLocked: isCostLocked,
      });
    }
    setIsEditingCost(false);
  };

  const streakSummary = useMemo(() => {
    const orderedTransactions = [...filteredTransactions]
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
          left.parsedDate.getTime() - right.parsedDate.getTime()
      );

    if (!orderedTransactions.length) {
      return {
        profitBeforeLoss: null as number | null,
        lossBeforeProfit: null as number | null,
      };
    }

    const profitRuns: number[] = [];
    const lossRuns: number[] = [];

    let currentType = orderedTransactions[0].type;
    let currentLength = 1;

    for (let index = 1; index < orderedTransactions.length; index += 1) {
      const nextType = orderedTransactions[index].type;

      if (nextType === currentType) {
        currentLength += 1;
        continue;
      }

      if (currentType === "profit" && nextType === "loss") {
        profitRuns.push(currentLength);
      }

      if (currentType === "loss" && nextType === "profit") {
        lossRuns.push(currentLength);
      }

      currentType = nextType;
      currentLength = 1;
    }

    const average = (values: number[]) =>
      values.length
        ? values.reduce((sum, value) => sum + value, 0) / values.length
        : null;

    return {
      profitBeforeLoss: average(profitRuns),
      lossBeforeProfit: average(lossRuns),
    };
  }, [filteredTransactions]);

  const monthlyData = useMemo(() => {
    const months: Record<
      string,
      {
        profit: number;
        loss: number;
      }
    > = {};

    filteredTransactions.forEach((transaction) => {
      const month = new Date(transaction.date).toLocaleDateString("en-IN", {
        month: "short",
        year: "numeric",
      });

      if (!months[month]) {
        months[month] = {
          profit: 0,
          loss: 0,
        };
      }

      months[month][transaction.type] += transaction.amount;
    });

    return Object.entries(months).slice(-8);
  }, [filteredTransactions]);

  const categoryData = useMemo(() => {
    const categories: Record<string, number> = {};

    filteredTransactions
      .filter((transaction) => transaction.type === "loss")
      .forEach((transaction) => {
        categories[transaction.category] =
          (categories[transaction.category] || 0) + transaction.amount;
      });

    return Object.entries(categories)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [filteredTransactions]);

  const signedNet = filteredTransactions.reduce((sum, tx) => sum + (tx.type === "profit" ? tx.amount : -tx.amount), 0);
  const winRate = transactionCount ? (profitCount / transactionCount) * 100 : 0;
  const averageWin = profitCount ? netProfitTotal / profitCount : 0;
  const averageLoss = lossCount ? netLossTotal / lossCount : 0;
  const profitFactor = netLossTotal ? netProfitTotal / netLossTotal : (netProfitTotal ? null : 0);
  const expectancy = transactionCount ? filteredTransactions.reduce((sum, tx) => sum + (tx.type === "profit" ? tx.amount : -tx.amount), 0) / transactionCount : 0;
  const tradeDistribution = useMemo(() => {
    const rows = filteredTransactions.map((tx) => tx.type === "profit" ? tx.amount : -tx.amount).sort((a, b) => a - b);
    const best = rows.length ? rows[rows.length - 1] : null;
    const worst = rows.length ? rows[0] : null;
    return { best, worst };
  }, [filteredTransactions]);
  const bestFiveTrades = useMemo(() => [...filteredTransactions]
    .sort((a, b) => (b.type === "profit" ? b.amount : -b.amount) - (a.type === "profit" ? a.amount : -a.amount))
    .slice(0, 5), [filteredTransactions]);
  const worstFiveTrades = useMemo(() => [...filteredTransactions]
    .sort((a, b) => (a.type === "profit" ? a.amount : -a.amount) - (b.type === "profit" ? b.amount : -b.amount))
    .slice(0, 5), [filteredTransactions]);
  const transactionCosts = totalCosts;
  const categories = useMemo(() => [...new Set(user.transactions.map((tx) => tx.category).filter(Boolean))].sort(), [user.transactions]);
  const cumulativeRows = useMemo(() => {
    const grouped = new Map<string, number>();
    filteredTransactions.forEach((tx) => {
      const date = parseLocalDate(tx.date);
      if (!date) return;
      let key = getDateKey(date);
      if (granularity === "month") key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      if (granularity === "year") key = String(date.getFullYear());
      if (granularity === "week") {
        const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
        key = getDateKey(monday);
      }
      grouped.set(key, (grouped.get(key) ?? 0) + (tx.type === "profit" ? tx.amount : -tx.amount));
    });
    let running = 0;
    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, amount]) => { running += amount; return { key, amount, cumulative: running }; });
  }, [filteredTransactions, granularity]);
  const drawdownRows = useMemo(() => {
    const byDay = new Map<string, number>();
    filteredTransactions.forEach((tx) => {
      const date = parseLocalDate(tx.date);
      if (!date) return;
      const key = getDateKey(date);
      byDay.set(key, (byDay.get(key) ?? 0) + (tx.type === "profit" ? tx.amount : -tx.amount));
    });
    let running = 0;
    let peak = 0;
    return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, net]) => {
      running += net;
      peak = Math.max(peak, running);
      const drawdown = running - peak;
      const peakEquity = user.startingBalance + peak;
      return {
        date,
        net,
        cumulative: running,
        peak,
        equity: user.startingBalance + running,
        peakEquity,
        drawdown,
        drawdownPct: peakEquity > 0 ? (drawdown / peakEquity) * 100 : null,
      };
    });
  }, [filteredTransactions, user.startingBalance]);
  const drawdownSummary = useMemo(() => {
    let currentUnderwaterDays = 0;
    let longestUnderwaterDays = 0;
    drawdownRows.forEach((row) => {
      if (row.drawdown < 0) {
        currentUnderwaterDays += 1;
        longestUnderwaterDays = Math.max(longestUnderwaterDays, currentUnderwaterDays);
      } else {
        currentUnderwaterDays = 0;
      }
    });
    const trough = drawdownRows.reduce<(typeof drawdownRows)[number] | null>(
      (worst, row) => !worst || row.drawdown < worst.drawdown ? row : worst,
      null,
    );
    const percentTrough = drawdownRows.reduce<(typeof drawdownRows)[number] | null>(
      (worst, row) => row.drawdownPct != null
        && (!worst || worst.drawdownPct == null || Math.abs(row.drawdownPct) > Math.abs(worst.drawdownPct))
        ? row
        : worst,
      null,
    );
    return {
      amount: trough ? Math.abs(trough.drawdown) : 0,
      percent: percentTrough?.drawdownPct == null ? null : Math.abs(percentTrough.drawdownPct),
      troughDate: trough?.date ?? null,
      percentTroughDate: percentTrough?.date ?? null,
      currentAmount: drawdownRows.at(-1) ? Math.abs(drawdownRows.at(-1)!.drawdown) : 0,
      longestUnderwaterDays,
      currentUnderwaterDays: (drawdownRows.at(-1)?.drawdown ?? 0) < 0 ? currentUnderwaterDays : 0,
    };
  }, [drawdownRows]);
  const weekdayRows = useMemo(() => {
    const rows = Array.from({ length: 5 }, (_, day) => ({
      day,
      name: WORKDAY_NAMES[day],
      profit: 0,
      loss: 0,
      net: 0,
      count: 0,
      winningTrades: 0,
      losingTrades: 0,
      activeSessions: 0,
      averageDailyNet: 0,
      medianDailyNet: 0,
    }));
    const dailyNet = new Map<string, { weekday: number; net: number }>();
    filteredTransactions.forEach((tx) => {
      const rawDate = parseLocalDate(tx.date);
      if (!rawDate) return;
      const date = getEffectiveWorkdayDate(rawDate);
      const weekday = (date.getDay() + 6) % 7;
      const row = rows[weekday];
      row[tx.type] += tx.grossAmount ?? tx.amount;
      row.net += tx.type === "profit" ? tx.amount : -tx.amount;
      row.count += 1;
      if (tx.type === "profit") row.winningTrades += 1;
      else row.losingTrades += 1;
      const key = getDateKey(date);
      const day = dailyNet.get(key) ?? { weekday, net: 0 };
      day.net += tx.type === "profit" ? tx.amount : -tx.amount;
      dailyNet.set(key, day);
    });
    const dailyNetsByWeekday = Array.from({ length: 5 }, () => [] as number[]);
    dailyNet.forEach(({ weekday, net }) => {
      rows[weekday].activeSessions += 1;
      rows[weekday].averageDailyNet += net;
      dailyNetsByWeekday[weekday].push(net);
    });
    return rows.map((row) => {
      const orderedDailyNets = dailyNetsByWeekday[row.day].sort((a, b) => a - b);
      const middle = Math.floor(orderedDailyNets.length / 2);
      const medianDailyNet = orderedDailyNets.length === 0
        ? 0
        : orderedDailyNets.length % 2
          ? orderedDailyNets[middle]
          : (orderedDailyNets[middle - 1] + orderedDailyNets[middle]) / 2;
      return {
        ...row,
        averageDailyNet: row.activeSessions ? row.averageDailyNet / row.activeSessions : 0,
        medianDailyNet,
      };
    });
  }, [filteredTransactions]);
  const selectedWeekdayTransactions = useMemo(() => {
    if (!selectedWeekday) return [];
    return filteredTransactions
      .filter((tx) => {
        const date = parseLocalDate(tx.date);
        return date && WORKDAY_NAMES[(getEffectiveWorkdayDate(date).getDay() + 6) % 7] === selectedWeekday;
      })
      .sort((a, b) => (parseLocalDate(b.date)?.getTime() ?? 0) - (parseLocalDate(a.date)?.getTime() ?? 0));
  }, [filteredTransactions, selectedWeekday]);
  const weekdayTradesPageSize = 7;
  const weekdayTradesPageCount = Math.max(1, Math.ceil(selectedWeekdayTransactions.length / weekdayTradesPageSize));
  const activeWeekdayTradesPage = Math.min(selectedWeekdayPage, weekdayTradesPageCount);
  const visibleWeekdayTransactions = selectedWeekdayTransactions.slice(
    (activeWeekdayTradesPage - 1) * weekdayTradesPageSize,
    activeWeekdayTradesPage * weekdayTradesPageSize,
  );
  const openWeekdayTrades = (weekday: string) => {
    setSelectedWeekdayPage(1);
    setSelectedWeekday(weekday);
  };
  const filteredExpenses = useMemo(() => {
    const now = new Date();
    let start: Date | null = null;
    if (period === "today") start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (period === "week") { start = new Date(now); start.setDate(now.getDate() - ((now.getDay() + 6) % 7)); start.setHours(0, 0, 0, 0); }
    if (period === "month") start = new Date(now.getFullYear(), now.getMonth(), 1);
    if (period === "lastMonth") start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    if (period === "3m") start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    if (period === "6m") start = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    if (period === "year") start = new Date(now.getFullYear(), 0, 1);
    const end = period === "lastMonth" ? new Date(now.getFullYear(), now.getMonth(), 1) : null;
    return (user.expenses ?? []).filter((expense) => {
      const date = parseLocalDate(expense.date);
      return date && (!start || date >= start) && (!end || date < end)
        && (!fromDate || getDateKey(date) >= fromDate) && (!toDate || getDateKey(date) <= toDate);
    });
  }, [user.expenses, period, fromDate, toDate]);
  const expenseRows = useMemo(() => {
    const grouped = new Map<string, number>();
    filteredExpenses.forEach((expense) => {
      grouped.set(expense.category || "Other", (grouped.get(expense.category || "Other") ?? 0) + expense.amount);
    });
    return [...grouped.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [filteredExpenses]);
  const investmentAnalysis = useMemo(() => {
    const holdings = (user.investments ?? []).map((holding) => {
      const quantity = holding.quantity ?? 1;
      const value = holding.isClosed
        ? (holding.exitPrice != null ? holding.exitPrice * quantity : holding.currentValue)
        : holding.currentValue;
      const appreciation = holding.directPnl ?? (value - holding.amount);
      const returnPct = holding.amount > 0 ? (appreciation / holding.amount) * 100 : 0;
      return { ...holding, value, appreciation, returnPct };
    });
    const open = holdings.filter((holding) => !holding.isClosed);
    const closed = holdings.filter((holding) => holding.isClosed);
    const investedCapital = holdings.reduce((sum, holding) => sum + holding.amount, 0);
    const openCapital = open.reduce((sum, holding) => sum + holding.amount, 0);
    const marketValue = open.reduce((sum, holding) => sum + holding.value, 0);
    const realized = closed.reduce((sum, holding) => sum + holding.appreciation, 0);
    const unrealized = open.reduce((sum, holding) => sum + holding.appreciation, 0);
    const totalAppreciation = realized + unrealized;
    const largestHolding = [...open].sort((a, b) => b.value - a.value)[0] ?? null;
    const byType = new Map<string, { value: number; invested: number; appreciation: number }>();
    open.forEach((holding) => {
      const row = byType.get(holding.type) ?? { value: 0, invested: 0, appreciation: 0 };
      row.value += holding.value;
      row.invested += holding.amount;
      row.appreciation += holding.appreciation;
      byType.set(holding.type, row);
    });
    return {
      holdings,
      open,
      investedCapital,
      openCapital,
      marketValue,
      realized,
      unrealized,
      totalAppreciation,
      returnPct: investedCapital > 0 ? totalAppreciation / investedCapital * 100 : 0,
      openReturnPct: openCapital > 0 ? unrealized / openCapital * 100 : 0,
      profitableOpenCount: open.filter((holding) => holding.appreciation > 0).length,
      largestHolding,
      largestHoldingSharePct: marketValue > 0 && largestHolding ? largestHolding.value / marketValue * 100 : 0,
      openRanked: [...open].sort((a, b) => b.appreciation - a.appreciation).slice(0, 12),
      byType: [...byType.entries()].map(([type, row]) => ({
        type,
        ...row,
        holdingCount: open.filter((holding) => holding.type === type).length,
        allocationPct: marketValue > 0 ? row.value / marketValue * 100 : 0,
        returnPct: row.invested > 0 ? row.appreciation / row.invested * 100 : 0,
      })).sort((a, b) => b.value - a.value),
      best: [...holdings].sort((a, b) => b.returnPct - a.returnPct)[0] ?? null,
      worst: [...holdings].sort((a, b) => a.returnPct - b.returnPct)[0] ?? null,
    };
  }, [user.investments]);
  const holdingsAppreciationOption = {
    backgroundColor: "transparent",
    grid: { left: 96, right: 25, top: 12, bottom: 28, containLabel: true },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, backgroundColor: "#171b22", borderColor: "#303744", textStyle: { color: "#fff" }, formatter: (params: unknown) => {
      const point = (Array.isArray(params) ? params[0] : null) as { name?: string; value?: number; dataIndex?: number } | null;
      const holding = investmentAnalysis.openRanked[point?.dataIndex ?? -1];
      return holding ? `${holding.name}<br/>Unrealized P&amp;L: ${formatMoney(holding.appreciation, user.currency)}<br/>Return on cost: ${holding.returnPct.toFixed(2)}%<br/>Current value: ${formatMoney(holding.value, user.currency)}<br/>Cost basis: ${formatMoney(holding.amount, user.currency)}` : "";
    } },
    xAxis: { type: "value", axisLabel: { color: "#7f8799", formatter: (value: number) => formatMoney(value, user.currency) }, splitLine: { lineStyle: { color: "rgba(148,163,184,.08)" } } },
    yAxis: { type: "category", inverse: true, data: investmentAnalysis.openRanked.map((holding) => holding.name), axisLabel: { color: "#aab5c7", width: 90, overflow: "truncate" }, axisLine: { lineStyle: { color: "#303744" } } },
    series: [{ type: "bar", name: "Unrealized P&L", markLine: { silent: true, symbol: "none", lineStyle: { color: "#718096", type: "dashed" }, data: [{ xAxis: 0 }] }, data: investmentAnalysis.openRanked.map((holding) => ({ value: holding.appreciation, itemStyle: { color: holding.appreciation >= 0 ? "#36d399" : "#ff667d", borderRadius: [0, 4, 4, 0] } })), barMaxWidth: 16 }],
  };
  const allocationOption = {
    backgroundColor: "transparent",
    tooltip: { trigger: "item", backgroundColor: "#171b22", borderColor: "#303744", textStyle: { color: "#fff" }, formatter: (params: unknown) => {
      const point = params as { dataIndex?: number };
      const row = investmentAnalysis.byType[point.dataIndex ?? -1];
      return row ? `${row.type.replaceAll("_", " ")}<br/>Market value: ${formatMoney(row.value, user.currency)} (${row.allocationPct.toFixed(1)}%)<br/>Cost basis: ${formatMoney(row.invested, user.currency)}<br/>Unrealized P&amp;L: ${formatMoney(row.appreciation, user.currency)}<br/>Return on cost: ${row.returnPct.toFixed(2)}%<br/>Holdings: ${row.holdingCount}` : "";
    } },
    legend: { bottom: 0, textStyle: { color: "#aab5c7" } },
    graphic: [{ type: "text", left: "center", top: "41%", style: { text: formatMoney(investmentAnalysis.marketValue, user.currency), fill: "#edf2f8", fontSize: 17, fontWeight: 700, textAlign: "center" } }],
    series: [{ type: "pie", radius: ["48%", "72%"], center: ["50%", "45%"], label: { color: "#cbd5e1", formatter: "{d}%" }, data: investmentAnalysis.byType.map((row) => ({ name: row.type.replaceAll("_", " "), value: row.value })) }],
  };

  const activityOptions: Highcharts.Options = {
    accessibility: {
      enabled: false,
    },
    chart: {
      type: "column",
      backgroundColor: "transparent",
      height: 340,
    },
    title: {
      text: undefined,
    },
    credits: {
      enabled: false,
    },
    xAxis: {
      categories: monthlyData.map(([label]) => label),
      labels: {
        style: {
          color: "#7f8799",
        },
      },
      lineColor: "#252b36",
    },
    yAxis: {
      min: 0,
      title: {
        text: undefined,
      },
      gridLineColor: "#222731",
      labels: {
        style: {
          color: "#7f8799",
        },
        formatter() {
          return formatMoney(Number(this.value), user.currency);
        },
      },
    },
    tooltip: {
      shared: true,
      backgroundColor: "#171b22",
      borderColor: "#303744",
      style: {
        color: "#ffffff",
      },
      formatter: function () {
        const context = this as unknown as { x?: string | number; points?: Array<{ series: { name: string }; y?: number }> };
        const values = context.points ?? [];
        return [String(context.x ?? ""), ...values.map((point) => `${point.series.name}: ${formatChartMoney(Number(point.y ?? 0), user.currency)}`)].join("<br/>");
      },
    },
    legend: {
      itemStyle: {
        color: "#cbd0dc",
      },
    },
    plotOptions: {
      column: {
        borderRadius: 6,
        grouping: true,
        pointPadding: 0.12,
        groupPadding: 0.18,
        minPointLength: 8,
      },
      series: {
        marker: {
          enabled: false,
        },
      },
    },
    series: [
      {
        type: "column",
        name: "Profit",
        color: "#36d399",
        data: monthlyData.map(([, values]) => values.profit),
      },
      {
        type: "column",
        name: "Loss",
        color: "#ff5f70",
        data: monthlyData.map(([, values]) => values.loss),
      },
    ],
  };

  const distributionOption = {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "item",
      backgroundColor: "#171b22",
      borderColor: "#303744",
      textStyle: {
        color: "#ffffff",
      },
      formatter: "{b}<br/>{c} ({d}%)",
    },
    legend: {
      top: "bottom",
      textStyle: {
        color: "#cbd0dc",
      },
    },
    series: [
      {
      name: "Expense categories",
        type: "pie",
        radius: ["54%", "80%"],
        center: ["50%", "42%"],
        itemStyle: {
          borderColor: "#0f1218",
          borderWidth: 2,
        },
        label: {
          color: "#d7dde8",
        },
        data:
          expenseRows.length > 0
            ? expenseRows.map((item, index) => ({
                name: item.name,
                value: item.value,
                itemStyle: {
                  color: [
                    "#4d8dff",
                    "#36d399",
                    "#f7c65f",
                    "#ff5f70",
                    "#8b5cf6",
                    "#22c55e",
                  ][index % 6],
                },
              }))
            : [
                {
                  name: "No recorded expenses",
                  value: 1,
                  itemStyle: {
                    color: "#303642",
                  },
                },
              ],
      },
    ],
  };

  const healthOption = {
    backgroundColor: "transparent",
    series: [
      {
        type: "gauge",
        startAngle: 180,
        endAngle: 0,
        center: ["50%", "59%"],
        radius: "88%",
        min: 0,
        max: 100,
        progress: {
          show: true,
          roundCap: true,
          width: 18,
          itemStyle: {
            color:
              profitableDayRate >= 60
                ? "#36d399"
                : profitableDayRate >= 40
                  ? "#f7c65f"
                  : "#ff5f70",
          },
        },
        axisLine: {
          roundCap: true,
          lineStyle: {
            width: 18,
            color: [[1, "#20242d"]],
          },
        },
        axisTick: {
          show: false,
        },
        splitLine: {
          show: false,
        },
        axisLabel: {
          show: false,
        },
        pointer: {
          show: false,
        },
        detail: {
          valueAnimation: true,
          formatter: "{value}%",
          color: "#eef2f8",
          fontSize: 28,
          fontWeight: "bold",
          offsetCenter: [0, "10%"],
        },
        title: {
          offsetCenter: [0, "42%"],
          color: "#7f8799",
          fontSize: 11,
        },
        data: [
          {
            value: Number(profitableDayRate.toFixed(1)),
            name: "profitable days",
          },
        ],
      },
    ],
  };

  const cumulativeOption = {
    backgroundColor: "transparent",
    grid: { left: 74, right: 28, top: 24, bottom: 50, containLabel: true },
    tooltip: { trigger: "axis", backgroundColor: "#171b22", borderColor: "#303744", textStyle: { color: "#fff" }, formatter: (params: unknown) => {
      const point = (Array.isArray(params) ? params[0] : null) as { axisValue?: string; value?: number } | null;
      return `${point?.axisValue ?? ""}<br/>Cumulative P&L: ${formatMoney(Number(point?.value ?? 0), user.currency)}`;
    } },
    xAxis: { type: "category", data: cumulativeRows.map((row) => row.key), axisLabel: { color: "#7f8799" }, axisLine: { lineStyle: { color: "#303744" } }, splitLine: { show: true, lineStyle: { color: CHART_GRID_LINE_COLOR, width: 1 } } },
    yAxis: { type: "value", axisLabel: { color: "#7f8799", formatter: (value: number) => formatMoney(value, user.currency) }, axisLine: { lineStyle: { color: "#303744" } }, splitLine: { show: true, lineStyle: { color: CHART_GRID_LINE_COLOR, width: 1 } } },
    series: [{ name: "Cumulative P&L", type: "line", smooth: true, showSymbol: false, data: cumulativeRows.map((row) => row.cumulative), lineStyle: { color: "#4d8dff", width: 3 }, areaStyle: { color: "rgba(77,141,255,0.12)" }, markLine: { silent: true, symbol: "none", lineStyle: { color: "#687386", type: "dashed" }, data: [{ yAxis: 0 }] } }],
  };
  const drawdownOption = {
    backgroundColor: "transparent",
    grid: { left: 70, right: 25, top: 16, bottom: 42, containLabel: true },
    tooltip: { trigger: "axis", backgroundColor: "#171b22", borderColor: "#303744", textStyle: { color: "#fff" }, formatter: (params: unknown) => {
      const point = (Array.isArray(params) ? params[0] : null) as { axisValue?: string; data?: { value?: number; drawdownPct?: number | null; cumulative?: number; peak?: number } } | null;
      if (!point) return "";
      const data = point.data ?? {};
      const percent = data.drawdownPct == null ? "Unavailable" : `${Math.abs(data.drawdownPct).toFixed(2)}%`;
      return `<strong>${point.axisValue ?? ""}</strong><br/>Drawdown: ${formatMoney(Math.abs(Number(data.value ?? 0)), user.currency)}<br/>Peak-equity decline: ${percent}<br/>Cumulative P&amp;L: ${formatMoney(Number(data.cumulative ?? 0), user.currency)}<br/>Previous high-water mark: ${formatMoney(Number(data.peak ?? 0), user.currency)}`;
    } },
    xAxis: { type: "category", data: drawdownRows.map((row) => row.date), axisLabel: { color: "#7f8799", interval: Math.max(0, Math.ceil(drawdownRows.length / 10) - 1), hideOverlap: true }, axisLine: { lineStyle: { color: "#303744" } } },
    yAxis: { type: "value", max: 0, axisLabel: { color: "#7f8799", formatter: (value: number) => formatMoney(value, user.currency) }, splitLine: { show: true, lineStyle: { color: CHART_GRID_LINE_COLOR, width: 1 } } },
    series: [{ name: "Peak-to-trough drawdown", type: "line", step: "end", showSymbol: false, data: drawdownRows.map((row) => ({ value: row.drawdown, drawdownPct: row.drawdownPct, cumulative: row.cumulative, peak: row.peak })), lineStyle: { color: "#ff667d", width: 2 }, areaStyle: { color: "rgba(255,102,125,.12)" } }],
  };
  const weekdayOption = {
    backgroundColor: "transparent", grid: { left: 68, right: 20, top: 42, bottom: 42, containLabel: true },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow", shadowStyle: { color: "rgba(148, 163, 184, .07)" } }, backgroundColor: "#111722", borderColor: "rgba(148, 163, 184, .22)", borderWidth: 1, textStyle: { color: "#e6edf7", fontSize: 13 }, formatter: (params: unknown) => {
      const points = (Array.isArray(params) ? params : []) as { axisValue?: string; seriesName?: string; value?: number }[];
      if (!points.length) return "";
      const row = weekdayRows.find((weekday) => weekday.name.slice(0, 3) === points[0].axisValue);
      return row ? `<strong>${row.name}</strong><br/>Gross profit: ${formatMoney(row.profit, user.currency)}<br/>Gross loss: ${formatMoney(-row.loss, user.currency)}<br/>Net P&amp;L after recorded costs: ${formatMoney(row.net, user.currency)}<br/>Trades: ${row.count} across ${row.activeSessions} active dates<br/>Average net per active date: ${formatMoney(row.averageDailyNet, user.currency)}<br/>Median net per active date: ${formatMoney(row.medianDailyNet, user.currency)}` : "";
    } },
    legend: { top: 4, itemWidth: 11, itemHeight: 11, itemGap: 22, textStyle: { color: "#aab5c7", fontSize: 14, fontFamily: "Roboto, Segoe UI, Arial, sans-serif" } },
    xAxis: { type: "category", data: weekdayRows.map((row) => row.name.slice(0, 3)), axisLabel: { color: "#a0aec0", fontSize: 14, fontFamily: "Roboto, Segoe UI, Arial, sans-serif", margin: 15 }, axisTick: { show: false }, axisLine: { lineStyle: { color: "rgba(148, 163, 184, .22)" } }, splitLine: { show: true, lineStyle: { color: CHART_GRID_LINE_COLOR, width: 1 } } },
    yAxis: { type: "value", axisLabel: { color: "#a0aec0", fontSize: 13, fontFamily: "Roboto, Segoe UI, Arial, sans-serif", margin: 13, formatter: (value: number) => formatMoney(value, user.currency) }, axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: true, lineStyle: { color: CHART_GRID_LINE_COLOR, width: 1 } } },
    series: [{ name: "Gross profit", type: "bar", barMaxWidth: 26, data: weekdayRows.map((row) => row.profit), itemStyle: { color: "#36d399", borderRadius: [4, 4, 0, 0] } }, { name: "Gross loss", type: "bar", barMaxWidth: 26, data: weekdayRows.map((row) => -row.loss), itemStyle: { color: "#ff6478", borderRadius: [0, 0, 4, 4] } }, { name: "Net P&L", type: "line", data: weekdayRows.map((row) => row.net), symbol: "circle", symbolSize: 7, showSymbol: true, itemStyle: { color: "#4d8dff", borderColor: "#dbeafe", borderWidth: 1.5 }, lineStyle: { color: "#4d8dff", width: 2.5 }, z: 3 }],
  };
  const weekdayChartEvents = {
    click: (event: { dataIndex?: number; axisValue?: string; name?: string }) => {
      const label = event.axisValue ?? event.name;
      const row = typeof event.dataIndex === "number" ? weekdayRows[event.dataIndex] : weekdayRows.find((weekday) => weekday.name.slice(0, 3) === label);
      if (row) openWeekdayTrades(row.name);
    },
  };
  const activeWeekdays = weekdayRows.filter((row) => row.count > 0);
  const bestWeekdayNet = activeWeekdays.length ? Math.max(...activeWeekdays.map((row) => row.net)) : null;
  const worstWeekdayNet = activeWeekdays.length ? Math.min(...activeWeekdays.map((row) => row.net)) : null;
  const busiestWeekday = activeWeekdays.reduce<(typeof weekdayRows)[number] | null>((best, row) => !best || row.count > best.count ? row : best, null);
  const bestWeekday = activeWeekdays.reduce<(typeof weekdayRows)[number] | null>((best, row) => !best || row.net > best.net ? row : best, null);
  const bestAverageWeekday = activeWeekdays.reduce<(typeof weekdayRows)[number] | null>((best, row) => !best || row.averageDailyNet > best.averageDailyNet ? row : best, null);
  const bestMedianWeekday = activeWeekdays.reduce<(typeof weekdayRows)[number] | null>((best, row) => !best || row.medianDailyNet > best.medianDailyNet ? row : best, null);
  const weekdayOutlook = useMemo(() => getWeekdayOutlook(user.transactions, new Date()), [user.transactions]);
  const activeFilterCount = Number(period !== "all") + Number(Boolean(fromDate)) + Number(Boolean(toDate)) + Number(categoryFilter !== "all") + Number(typeFilter !== "all");

  return (
    <div className="page-content">
      <div className="dashboard-header">
        <div>
          <span className="eyebrow">ANALYTICS</span>

          <h1>Performance analytics</h1>

          <p>Measure realized trading performance, attribution, consistency, and recorded risk.</p>
        </div>

        <div className="dashboard-actions">
          <div className="analytics-pill">
            <Activity size={16} />
            {transactionCount} transactions
          </div>

          <div className="analytics-pill">
            <ArrowUpRight size={16} />
            {formatMoney(totalProfit)} profit
          </div>

          <div className="analytics-pill negative">
            <ArrowDownRight size={16} />
            {formatMoney(totalLoss)} loss
          </div>
        </div>
      </div>

      <section className="analytics-filter-bar" aria-label="Analytics filters">
        <label><span>Date range</span><select value={period} onChange={(event) => { setPeriod(event.target.value); }}>
          <option value="all">All time</option><option value="today">Today</option><option value="week">This week</option><option value="month">This month</option><option value="lastMonth">Last month</option><option value="3m">Last 3 months</option><option value="6m">Last 6 months</option><option value="year">This year</option><option value="custom">Custom dates</option>
        </select></label>
        <label><span>From</span><input aria-label="From date" type="date" value={fromDate} onChange={(event) => { setFromDate(event.target.value); }} /></label>
        <label><span>To</span><input aria-label="To date" type="date" value={toDate} onChange={(event) => { setToDate(event.target.value); }} /></label>
        <label><span>Category</span><select value={categoryFilter} onChange={(event) => { setCategoryFilter(event.target.value); }}><option value="all">All categories</option>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
        <label><span>Transaction type</span><select value={typeFilter} onChange={(event) => { setTypeFilter(event.target.value); }}><option value="all">All types</option><option value="profit">Profit</option><option value="loss">Loss</option></select></label>
        <label className="analytics-compare-toggle"><input type="checkbox" checked={comparePrevious} onChange={(event) => setComparePrevious(event.target.checked)} />Compare previous period</label>
        <div className="analytics-filter-result"><CalendarDays size={16} />{transactionCount} matching records</div>
        <div className="analytics-filter-actions"><span>{activeFilterCount ? `${activeFilterCount} active filter${activeFilterCount === 1 ? "" : "s"}` : "No additional filters"}</span><button type="button" onClick={() => { setPeriod("all"); setFromDate(""); setToDate(""); setCategoryFilter("all"); setTypeFilter("all"); setComparePrevious(false); }}> <RotateCcw size={14} /> Reset filters</button></div>
      </section>

      <section className="analytics-kpi-grid" aria-label="Performance metrics">
        {[
          ["Realized net P&L", formatMoney(signedNet, user.currency), `Saved net transaction result after recorded costs; costs are not deducted twice.${comparePrevious && previousPeriodNet != null ? ` Previous period: ${formatMoney(previousPeriodNet, user.currency)} (${formatMoney(signedNet - previousPeriodNet, user.currency)} change).` : comparePrevious ? " Previous-period comparison is unavailable for this custom range." : ""}`, signedNet >= 0],
          ["Gross profit", formatMoney(totalProfit, user.currency), `${profitCount} winning transactions`, true],
          ["Gross loss", formatMoney(totalLoss, user.currency), `${lossCount} losing transactions`, false],
          ["Win rate", `${winRate.toFixed(1)}%`, "Winning transactions / all trades", winRate >= 50],
          ["Profit factor", profitFactor == null ? "No losses" : profitFactor.toFixed(2), "Net wins / net losses after recorded costs", (profitFactor ?? 1) >= 1],
          ["Average winning transaction", formatMoney(averageWin, user.currency), "Average net result per winning record", true],
          ["Average losing transaction", formatMoney(averageLoss, user.currency), "Average net loss per losing record", false],
          ["Expectancy", formatMoney(expectancy, user.currency), "Average recorded net P&L per transaction", expectancy >= 0],
          ["Maximum drawdown", formatMoney(drawdownSummary.amount, user.currency), "Largest daily peak-to-trough decline", false],
          ["Largest gain", tradeDistribution.best == null ? "—" : formatMoney(tradeDistribution.best, user.currency), "Best single transaction record", true],
          ["Largest loss", tradeDistribution.worst == null ? "—" : formatMoney(tradeDistribution.worst, user.currency), "Worst single transaction record", false],
        ].map(([label, value, help, positive]) => <article className="analytics-kpi-card" key={String(label)} title={String(help)}>
          <span>{label}</span><strong className={positive ? "positive" : "negative"}>{value}</strong><small>{help}</small>
        </article>)}
      </section>

      <ChartPanel className="analytics-cumulative-chart" title="Cumulative profit & loss" subtitle="Cumulative recorded net P&L over the selected range">
        <div className="analytics-chart-controls"><span>Group by</span>{[["day", "Daily"], ["week", "Weekly"], ["month", "Monthly"], ["year", "Yearly"]].map(([value, label]) => <button className={granularity === value ? "active" : ""} type="button" key={value} onClick={() => setGranularity(value)}>{label}</button>)}</div>
        <EChartsChart option={cumulativeOption} style={{ height: 340, width: "100%" }} notMerge lazyUpdate />
      </ChartPanel>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-card-top">
            <div className="stat-icon">
              <BarChart3 size={19} />
            </div>
            <span>Analytics scope</span>
          </div>
          <div className="stat-value">{formatMoney(totalMovement)}</div>
          <div className="stat-trend positive">Total tracked movement</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-top">
            <div className="stat-icon">
              <TrendingUp size={19} />
            </div>
            <span>Profit ratio</span>
          </div>
          <div className="stat-value">{profitShareRatio.toFixed(0)}%</div>
          <div className="stat-trend positive">Share of positive activity</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-top">
            <div className="stat-icon">
              <TrendingDown size={19} />
            </div>
            <span>Expense groups</span>
          </div>
          <div className="stat-value">{categoryData.length}</div>
          <div className="stat-trend negative">Categories with losses</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-top">
            <div className="stat-icon">
              <Wallet size={19} />
            </div>
            <span>Current balance</span>
          </div>
          <div className="stat-value">
            {formatMoney(user.currentBalance ?? (user.startingBalance + totalProfit - totalLoss))}
          </div>
          <div className="stat-trend positive">Live account balance</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-top">
            <div className="stat-icon">
              <DollarSign size={19} />
            </div>
            <span>Cost</span>
          </div>
          {isEditingCost ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
              <input
                type="number"
                min="0"
                step="0.01"
                value={costInput}
                onChange={(event) => setCostInput(event.target.value)}
                autoFocus
                placeholder="0.00"
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  border: "1px solid rgba(59, 130, 246, 0.3)",
                  borderRadius: 6,
                  backgroundColor: "var(--bg-tertiary)",
                  color: "var(--text-primary)",
                  fontSize: 16,
                  fontWeight: 600,
                }}
              />
              <button
                type="button"
                onClick={handleSaveCost}
                style={{
                  padding: "6px 8px",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "#10b981",
                }}
                title="Save cost"
              >
                <Check size={18} />
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
              <div className="stat-value">{formatMoney(totalCosts)}</div>
              <button
                type="button"
                onClick={() => setIsEditingCost(true)}
                disabled={isCostLocked}
                style={{
                  padding: "6px 8px",
                  background: "none",
                  border: "none",
                  cursor: isCostLocked ? "not-allowed" : "pointer",
                  color: isCostLocked ? "var(--text-quaternary)" : "var(--text-secondary)",
                  opacity: isCostLocked ? 0.5 : 1,
                }}
                title={isCostLocked ? "Cost is locked" : "Edit cost"}
              >
                <Pencil size={16} />
              </button>
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div className="stat-trend">All transaction cost</div>
            <button
              type="button"
              onClick={() => setIsCostLocked(!isCostLocked)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                padding: "4px 8px",
                background: isCostLocked ? "rgba(239, 68, 68, 0.1)" : "rgba(59, 130, 246, 0.1)",
                border: `1px solid ${isCostLocked ? "#ef4444" : "#3b82f6"}`,
                borderRadius: "4px",
                color: isCostLocked ? "#ef4444" : "#3b82f6",
                cursor: "pointer",
                fontSize: "11px",
                fontWeight: 600,
              }}
              title={isCostLocked ? "Click to unlock cost" : "Click to lock cost"}
            >
              {isCostLocked ? <Lock size={12} /> : <LockOpen size={12} />}
              {isCostLocked ? "Locked" : "Unlocked"}
            </button>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-top">
            <div className="stat-icon">
              <Activity size={19} />
            </div>
            <span>Total transactions</span>
          </div>
          <div className="stat-value">{transactionCount}</div>
          <div className="stat-trend positive">All transaction entries</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-top">
            <div className="stat-icon">
              <ArrowUpRight size={19} />
            </div>
            <span>Profit entries</span>
          </div>
          <div className="stat-value">{profitCount}</div>
          <div className="stat-trend positive">Count of profit transactions</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-top">
            <div className="stat-icon">
              <ArrowDownRight size={19} />
            </div>
            <span>Loss entries</span>
          </div>
          <div className="stat-value">{lossCount}</div>
          <div className="stat-trend negative">Count of loss transactions</div>
        </div>

        <div className="stat-card stat-card-tall">
          <div className="stat-card-top">
            <div className="stat-icon">
              <Activity size={19} />
            </div>
            <span>Win-loss rhythm</span>
          </div>
          <div className="analytics-summary stat-card-tall-content">
            <div className="snapshot-item" style={{ padding: "10px 12px" }}>
              <span>Avg profits before loss</span>
              <strong>
                {streakSummary.profitBeforeLoss == null
                  ? "—"
                  : streakSummary.profitBeforeLoss.toFixed(1)}
              </strong>
            </div>

            <div className="snapshot-item" style={{ padding: "10px 12px" }}>
              <span>Avg losses before profit</span>
              <strong>
                {streakSummary.lossBeforeProfit == null
                  ? "—"
                  : streakSummary.lossBeforeProfit.toFixed(1)}
              </strong>
            </div>
          </div>
          <div className="stat-trend">Daily win and loss counts · latest 30 active days</div>
          {dailyOutcomeRows.length
            ? <EChartsChart option={dailyOutcomeOption} style={{ height: 190, marginTop: 10, width: "100%" }} notMerge lazyUpdate />
            : <div className="analytics-volatility-unavailable">Record trades to see the daily win-loss chart.</div>}
        </div>

        <div className="stat-card stat-card-tall" title="Daily P&L volatility = absolute daily net P&L movement divided by the absolute previous recorded P&L close, multiplied by 100. Zero previous closes are skipped.">
          <div className="stat-card-top">
            <div className="stat-icon"><Activity size={19} /></div>
            <span>Daily P&amp;L Volatility</span>
          </div>
          <div className={`stat-value ${currentDailyPnlVolatility?.direction === "up" ? "positive" : currentDailyPnlVolatility?.direction === "down" ? "negative" : ""}`}>
            {currentDailyPnlVolatility ? `${currentDailyPnlVolatility.percent.toFixed(2)}%` : "—"}
          </div>
          <div className="stat-trend">Based on saved daily P&amp;L closes, not market prices or implied volatility</div>
          {currentDailyPnlVolatility ? <>
            <div className="analytics-pnl-volatility-details">
              <span><small>Previous P&amp;L close</small><strong>{formatPreciseMoney(currentDailyPnlVolatility.previousClose, user.currency ?? "INR")}</strong></span>
              <span><small>Current P&amp;L close</small><strong>{formatPreciseMoney(currentDailyPnlVolatility.currentClose, user.currency ?? "INR")}</strong></span>
              <span><small>Absolute movement</small><strong>{formatPreciseMoney(currentDailyPnlVolatility.absoluteMovement, user.currency ?? "INR")}</strong></span>
              <span><small>Observations</small><strong>{dailyPnlVolatilityPoints.length} daily readings</strong></span>
            </div>
            <div className={`stat-trend ${currentDailyPnlVolatility.direction === "up" ? "positive" : currentDailyPnlVolatility.direction === "down" ? "negative" : ""}`}>
              {currentDailyPnlVolatility.direction === "up" ? <ArrowUpRight size={14} /> : currentDailyPnlVolatility.direction === "down" ? <ArrowDownRight size={14} /> : null}
              {dailyPnlVolatilityDate(currentDailyPnlVolatility.date)} · P&amp;L {currentDailyPnlVolatility.direction === "up" ? "increased" : currentDailyPnlVolatility.direction === "down" ? "decreased" : "was unchanged"}
            </div>
          </> : <div className="stat-trend analytics-volatility-unavailable">No percentage is available until a valid non-zero previous P&amp;L close exists.</div>}
          {dailyPnlVolatilityPoints.length > 0
            ? <EChartsChart option={dailyVolatilityChartOption} style={{ height: 150, marginTop: 10, width: "100%" }} notMerge lazyUpdate />
            : <div className="analytics-volatility-unavailable">Daily P&amp;L movement history will appear here as valid closing observations are recorded.</div>}
        </div>
        <div className="stat-card stat-card-tall" title="Sized trades use entry plus exit price times quantity. Unsized trades use twice the day's combined gross profit and loss.">
          <div className="stat-card-top">
            <div className="stat-icon"><BarChart3 size={19} /></div>
            <span>Volume of trades</span>
          </div>
          <div className="stat-value">{formatMoney(tradeVolumeSummary.total, user.currency ?? "INR")}</div>
          <div className="stat-trend">Lifetime transaction volume by active day</div>
          {dailyTradeVolumeRows.length
            ? <EChartsChart option={dailyTradeVolumeOption} style={{ height: 220, minHeight: 220, flex: "1 1 220px", marginTop: 8, width: "100%" }} notMerge lazyUpdate />
            : <div className="analytics-volatility-unavailable">No dated transactions to calculate volume yet.</div>}
        </div>
        <div className="stat-card stat-card-tall">
          <div className="stat-card-top">
            <div className="stat-icon"><DollarSign size={19} /></div>
            <span>Transaction costs</span>
          </div>
          <div className="stat-value">{formatMoney(transactionCosts, user.currency ?? "INR")}</div>
          <div className="stat-trend">Recorded costs by active day · selected filters</div>
          {dailyTransactionCostRows.length
            ? <EChartsChart option={dailyTransactionCostOption} style={{ height: 220, minHeight: 220, flex: "1 1 220px", marginTop: 8, width: "100%" }} notMerge lazyUpdate />
            : <div className="analytics-volatility-unavailable">No recorded costs in this filter range.</div>}
        </div>
      </div>

      <div className="charts-two-column">
        <ChartPanel
          title="Monthly movement"
          subtitle="Profit and loss by month"
        >
          {monthlyData.length > 0 ? (
            <HighchartsChart
              highcharts={Highcharts}
              options={activityOptions}
            />
          ) : (
            <div className="empty-mini-state">
              Add a few transactions to see monthly movement here.
            </div>
          )}
        </ChartPanel>

        <ChartPanel
          className="analytics-financial-health"
          title="Financial health"
          subtitle="How consistently your net result finishes positive across active days"
        >
          <div className="financial-health-main">
            <div className="financial-health-gauge">
              <EChartsChart option={healthOption} style={{ height: 250, width: "100%" }} notMerge lazyUpdate />
              <span className="financial-health-status">
                {dailyFinancialRows.length ? `${profitableDays.length} positive days out of ${dailyFinancialRows.length} active days` : "No dated trades in this selection"}
              </span>
            </div>
            <div className="financial-health-metrics">
              <article>
                <span>Average positive day</span>
                <strong className="positive">{averageGreenDay == null ? "—" : formatMoney(averageGreenDay, user.currency)}</strong>
                <small>{profitableDays.length} days with net profit</small>
              </article>
              <article>
                <span>Average negative day</span>
                <strong className="negative">{averageRedDay == null ? "—" : formatMoney(averageRedDay, user.currency)}</strong>
                <small>{losingDays.length} days with net loss</small>
              </article>
              <article title={bestPnlDay ? `Best net day: ${dailyPnlVolatilityDate(bestPnlDay.date)}` : "No dated trades"}>
                <span>Best day</span>
                <strong className={bestPnlDay && bestPnlDay.net >= 0 ? "positive" : "negative"}>{bestPnlDay ? formatMoney(bestPnlDay.net, user.currency) : "—"}</strong>
                <small>{bestPnlDay ? dailyPnlVolatilityDate(bestPnlDay.date) : "No dated results"}</small>
              </article>
              <article title={worstPnlDay ? `Worst net day: ${dailyPnlVolatilityDate(worstPnlDay.date)}` : "No dated trades"}>
                <span>Worst day</span>
                <strong className="negative">{worstPnlDay ? formatMoney(worstPnlDay.net, user.currency) : "—"}</strong>
                <small>{worstPnlDay ? dailyPnlVolatilityDate(worstPnlDay.date) : "No dated results"}</small>
              </article>
            </div>
          </div>
          <div className="financial-health-footer">
            <span><i className="profit-dot" />Positive days <b>{profitableDays.length}</b></span>
            <span><i className="loss-dot" />Negative days <b>{losingDays.length}</b></span>
            <span>Flat days <b>{flatDays.length}</b></span>
            <span>Daily total uses net results after recorded costs</span>
          </div>
        </ChartPanel>
        <section className={`analytics-weekday-outlook ${weekdayOutlook.status}`} aria-label="Next trading day reminder">
          <div className="analytics-weekday-outlook-icon"><BellRing size={19} /></div>
          <div className="analytics-weekday-outlook-copy"><span className="eyebrow">NEXT TRADING DAY · {weekdayOutlook.dayName.toUpperCase()}</span><h2>{weekdayOutlook.status === "strong" ? `${weekdayOutlook.dayName} has been a stronger day in your history` : weekdayOutlook.status === "caution" ? `A discipline reminder for ${weekdayOutlook.dayName}` : `Your ${weekdayOutlook.dayName} outlook`}</h2><p>{weekdayOutlook.message}</p></div>
          <button type="button" onClick={onOpenNotifications}><span>Notification center</span><ArrowRight size={16} /></button>
        </section>
      </div>

      <div className="charts-two-column">
        <ChartPanel
          title="Expense distribution"
          subtitle="Recorded expenses grouped by category"
        >
          <EChartsChart
            option={distributionOption}
            style={{ height: 340, width: "100%" }}
            notMerge
            lazyUpdate
          />
        </ChartPanel>

      </div>

      <div className="analytics-section-grid analytics-weekday-grid">
        <ChartPanel title="Drawdown history" subtitle="Daily decline from the previous high-water mark; hover for peak, cumulative P&amp;L, and equity-based drawdown percentage.">
          {drawdownRows.length ? <>
            <div className="drawdown-summary-grid">
              <article><span>Worst peak-to-trough</span><strong>{formatMoney(drawdownSummary.amount, user.currency)}</strong><small>{drawdownSummary.troughDate ? `Trough · ${dailyPnlVolatilityDate(drawdownSummary.troughDate)}` : "No decline recorded"}</small></article>
              <article><span>Worst decline vs peak equity</span><strong>{drawdownSummary.percent == null ? "—" : `${drawdownSummary.percent.toFixed(2)}%`}</strong><small>{drawdownSummary.percentTroughDate ? `Trough · ${dailyPnlVolatilityDate(drawdownSummary.percentTroughDate)}` : "Uses starting balance plus cumulative net P&amp;L"}</small></article>
              <article><span>Current drawdown</span><strong>{formatMoney(drawdownSummary.currentAmount, user.currency)}</strong><small>{drawdownSummary.currentUnderwaterDays ? `${drawdownSummary.currentUnderwaterDays} active days below the high-water mark` : "At the latest high-water mark"}</small></article>
              <article><span>Longest underwater stretch</span><strong>{drawdownSummary.longestUnderwaterDays} active days</strong><small>Consecutive dated sessions before a new high</small></article>
            </div>
            <EChartsChart option={drawdownOption} style={{ height: 300, marginTop: 12, width: "100%" }} notMerge lazyUpdate />
          </> : <div className="empty-mini-state">Record dated trades to see drawdown from peak equity.</div>}
        </ChartPanel>
      </div>

      <section className="analytics-extremes-panel">
        <div className="analytics-section-heading"><div><span className="eyebrow">TRADE EXTREMES</span><h2>Best and worst trades</h2><p>Ranked by recorded net result for the selected date range and filters.</p></div><span>{transactionCount} trades analyzed</span></div>
        <div className="analytics-best-worst-grid">
          {[{ title: "Top 5 performers", rows: bestFiveTrades, tone: "best", icon: <TrendingUp size={16} /> }, { title: "Bottom 5 performers", rows: worstFiveTrades, tone: "worst", icon: <TrendingDown size={16} /> }].map(({ title, rows, tone, icon }) => <section className={`analytics-extreme-list ${tone}`} key={title} aria-label={title}>
            <header><span className="analytics-extreme-icon">{icon}</span><div><h3>{title}</h3><p>{tone === "best" ? "Highest net results" : "Lowest net results"}</p></div></header>
            {rows.length ? <ol>{rows.map((tx, index) => <li key={tx.id}>
              <span className="analytics-extreme-rank">{String(index + 1).padStart(2, "0")}</span>
              <span className="analytics-extreme-copy"><strong title={tx.note || tx.category || "Trade record"}>{tx.note || tx.category || "Trade record"}</strong><small><span>{parseLocalDate(tx.date)?.toLocaleDateString("en-IN") ?? "Date unavailable"}</span><i /><span>{tx.category || "Uncategorized"}</span></small></span>
              <b className={tx.type}>{formatMoney(tx.type === "profit" ? tx.amount : -tx.amount, user.currency)}</b>
            </li>)}</ol> : <p className="analytics-extreme-empty">No matching trades in this period.</p>}
          </section>)}
        </div>
      </section>

      <section className="appreciation-section">
        <div className="appreciation-heading"><div><span className="eyebrow">PORTFOLIO PERFORMANCE</span><h2>Investment appreciation</h2><p>Realized and unrealized returns from your recorded holdings.</p></div><span className="appreciation-asof">Current values from portfolio records</span></div>
        <div className="appreciation-kpis">
          <article><span>Total appreciation</span><strong className={investmentAnalysis.totalAppreciation >= 0 ? "positive" : "negative"}>{formatMoney(investmentAnalysis.totalAppreciation, user.currency)}</strong><small>{investmentAnalysis.returnPct.toFixed(2)}% return on recorded capital</small></article>
          <article><span>Open market value</span><strong>{formatMoney(investmentAnalysis.marketValue, user.currency)}</strong><small>Invested: {formatMoney(investmentAnalysis.openCapital, user.currency)}</small></article>
          <article><span>Open return on cost</span><strong className={investmentAnalysis.openReturnPct >= 0 ? "positive" : "negative"}>{investmentAnalysis.openReturnPct.toFixed(2)}%</strong><small>Unrealized result ÷ cost of open holdings</small></article>
          <article><span>Unrealized appreciation</span><strong className={investmentAnalysis.unrealized >= 0 ? "positive" : "negative"}>{formatMoney(investmentAnalysis.unrealized, user.currency)}</strong><small>{investmentAnalysis.open.length} open holdings</small></article>
          <article><span>Realized appreciation</span><strong className={investmentAnalysis.realized >= 0 ? "positive" : "negative"}>{formatMoney(investmentAnalysis.realized, user.currency)}</strong><small>{investmentAnalysis.holdings.length - investmentAnalysis.open.length} closed holdings</small></article>
          <article title="Largest open holding's share of the combined current market value of open holdings."><span>Largest position share</span><strong>{investmentAnalysis.largestHolding ? `${investmentAnalysis.largestHoldingSharePct.toFixed(1)}%` : "—"}</strong><small>{investmentAnalysis.largestHolding?.name ?? "No open holdings"} of open market value</small></article>
        </div>
        <div className="appreciation-chart-grid">
          <ChartPanel title="Open holding performance" subtitle="Unrealized P&amp;L ranked from strongest to weakest; zero marks break-even">
            {investmentAnalysis.open.length ? <EChartsChart option={holdingsAppreciationOption} style={{ height: 330, width: "100%" }} notMerge lazyUpdate /> : <div className="empty-mini-state">Add open investments with current values to see holding appreciation.</div>}
          </ChartPanel>
          <ChartPanel title="Portfolio allocation" subtitle="Current value, cost basis, and return by asset type; hover for details">
            {investmentAnalysis.byType.length ? <EChartsChart option={allocationOption} style={{ height: 330, width: "100%" }} notMerge lazyUpdate /> : <div className="empty-mini-state">No open portfolio values to allocate.</div>}
          </ChartPanel>
        </div>
        <div className="appreciation-performers">
          <span>Top return <b>{investmentAnalysis.best ? `${investmentAnalysis.best.name} · ${investmentAnalysis.best.returnPct.toFixed(2)}%` : "—"}</b></span>
          <span>Lowest return <b>{investmentAnalysis.worst ? `${investmentAnalysis.worst.name} · ${investmentAnalysis.worst.returnPct.toFixed(2)}%` : "—"}</b></span>
          <span>Open positions in profit <b>{investmentAnalysis.profitableOpenCount} of {investmentAnalysis.open.length}</b></span>
          <span>Total capital recorded <b>{formatMoney(investmentAnalysis.investedCapital, user.currency)}</b></span>
        </div>
        <p className="appreciation-footnote">Returns use entry amount and the latest current value for open holdings or exit value for closed holdings. Historical price snapshots are not stored, so this section reports current appreciation rather than a fabricated historical time series.</p>
      </section>

      <div className="analytics-section-grid analytics-weekday-grid">
        <ChartPanel title="Weekday performance" subtitle={`Monday–Friday totals · Saturday trades count toward Friday, Sunday trades count toward Monday · ${activeWeekdays.length} of 5 workdays active`}>
          <div className="analytics-weekday-highlights">
            <div><span>Best net weekday</span><strong>{bestWeekday ? bestWeekday.name : "—"}</strong><small>{bestWeekday ? `${formatMoney(bestWeekday.net, user.currency)} total net P&L` : "No trades in this range"}</small></div>
            <div><span>Most traded weekday</span><strong>{busiestWeekday ? busiestWeekday.name : "—"}</strong><small>{busiestWeekday ? `${busiestWeekday.count} trades across ${busiestWeekday.activeSessions} active dates` : "No trades in this range"}</small></div>
            <div><span>Best average session</span><strong>{bestAverageWeekday ? bestAverageWeekday.name : "—"}</strong><small>{bestAverageWeekday ? `${formatMoney(bestAverageWeekday.averageDailyNet, user.currency)} average net per active date` : "No trades in this range"}</small></div>
            <div><span>Best typical session</span><strong>{bestMedianWeekday ? bestMedianWeekday.name : "—"}</strong><small>{bestMedianWeekday ? `${formatMoney(bestMedianWeekday.medianDailyNet, user.currency)} median net per active date` : "No trades in this range"}</small></div>
          </div>
          <EChartsChart option={weekdayOption} onEvents={weekdayChartEvents} style={{ height: 420, width: "100%", cursor: "pointer" }} notMerge lazyUpdate />
          <div className="analytics-weekday-summary">{weekdayRows.map((row) => {
            const isBest = row.count > 0 && row.net === bestWeekdayNet;
            const isWorst = row.count > 0 && row.net === worstWeekdayNet;
            return <article className={`${row.count === 0 ? "empty" : row.net >= 0 ? "positive" : "negative"} clickable`} key={row.name} role="button" tabIndex={0} aria-label={`Show ${row.count} ${row.name} trades`} onClick={() => openWeekdayTrades(row.name)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openWeekdayTrades(row.name); } }}>
              <header><b>{row.name}</b>{isBest && <span className="best">Top net</span>}{isWorst && !isBest && <span className="worst">Lowest</span>}{row.count === 0 && <span className="quiet">No trades</span>}</header>
              <small className="analytics-weekday-metric-label">Total net P&amp;L</small>
              <strong>{formatMoney(row.net, user.currency)}</strong>
              <div className="analytics-weekday-win-summary"><span>Win rate</span><b>{row.count ? `${Math.round(row.winningTrades / row.count * 100)}%` : "—"}</b></div>
              <div className="analytics-weekday-win-summary"><span>Avg net / active date</span><b>{row.activeSessions ? formatMoney(row.averageDailyNet, user.currency) : "—"}</b></div>
              <div className="analytics-weekday-win-summary"><span>Median net / active date</span><b>{row.activeSessions ? formatMoney(row.medianDailyNet, user.currency) : "—"}</b></div>
              <div className="analytics-weekday-winbar" role="img" aria-label={row.count ? `${row.winningTrades} wins and ${row.losingTrades} losses` : "No trades"}><i style={{ width: `${row.count ? row.winningTrades / row.count * 100 : 0}%` }} /></div>
              <small>{row.count ? `${row.activeSessions} active dates · ${row.count} trades · ${row.winningTrades} wins · ${row.losingTrades} losses` : "No activity in this range"}</small>
            </article>;
          })}</div>
        </ChartPanel>
      </div>
      {selectedWeekday && <div className="analytics-weekday-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedWeekday(null); }}>
        <section className="analytics-weekday-dialog" role="dialog" aria-modal="true" aria-labelledby="analytics-weekday-dialog-title">
          <header>
            <div><span className="eyebrow">WEEKDAY TRADES</span><h2 id="analytics-weekday-dialog-title">{selectedWeekday} trades</h2><p>{selectedWeekdayTransactions.length} matching records · filtered by your current analytics selection</p></div>
            <button type="button" aria-label="Close trades dialog" onClick={() => setSelectedWeekday(null)}>×</button>
          </header>
          {(selectedWeekday === "Monday" || selectedWeekday === "Friday") && <p className="analytics-weekday-dialog-note">{selectedWeekday === "Monday" ? "Sunday trades are included here." : "Saturday trades are included here."}</p>}
          <div className="analytics-weekday-dialog-list">
            {visibleWeekdayTransactions.length ? visibleWeekdayTransactions.map((tx) => {
              const date = parseLocalDate(tx.date);
              const result = tx.type === "profit" ? tx.amount : -tx.amount;
              return <article key={tx.id}>
                <div><strong>{tx.note?.trim() || tx.category || "Trade record"}</strong><span>{date ? date.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "Date unavailable"} · {tx.category || "Uncategorized"}</span>{(tx.costAmount ?? 0) > 0 && <small>Recorded cost: {formatMoney(tx.costAmount ?? 0, user.currency)}</small>}</div>
                <b className={result >= 0 ? "profit" : "loss"}>{formatMoney(result, user.currency)}</b>
              </article>;
            }) : <p className="analytics-weekday-dialog-empty">No matching trades for this workday.</p>}
          </div>
          <nav className="analytics-weekday-pagination" aria-label="Weekday trades pagination">
            <span>Showing {selectedWeekdayTransactions.length ? (activeWeekdayTradesPage - 1) * weekdayTradesPageSize + 1 : 0}–{Math.min(activeWeekdayTradesPage * weekdayTradesPageSize, selectedWeekdayTransactions.length)} of {selectedWeekdayTransactions.length} trades</span>
            <div>
              <button type="button" onClick={() => setSelectedWeekdayPage(Math.max(1, activeWeekdayTradesPage - 1))} disabled={activeWeekdayTradesPage <= 1}>Previous</button>
              <span>Page {activeWeekdayTradesPage} of {weekdayTradesPageCount}</span>
              <button type="button" onClick={() => setSelectedWeekdayPage(Math.min(weekdayTradesPageCount, activeWeekdayTradesPage + 1))} disabled={activeWeekdayTradesPage >= weekdayTradesPageCount}>Next</button>
            </div>
          </nav>
        </section>
      </div>}
    </div>
  );
};

export default Analytics;

