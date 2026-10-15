import { Fragment, useMemo, useState } from "react";
import { ChartNoAxesCombined, Check, ChevronDown, ChevronUp, Landmark, Pencil, Plus, TrendingDown, TrendingUp, Trash2, Wallet, X } from "lucide-react";
import type { Investment, InvestmentType, UserAccount } from "../types/finance";
import { formatCurrency } from "../utils/money";

interface Props { user: UserAccount; onSave: (updatedUser: UserAccount) => void; }

const TYPE_LABELS: Record<InvestmentType, string> = { stocks: "Stocks", mutual_fund: "Mutual Fund", crypto: "Crypto", gold: "Gold", real_estate: "Real Estate", fd: "Fixed Deposit", other: "Other" };
const TYPE_COLORS: Record<InvestmentType, string> = { stocks: "#60a5fa", mutual_fund: "#34d399", crypto: "#fbbf24", gold: "#facc15", real_estate: "#a78bfa", fd: "#22d3ee", other: "#94a3b8" };
const emptyForm = (): Omit<Investment, "id"> => ({ name: "", type: "stocks", amount: 0, currentValue: 0, entryPrice: undefined, exitPrice: undefined, date: new Date().toISOString().split("T")[0], note: "" });

const InvestmentPage = ({ user, onSave }: Props) => {
  const investments = user.investments ?? [];
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Investment | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [filterType, setFilterType] = useState<InvestmentType | "all">("all");
  const [expandedInvestmentId, setExpandedInvestmentId] = useState<string | null>(null);
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
    if (!form.name.trim() || form.amount <= 0 || form.currentValue < 0 || (form.entryPrice != null && form.entryPrice < 0) || (form.exitPrice != null && form.exitPrice < 0)) return;
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
      const pnl = item.currentValue - item.amount;
      const pct = item.amount ? pnl / item.amount * 100 : 0;
      const positive = pnl >= 0;
      const isExpanded = expandedInvestmentId === item.id;
      const date = new Date(item.date);

      return <Fragment key={item.id}>
        <tr>
          <td className="investment-name">{item.name}</td>
          <td><span className="investment-type-badge" style={{ color: TYPE_COLORS[item.type], borderColor: `${TYPE_COLORS[item.type]}55`, backgroundColor: `${TYPE_COLORS[item.type]}16` }}>{TYPE_LABELS[item.type]}</span></td>
          <td className="investment-date">{date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</td>
          <td className="investment-money">{fmt(item.amount)}</td>
          <td className="investment-money">{fmt(item.currentValue)}</td>
          <td className={positive ? "investment-positive" : "investment-negative"}>{positive ? "+" : ""}{fmt(pnl)}</td>
          <td className={positive ? "investment-positive" : "investment-negative"}>{positive ? "+" : ""}{pct.toFixed(2)}%</td>
          <td className="investment-note">{item.note || "—"}</td>
          <td><div className="investment-actions">
            <button type="button" className="action-button" onClick={() => openEdit(item)} title="Edit investment" aria-label={`Edit ${item.name}`}><Pencil size={14} /></button>
            <button type="button" className="action-button delete" onClick={() => remove(item.id)} title="Delete investment" aria-label={`Delete ${item.name}`}><Trash2 size={14} /></button>
            <button type="button" className="action-button expand" onClick={() => setExpandedInvestmentId(isExpanded ? null : item.id)} title={isExpanded ? "Hide investment details" : "Show investment details"} aria-label={isExpanded ? "Hide investment details" : `Show details for ${item.name}`} aria-expanded={isExpanded}>{isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button>
          </div></td>
        </tr>
        <tr className={`investment-detail-row ${isExpanded ? "is-expanded" : ""}`}>
          <td colSpan={9}>
            <div className="investment-detail-disclosure" aria-hidden={!isExpanded}>
              <div className="investment-detail-disclosure-inner">
                <section className="investment-details" aria-label={`${item.name} investment details`}>
                  <div className="investment-details-heading">
                    <div><span>PORTFOLIO HOLDING</span><strong>{item.name}</strong></div>
                    <span>{date.toLocaleDateString("en-IN", { dateStyle: "full" })}</span>
                  </div>
                  <dl className="investment-details-grid">
                    <div><dt>Asset class</dt><dd>{TYPE_LABELS[item.type]}</dd></div>
                    <div><dt>Amount invested</dt><dd>{fmt(item.amount)}</dd></div>
                    <div><dt>Current value</dt><dd>{fmt(item.currentValue)}</dd></div>
                    <div><dt>Entry price</dt><dd>{item.entryPrice != null ? fmt(item.entryPrice) : "Not set"}</dd></div>
                    <div><dt>Exit price</dt><dd>{item.exitPrice != null ? fmt(item.exitPrice) : "Not set"}</dd></div>
                    <div><dt>Profit / Loss</dt><dd className={positive ? "investment-positive" : "investment-negative"}>{positive ? "+" : "−"}{fmt(Math.abs(pnl))}</dd></div>
                    <div><dt>Return</dt><dd className={positive ? "investment-positive" : "investment-negative"}>{positive ? "+" : ""}{pct.toFixed(2)}%</dd></div>
                    <div className="investment-details-note"><dt>Note</dt><dd>{item.note || "No note added"}</dd></div>
                  </dl>
                </section>
              </div>
            </div>
          </td>
        </tr>
      </Fragment>;
    })}</tbody></table></div></section>
    {showModal && <InvestmentModal editing={editing} form={form} setForm={setForm} onClose={() => setShowModal(false)} onSave={save} />}
  </div>;
};

