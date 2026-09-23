import { useMemo, useState } from "react";
import { ChartNoAxesCombined, Check, Landmark, Pencil, Plus, TrendingDown, TrendingUp, Trash2, Wallet, X } from "lucide-react";
import type { Investment, InvestmentType, UserAccount } from "../types/finance";
import { formatCurrency } from "../utils/money";

interface Props { user: UserAccount; onSave: (updatedUser: UserAccount) => void; }

const TYPE_LABELS: Record<InvestmentType, string> = { stocks: "Stocks", mutual_fund: "Mutual Fund", crypto: "Crypto", gold: "Gold", real_estate: "Real Estate", fd: "Fixed Deposit", other: "Other" };
const TYPE_COLORS: Record<InvestmentType, string> = { stocks: "#60a5fa", mutual_fund: "#34d399", crypto: "#fbbf24", gold: "#facc15", real_estate: "#a78bfa", fd: "#22d3ee", other: "#94a3b8" };
const emptyForm = (): Omit<Investment, "id"> => ({ name: "", type: "stocks", amount: 0, currentValue: 0, date: new Date().toISOString().split("T")[0], note: "" });

const InvestmentPage = ({ user, onSave }: Props) => {
  const investments = user.investments ?? [];
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Investment | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [filterType, setFilterType] = useState<InvestmentType | "all">("all");
  const stats = useMemo(() => {
    const totalInvested = investments.reduce((total, item) => total + item.amount, 0);
    const totalCurrent = investments.reduce((total, item) => total + item.currentValue, 0);
    const pnl = totalCurrent - totalInvested;
    return { totalInvested, totalCurrent, pnl, pnlPct: totalInvested ? (pnl / totalInvested) * 100 : 0 };
  }, [investments]);
  const filtered = useMemo(() => filterType === "all" ? investments : investments.filter((item) => item.type === filterType), [investments, filterType]);
  const fmt = (value: number) => formatCurrency(value, user.currency ?? "INR");
  const openAdd = () => { setEditing(null); setForm(emptyForm()); setShowModal(true); };
  const openEdit = (item: Investment) => { setEditing(item); setForm({ ...item, date: item.date.split("T")[0] }); setShowModal(true); };
  const save = () => {
    if (!form.name.trim() || form.amount <= 0) return;
    const next = editing ? investments.map((item) => item.id === editing.id ? { ...editing, ...form } : item) : [{ id: crypto.randomUUID(), ...form }, ...investments];
    onSave({ ...user, investments: next }); setShowModal(false);
  };
  const remove = (id: string) => { if (window.confirm("Delete this investment?")) onSave({ ...user, investments: investments.filter((item) => item.id !== id) }); };

  return <div className="page-content investment-page">
    <div className="page-heading investment-heading"><div><span className="eyebrow">WEALTH MANAGEMENT</span><h1>Investment portfolio</h1><p>See your holdings, performance, and long-term growth in one place.</p></div><button className="primary-button investment-add-button" onClick={openAdd}><Plus size={17} /> Add investment</button></div>
    <div className="investment-summary-grid">
      <Summary label="Total invested" value={fmt(stats.totalInvested)} detail={`${investments.length} ${investments.length === 1 ? "holding" : "holdings"} tracked`} icon={<Wallet size={19} />} kind="invested" />
      <Summary label="Current value" value={fmt(stats.totalCurrent)} detail="Live portfolio value" icon={<Landmark size={19} />} kind="value" />
      <Summary label="Total P&L" value={`${stats.pnl >= 0 ? "+" : ""}${fmt(stats.pnl)}`} detail={`${stats.pnlPct >= 0 ? "+" : ""}${stats.pnlPct.toFixed(2)}% total return`} icon={stats.pnl >= 0 ? <TrendingUp size={19} /> : <TrendingDown size={19} />} kind={stats.pnl >= 0 ? "gain" : "loss"} />
      <Summary label="Portfolio ROI" value={`${stats.pnlPct >= 0 ? "+" : ""}${stats.pnlPct.toFixed(1)}%`} detail={stats.pnl >= 0 ? "Unrealised gain" : "Unrealised loss"} icon={<ChartNoAxesCombined size={19} />} kind={stats.pnl >= 0 ? "roi-gain" : "roi-loss"} />
    </div>
    <section className="investment-filter-panel"><div><span className="eyebrow">HOLDINGS</span><p>Filter by asset class</p></div><div className="investment-filter-chips">{(["all", ...Object.keys(TYPE_LABELS)] as (InvestmentType | "all")[]).map((type) => <button key={type} onClick={() => setFilterType(type)} className={filterType === type ? "investment-filter active" : "investment-filter"}>{type === "all" ? "All types" : TYPE_LABELS[type]}</button>)}</div></section>
    <section className="investment-holdings-card"><div className="investment-holdings-header"><div><h3>Portfolio holdings</h3><p>{filtered.length} of {investments.length} holdings shown</p></div><span className="investment-holdings-value">{fmt(stats.totalCurrent)}</span></div><div className="investment-table-scroll"><table className="investment-table"><thead><tr><th>Name</th><th>Type</th><th>Date</th><th>Invested</th><th>Current value</th><th>P&amp;L</th><th>Return</th><th>Note</th><th className="investment-actions-heading">Actions</th></tr></thead><tbody>{filtered.length === 0 ? <tr><td colSpan={9} className="investment-empty"><Wallet size={32} /><p>No investments yet. Click <strong>Add investment</strong> to get started.</p></td></tr> : filtered.map((item) => {
      const pnl = item.currentValue - item.amount; const pct = item.amount ? pnl / item.amount * 100 : 0; const positive = pnl >= 0;
      return <tr key={item.id}><td className="investment-name">{item.name}</td><td><span className="investment-type-badge" style={{ color: TYPE_COLORS[item.type], borderColor: `${TYPE_COLORS[item.type]}55`, backgroundColor: `${TYPE_COLORS[item.type]}16` }}>{TYPE_LABELS[item.type]}</span></td><td className="investment-date">{new Date(item.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</td><td className="investment-money">{fmt(item.amount)}</td><td className="investment-money">{fmt(item.currentValue)}</td><td className={positive ? "investment-positive" : "investment-negative"}>{positive ? "+" : ""}{fmt(pnl)}</td><td className={positive ? "investment-positive" : "investment-negative"}>{positive ? "+" : ""}{pct.toFixed(2)}%</td><td className="investment-note">{item.note || "—"}</td><td><div className="investment-actions"><button className="action-button" onClick={() => openEdit(item)} title="Edit investment"><Pencil size={14} /></button><button className="action-button delete" onClick={() => remove(item.id)} title="Delete investment"><Trash2 size={14} /></button></div></td></tr>;
    })}</tbody></table></div></section>
    {showModal && <InvestmentModal editing={editing} form={form} setForm={setForm} onClose={() => setShowModal(false)} onSave={save} />}
  </div>;
};

const Summary = ({ label, value, detail, icon, kind }: { label: string; value: string; detail: string; icon: React.ReactNode; kind: string }) => <div className={`investment-summary-card ${kind}`}><div className="investment-summary-top"><span>{label}</span><div className="investment-summary-icon">{icon}</div></div><strong>{value}</strong><small>{detail}</small></div>;

const InvestmentModal = ({ editing, form, setForm, onClose, onSave }: { editing: Investment | null; form: Omit<Investment, "id">; setForm: React.Dispatch<React.SetStateAction<Omit<Investment, "id">>>; onClose: () => void; onSave: () => void }) => <div className="modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="transaction-modal investment-modal" role="dialog" aria-modal="true"><div className="modal-header"><div className="modal-header-text"><span className="eyebrow">{editing ? "EDIT INVESTMENT" : "NEW INVESTMENT"}</span><h2>{editing ? "Edit investment" : "Add investment"}</h2><p>Keep your portfolio records accurate and up to date.</p></div><button className="close-button" onClick={onClose}><X size={18} /></button></div><div className="modal-body"><div className="form-grid"><label>Investment name<input value={form.name} placeholder="e.g. Reliance Industries" onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label><label>Asset type<select value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value as InvestmentType }))}>{Object.entries(TYPE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>Amount invested<input type="number" min="0" value={form.amount || ""} onChange={(event) => setForm((current) => ({ ...current, amount: Number(event.target.value) }))} /></label><label>Current value<input type="number" min="0" value={form.currentValue || ""} onChange={(event) => setForm((current) => ({ ...current, currentValue: Number(event.target.value) }))} /></label><label>Date<input type="date" value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} /></label></div><label className="investment-note-field">Note<input value={form.note} placeholder="e.g. Long-term holding" onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} /></label></div><div className="modal-footer"><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" onClick={onSave}><Check size={15} /> {editing ? "Save changes" : "Add investment"}</button></div></div></div>;

export default InvestmentPage;
