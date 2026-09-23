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
} from "lucide-react";

import ChartPanel from "../components/ChartPanel";

import type { UserAccount } from "../types/finance";
import { calculateBalanceStats } from "../utils/balance";

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
}

const formatMoney = (value: number, currency: string = "INR") =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);

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

const Analytics = ({ user, onSave }: Props) => {
  const [isEditingCost, setIsEditingCost] = useState(false);
  const [costInput, setCostInput] = useState(String(user.defaultCostAmount ?? 0));
  const [isCostLocked, setIsCostLocked] = useState(user.costLocked ?? false);

  const transactionCount = user.transactions.length;

  const balanceStats = calculateBalanceStats(user);
  const { totalProfit, totalLoss } = balanceStats;

  // Calculate total costs from all transactions
  const totalCosts = user.transactions.reduce((sum, transaction) => {
    return sum + (transaction.costAmount || 0);
  }, 0);

  const totalMovement = totalProfit + totalLoss;

  const profitCount = user.transactions.filter(
    (transaction) => transaction.type === "profit"
  ).length;

  const lossCount = user.transactions.filter(
    (transaction) => transaction.type === "loss"
  ).length;

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

  const historySummary = useMemo(() => {
    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(
      now.getMonth() + 1
    ).padStart(2, "0")}`;

    const allProfitDays = new Set<string>();
    const allLossDays = new Set<string>();
    const monthProfitDays = new Set<string>();
    const monthLossDays = new Set<string>();

    user.transactions.forEach((transaction) => {
      const parsedDate = parseLocalDate(transaction.date);

      if (!parsedDate) {
        return;
      }

      const dateKey = getDateKey(parsedDate);
      const monthKey = `${parsedDate.getFullYear()}-${String(
        parsedDate.getMonth() + 1
      ).padStart(2, "0")}`;

      if (transaction.type === "profit") {
        allProfitDays.add(dateKey);

        if (monthKey === currentMonthKey) {
          monthProfitDays.add(dateKey);
        }
      } else {
        allLossDays.add(dateKey);

        if (monthKey === currentMonthKey) {
          monthLossDays.add(dateKey);
        }
      }
    });

    return {
      allProfitDays: allProfitDays.size,
      allLossDays: allLossDays.size,
      monthProfitDays: monthProfitDays.size,
      monthLossDays: monthLossDays.size,
    };
  }, [user.transactions]);

  const streakSummary = useMemo(() => {
    const orderedTransactions = [...user.transactions]
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
  }, [user.transactions]);

  const monthlyData = useMemo(() => {
    const months: Record<
      string,
      {
        profit: number;
        loss: number;
      }
    > = {};

    user.transactions.forEach((transaction) => {
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
  }, [user.transactions]);

  const categoryData = useMemo(() => {
    const categories: Record<string, number> = {};

    user.transactions
      .filter((transaction) => transaction.type === "loss")
      .forEach((transaction) => {
        categories[transaction.category] =
          (categories[transaction.category] || 0) + transaction.amount;
      });

    return Object.entries(categories)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [user.transactions]);

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
      valuePrefix: "Rs ",
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
        name: "Loss categories",
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
          categoryData.length > 0
            ? categoryData.map((item, index) => ({
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
                  name: "No expenses",
                  value: 1,
                  itemStyle: {
                    color: "#303642",
                  },
                },
              ],
      },
    ],
  };

  const healthRatio =
    totalMovement > 0 ? (totalProfit / totalMovement) * 100 : 0;

  const healthOption = {
    backgroundColor: "transparent",
    series: [
      {
        type: "gauge",
        startAngle: 180,
        endAngle: 0,
        center: ["50%", "60%"],
        radius: "100%",
        min: 0,
        max: 100,
        progress: {
          show: true,
          roundCap: true,
          width: 18,
          itemStyle: {
            color:
              healthRatio >= 70
                ? "#36d399"
                : healthRatio >= 45
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
            value: Number(healthRatio.toFixed(1)),
            name: "profit share",
          },
        ],
      },
    ],
  };

  return (
    <div className="page-content">
      <div className="dashboard-header">
        <div>
          <span className="eyebrow">ANALYTICS</span>

          <h1>Performance analytics</h1>

          <p>Deep dive into trend, distribution, and balance behavior.</p>
        </div>

        <div className="dashboard-actions">
          <div className="analytics-pill">
            <Activity size={16} />
            {user.transactions.length} transactions
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
          <div className="stat-value">{healthRatio.toFixed(0)}%</div>
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
          title="Financial health"
          subtitle="Profit share inside the total movement"
        >
          <EChartsChart
            option={healthOption}
            style={{ height: 340, width: "100%" }}
            notMerge
            lazyUpdate
          />
        </ChartPanel>
      </div>

      <div className="charts-two-column">
        <ChartPanel
          title="Expense distribution"
          subtitle="Losses grouped by category"
        >
          <EChartsChart
            option={distributionOption}
            style={{ height: 340, width: "100%" }}
            notMerge
            lazyUpdate
          />
        </ChartPanel>

        <ChartPanel
          title="History summary"
          subtitle="All-time and this-month activity at a glance"
        >
          <div className="analytics-summary">
            <div className="snapshot-item">
              <span>This month profit days</span>
              <strong>{historySummary.monthProfitDays}</strong>
            </div>

            <div className="snapshot-item">
              <span>This month loss days</span>
              <strong>{historySummary.monthLossDays}</strong>
            </div>

            <div className="snapshot-item">
              <span>All-time profit days</span>
              <strong>{historySummary.allProfitDays}</strong>
            </div>

            <div className="snapshot-item">
              <span>All-time loss days</span>
              <strong>{historySummary.allLossDays}</strong>
            </div>
          </div>
        </ChartPanel>
      </div>
    </div>
  );
};

export default Analytics;
