import { useMemo, useState, useEffect } from "react";
import Highcharts from "highcharts";
import HighchartsStock from "highcharts/highstock";
import HighchartsReact from "highcharts-react-official";
import ReactECharts from "echarts-for-react";
import {
  BarChart3,
  Download,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";

import StatCard from "../components/StatCard";
import ChartPanel from "../components/ChartPanel";
import ChartFullscreenModal from "../components/ChartFullscreenModal";

import type { UserAccount } from "../types/finance";
import { exportFinanceToExcel } from "../utils/excel";
import { formatCurrency } from "../utils/money";
import { calculateBalanceStats, getAuthoritativeBalance } from "../utils/balance";

const HighchartsChart =
  (HighchartsReact as unknown as {
    default?: typeof HighchartsReact;
  }).default ?? HighchartsReact;

const HighchartsStockChart =
  (HighchartsReact as unknown as {
    default?: typeof HighchartsReact;
  }).default ?? HighchartsReact;

const EChartsChart =
  (ReactECharts as unknown as {
    default?: typeof ReactECharts;
  }).default ?? ReactECharts;

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
  const [refreshKey, setRefreshKey] = useState(0);
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

  // Force re-render when transactions change
  useEffect(() => {
    setRefreshKey(prev => prev + 1);
  }, [user.transactions.length, user.currentBalance, user.startingBalance, user.investmentIncluded, (user.investments ?? []).map(i => i.currentValue).join(','), user.transactions.map(t => `${t.id}-${t.amount}-${t.type}`).join(',')]); 

  const formatMoney = (value: number) => formatCurrency(value, user.currency);

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
  }, [user.transactions, user.startingBalance, user.currentBalance, user.defaultCostAmount, user.investmentIncluded, user.investments, refreshKey]);

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
  }, [user.startingBalance, user.transactions, user.createdAt, currentBalance, refreshKey, totalProfit, totalLoss]);

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

    // Create cumulative series (always going up)
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
  }, [user.createdAt, user.transactions, refreshKey]);

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
          height: 420,
          spacing: [32, 32, 34, 32],
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
          selected: 5,
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
          buttons: [
            { type: "month", count: 1, text: "1m" },
            { type: "month", count: 3, text: "3m" },
            { type: "month", count: 6, text: "6m" },
            { type: "ytd", text: "YTD" },
            { type: "year", count: 1, text: "1y" },
            { type: "year", count: 6, text: "6Y" },
            { type: "all", text: "All Time" },
          ],
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
        height: 420,
        spacing: [32, 32, 36, 32],
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
        selected: 5,
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
        buttons: [
          { type: "month", count: 1, text: "1m" },
          { type: "month", count: 3, text: "3m" },
          { type: "month", count: 6, text: "6m" },
          { type: "ytd", text: "YTD" },
          { type: "year", count: 1, text: "1y" },
          { type: "year", count: 5, text: "5y" },
          { type: "all", text: "All" },
        ],
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
  }, [formatMoney, user.createdAt, user.startingBalance, user.transactions, refreshKey]);

  const categoryData = useMemo(() => {
    const categories: Record<string, number> = {};

    user.transactions
      .filter((transaction) => transaction.type === "loss")
      .forEach((transaction) => {
        categories[transaction.category] =
          (categories[transaction.category] || 0) + transaction.amount;
      });

    return Object.entries(categories)
      .map(([name, amount]) => ({ name, amount }))
      .sort((left, right) => right.amount - left.amount)
      .slice(0, 6);
  }, [user.transactions, refreshKey]);

  // ─── Shared helper: attach left-click pan to Highcharts charts ───
  const attachChartInteraction = (chart: Highcharts.Chart) => {
    let isDragging = false;
    let dragStartX = 0, dragStartY = 0;
    let dxMin = 0, dxMax = 0, dyMin = 0, dyMax = 0;

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
      chart.container.style.cursor = 'crosshair';
    });

    // Double-click → reset
    chart.container.addEventListener('dblclick', () => {
      chart.xAxis[0].setExtremes(undefined, undefined, false);
      chart.yAxis[0].setExtremes(undefined, undefined, true);
    });
  };

  const wealthOptions: Highcharts.Options = {
    accessibility: { enabled: true },
    chart: {
      type: "areaspline",
      backgroundColor: "transparent",
      height: 320,
      style: { fontFamily: "Inter, system-ui, sans-serif" },
      animation: { duration: 1800, easing: "easeOutQuart" } as Highcharts.AnimationOptionsObject,
      spacing: [20, 20, 20, 20],
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
              enabled: true,
              radius: 9,
              fillColor: "#60a5fa",
              lineColor: "#ffffff",
              lineWidth: 2,
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
            lineWidth: 2.8,
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
    animation: { duration: 1600, easing: "cubicOut" },
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
      top: 20,
      bottom: 48,
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
      trigger: "axis",
      transitionDuration: 0.12,
      axisPointer: { 
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
        show: true,
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
        show: true,
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
          focus: "series",
          scale: true,
          lineStyle: { width: 3 },
          itemStyle: { borderColor: "#ffffff", borderWidth: 2 },
          shadowColor: "rgba(16, 185, 129, 0.35)",
          shadowBlur: 14,
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
          focus: "series",
          scale: true,
          lineStyle: { width: 3 },
          itemStyle: { borderColor: "#ffffff", borderWidth: 2 },
          shadowColor: "rgba(239, 68, 68, 0.35)",
          shadowBlur: 14,
        },
        data: profitLossData.map((item) => [item.date, item.loss]),
      },
    ],
  };

  const PIE_COLORS = ["#4f8fff", "#00e5a0", "#f5a623", "#ff4d6a", "#a78bfa", "#34d399"];

  const expenseOption = {
    backgroundColor: "transparent",
    animation: true,
    animationDuration: 1200,
    animationEasing: "cubicOut",
    tooltip: {
      trigger: "item",
      backgroundColor: "transparent",
      borderWidth: 0,
      padding: 0,
      formatter: (params: unknown) => {
        const p = params as { name: string; value: number; percent: number; color: string };
        return `<div style="background:rgba(10,14,24,0.96);border:1.5px solid rgba(59,130,246,0.4);border-radius:12px;padding:12px 16px;box-shadow:0 12px 40px rgba(0,0,0,0.7),inset 0 1px 2px rgba(255,255,255,0.08)">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${p.color}"></span><span style="color:#e8edf5;font-weight:700;font-size:13px">${p.name}</span></div>
          <div style="color:#3b82f6;font-weight:800;font-size:16px;margin-bottom:6px">${formatMoney(p.value)}</div>
          <div style="display:flex;justify-content:space-between;align-items:center;padding-top:8px;border-top:1px solid rgba(59,130,246,0.2)"><span style="color:#5e6b80;font-size:11px;font-weight:600">Percentage</span><span style="color:#10b981;font-weight:700;font-size:12px">${p.percent.toFixed(1)}%</span></div>
        </div>`;
      },
    },
    legend: {
      top: "bottom",
      icon: "circle",
      itemGap: 16,
      textStyle: { color: "#9aa5ba", fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 600 },
      inactiveColor: "rgba(94, 107, 128, 0.4)",
    },
    series: [
      {
        name: "Expenses",
        type: "pie",
        radius: ["50%", "82%"],
        center: ["50%", "44%"],
        avoidLabelOverlap: true,
        itemStyle: {
          borderColor: "rgba(6, 8, 16, 0.95)",
          borderWidth: 3,
          borderRadius: 8,
          shadowColor: "rgba(0, 0, 0, 0.4)",
          shadowBlur: 12,
          shadowOffsetX: 0,
          shadowOffsetY: 4,
        },
        label: {
          show: true,
          color: "#9aa5ba",
          fontFamily: "Inter, sans-serif",
          fontSize: 11,
          fontWeight: 600,
          formatter: "{b}",
        },
        emphasis: {
          itemStyle: {
            shadowBlur: 24,
            shadowOffsetX: 0,
            shadowColor: "rgba(59, 130, 246, 0.6)",
            borderColor: "rgba(59, 130, 246, 0.8)",
            borderWidth: 3,
          },
          label: { show: true, fontWeight: 800, fontSize: 13, color: "#e8edf5" },
          scale: true,
          scaleSize: 8,
        },
        data:
          categoryData.length > 0
            ? categoryData.map((item, index) => ({
                name: item.name,
                value: item.amount,
                itemStyle: { color: PIE_COLORS[index % PIE_COLORS.length] },
              }))
            : [{ name: "No expenses", value: 1, itemStyle: { color: "#1e2738" }, label: { color: "#5e6b80" } }],
      },
    ],
  };

  const gaugeColor = performancePercentage >= 70 ? "#10b981" : performancePercentage >= 40 ? "#f5a623" : "#ff4d6a";
  const gaugeGlow  = performancePercentage >= 70 ? "rgba(16,185,129,0.5)"  : performancePercentage >= 40 ? "rgba(245,166,35,0.5)"  : "rgba(255,77,106,0.5)";

  const healthOption = {
    backgroundColor: "transparent",
    animation: true,
    animationDuration: 1600,
    animationEasing: "cubicOut",
    series: [
      {
        type: "gauge",
        startAngle: 200,
        endAngle: -20,
        center: ["50%", "58%"],
        radius: "92%",
        min: 0,
        max: 100,
        progress: {
          show: true,
          roundCap: true,
          width: 24,
          itemStyle: {
            color: {
              type: "linear",
              x: 0, y: 0, x2: 1, y2: 0,
              colorStops: [
                { offset: 0, color: performancePercentage >= 40 ? "#4f8fff" : "#ff4d6a" },
                { offset: 1, color: gaugeColor },
              ],
            },
            shadowColor: gaugeGlow,
            shadowBlur: 20,
            shadowOffsetX: 0,
            shadowOffsetY: 6,
          },
        },
        axisLine: {
          roundCap: true,
          lineStyle: {
            width: 24,
            color: [[1, "rgba(30, 39, 56, 0.7)"]],
            shadowColor: "rgba(0, 0, 0, 0.3)",
            shadowBlur: 8,
          },
        },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        pointer: { show: false },
        detail: {
          valueAnimation: true,
          formatter: "{value}%",
          color: "#e8edf5",
          fontSize: 36,
          fontWeight: "900",
          fontFamily: "Inter, sans-serif",
          offsetCenter: [0, "8%"],
        },
        title: {
          offsetCenter: [0, "40%"],
          color: "#5e6b80",
          fontSize: 12,
          fontWeight: 600,
          fontFamily: "Inter, sans-serif",
        },
        data: [{ value: Number(performancePercentage.toFixed(1)), name: "financial health" }],
      },
    ],
  };

  return (
    <div className="page-content">
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
            Good evening, {user.name.split(" ")[0]}{" "}
            <span className="green-star">*</span>
          </h1>

          <p>Here is the live view of your money right now.</p>
        </div>

        <div className="dashboard-actions">


          <button className="secondary-button" onClick={() => exportFinanceToExcel(user)}>
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

      <div className="charts-two-column">
        <ChartPanel
          title="Wealth Chart"
          subtitle="Your wealth over time, built from profits and losses"
          action={<span className="live-badge">LIVE</span>}
          onClick={() =>
            setFullscreenChart({
              title: "Wealth Chart",
              subtitle: "Your wealth over time, built from profits and losses",
              kind: "highcharts",
              highchartsOptions: wealthOptions,
              stockOptions: candlestickOptions,
              defaultChartMode: "classic",
            })
          }
        >
          <HighchartsChart highcharts={Highcharts} options={wealthOptions} />
        </ChartPanel>

        <ChartPanel
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
            style={{ height: 320, width: "100%" }}
            notMerge
            lazyUpdate
          />
        </ChartPanel>
      </div>

      <div className="charts-one-column">
        <ChartPanel
          title="Candlestick"
          subtitle="Daily balance candles with time filters"
          action={<span className="live-badge">ALL TIME</span>}
          onClick={() =>
            setFullscreenChart({
              title: "Candlestick",
              subtitle: "Daily balance candles with time filters",
              kind: "stock",
              highchartsOptions: wealthOptions,
              stockOptions: candlestickOptions,
              defaultChartMode: "candlestick",
            })
          }
        >
          <HighchartsStockChart
            highcharts={HighchartsStock}
            constructorType="stockChart"
            options={candlestickOptions}
          />
        </ChartPanel>
      </div>

      <div className="charts-three-column">
        <ChartPanel
          title="Expense breakdown"
          subtitle="Where your money goes"
          onClick={() =>
            setFullscreenChart({
              title: "Expense breakdown",
              subtitle: "Where your money goes",
              kind: "echarts",
              echartsOption: expenseOption,
            })
          }
        >
          <div className="echart-panel">
            <EChartsChart
              option={expenseOption}
              style={{ height: 280, width: "100%" }}
              notMerge
              lazyUpdate
            />
          </div>
        </ChartPanel>

        <ChartPanel
          title="Financial health"
          subtitle="Based on your net performance"
          onClick={() =>
            setFullscreenChart({
              title: "Financial health",
              subtitle: "Based on your net performance",
              kind: "echarts",
              echartsOption: healthOption,
            })
          }
        >
          <div className="echart-panel">
            <EChartsChart
              option={healthOption}
              style={{ height: 280, width: "100%" }}
              notMerge
              lazyUpdate
            />
          </div>
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
        onClose={() => setFullscreenChart(null)}
      />
    </div>
  );
};

export default Dashboard;
