import { useEffect, useMemo, useState } from "react";
import { Plus, ReceiptText, X } from "lucide-react";
import type { Expense, UserAccount } from "../types/finance";
import { formatCurrency } from "../utils/money";
import { useAppDialog } from "../components/AppDialog";
import PersonalCashFlowTable from "../components/PersonalCashFlowTable";
import ExpenseMonthChartDialog from "../components/ExpenseMonthChartDialog";

interface Props {
  user: UserAccount;
  onSave: (user: UserAccount) => void;
}

const categories = ["Food", "Transport", "Shopping", "Bills", "Health", "Entertainment", "Other"];
const EMPTY_EXPENSES: Expense[] = [];
const monthKeyFor = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
type ExpenseForm = Omit<Expense, "id" | "amount" | "categories"> & { amount: number; categories: string[] };
const expenseCategories = (expense: Expense) => expense.categories?.length ? expense.categories : [expense.category];
const blank = (): ExpenseForm => ({
  name: "", category: "Food", categories: ["Food"], amount: 0,
  date: new Date().toISOString().slice(0, 10), note: "",
});

const evaluateAmountExpression = (expression: string): { value: number | null; error: string | null } => {
  const source = expression.replace(/[×x]/g, "*").replace(/÷/g, "/").replace(/\s+/g, "");
  if (!source) return { value: null, error: "Enter an amount or calculation." };
  if (source.length > 120) return { value: null, error: "Calculation is too long." };
  const tokens = source.match(/(?:\d+(?:\.\d*)?|\.\d+)|[()+\-*/]/g) ?? [];
  if (tokens.join("") !== source) return { value: null, error: "Use numbers, +, −, ×, ÷, and parentheses only." };
  let position = 0;
  function sum(): number {
    let value = product();
    while (tokens[position] === "+" || tokens[position] === "-") {
      const operator = tokens[position++];
      const right = product();
      value = operator === "+" ? value + right : value - right;
      if (!Number.isFinite(value)) throw new Error("Amount is outside the supported range.");
    }
    return value;
  }
  function product(): number {
    let value = unary();
    while (tokens[position] === "*" || tokens[position] === "/") {
      const operator = tokens[position++];
      const right = unary();
      if (operator === "/" && right === 0) throw new Error("Cannot divide by zero.");
      value = operator === "*" ? value * right : value / right;
      if (!Number.isFinite(value)) throw new Error("Amount is outside the supported range.");
    }
    return value;
  }
  function unary(): number {
    if (tokens[position] === "+" || tokens[position] === "-") {
      const negative = tokens[position++] === "-";
      const value = unary();
      return negative ? -value : value;
    }
    const token = tokens[position++];
    if (token === "(") {
      const value = sum();
      if (tokens[position++] !== ")") throw new Error("Close the parentheses.");
      return value;
    }
    if (token == null || !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(token)) throw new Error("Complete the calculation.");
    return Number(token);
  }
  try {
    const value = sum();
    return position === tokens.length
      ? { value, error: null }
      : { value: null, error: "Check the calculation format." };
  } catch (error) {
    return { value: null, error: error instanceof Error ? error.message : "Check the calculation." };
  }
};

