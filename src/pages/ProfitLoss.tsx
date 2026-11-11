import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  TrendingUp,
  TrendingDown,
  Calendar,
  DollarSign,
  X,
} from "lucide-react";
import type { Transaction, UserAccount } from "../types/finance";
import { formatCurrency } from "../utils/money";
import { calculateBalanceStats } from "../utils/balance";
import { usePersistentState } from "../hooks/usePersistentState";

const parseLocalDate = (value: string) => {
  // Handle different date formats consistently
  if (!value) return null;
  
  try {
    // If it's already in ISO format, use it directly
    if (value.includes('T')) {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) {
        return date;
      }
    }
    
    // If it's just a date string, parse it as local date
    const date = new Date(value + 'T00:00:00');
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
    
    // Fallback: try direct parsing
    const fallbackDate = new Date(value);
    if (!Number.isNaN(fallbackDate.getTime())) {
      return fallbackDate;
    }
  } catch (error) {
    console.warn('Date parsing error:', value, error);
  }

  return null;
};

type DailyTransactionGroup = { profit: number; loss: number; transactions: Transaction[] };

const getDateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const generateCalendarDays = (
  month: Date,
  transactionsByDate: Map<string, DailyTransactionGroup>,
  largestProfit: number,
  largestLoss: number,
) => {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstDay = new Date(year, monthIndex, 1);
  
  // Calculate the start date (Sunday before the first day of the month)
  const startDate = new Date(firstDay);
  const dayOfWeek = firstDay.getDay(); // 0 = Sunday, 1 = Monday, etc.
  startDate.setDate(firstDay.getDate() - dayOfWeek);
  
  const days = [];
  const current = new Date(startDate);
  const todayKey = getDateKey(new Date());
  
  // Generate 42 days (6 weeks) for proper calendar layout
  for (let i = 0; i < 42; i++) {
    // Create date key for current calendar day
    const dateKey = getDateKey(current);
    
    const dayData = transactionsByDate.get(dateKey);
    const isCurrentMonth = current.getMonth() === monthIndex;
    
    let dayType = 'neutral';
    let amount = null;
    let intensity = 0;
    let tooltip = current.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    
    if (dayData && isCurrentMonth) {
      const netAmount = dayData.profit - dayData.loss;
      if (netAmount > 0) {
        dayType = 'profit';
        amount = netAmount;
        intensity = largestProfit ? Math.max(1, Math.ceil((netAmount / largestProfit) * 4)) : 1;
        tooltip = `${tooltip}\nProfit: ₹${dayData.profit.toLocaleString()}\nLoss: ₹${dayData.loss.toLocaleString()}\nNet: +₹${netAmount.toLocaleString()}`;
      } else if (netAmount < 0) {
        dayType = 'loss';
        amount = Math.abs(netAmount);
        intensity = largestLoss ? Math.max(1, Math.ceil((Math.abs(netAmount) / largestLoss) * 4)) : 1;
        tooltip = `${tooltip}\nProfit: ₹${dayData.profit.toLocaleString()}\nLoss: ₹${dayData.loss.toLocaleString()}\nNet: -₹${Math.abs(netAmount).toLocaleString()}`;
      } else if (dayData.profit > 0 || dayData.loss > 0) {
        dayType = 'neutral';
        amount = dayData.profit + dayData.loss; // Show total volume for breakeven days
        tooltip = `${tooltip}\nProfit: ₹${dayData.profit.toLocaleString()}\nLoss: ₹${dayData.loss.toLocaleString()}\nNet: ₹0 (Breakeven)`;
      }
    }
    
    days.push({
      day: current.getDate(),
      dateKey,
      type: dayType,
      amount: amount,
      profit: dayData?.profit ?? 0,
      loss: dayData?.loss ?? 0,
      transactions: dayData?.transactions ?? [],
      intensity,
      isEmpty: !isCurrentMonth,
      tooltip: tooltip,
      hasData: !!dayData,
      isToday: isCurrentMonth && dateKey === todayKey,
      isVisible: isCurrentMonth  // Add visibility flag for current month only
    });
    
    current.setDate(current.getDate() + 1);
  }
  
  return days;
};

interface Props {
  user: UserAccount;
}

