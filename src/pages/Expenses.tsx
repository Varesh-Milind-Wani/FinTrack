import { useMemo, useState } from "react";
import { Plus, Pencil, ReceiptText, Trash2, X } from "lucide-react";
import type { Expense, UserAccount } from "../types/finance";
import { formatCurrency } from "../utils/money";

interface Props {
  user: UserAccount;
  onSave: (user: UserAccount) => void;
}

const categories = ["Food", "Transport", "Shopping", "Bills", "Health", "Entertainment", "Other"];
const blank = (): Omit<Expense, "id"> => ({
  name: "", category: "Food", amount: 0,
  date: new Date().toISOString().slice(0, 10), note: "",
});

const Expenses = ({ user, onSave }: Props) => {
  const expenses = user.expenses ?? [];
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [form, setForm] = useState(blank());
  const [category, setCategory] = useState("all");

  const visible = useMemo(() =>
    category === "all" ? expenses : expenses.filter((expense) => expense.category === category),
    [category, expenses]
  );
  const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const thisMonth = expenses.filter((expense) => {
    const date = new Date(expense.date);
    const now = new Date();
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  }).reduce((sum, expense) => sum + expense.amount, 0);
  const fmt = (value: number) => formatCurrency(value, user.currency);

  const openAdd = () => { setEditing(null); setForm(blank()); setModalOpen(true); };
  const openEdit = (expense: Expense) => {
    setEditing(expense);
    setForm({ ...expense, date: expense.date.slice(0, 10) });
    setModalOpen(true);
  };
  const save = () => {
    if (!form.name.trim() || !Number.isFinite(form.amount) || form.amount <= 0) return;
    const next = editing
      ? expenses.map((expense) => expense.id === editing.id ? { ...editing, ...form } : expense)
      : [{ id: crypto.randomUUID(), ...form }, ...expenses];
    onSave({ ...user, expenses: next });
    setModalOpen(false);
  };
  const remove = (id: string) => {
    if (window.confirm("Delete this expense?")) onSave({ ...user, expenses: expenses.filter((expense) => expense.id !== id) });
  };

  return <div className="page-container">
    <div className="page-header">
      <div><h1 className="page-title">Expense Tracker</h1><p className="page-subtitle">Keep personal spending separate from trades and investments.</p></div>
      <button className="btn-primary" onClick={openAdd}><Plus size={16} /> Add expense</button>
    </div>
    <div className="stats-grid-three" style={{ marginBottom: 24 }}>
      <div className="stat-card"><div className="stat-card-top"><div className="stat-icon loss"><ReceiptText size={19} /></div><span>Total expenses</span></div><div className="stat-value negative">{fmt(total)}</div><div className="stat-trend neutral">All recorded spending</div></div>
      <div className="stat-card"><div className="stat-card-top"><div className="stat-icon cost"><ReceiptText size={19} /></div><span>This month</span></div><div className="stat-value cost">{fmt(thisMonth)}</div><div className="stat-trend neutral">Current month spending</div></div>
      <div className="stat-card"><div className="stat-card-top"><div className="stat-icon blue"><ReceiptText size={19} /></div><span>Records</span></div><div className="stat-value">{expenses.length}</div><div className="stat-trend neutral">Expense entries saved</div></div>
    </div>
    <div className="expense-toolbar">
      <span>Category</span>
      <select value={category} onChange={(event) => setCategory(event.target.value)} className="period-selector"><option value="all">All categories</option>{categories.map((item) => <option key={item}>{item}</option>)}</select>
      <span className="expense-summary">{visible.length} shown · {fmt(visible.reduce((sum, expense) => sum + expense.amount, 0))}</span>
    </div>
    <div className="enterprise-table-container"><table className="enterprise-table"><thead><tr><th>EXPENSE</th><th>CATEGORY</th><th>DATE</th><th>AMOUNT</th><th>NOTE</th><th>ACTIONS</th></tr></thead><tbody>
      {visible.length ? visible.map((expense) => <tr key={expense.id}><td style={{ fontWeight: 700 }}>{expense.name}</td><td><span className="expense-category">{expense.category}</span></td><td>{new Date(expense.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</td><td className="negative" style={{ fontWeight: 800 }}>−{fmt(expense.amount)}</td><td>{expense.note || "—"}</td><td><div className="expense-actions"><button className="action-button" onClick={() => openEdit(expense)}><Pencil size={14} /></button><button className="action-button delete" onClick={() => remove(expense.id)}><Trash2 size={14} /></button></div></td></tr>) : <tr><td colSpan={6} className="expense-empty"><ReceiptText size={32} /><p>No expenses recorded yet. Add an expense to begin tracking.</p></td></tr>}
    </tbody></table></div>
    {modalOpen && <div className="modal-overlay" onMouseDown={(event) => event.target === event.currentTarget && setModalOpen(false)}><div className="transaction-modal expense-modal"><div className="modal-header"><div><span className="eyebrow">{editing ? "EDIT EXPENSE" : "NEW EXPENSE"}</span><h2>{editing ? "Edit expense" : "Add expense"}</h2></div><button className="close-button" onClick={() => setModalOpen(false)}><X size={18} /></button></div><div className="modal-body"><div className="form-grid"><label>Expense name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. Grocery shopping" /></label><label>Category<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label><label>Amount<input type="number" min="0" step="0.01" value={form.amount || ""} onChange={(event) => setForm({ ...form, amount: Number(event.target.value) })} /></label><label>Date<input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label></div><label className="expense-note">Note<textarea value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="Optional details" /></label></div><div className="modal-footer"><button className="secondary-button" onClick={() => setModalOpen(false)}>Cancel</button><button className="primary-button" onClick={save}>Save expense</button></div></div></div>}
  </div>;
};

export default Expenses;