const Expenses = ({ user, onSave }: Props) => {
  const { confirm } = useAppDialog();
  const expenses = user.expenses ?? EMPTY_EXPENSES;
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [form, setForm] = useState(blank());
  const [amountExpression, setAmountExpression] = useState("");
  const [currentMonthKey, setCurrentMonthKey] = useState(() => monthKeyFor(new Date()));
  const [expenseChartOpen, setExpenseChartOpen] = useState(false);
  useEffect(() => {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 2);
    const timer = window.setTimeout(() => setCurrentMonthKey(monthKeyFor(new Date())), Math.max(1000, nextMonth.getTime() - now.getTime()));
    return () => window.clearTimeout(timer);
  }, [currentMonthKey]);
  const { total, thisMonth } = useMemo(() => {
    return expenses.reduce((totals, expense) => {
      totals.total += expense.amount;
      if (expense.date.slice(0, 7) === currentMonthKey) totals.thisMonth += expense.amount;
      return totals;
    }, { total: 0, thisMonth: 0 });
  }, [expenses, currentMonthKey]);
  const fmt = (value: number) => formatCurrency(value, user.currency);
  const currentMonthIncome = (user.incomes ?? []).reduce((sum, income) => income.date.slice(0, 7) === currentMonthKey ? sum + income.amount : sum, 0);
  const cashLeft = currentMonthIncome - thisMonth;
  const amountCalculation = useMemo(() => evaluateAmountExpression(amountExpression), [amountExpression]);
  const openAdd = () => { setEditing(null); setForm(blank()); setAmountExpression(""); setModalOpen(true); };
  const openEdit = (expense: Expense) => {
    setEditing(expense);
    const selectedCategories = expenseCategories(expense);
    setForm({ ...expense, categories: selectedCategories, category: selectedCategories[0] ?? expense.category, date: expense.date.slice(0, 10) });
    setAmountExpression(String(expense.amount));
    setModalOpen(true);
  };
  const toggleExpenseCategory = (selected: string) => setForm((current) => {
    const next = current.categories.includes(selected)
      ? current.categories.filter((item) => item !== selected)
      : [...current.categories, selected];
    return { ...current, categories: next, category: next[0] ?? "" };
  });
  const save = () => {
    const amount = amountCalculation.value;
    if (!form.name.trim() || !form.categories.length || amount == null || !Number.isFinite(amount) || amount <= 0) return;
    const savedForm = { ...form, category: form.categories[0], categories: [...form.categories], amount };
    const next = editing
      ? expenses.map((expense) => expense.id === editing.id ? { ...editing, ...savedForm } : expense)
      : [{ id: crypto.randomUUID(), ...savedForm }, ...expenses];
    onSave({ ...user, expenses: next });
    setModalOpen(false);
  };
  const remove = async (id: string) => {
    if (await confirm("Delete this expense?", "Delete expense")) onSave({ ...user, expenses: expenses.filter((expense) => expense.id !== id) });
  };

  return <div className="page-content expenses-page">
    <div className="page-heading expense-page-heading">
      <div><span className="eyebrow">PERSONAL FINANCE</span><h1>Expense tracker</h1><p>Keep personal spending separate from trades and investments.</p></div>
      <button className="primary-button" onClick={openAdd}><Plus size={16} /> Add expense</button>
    </div>
    <div className="stats-grid-three expense-summary-grid" style={{ marginBottom: 24 }}>
      <div className="stat-card"><div className="stat-card-top"><div className="stat-icon loss"><ReceiptText size={19} /></div><span>Total expenses</span></div><div className="stat-value negative">{fmt(total)}</div><div className="stat-trend neutral">All recorded spending</div></div>
      <button type="button" className="stat-card stat-card-action" onClick={() => setExpenseChartOpen(true)} aria-label={`View ${new Date(`${currentMonthKey}-01T12:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" })} spending chart`}><div className="stat-card-top"><div className="stat-icon cost"><ReceiptText size={19} /></div><span>This month</span></div><div className="stat-value cost">{fmt(thisMonth)}</div><div className="stat-trend neutral">Current month spending · Click to view</div></button>
      <div className="stat-card"><div className="stat-card-top"><div className="stat-icon blue"><ReceiptText size={19} /></div><span>Records</span></div><div className="stat-value">{expenses.length}</div><div className="stat-trend neutral">Expense entries saved</div></div>
      <div className={`stat-card cash-left-summary-card ${cashLeft < 0 ? "is-negative" : ""}`}><div className="stat-card-top"><div className="stat-icon profit"><ReceiptText size={19} /></div><span>Cash left this month</span></div><div className={`stat-value ${cashLeft < 0 ? "negative" : "positive"}`}>{fmt(cashLeft)}</div><div className="stat-trend neutral">Recorded income minus expenses</div></div>
    </div>
    <PersonalCashFlowTable mode="expense" incomes={user.incomes ?? []} expenses={expenses} currency={user.currency} onEditExpense={openEdit} onDeleteExpense={(id) => { void remove(id); }} />
    {expenseChartOpen && <ExpenseMonthChartDialog expenses={expenses} monthKey={currentMonthKey} currency={user.currency} onClose={() => setExpenseChartOpen(false)} />}
    {modalOpen && <div className="modal-overlay" onMouseDown={(event) => event.target === event.currentTarget && setModalOpen(false)}><div className="transaction-modal expense-modal"><div className="modal-header"><div><span className="eyebrow">{editing ? "EDIT EXPENSE" : "NEW EXPENSE"}</span><h2>{editing ? "Edit expense" : "Add expense"}</h2></div><button className="close-button" onClick={() => setModalOpen(false)} aria-label="Close"><X size={18} /></button></div><div className="modal-body"><div className="form-grid"><label>Expense name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. Grocery shopping" /></label><fieldset className="expense-category-field"><legend>Categories</legend><div className="expense-category-options">{categories.map((item) => <label key={item}><input type="checkbox" checked={form.categories.includes(item)} onChange={() => toggleExpenseCategory(item)} /><span>{item}</span></label>)}</div><small>Select every category that applies.</small></fieldset><label>Amount ({user.currency})<input type="text" inputMode="decimal" value={amountExpression} onChange={(event) => setAmountExpression(event.target.value)} placeholder="e.g. 56 + 443" aria-describedby="expense-amount-help" /><small id="expense-amount-help" className={amountCalculation.error ? "expense-calculation-error" : "expense-calculation-result"}>{amountCalculation.value == null ? amountCalculation.error : `Calculated amount: ${new Intl.NumberFormat(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amountCalculation.value)} ${user.currency}`}</small><div className="expense-calculation-keys" aria-label="Calculation operators">{["+", "−", "×", "÷", "(", ")"].map((operator) => <button type="button" key={operator} onClick={() => setAmountExpression((value) => `${value}${operator}`)}>{operator}</button>)}</div></label><label>Date<input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label></div><label className="expense-note">Note<textarea value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="Optional details" /></label><span className="expense-currency-hint">Entered in {user.currency}; amounts are displayed in your selected currency.</span></div><div className="modal-footer"><button className="secondary-button" onClick={() => setModalOpen(false)}>Cancel</button><button className="primary-button" onClick={save} disabled={!form.name.trim() || !form.categories.length || amountCalculation.value == null || amountCalculation.value <= 0}>Save expense</button></div></div></div>}
  </div>;
};

export default Expenses;
