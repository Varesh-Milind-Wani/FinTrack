import { useMemo, useState } from "react";
import { X } from "lucide-react";
import type { Expense } from "../types/finance";
import { formatCurrency } from "../utils/money";

type Props = { expenses: Expense[]; monthKey: string; currency: string; onClose: () => void };

const monthKeyFor = (year: number, month: number) => `${year}-${String(month).padStart(2, "0")}`;
const monthLabel = (key: string) => new Date(`${key}-01T12:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
const chartPath = (values: number[], width: number, height: number, maxDays: number, maxValue: number) => values.map((value, index) => {
  const x = 64 + (index / Math.max(1, maxDays - 1)) * (width - 84);
  const y = height - 36 - (value / maxValue) * (height - 72);
  return `${index ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
}).join(" ");

export default function ExpenseMonthChartDialog({ expenses, monthKey, currency, onClose }: Props) {
  const [comparePrevious, setComparePrevious] = useState(true);
  const previousMonth = useMemo(() => {
    const [year, month] = monthKey.split("-").map(Number);
    const previous = new Date(year, month - 2, 1, 12);
    return monthKeyFor(previous.getFullYear(), previous.getMonth() + 1);
  }, [monthKey]);
  const [year, month] = monthKey.split("-").map(Number);
  const daysInPrevious = new Date(Number(previousMonth.slice(0, 4)), Number(previousMonth.slice(5, 7)), 0).getDate();
  const daysInCurrent = new Date(year, month, 0).getDate();
  const today = new Date();
  const elapsedDays = monthKey === monthKeyFor(today.getFullYear(), today.getMonth() + 1) ? today.getDate() : daysInCurrent;
  const current = useMemo(() => expenses.filter((expense) => expense.date.slice(0, 7) === monthKey), [expenses, monthKey]);
  const previous = useMemo(() => expenses.filter((expense) => expense.date.slice(0, 7) === previousMonth), [expenses, previousMonth]);
  const series = (entries: Expense[], days: number) => {
    const daily = Array.from({ length: days }, () => 0);
    entries.forEach((expense) => {
      const day = Number(expense.date.slice(8, 10));
      if (day >= 1 && day <= days) daily[day - 1] += expense.amount;
    });
    let total = 0;
    return daily.map((amount) => (total += amount));
  };
  const currentSeries = useMemo(() => series(current, elapsedDays), [current, elapsedDays]);
  const previousSeries = useMemo(() => series(previous, Math.min(elapsedDays, daysInPrevious)), [previous, elapsedDays, daysInPrevious]);
  const currentTotal = current.reduce((sum, expense) => sum + expense.amount, 0);
  const previousTotal = previousSeries.at(-1) ?? 0;
  const maxDays = comparePrevious ? Math.max(elapsedDays, previousSeries.length) : elapsedDays;
  const maxValue = Math.max(1, ...currentSeries, ...(comparePrevious ? previousSeries : [])) * 1.12;
  const width = 960;
  const height = 360;
  const money = (value: number) => formatCurrency(value, currency);

  return <div className="modal-overlay expense-chart-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="transaction-modal expense-chart-dialog" role="dialog" aria-modal="true" aria-labelledby="expense-chart-title">
      <header className="expense-chart-header"><div><span className="eyebrow">MONTHLY SPENDING</span><h2 id="expense-chart-title">{monthLabel(monthKey)} expenses</h2><p>Daily cumulative spending for this month.</p></div><button className="close-button" type="button" aria-label="Close expense chart" onClick={onClose}><X size={18} /></button></header>
      <div className="expense-chart-toolbar"><div className="expense-chart-total"><span>{monthLabel(monthKey)}</span><strong>{money(currentTotal)}</strong></div><label className="expense-chart-compare"><input type="checkbox" checked={comparePrevious} onChange={(event) => setComparePrevious(event.target.checked)} /><span>Compare with previous month</span></label>{comparePrevious && <div className="expense-chart-total previous-total"><span>{monthLabel(previousMonth)}</span><strong>{money(previousTotal)}</strong></div>}</div>
      <div className="expense-chart-plot"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${monthLabel(monthKey)} cumulative expense chart${comparePrevious ? ` compared with ${monthLabel(previousMonth)}` : ""}`}>
        {[0, 1, 2, 3, 4].map((index) => { const value = maxValue * (4 - index) / 4; const y = 22 + index * 72; return <g key={`grid-${index}`}><line x1="64" x2={width - 20} y1={y} y2={y} className="expense-chart-gridline" /><text x="54" y={y + 4} textAnchor="end">{money(value)}</text></g>; })}
        {comparePrevious && <path d={chartPath(previousSeries, width, height, maxDays, maxValue)} className="expense-chart-line previous" />}
        <path d={chartPath(currentSeries, width, height, maxDays, maxValue)} className="expense-chart-line current" />
        <text x="64" y={height - 8}>Day 1</text><text x={width / 2} y={height - 8} textAnchor="middle">Day {Math.max(1, Math.round(maxDays / 2))}</text><text x={width - 20} y={height - 8} textAnchor="end">Day {maxDays}</text>
      </svg></div>
      <footer className="expense-chart-legend"><span><i className="current" />{monthLabel(monthKey)}</span>{comparePrevious && <span><i className="previous" />{monthLabel(previousMonth)}</span>}<small>Previous-month comparison uses the same elapsed days.</small></footer>
    </section>
  </div>;
}