const ProfitLoss = ({ user }: Props) => {
  const [selectedPeriod, setSelectedPeriod] = usePersistentState("profitLoss.period", "all");
  const [calendarMonths, setCalendarMonths] = usePersistentState("profitLoss.calendarMonths", 1);
  const [selectedDay, setSelectedDay] = useState<{
    dateKey: string;
    transactions: Transaction[];
  } | null>(null);

  useEffect(() => {
    if (!selectedDay) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedDay(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedDay]);

  const filteredTransactions = useMemo(() => {
    const monthsByPeriod: Record<string, number> = {
      "1m": 1,
      "3m": 3,
      "6m": 6,
      "1y": 12,
    };
    const months = monthsByPeriod[selectedPeriod];

    if (!months) return user.transactions;

    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setMonth(cutoff.getMonth() - months);

    return user.transactions.filter((transaction) => {
      const date = parseLocalDate(transaction.date);
      return Boolean(date && date >= cutoff);
    });
  }, [selectedPeriod, user.transactions]);

  const calendarMonthsData = useMemo(() => {
    const transactionsByDate = new Map<string, DailyTransactionGroup>();
    filteredTransactions.forEach((transaction) => {
      const date = parseLocalDate(transaction.date);
      if (!date) return;
      const key = getDateKey(date);
      const group = transactionsByDate.get(key) ?? { profit: 0, loss: 0, transactions: [] };
      group[transaction.type] += transaction.amount;
      group.transactions.push(transaction);
      transactionsByDate.set(key, group);
    });

    let largestProfit = 0;
    let largestLoss = 0;
    transactionsByDate.forEach((group) => {
      const net = group.profit - group.loss;
      if (net > largestProfit) largestProfit = net;
      if (net < 0 && Math.abs(net) > largestLoss) largestLoss = Math.abs(net);
    });

    const currentMonth = new Date();
    currentMonth.setDate(1);
    currentMonth.setHours(0, 0, 0, 0);
    return Array.from({ length: calendarMonths }, (_, monthOffset) => {
      const month = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - monthOffset, 1);
      let monthNet = 0;
      let monthTransactionCount = 0;
      const monthDays = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
      for (let day = 1; day <= monthDays; day += 1) {
        const daily = transactionsByDate.get(getDateKey(new Date(month.getFullYear(), month.getMonth(), day)));
        if (!daily) continue;
        monthNet += daily.profit - daily.loss;
        monthTransactionCount += daily.transactions.length;
      }
      return {
        currentMonth: month,
        monthNet,
        monthTransactionCount,
        days: generateCalendarDays(month, transactionsByDate, largestProfit, largestLoss),
      };
    });
  }, [calendarMonths, filteredTransactions]);

  const stats = useMemo(() => {
    const balanceStats = calculateBalanceStats({ ...user, transactions: filteredTransactions });
    
    const profitCount = filteredTransactions.filter((t) => t.type === "profit").length;
    const lossCount = filteredTransactions.filter((t) => t.type === "loss").length;
    const totalTrades = profitCount + lossCount;
    const winRate = totalTrades > 0 ? (profitCount / totalTrades) * 100 : 0;
    const avgProfitPerTrade = profitCount > 0 ? balanceStats.totalProfit / profitCount : 0;
    const avgLossPerTrade = lossCount > 0 ? balanceStats.totalLoss / lossCount : 0;

    // Calculate total costs from all transactions
    const totalCosts = filteredTransactions.reduce((sum, transaction) => {
      return sum + (transaction.costAmount || 0);
    }, 0);

    return {
      ...balanceStats,
      profitCount,
      lossCount,
      totalTrades,
      winRate,
      avgProfitPerTrade,
      avgLossPerTrade,
      totalCosts,
    };
  }, [filteredTransactions, user]);

  const selectedDayTransactions = selectedDay
    ? [...selectedDay.transactions].sort(
        (left, right) => new Date(right.date).getTime() - new Date(left.date).getTime(),
      )
    : [];
  const selectedDaySummary = selectedDayTransactions.reduce(
    (summary, transaction) => {
      if (transaction.type === "profit") summary.profit += transaction.amount;
      else summary.loss += transaction.amount;
      summary.costs += transaction.costAmount ?? 0;
      return summary;
    },
    { profit: 0, loss: 0, costs: 0 },
  );
  const selectedDayNet = selectedDaySummary.profit - selectedDaySummary.loss;
  const selectedDayDate = selectedDay
    ? new Date(`${selectedDay.dateKey}T00:00:00`)
    : null;

  return (
    <div className="page-content pl-page">
      <div className="pl-page-header">
        <div>
          <span className="eyebrow">P&L ANALYSIS</span>
          <h1>Profit & Loss Analysis</h1>
          <p>Comprehensive view of your trading performance and profitability.</p>
        </div>
        
        <div className="pl-period-control">
          <select 
            value={selectedPeriod} 
            onChange={(e) => setSelectedPeriod(e.target.value)}
            className="period-selector"
          >
            <option value="all">All Time</option>
            <option value="1m">Last Month</option>
            <option value="3m">Last 3 Months</option>
            <option value="6m">Last 6 Months</option>
            <option value="1y">Last Year</option>
          </select>
        </div>
      </div>

      {/* P&L Overview Cards - Profit, Loss & Cost */}
      <div className="pl-summary-grid">
        <div className="pl-summary-card profit-card">
          <div className="stat-card-top">
            <div className="stat-icon profit">
              <TrendingUp size={19} />
            </div>
            <span>Total Profit</span>
          </div>
          <div className="stat-value positive">{formatCurrency(stats.totalProfit, user.currency)}</div>
          <div className="stat-trend positive">{stats.profitCount} profitable trades</div>
        </div>

        <div className="pl-summary-card loss-card">
          <div className="stat-card-top">
            <div className="stat-icon loss">
              <TrendingDown size={19} />
            </div>
            <span>Total Loss</span>
          </div>
          <div className="stat-value negative">{formatCurrency(stats.totalLoss, user.currency)}</div>
          <div className="stat-trend negative">{stats.lossCount} losing trades</div>
        </div>

        <div className="pl-summary-card cost-card">
          <div className="stat-card-top">
            <div className="stat-icon cost">
              <DollarSign size={19} />
            </div>
            <span>Total Cost</span>
          </div>
          <div className="stat-value cost">{formatCurrency(stats.totalCosts, user.currency)}</div>
          <div className="stat-trend neutral">All transaction costs</div>
        </div>
      </div>

      {/* Trading Calendar - Dashboard Style */}
      <section className="pl-calendar-section">
        <div className="pl-calendar-toolbar">
          <div>
            <span className="eyebrow">TRADING CALENDAR</span>
            <h2>Daily Performance Overview</h2>
            <p>{filteredTransactions.length} transactions in the selected period</p>
          </div>
          <div className="pl-calendar-controls">
            <div className="calendar-legend" aria-label="Calendar legend">
              <span><i className="profit-dot" /> Profit</span>
              <span><i className="loss-dot" /> Loss</span>
              <span><i className="neutral-dot" /> No activity</span>
            </div>
            <select 
              value={calendarMonths} 
              onChange={(e) => setCalendarMonths(Number(e.target.value))}
              className="period-selector"
            >
              <option value={1}>1 Month</option>
              <option value={2}>2 Months</option>
              <option value={3}>3 Months</option>
              <option value={6}>6 Months</option>
            </select>
          </div>
        </div>
        
        <div className="pl-calendar-grid">
          {calendarMonthsData.map(({ currentMonth, monthNet, monthTransactionCount, days }, monthOffset) => {
            return (
              <div key={monthOffset} className="calendar-card pl-month-card">
                <div className="calendar-card-header">
                  <div className="calendar-card-title">
                    <Calendar size={20} />
                    <h3>{currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h3>
                  </div>
                  <div className={`pl-month-summary ${monthNet > 0 ? "positive" : monthNet < 0 ? "negative" : "neutral"}`}>
                    <strong>{monthNet > 0 ? "+" : ""}{formatCurrency(monthNet, user.currency)}</strong>
                    <span>{monthTransactionCount} {monthTransactionCount === 1 ? "trade" : "trades"} · net</span>
                  </div>
                </div>
                
                <div className="calendar-card-content">
                  <div className="calendar-day-headers">
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(day => (
                      <div key={day} className="calendar-day-header">{day}</div>
                    ))}
                  </div>
                  
                  <div className="calendar-days-grid">
                    {days.map((day, index) => (
                      day.isVisible ? (
                        <button
                          type="button"
                          key={index} 
                          className={`calendar-day-cell ${day.type} strength-${day.intensity} ${day.isEmpty ? 'empty' : ''} ${day.isToday ? 'today' : ''}`}
                          title={day.tooltip}
                          aria-label={`${day.tooltip}. View day's transaction summary.`}
                          aria-haspopup="dialog"
                          onClick={() => setSelectedDay({ dateKey: day.dateKey, transactions: day.transactions })}
                        >
                          <span className="day-number">{day.day}</span>
                          {day.amount && <span className="day-amount">₹{Math.floor(day.amount)}</span>}
                        </button>
                      ) : (
                        <div key={index} className="calendar-day-cell invisible"></div>
                      )
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {selectedDay && selectedDayDate && (
        <div
          className="modal-overlay daily-summary-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedDay(null);
          }}
        >
          <section className="daily-summary-dialog" role="dialog" aria-modal="true" aria-labelledby="daily-summary-title">
            <header className="daily-summary-header">
              <div>
                <span className="eyebrow">DAILY TRADE SUMMARY</span>
                <h2 id="daily-summary-title">
                  {selectedDayDate.toLocaleDateString("en-IN", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </h2>
                <p>{selectedDayTransactions.length} transaction{selectedDayTransactions.length === 1 ? "" : "s"} recorded</p>
              </div>
              <button type="button" className="close-button" onClick={() => setSelectedDay(null)} aria-label="Close daily summary">
                <X size={18} />
              </button>
            </header>

            <div className={`daily-summary-net ${selectedDayNet >= 0 ? "positive" : "negative"}`}>
              <span>Net result</span>
              <strong>{formatCurrency(selectedDayNet, user.currency)}</strong>
            </div>

            <div className="daily-summary-metrics">
              <div className="daily-summary-metric profit">
                <span>Profit after costs</span>
                <strong>{formatCurrency(selectedDaySummary.profit, user.currency)}</strong>
              </div>
              <div className="daily-summary-metric loss">
                <span>Loss including costs</span>
                <strong>{formatCurrency(selectedDaySummary.loss, user.currency)}</strong>
              </div>
              <div className="daily-summary-metric costs">
                <span>Recorded costs</span>
                <strong>{formatCurrency(selectedDaySummary.costs, user.currency)}</strong>
              </div>
            </div>

            <div className="daily-summary-list-heading">
              <h3>Transactions</h3>
              <span>{selectedDayTransactions.length}</span>
            </div>

            {selectedDayTransactions.length ? (
              <div className="daily-summary-transaction-list">
                {selectedDayTransactions.map((transaction) => {
                  const transactionDate = parseLocalDate(transaction.date);
                  const isProfit = transaction.type === "profit";
                  const grossAmount = transaction.grossAmount ?? transaction.amount;

                  return (
                    <article className="daily-summary-transaction" key={transaction.id}>
                      <div className={`daily-summary-transaction-icon ${isProfit ? "profit" : "loss"}`} aria-hidden="true">
                        {isProfit ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                      </div>
                      <div className="daily-summary-transaction-description">
                        <strong>{transaction.category || (isProfit ? "Profit trade" : "Loss trade")}</strong>
                        <span>{transaction.note || "No note added"}</span>
                        <small>
                          {transactionDate?.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }) ?? "Time unavailable"}
                          {transaction.costAmount ? ` · Before costs ${formatCurrency(grossAmount, user.currency)} · Costs ${formatCurrency(transaction.costAmount, user.currency)}` : ""}
                        </small>
                      </div>
                      <strong className={`daily-summary-transaction-amount ${isProfit ? "profit" : "loss"}`}>
                        {isProfit ? "+" : "−"}{formatCurrency(transaction.amount, user.currency)}
                      </strong>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="daily-summary-empty">No transactions were recorded on this day.</div>
            )}

            <footer className="daily-summary-footer">
              <span>Transaction amounts reflect the saved net P&amp;L.</span>
              <button type="button" className="secondary-button" onClick={() => setSelectedDay(null)}>Close</button>
            </footer>
          </section>
        </div>
      )}

    </div>
  );
};

export default ProfitLoss;
