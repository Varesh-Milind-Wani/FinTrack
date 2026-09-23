import { useMemo, useState } from "react";
import {
  TrendingUp,
  TrendingDown,
  Calendar,
  DollarSign,
} from "lucide-react";
import type { Transaction, UserAccount } from "../types/finance";
import { formatCurrency } from "../utils/money";
import { calculateBalanceStats } from "../utils/balance";

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

const generateCalendarDays = (month: Date, transactions: Transaction[]) => {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstDay = new Date(year, monthIndex, 1);
  
  // Calculate the start date (Sunday before the first day of the month)
  const startDate = new Date(firstDay);
  const dayOfWeek = firstDay.getDay(); // 0 = Sunday, 1 = Monday, etc.
  startDate.setDate(firstDay.getDate() - dayOfWeek);
  
  const days = [];
  const current = new Date(startDate);
  
  // Group transactions by date - use local date formatting
  const transactionsByDate: Record<string, { profit: number; loss: number; transactions: Transaction[] }> = {};
  
  transactions.forEach(transaction => {
    const date = parseLocalDate(transaction.date);
    if (date) {
      // Create date key in YYYY-MM-DD format using local timezone
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const dateKey = `${year}-${month}-${day}`;
      
      if (!transactionsByDate[dateKey]) {
        transactionsByDate[dateKey] = { profit: 0, loss: 0, transactions: [] };
      }
      
      const amount = transaction.amount;
      if (transaction.type === 'profit') {
        transactionsByDate[dateKey].profit += amount;
      } else {
        transactionsByDate[dateKey].loss += amount;
      }
      transactionsByDate[dateKey].transactions.push(transaction);
    }
  });

  // Use a separate scale for gains and losses so the calendar becomes a
  // readable heatmap: larger amounts receive a stronger colour treatment.
  const dailyTotals = Object.values(transactionsByDate).map((data) => data.profit - data.loss);
  const largestProfit = Math.max(0, ...dailyTotals.filter((total) => total > 0));
  const largestLoss = Math.max(0, ...dailyTotals.filter((total) => total < 0).map(Math.abs));
  
  // Generate 42 days (6 weeks) for proper calendar layout
  for (let i = 0; i < 42; i++) {
    // Create date key for current calendar day
    const year = current.getFullYear();
    const month = String(current.getMonth() + 1).padStart(2, '0');
    const day = String(current.getDate()).padStart(2, '0');
    const dateKey = `${year}-${month}-${day}`;
    
    const dayData = transactionsByDate[dateKey];
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
        intensity = Math.max(1, Math.ceil((netAmount / largestProfit) * 4));
        tooltip = `${tooltip}\nProfit: ₹${dayData.profit.toLocaleString()}\nLoss: ₹${dayData.loss.toLocaleString()}\nNet: +₹${netAmount.toLocaleString()}`;
      } else if (netAmount < 0) {
        dayType = 'loss';
        amount = Math.abs(netAmount);
        intensity = Math.max(1, Math.ceil((Math.abs(netAmount) / largestLoss) * 4));
        tooltip = `${tooltip}\nProfit: ₹${dayData.profit.toLocaleString()}\nLoss: ₹${dayData.loss.toLocaleString()}\nNet: -₹${Math.abs(netAmount).toLocaleString()}`;
      } else if (dayData.profit > 0 || dayData.loss > 0) {
        dayType = 'neutral';
        amount = dayData.profit + dayData.loss; // Show total volume for breakeven days
        tooltip = `${tooltip}\nProfit: ₹${dayData.profit.toLocaleString()}\nLoss: ₹${dayData.loss.toLocaleString()}\nNet: ₹0 (Breakeven)`;
      }
    }
    
    days.push({
      day: current.getDate(),
      type: dayType,
      amount: amount,
      intensity,
      isEmpty: !isCurrentMonth,
      tooltip: tooltip,
      hasData: !!dayData,
      isToday: isCurrentMonth && 
        current.getDate() === new Date().getDate() && 
        current.getMonth() === new Date().getMonth() && 
        current.getFullYear() === new Date().getFullYear(),
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
  const [selectedPeriod, setSelectedPeriod] = useState("all");
  const [calendarMonths, setCalendarMonths] = useState(1);

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
          {Array.from({ length: calendarMonths }, (_, monthOffset) => {
            const currentMonth = new Date();
            currentMonth.setMonth(currentMonth.getMonth() - monthOffset);
            
            return (
              <div key={monthOffset} className="calendar-card pl-month-card">
                <div className="calendar-card-header">
                  <div className="calendar-card-title">
                    <Calendar size={20} />
                    <h3>{currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h3>
                  </div>
                </div>
                
                <div className="calendar-card-content">
                  <div className="calendar-day-headers">
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(day => (
                      <div key={day} className="calendar-day-header">{day}</div>
                    ))}
                  </div>
                  
                  <div className="calendar-days-grid">
                    {generateCalendarDays(currentMonth, filteredTransactions).map((day, index) => (
                      day.isVisible ? (
                        <div 
                          key={index} 
                          className={`calendar-day-cell ${day.type} strength-${day.intensity} ${day.isEmpty ? 'empty' : ''} ${day.isToday ? 'today' : ''}`}
                          title={day.tooltip}
                          aria-label={day.tooltip}
                        >
                          <span className="day-number">{day.day}</span>
                          {day.amount && <span className="day-amount">₹{Math.floor(day.amount)}</span>}
                        </div>
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

    </div>
  );
};

export default ProfitLoss;
