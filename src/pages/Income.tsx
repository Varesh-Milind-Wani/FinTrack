import { useMemo, useState } from "react";
import { ArrowDownLeft, CircleDollarSign, Plus, X } from "lucide-react";
import type { IncomeEntry, UserAccount } from "../types/finance";
import { formatCurrency } from "../utils/money";
import { useAppDialog } from "../components/AppDialog";
import PersonalCashFlowTable from "../components/PersonalCashFlowTable";

interface Props {
  user: UserAccount;
  onSave: (user: UserAccount) => void;
}

const categories = ["Salary", "Freelance", "Business", "Investment", "Rental", "Interest", "Other"];
const EMPTY_INCOMES: IncomeEntry[] = [];
type IncomeForm = Omit<IncomeEntry, "id" | "amount"> & { amount: string };

const blankForm = (): IncomeForm => ({
  source: "",
  category: "Salary",
  amount: "",
  date: new Date().toISOString().slice(0, 10),
  note: "",
});

const Income = ({ user, onSave }: Props) => {
  const { confirm } = useAppDialog();
  const incomes = user.incomes ?? EMPTY_INCOMES;
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<IncomeEntry | null>(null);
  const [form, setForm] = useState<IncomeForm>(blankForm);
  const fmt = (value: number) => formatCurrency(value, user.currency);
  const { total, thisMonth } = useMemo(() => {
    const now = new Date();
    return incomes.reduce((totals, income) => {
      totals.total += income.amount;
      const date = new Date(`${income.date.slice(0, 10)}T00:00:00`);
      if (date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear()) totals.thisMonth += income.amount;
      return totals;
    }, { total: 0, thisMonth: 0 });
  }, [incomes]);

  const openAdd = () => {
    setEditing(null);
    setForm(blankForm());
    setModalOpen(true);
  };

  const openEdit = (income: IncomeEntry) => {
    setEditing(income);
    setForm({ ...income, amount: String(income.amount), date: income.date.slice(0, 10) });
    setModalOpen(true);
  };

  const save = () => {
    const amount = Number(form.amount);
    if (!form.source.trim() || !Number.isFinite(amount) || amount <= 0 || !form.date) return;
    const record: Omit<IncomeEntry, "id"> = { ...form, source: form.source.trim(), amount };
    const next = editing
      ? incomes.map((income) => income.id === editing.id ? { ...record, id: editing.id } : income)
      : [{ ...record, id: crypto.randomUUID() }, ...incomes];
    onSave({ ...user, incomes: next });
    setModalOpen(false);
  };

  const remove = async (id: string) => {
    if (await confirm("Delete this income record?", "Delete income record")) {
      onSave({ ...user, incomes: incomes.filter((income) => income.id !== id) });
    }
  };

  return (
    <div className="page-content expenses-page income-page">
      <div className="page-heading expense-page-heading">
        <div>
          <span className="eyebrow">PERSONAL FINANCE</span>
          <h1>Income</h1>
          <p>Record and review money received, separately from your trading results.</p>
        </div>
        <button className="primary-button" onClick={openAdd}><Plus size={16} /> Add income</button>
      </div>

      <div className="stats-grid-three" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-card-top"><div className="stat-icon profit"><ArrowDownLeft size={19} /></div><span>Total income</span></div>
          <div className="stat-value positive">{fmt(total)}</div>
          <div className="stat-trend neutral">All recorded income</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-top"><div className="stat-icon blue"><CircleDollarSign size={19} /></div><span>This month</span></div>
          <div className="stat-value">{fmt(thisMonth)}</div>
          <div className="stat-trend neutral">Income received this month</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-top"><div className="stat-icon cost"><CircleDollarSign size={19} /></div><span>Records</span></div>
          <div className="stat-value">{incomes.length}</div>
          <div className="stat-trend neutral">Income entries saved</div>
        </div>
      </div>

      <PersonalCashFlowTable mode="income" incomes={incomes} currency={user.currency} onEditIncome={openEdit} onDeleteIncome={(id) => { void remove(id); }} />

      {modalOpen && (
        <div className="modal-overlay" onMouseDown={(event) => event.target === event.currentTarget && setModalOpen(false)}>
          <div className="transaction-modal expense-modal" role="dialog" aria-modal="true" aria-labelledby="income-dialog-title">
            <div className="modal-header"><div><span className="eyebrow">{editing ? "EDIT INCOME" : "NEW INCOME"}</span><h2 id="income-dialog-title">{editing ? "Edit income" : "Add income"}</h2></div><button className="close-button" onClick={() => setModalOpen(false)} aria-label="Close"><X size={18} /></button></div>
            <div className="modal-body">
              <div className="form-grid">
                <label>Source<input autoFocus value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })} placeholder="e.g. Monthly salary" /></label>
                <label>Category<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
                <label>Amount<input type="number" min="0.01" step="0.01" inputMode="decimal" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} placeholder="0.00" /></label>
                <label>Date received<input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label>
              </div>
              <label className="expense-note">Note<textarea value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="Optional details" /></label>
            </div>
            <div className="modal-footer"><button className="secondary-button" onClick={() => setModalOpen(false)}>Cancel</button><button className="primary-button" onClick={save} disabled={!form.source.trim() || !form.amount || Number(form.amount) <= 0}>{editing ? "Save changes" : "Save income"}</button></div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Income;
