import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import Highcharts from "highcharts";
import HighchartsStock from "highcharts/highstock";
import HighchartsReact from "highcharts-react-official";
import type { HighchartsReactRefObject } from "highcharts-react-official";
import ReactECharts from "echarts-for-react";
import {
  BarChart3,
  CheckCircle2,
  Download,
  Gauge,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";

import StatCard from "../components/StatCard";
import ChartPanel from "../components/ChartPanel";
import ChartFullscreenModal from "../components/ChartFullscreenModal";

import type { UserAccount } from "../types/finance";
import { formatCurrency } from "../utils/money";
import { calculateBalanceStats, getAuthoritativeBalance } from "../utils/balance";

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

const ChartRangeDropdown = ({
  chartRef,
  value,
  onChange,
}: {
  chartRef: React.RefObject<HighchartsReactRefObject | null>;
  value: number;
  onChange: (index: number) => void;
}) => (
  <label className="chart-range-dropdown" onClick={(event) => event.stopPropagation()}>
    <span>Range</span>
    <select
      value={value}
      aria-label="Chart date range"
      onChange={(event) => {
        const index = Number(event.target.value);
        (chartRef.current?.chart as Highcharts.Chart & { rangeSelector?: { clickButton: (buttonIndex: number) => void } }).rangeSelector?.clickButton(index);
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
}

const Dashboard = ({ user, onAdd }: Props) => {
  const dashboardRef = useRef<HTMLDivElement>(null);
  const [currentHour, setCurrentHour] = useState(() => new Date().getHours());
  const wealthChartRef = useRef<HighchartsReactRefObject>(null);
  const [wealthRange, setWealthRange] = useState(9);
  const [fullscreenChart, setFullscreenChart] = useState<
    | {
        title: string;
        subtitle: string;
        kind: "highcharts" | "stock" | "echarts";
        highchartsOptions?: Highcharts.Options;
        stockOptions?: Highcharts.Options;
        defaultChartMode?: "classic" | "candlestick";
        echartsOption?: Record<string, unknown>;
      }
    | null
  >(null);
  const closeFullscreenChart = useCallback(() => setFullscreenChart(null), []);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentHour(new Date().getHours()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    // Rebuilds start from the complete dataset, so keep the native select in
    // sync when transactions are replaced or imported.
    setWealthRange(9);
  }, [user.transactions, user.createdAt]);

  // The sidebar collapse animates the content width without resizing the
  // browser window. Reflow Highcharts when its chart panels change size so the
  // plot and navigator continue to use the full available width.
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

    // Calculate percentage based on starting balance (ROI)
    const performancePercentage =
      balanceStats.startingBalance > 0
        ? (netPerformance / balanceStats.startingBalance) * 100
        : 0;

    return {
      ...balanceStats,
      currentBalance: actualCurrentBalance,
      netPerformance,
      profitCount,
      lossCount,
      totalTrades,
      winRate,
      avgProfitPerTrade,
      avgLossPerTrade,
      performancePercentage,
    };
  }, [user.transactions, user.startingBalance, user.currentBalance, user.defaultCostAmount, user.investmentIncluded, user.investments]);

  const {
    totalProfit,
    totalLoss,
    currentBalance,
    netPerformance,
    performancePercentage,
    profitCount,
    lossCount,
    totalTrades,
    winRate,
    avgProfitPerTrade,
    avgLossPerTrade,
  } = stats;

  const paceCoach = useMemo(() => {
    const trades = user.transactions
      .filter((transaction) => transaction.type === "profit" || transaction.type === "loss")
      .slice()
      .sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime());
    const recentTrades = trades.slice(-10);
    const recentNet = recentTrades.reduce(
      (total, trade) => total + (trade.type === "profit" ? trade.amount : -trade.amount),
      0,
    );
    let consecutiveLosses = 0;
    for (let index = trades.length - 1; index >= 0 && trades[index].type === "loss"; index -= 1) {
      consecutiveLosses += 1;
    }

    const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : totalProfit > 0 ? Infinity : 0;
    if (trades.length < 10) {
      return {
        tone: "steady" as const,
        title: "Build your sample first",
        message: "Keep position size small until at least 10 recorded trades show a reliable pattern.",
        detail: `${trades.length}/10 trades recorded · no size increase yet`,
        icon: <Gauge size={19} />,
      };
    }
    if (consecutiveLosses >= 3 || recentNet < 0 || winRate < 40 || profitFactor < 0.9) {
      return {
        tone: "warning" as const,
        title: "Slow down and protect capital",
        message: "Recent results are under pressure. Reduce risk per trade, pause after a loss streak, and review your setup before adding size.",
        detail: `${consecutiveLosses} consecutive losses · recent 10 net ${formatMoney(recentNet)}`,
        icon: <ShieldAlert size={19} />,
      };
    }
    if (trades.length >= 20 && recentNet > 0 && winRate >= 55 && profitFactor >= 1.3) {
      return {
        tone: "positive" as const,
        title: "Measured momentum",
        message: "Your sample is consistently positive. If your written risk limit allows it, consider increasing size gradually by 5–10% and review again after 10 trades.",
        detail: `${winRate.toFixed(0)}% win rate · ${profitFactor.toFixed(2)} profit factor`,
        icon: <CheckCircle2 size={19} />,
      };
    }
    return {
      tone: "steady" as const,
      title: "Keep your current pace",
      message: "Results are mixed but controlled. Keep the same size and collect more data before changing your risk.",
      detail: `${winRate.toFixed(0)}% win rate · ${trades.length} trades reviewed`,
      icon: <Gauge size={19} />,
    };
  }, [formatMoney, lossCount, totalLoss, totalProfit, user.transactions, winRate]);

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

        // Only count if transaction type matches
        if (transaction.type === "profit") {
          dailyTotals[key].profit += transaction.amount;
        } else if (transaction.type === "loss") {
          dailyTotals[key].loss += transaction.amount;
        }
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
          spacing: [14, 64, 22, 20],
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
          enabled: true,
          margin: 18,
          height: 72,
        },
        scrollbar: {
          enabled: false,
        },
        xAxis: {
          type: "datetime",
          lineColor: "#252b36",
          crosshair: {
            width: 1,
            color: "rgba(96, 165, 250, 0.65)",
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
            color: "rgba(96, 165, 250, 0.65)",
            dashStyle: "Dash",
            snap: false,
            label: {
              enabled: true,
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
            color: "#ff5f70",
            upColor: "#36d399",
            lineColor: "#ffffff",
            upLineColor: "#ffffff",
            states: { hover: { enabled: false } },
          },
        },
        series: [
          {
            type: "candlestick",
            name: "Balance",
            data: [makePoint(createdAt, currentBalance, currentBalance, currentBalance, currentBalance)],
            dataGrouping: {
              units: [
                ["week", [1]],
                ["month", [1, 2, 3, 4, 6]],
              ],
            },
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
        spacing: [14, 64, 24, 20],
        style: { fontFamily: "Inter, system-ui, sans-serif" },
        // Disable built-in zoom/pan — handled by attachChartInteraction
        zoomType: undefined,
        panning: { enabled: false },
        zooming: { mouseWheel: { enabled: false } },
        reflow: true,
        resetZoomButton: { theme: { display: "none" } },
        events: {
          load: function(this: Highcharts.Chart) {
            attachChartInteraction(this);
          }
        }
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
        enabled: true,
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
      scrollbar: { enabled: true, height: 8, trackBorderColor: "rgba(59, 130, 246, 0.1)" },
      xAxis: {
        type: "datetime",
        lineColor: "rgba(59, 130, 246, 0.2)",
        tickColor: "rgba(59, 130, 246, 0.2)",
        gridLineColor: "rgba(59, 130, 246, 0.08)",
          crosshair: {
            width: 1,
            color: "rgba(96, 165, 250, 0.7)",
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
          color: "rgba(96, 165, 250, 0.7)",
          dashStyle: "Dash",
          snap: false,
          label: {
            enabled: true,
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
          color: "#ef4444",
          upColor: "#10b981",
          lineColor: "#ef5350",
          upLineColor: "#34d399",
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
          dataGrouping: {
            units: [["week", [1]], ["month", [1, 2, 3, 4, 6]]],
          },
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

  const attachChartInteraction = (chart: Highcharts.Chart) => {
    // Charts are display-only. The panel click still opens fullscreen, but
    // chart-level drag, wheel, and mouse listeners are intentionally disabled.
    return;

    let isDragging = false;
    let dragStartX = 0, dragStartY = 0;
    let dxMin = 0, dxMax = 0, dyMin = 0, dyMax = 0;

    // Highcharts can consume wheel events even when mouse-wheel zoom is off.
    // Forward chart wheel input to the page so scrolling never gets trapped.
    const forwardWheelToPage = (event: WheelEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(".chart-range-dropdown")) return;
      event.preventDefault();
      window.scrollBy({ top: event.deltaY, left: event.deltaX, behavior: "auto" });
    };
    chart.container.addEventListener("wheel", forwardWheelToPage, { capture: true, passive: false });

    // Left-click drag → pan X and Y
    chart.container.addEventListener('mousedown', (e: MouseEvent) => {
      if (e.button !== 0) return;
      const target = e.target instanceof Element ? e.target : null;
      if (
        target?.closest(
          ".highcharts-button, .highcharts-range-selector-group, .highcharts-navigator, .highcharts-scrollbar"
        )
      ) {
        return;
      }
      const point = chart.pointer.normalize(e);
      if (!chart.isInsidePlot(point.chartX - chart.plotLeft, point.chartY - chart.plotTop)) {
        return;
      }
      isDragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      dxMin = typeof chart.xAxis[0].min === 'number' ? chart.xAxis[0].min : 0;
      dxMax = typeof chart.xAxis[0].max === 'number' ? chart.xAxis[0].max : 1;
      dyMin = typeof chart.yAxis[0].min === 'number' ? chart.yAxis[0].min : 0;
      dyMax = typeof chart.yAxis[0].max === 'number' ? chart.yAxis[0].max : 1;
      chart.container.style.cursor = 'grabbing';
      chart.container.classList.add('dragging');
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e: MouseEvent) => {
      if (!isDragging) return;
      const xShift = -((e.clientX - dragStartX) / chart.plotWidth)  * (dxMax - dxMin);
      const yShift =  ((e.clientY - dragStartY) / chart.plotHeight) * (dyMax - dyMin);
      chart.xAxis[0].setExtremes(dxMin + xShift, dxMax + xShift, false);
      chart.yAxis[0].setExtremes(dyMin + yShift, dyMax + yShift, true);
    });

    document.addEventListener('mouseup', () => {
      if (!isDragging) return;
      isDragging = false;
      chart.container.style.cursor = 'pointer';
      chart.container.classList.remove('dragging');
    });

    // Double-click → reset
    chart.container.addEventListener('dblclick', () => {
      chart.xAxis[0].setExtremes(undefined, undefined, false);
      chart.yAxis[0].setExtremes(undefined, undefined, true);
    });
    Highcharts.addEvent(chart, "destroy", () => {
      chart.container.removeEventListener("wheel", forwardWheelToPage, true);
    });
  };

  const wealthOptions: Highcharts.Options = {
    accessibility: { enabled: true },
    chart: {
      type: "areaspline",
      backgroundColor: "transparent",
      height: 300,
      style: { fontFamily: "Inter, system-ui, sans-serif" },
      animation: { duration: 450, easing: "easeOutQuart" } as Highcharts.AnimationOptionsObject,
      spacing: [8, 12, 14, 12],
      borderRadius: 0,
      zoomType: undefined,
      panning: { enabled: false },
      zooming: { mouseWheel: { enabled: false } },
      reflow: true,
      resetZoomButton: { theme: { display: "none" } },
      events: {
        load: function(this: Highcharts.Chart) {
          attachChartInteraction(this);
        }
      }
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
        color: "rgba(96, 165, 250, 0.5)",
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
          color: "rgba(96, 165, 250, 0.7)",
          dashStyle: "Dash",
          snap: false,
          label: {
            enabled: true,
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
    grid: {
      left: 65,
      right: 20,
      top: 10,
      bottom: 38,
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
        lineStyle: { color: "rgba(96,165,250,0.6)", type: "dashed", width: 1 },
        crossStyle: { color: "rgba(96,165,250,0.6)", width: 1 },
        label: {
          show: true,
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
          <div style="color:#5e6b80;font-size:11px;margin-bottom:10px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase">${date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;padding:6px 0"><span style="color:#5e6b80;font-size:12px;font-weight:600">Profit</span><span style="color:#10b981;font-weight:700;font-size:13px">${formatMoney(profit)}</span></div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;padding:6px 0"><span style="color:#5e6b80;font-size:12px;font-weight:600">Loss</span><span style="color:#ef4444;font-weight:700;font-size:13px">${formatMoney(loss)}</span></div>
          <div style="border-top:1.5px solid rgba(59,130,246,0.2);padding-top:8px;display:flex;justify-content:space-between;align-items:center"><span style="color:#5e6b80;font-size:11px;font-weight:600">Net P&L</span><span style="color:${netColor};font-weight:800;font-size:13px">${formatMoney(net)}</span></div>
        </div>`;
      },
    },
    xAxis: {
      type: "time",
      splitLine: { show: false },
      axisLine: { lineStyle: { color: "rgba(59, 130, 246, 0.2)", width: 1 } },
      axisLabel: { color: "#5e6b80", fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 600 },
      boundaryGap: false,
      gridLineColor: "rgba(59, 130, 246, 0.08)",
      axisPointer: {
        show: false,
        label: {
          show: true,
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
        label: {
          show: true,
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
    <div className="page-content" ref={dashboardRef}>
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

        <div className="dashboard-actions">


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

      <div className="stats-grid">
        <StatCard
          title="Current balance"
          value={currentBalance}
          formatValue={(value) => formatCurrency(value, user.currency)}
          subtitle={
            user.investmentIncluded && (user.investments ?? []).length > 0
              ? `+${formatCurrency(Math.abs(netPerformance), user.currency)} net · incl. investments`
              : `${netPerformance >= 0 ? "+" : "-"}${formatCurrency(Math.abs(netPerformance), user.currency)} net`
          }
          positive={netPerformance >= 0}
          icon={<Wallet size={19} />}
          colorVariant="blue"
        />

        <StatCard
          title="Total profit"
          value={totalProfit}
          formatValue={(value) => formatCurrency(value, user.currency)}
          subtitle="Profit recorded"
          positive
          icon={<TrendingUp size={19} />}
          colorVariant="green"
        />

        <StatCard
          title="Total loss"
          value={totalLoss}
          formatValue={(value) => formatCurrency(value, user.currency)}
          subtitle="Loss recorded"
          positive={false}
          icon={<TrendingDown size={19} />}
          colorVariant="red"
        />

        <StatCard
          title="Net performance"
          value={netPerformance}
          formatValue={(value) => formatCurrency(value, user.currency)}
          subtitle={`${performancePercentage.toFixed(1)}% performance`}
          positive={netPerformance >= 0}
          icon={<BarChart3 size={19} />}
          colorVariant={netPerformance >= 0 ? "green" : "amber"}
        />
      </div>

      <div className="stats-grid" style={{ opacity: 0.9 }}>
        <StatCard
          title="Win Rate"
          value={winRate}
          formatValue={(value) => `${value.toFixed(1)}%`}
          subtitle={`${profitCount} wins, ${lossCount} losses`}
          positive={winRate >= 50}
          icon={<TrendingUp size={19} />}
          colorVariant="purple"
        />

        <StatCard
          title="Avg Profit/Trade"
          value={avgProfitPerTrade}
          formatValue={(value) => formatCurrency(value, user.currency)}
          subtitle={`${profitCount} profitable trades`}
          positive
          icon={<TrendingUp size={19} />}
          colorVariant="green"
        />

        <StatCard
          title="Avg Loss/Trade"
          value={avgLossPerTrade}
          formatValue={(value) => formatCurrency(value, user.currency)}
          subtitle={`${lossCount} losing trades`}
          positive={false}
          icon={<TrendingDown size={19} />}
          colorVariant="red"
        />

        <StatCard
          title="Total Trades"
          value={totalTrades}
          formatValue={(value) => value.toFixed(0)}
          subtitle={`${user.transactions.length} recorded`}
          positive
          icon={<BarChart3 size={19} />}
          colorVariant="blue"
        />
      </div>

      <section className={`trading-pace-coach ${paceCoach.tone}`} aria-live="polite">
        <div className="trading-pace-icon" aria-hidden="true">{paceCoach.icon}</div>
        <div className="trading-pace-content">
          <div className="trading-pace-heading">
            <span className="eyebrow">TRADING PACE COACH</span>
            <strong>{paceCoach.title}</strong>
          </div>
          <p>{paceCoach.message}</p>
          <span className="trading-pace-detail">{paceCoach.detail}</span>
        </div>
      </section>

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
          <ChartRangeDropdown chartRef={wealthChartRef} value={wealthRange} onChange={setWealthRange} />
          <HighchartsStockChart
            ref={wealthChartRef}
            highcharts={HighchartsStock}
            constructorType="stockChart"
            options={candlestickOptions}
          />
        </ChartPanel>

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
            })
          }
        >
          <EChartsChart
            option={profitLossTrendOption}
            style={{ height: 300, width: "100%" }}
            notMerge
            lazyUpdate
          />
        </ChartPanel>
      </div>

      <ChartFullscreenModal
        open={Boolean(fullscreenChart)}
        title={fullscreenChart?.title ?? ""}
        subtitle={fullscreenChart?.subtitle ?? ""}
        kind={fullscreenChart?.kind ?? "highcharts"}
        highchartsOptions={fullscreenChart?.highchartsOptions}
        stockOptions={fullscreenChart?.stockOptions}
        defaultChartMode={fullscreenChart?.defaultChartMode}
        echartsOption={fullscreenChart?.echartsOption}
        onClose={closeFullscreenChart}
      />
    </div>
  );
};

export default Dashboard;