const Summary = ({ label, value, detail, icon, kind }: { label: string; value: string; detail: string; icon: React.ReactNode; kind: string }) => <div className={`investment-summary-card ${kind}`}><div className="investment-summary-top"><span>{label}</span><div className="investment-summary-icon">{icon}</div></div><strong>{value}</strong><small>{detail}</small></div>;

const InvestmentModal = ({ editing, form, setForm, onClose, onSave }: { editing: Investment | null; form: Omit<Investment, "id">; setForm: React.Dispatch<React.SetStateAction<Omit<Investment, "id">>>; onClose: () => void; onSave: () => void }) => <div className="modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><form className="transaction-modal investment-modal" role="dialog" aria-modal="true" aria-labelledby="investment-modal-title" onSubmit={(event) => { event.preventDefault(); onSave(); }}><div className="modal-header"><div className="modal-header-text"><span className="eyebrow">{editing ? "EDIT INVESTMENT" : "NEW INVESTMENT"}</span><h2 id="investment-modal-title">{editing ? "Edit investment" : "Add investment"}</h2><p>Record your holding and track its purchase and sale prices.</p></div><button type="button" className="close-button" onClick={onClose} aria-label="Close dialog"><X size={18} /></button></div><div className="modal-body"><div className="form-grid"><label>Investment name<input required value={form.name} placeholder="e.g. Reliance Industries" onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label><label>Asset type<select value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value as InvestmentType }))}>{Object.entries(TYPE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>Amount invested<input type="number" min="0.01" step="any" required value={form.amount || ""} onChange={(event) => setForm((current) => ({ ...current, amount: Number(event.target.value) }))} /></label><label>Current value<input type="number" min="0" step="any" value={form.currentValue || ""} onChange={(event) => setForm((current) => ({ ...current, currentValue: Number(event.target.value) }))} /></label><label>Entry price <span className="investment-field-hint">Per unit at purchase</span><input type="number" min="0" step="any" inputMode="decimal" value={form.entryPrice ?? ""} placeholder="Optional" onChange={(event) => setForm((current) => ({ ...current, entryPrice: event.target.value === "" ? undefined : Number(event.target.value) }))} /></label><label>Exit price <span className="investment-field-hint">Per unit when sold</span><input type="number" min="0" step="any" inputMode="decimal" value={form.exitPrice ?? ""} placeholder="Optional" onChange={(event) => setForm((current) => ({ ...current, exitPrice: event.target.value === "" ? undefined : Number(event.target.value) }))} /></label><label>Date<input type="date" value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} /></label></div><label className="investment-note-field">Note<input value={form.note} placeholder="e.g. Long-term holding" onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} /></label></div><div className="modal-footer"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button"><Check size={15} /> {editing ? "Save changes" : "Add investment"}</button></div></form></div>;

export default InvestmentPage;
