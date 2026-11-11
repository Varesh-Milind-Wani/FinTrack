import { useMemo, useState } from "react";
import {
  Calendar,
  Check,
  CreditCard,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Eye,
  IndianRupee,
  Pencil,
  Plus,
  Search,
  Trash2,
  TrendingDown,
  X,
} from "lucide-react";
import type { UserAccount, Withdrawal } from "../types/finance";
import { formatCurrency } from "../utils/money";
import { getInvestmentProceeds } from "../utils/balance";
import { usePersistentState } from "../hooks/usePersistentState";
import { useAppDialog } from "../components/AppDialog";

interface Props {
  user: UserAccount;
  onSave: (updatedUser: UserAccount) => void;
}

const PAGE_SIZE = 20;
const EMPTY_WITHDRAWALS: Withdrawal[] = [];

const Withdrawals = ({ user, onSave }: Props) => {
  const { confirm } = useAppDialog();
  const [showModal, setShowModal] = useState(false);
  const [editingWithdrawal, setEditingWithdrawal] = useState<Withdrawal | null>(null);
  const [search, setSearch] = usePersistentState("withdrawals.search", "");
  const [filter, setFilter] = usePersistentState<"all" | "completed" | "pending" | "cancelled">("withdrawals.status", "all");
  const [currentPage, setCurrentPage] = useState(1);

  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<Withdrawal["method"]>("bank");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [withdrawalStatus, setWithdrawalStatus] = useState<Withdrawal["status"]>("completed");
  const [status, setStatus] = useState<string | null>(null);

  const withdrawals = user.withdrawals ?? EMPTY_WITHDRAWALS;
  const displayedWithdrawals = useMemo(() => withdrawals.filter((entry) => {
    if (entry.method !== "investment" || !entry.sourceInvestmentId) return true;
    return user.investments?.some((investment) =>
      investment.id === entry.sourceInvestmentId && investment.isClosed && investment.withdrawalRecorded
    ) ?? false;
  }), [withdrawals, user.investments]);

  const filteredWithdrawals = useMemo(() => {
    return displayedWithdrawals
      .filter((w) => {
        if (filter !== "all" && w.status !== filter) return false;
        const searchLower = search.toLowerCase();
        return (
          w.method.toLowerCase().includes(searchLower) ||
          w.note.toLowerCase().includes(searchLower) ||
          w.amount.toString().includes(searchLower)
        );
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [displayedWithdrawals, search, filter]);
  const pageCount = Math.max(1, Math.ceil(filteredWithdrawals.length / PAGE_SIZE));
  const visiblePage = Math.min(currentPage, pageCount);
  const pageWithdrawals = useMemo(() => filteredWithdrawals.slice((visiblePage - 1) * PAGE_SIZE, visiblePage * PAGE_SIZE), [filteredWithdrawals, visiblePage]);

  const completedWithdrawals = useMemo(
    () => displayedWithdrawals.filter((withdrawal) => withdrawal.status === "completed"),
    [displayedWithdrawals]
  );

  const totalWithdrawn = useMemo(
    () => completedWithdrawals.reduce((sum, withdrawal) => sum + Math.abs(withdrawal.amount), 0),
    [completedWithdrawals]
  );

  const pendingWithdrawals = useMemo(
    () => withdrawals.filter((w) => w.status === "pending" && w.method !== "investment").reduce((sum, w) => sum + w.amount, 0),
    [withdrawals]
  );

  const investmentProceeds = useMemo(
    () => getInvestmentProceeds(user),
    [user.investments, user.withdrawals]
  );

  const totalAmountInvested = useMemo(
    () => user.investments?.reduce((total, investment) => total + investment.amount, 0) ?? 0,
    [user.investments]
  );

  const availableBalance = useMemo(() => {
    const currentBalance = user.currentBalance ?? user.startingBalance;
    return Math.max(0, currentBalance + investmentProceeds - pendingWithdrawals);
  }, [user.currentBalance, user.startingBalance, investmentProceeds, pendingWithdrawals]);

  const openAddWithdrawal = () => {
    setEditingWithdrawal(null);
    setAmount("");
    setMethod("bank");
    setNote("");
    setDate(new Date().toISOString().slice(0, 10));
    setWithdrawalStatus("completed");
    setStatus(null);
    setShowModal(true);
  };

  const openEditWithdrawal = (withdrawal: Withdrawal) => {
    setEditingWithdrawal(withdrawal);
    setAmount(String(withdrawal.amount));
    setMethod(withdrawal.method);
    setNote(withdrawal.note);
    setDate(withdrawal.date.slice(0, 10));
    setWithdrawalStatus(withdrawal.status);
    setStatus(null);
    setShowModal(true);
  };

  const handleSaveWithdrawal = (e: React.FormEvent) => {
    e.preventDefault();

    const withdrawalAmount = Number(amount);

    if (!withdrawalAmount || withdrawalAmount <= 0) {
      setStatus("Please enter a valid amount.");
      return;
    }

    if (!editingWithdrawal && method !== "investment" && withdrawalStatus === "completed" && withdrawalAmount > availableBalance) {
      setStatus(`Insufficient balance. Available: ${formatCurrency(availableBalance, user.currency)}`);
      return;
    }

    const newWithdrawal: Withdrawal = editingWithdrawal ? {
      ...editingWithdrawal,
      date: `${date}T12:00:00`,
      amount: withdrawalAmount,
      method: editingWithdrawal.method === "investment" ? "investment" : method,
      note: note.trim() || "Withdrawal",
      status: editingWithdrawal.method === "investment" ? "completed" : withdrawalStatus,
    } : {
      id: crypto.randomUUID(),
      date: `${date}T12:00:00`,
      amount: withdrawalAmount,
      method,
      note: note.trim() || "Withdrawal",
      status: withdrawalStatus,
    };

    const oldBalanceImpact = editingWithdrawal && editingWithdrawal.method !== "investment" && editingWithdrawal.status === "completed"
      ? editingWithdrawal.amount : 0;
    const newBalanceImpact = newWithdrawal.method !== "investment" && newWithdrawal.status === "completed"
      ? newWithdrawal.amount : 0;
    const nextInvestments = editingWithdrawal?.method === "investment" && editingWithdrawal.sourceInvestmentId
      ? (user.investments ?? []).map((investment) => investment.id === editingWithdrawal.sourceInvestmentId
        ? {
          ...investment,
          currentValue: withdrawalAmount,
          exitPrice: withdrawalAmount / (investment.quantity || 1),
          directPnl: investment.directPnl != null ? withdrawalAmount - investment.amount : investment.directPnl,
          withdrawalRecorded: true,
        }
        : investment)
      : user.investments;

    const updatedUser: UserAccount = {
      ...user,
      withdrawals: editingWithdrawal
        ? withdrawals.map((entry) => entry.id === editingWithdrawal.id ? newWithdrawal : entry)
        : [newWithdrawal, ...withdrawals],
      investments: nextInvestments,
      currentBalance: user.currentBalance != null ? user.currentBalance + oldBalanceImpact - newBalanceImpact : undefined,
    };

    onSave(updatedUser);
    setAmount("");
    setNote("");
    setMethod("bank");
    setEditingWithdrawal(null);
    setStatus(editingWithdrawal ? "Withdrawal updated successfully!" : "Withdrawal recorded successfully!");
    setShowModal(false);
    setCurrentPage(1);

    setTimeout(() => setStatus(null), 3000);
  };

  const handleDeleteWithdrawal = async (id: string) => {
    if (!await confirm("Are you sure you want to delete this withdrawal record?", "Delete withdrawal")) return;

    const withdrawal = withdrawals.find((w) => w.id === id);
    if (!withdrawal) return;

    const deletedInvestmentId = withdrawal.sourceInvestmentId;
    const updatedUser: UserAccount = {
      ...user,
      withdrawals: withdrawals.filter((w) => w.id !== id),
      investments: withdrawal.method === "investment" && deletedInvestmentId
        ? (user.investments ?? []).map((investment) => investment.id === deletedInvestmentId
          ? { ...investment, withdrawalRecorded: false }
          : investment)
        : user.investments,
      currentBalance: user.currentBalance != null
        ? user.currentBalance + (withdrawal.method !== "investment" && withdrawal.status === "completed" ? withdrawal.amount : 0)
        : undefined,
    };

    onSave(updatedUser);
    setCurrentPage(1);
  };

  const getMethodColor = (method: string) => {
    switch (method) {
      case "bank":
        return "#4f8fff";
      case "crypto":
        return "#a78bfa";
      case "cash":
        return "#f5a623";
      case "investment":
        return "#34d399";
      default:
        return "#34d399";
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return { bg: "rgba(52, 211, 153, 0.1)", color: "#34d399", text: "Completed" };
      case "pending":
        return { bg: "rgba(245, 166, 35, 0.1)", color: "#f5a623", text: "Pending" };
      case "cancelled":
        return { bg: "rgba(255, 77, 106, 0.1)", color: "#ff4d6a", text: "Cancelled" };
      default:
        return { bg: "rgba(79, 143, 255, 0.1)", color: "#4f8fff", text: status };
    }
  };

  return (
    <div className="page-content">
      <div className="page-heading">
        <div>
          <span className="eyebrow">CASH FLOW</span>
          <h1>Withdrawals</h1>
          <p>Manage and track your fund withdrawals.</p>
        </div>
        <button
          className="primary-button"
          onClick={openAddWithdrawal}
          style={{ display: "flex", alignItems: "center", gap: 8 }}
        >
          <Plus size={18} /> Record Withdrawal
        </button>
      </div>

      {status && (
        <div
          style={{
            padding: "12px 16px",
            borderRadius: 8,
            marginBottom: 20,
            backgroundColor: status.includes("success") ? "rgba(52, 211, 153, 0.1)" : "rgba(255, 77, 106, 0.1)",
            color: status.includes("success") ? "#34d399" : "#ff4d6a",
            fontSize: 14,
          }}
        >
          {status}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16, marginBottom: 32 }}>
        <div
          style={{
            background: "linear-gradient(135deg, rgba(79, 143, 255, 0.12), rgba(79, 143, 255, 0.045))",
            border: "1px solid rgba(79, 143, 255, 0.28)",
            borderRadius: 12,
            padding: 20,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: "#5e6b80", fontWeight: 600, textTransform: "uppercase" }}>Total Amount Invested</span>
            <DollarSign size={18} color="#4f8fff" />
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#4f8fff", marginBottom: 4 }}>
            {formatCurrency(totalAmountInvested, user.currency)}
          </div>
          <div style={{ fontSize: 12, color: "#7f8799" }}>Across all recorded holdings</div>
        </div>

        <div
          style={{
            background: "linear-gradient(135deg, rgba(52, 211, 153, 0.1), rgba(16, 185, 129, 0.04))",
            border: "1px solid rgba(52, 211, 153, 0.2)",
            borderRadius: 12,
            padding: 20,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: "#5e6b80", fontWeight: 600, textTransform: "uppercase" }}>Investment proceeds</span>
            <TrendingDown size={18} color="#34d399" />
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#34d399", marginBottom: 4 }}>
            {formatCurrency(investmentProceeds, user.currency)}
          </div>
          <div style={{ fontSize: 12, color: "#7f8799" }}>Cash returned from closed positions</div>
        </div>

        <div
          style={{
            background: "linear-gradient(135deg, rgba(255, 77, 106, 0.1), rgba(255, 109, 135, 0.05))",
            border: "1px solid rgba(255, 77, 106, 0.2)",
            borderRadius: 12,
            padding: 20,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: "#5e6b80", fontWeight: 600, textTransform: "uppercase" }}>Total Withdrawn</span>
            <TrendingDown size={18} color="#ff4d6a" />
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#ff4d6a", marginBottom: 4 }}>
            {formatCurrency(totalWithdrawn, user.currency)}
          </div>
          <div style={{ fontSize: 12, color: "#7f8799" }}>{completedWithdrawals.length} completed</div>
        </div>

        <div
          style={{
            background: "linear-gradient(135deg, rgba(245, 166, 35, 0.1), rgba(245, 166, 35, 0.05))",
            border: "1px solid rgba(245, 166, 35, 0.2)",
            borderRadius: 12,
            padding: 20,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: "#5e6b80", fontWeight: 600, textTransform: "uppercase" }}>Pending</span>
            <Eye size={18} color="#f5a623" />
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#f5a623", marginBottom: 4 }}>
            {formatCurrency(pendingWithdrawals, user.currency)}
          </div>
          <div style={{ fontSize: 12, color: "#7f8799" }}>{withdrawals.filter((w) => w.status === "pending").length} pending</div>
        </div>
      </div>

      <div
        style={{
          background: "rgba(10, 14, 24, 0.4)",
          border: "1px solid rgba(30, 39, 56, 0.6)",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "20px 24px", borderBottom: "1px solid rgba(30, 39, 56, 0.6)" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div className="search-box withdrawals-search-box shared-black-search">
              <Search size={16} className="search-icon" />
              <input
                type="text"
                aria-label="Search withdrawals by method, note, or amount"
                placeholder="Search"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
              />
            </div>
            <select
              value={filter}
              onChange={(e) => { setFilter(e.target.value as any); setCurrentPage(1); }}
              className="filter-dropdown"
            >
              <option value="all">All Status</option>
              <option value="completed">Completed</option>
              <option value="pending">Pending</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(30, 39, 56, 0.6)" }}>
                <th style={{ padding: "16px 24px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "#5e6b80", textTransform: "uppercase" }}>Date</th>
                <th style={{ padding: "16px 24px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "#5e6b80", textTransform: "uppercase" }}>Amount</th>
                <th style={{ padding: "16px 24px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "#5e6b80", textTransform: "uppercase" }}>Method</th>
                <th style={{ padding: "16px 24px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "#5e6b80", textTransform: "uppercase" }}>Note</th>
                <th style={{ padding: "16px 24px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "#5e6b80", textTransform: "uppercase" }}>Status</th>
                <th style={{ padding: "16px 24px", textAlign: "center", fontSize: 12, fontWeight: 600, color: "#5e6b80", textTransform: "uppercase" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredWithdrawals.length > 0 ? (
                pageWithdrawals.map((withdrawal) => {
                  const statusBadge = getStatusBadge(withdrawal.status);
                  const date = new Date(withdrawal.date);
                  return (
                    <tr key={withdrawal.id} style={{ borderBottom: "1px solid rgba(30, 39, 56, 0.4)", transition: "background 0.2s" }}>
                      <td style={{ padding: "16px 24px", color: "#e8edf5", fontSize: 14 }}>
                        {date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                      </td>
                      <td style={{ padding: "16px 24px", color: "#ff4d6a", fontSize: 14, fontWeight: 700 }}>
                        -{formatCurrency(Math.abs(withdrawal.amount), user.currency)}
                        {withdrawal.method === "investment" && (
                          <small style={{ display: "block", marginTop: 4, color: "#7f8799", fontSize: 10, fontWeight: 500 }}>
                            Full sale proceeds
                          </small>
                        )}
                      </td>
                      <td style={{ padding: "16px 24px" }}>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            padding: "6px 10px",
                            borderRadius: 4,
                            background: `${getMethodColor(withdrawal.method)}20`,
                            color: getMethodColor(withdrawal.method),
                            fontSize: 12,
                            fontWeight: 600,
                          }}
                        >
                          <CreditCard size={14} />
                          {withdrawal.method === "investment" ? "Investment sale" : withdrawal.method.charAt(0).toUpperCase() + withdrawal.method.slice(1)}
                        </span>
                      </td>
                      <td style={{ padding: "16px 24px", color: "#9aa5ba", fontSize: 14 }}>{withdrawal.note}</td>
                      <td style={{ padding: "16px 24px" }}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "6px 12px",
                            borderRadius: 4,
                            background: statusBadge.bg,
                            color: statusBadge.color,
                            fontSize: 12,
                            fontWeight: 600,
                          }}
                        >
                          {statusBadge.text}
                        </span>
                      </td>
                      <td style={{ padding: "16px 24px", textAlign: "center" }}>
                        <div className="withdrawal-actions">
                        <button
                          type="button"
                          className="action-button"
                          onClick={() => openEditWithdrawal(withdrawal)}
                          title="Edit withdrawal"
                          aria-label="Edit withdrawal"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          type="button"
                          className="action-button delete"
                          onClick={() => handleDeleteWithdrawal(withdrawal.id)}
                          title="Delete withdrawal"
                          aria-label="Delete withdrawal"
                        >
                          <Trash2 size={16} />
                        </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} style={{ padding: "40px", textAlign: "center", color: "#5e6b80" }}>
                    No withdrawals found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {filteredWithdrawals.length > PAGE_SIZE && <div className="enterprise-table-footer">
          <div className="footer-stats">
            <span>Showing <strong>{filteredWithdrawals.length ? (visiblePage - 1) * PAGE_SIZE + 1 : 0}–{Math.min(visiblePage * PAGE_SIZE, filteredWithdrawals.length)}</strong> of <strong>{filteredWithdrawals.length}</strong> withdrawals</span>
            <span className="page-size-label">20 per page</span>
          </div>
          {filteredWithdrawals.length > 0 && <nav className="transaction-pagination" aria-label="Withdrawal pages">
            <button type="button" className="pagination-button" onClick={() => setCurrentPage((page) => Math.max(1, Math.min(page, pageCount) - 1))} disabled={visiblePage <= 1} aria-label="Previous withdrawal page"><ChevronLeft size={15} /> Previous</button>
            <span>Page <strong>{visiblePage}</strong> of <strong>{pageCount}</strong></span>
            <button type="button" className="pagination-button" onClick={() => setCurrentPage((page) => Math.min(pageCount, Math.min(page, pageCount) + 1))} disabled={visiblePage >= pageCount} aria-label="Next withdrawal page">Next <ChevronRight size={15} /></button>
          </nav>}
        </div>}
      </div>

      {showModal && (
        <div
          className="modal-overlay"
          onMouseDown={(e) => e.target === e.currentTarget && setShowModal(false)}
        >
          <div className="transaction-modal withdrawal-modal">
            <div className="modal-header">
              <div className="modal-header-text">
                <span className="eyebrow">CASH FLOW</span>
                <h2>{editingWithdrawal ? "Edit withdrawal" : "Record Withdrawal"}</h2>
                <p>{editingWithdrawal ? "Update the date, amount, note, or status for this withdrawal." : "Add a new withdrawal record to your account."}</p>
              </div>
              <button
                type="button"
                className="close-button"
                onClick={() => setShowModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form className="modal-form" onSubmit={handleSaveWithdrawal}>
              <div className="form-grid">
                <div className="form-group form-span-full">
                  <label htmlFor="wd-amount">
                    <span className="field-label-text">
                      {user.currency === "INR" ? <IndianRupee size={14} /> : <DollarSign size={14} />} Withdrawal Amount
                    </span>
                    <span className="field-hint">How much are you withdrawing?</span>
                  </label>
                  <div className="input-with-prefix">
                    <span className="prefix">{user.currency}</span>
                    <input
                      id="wd-amount"
                      type="number"
                      min="0"
                      step="0.01"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="wd-method">
                    <span className="field-label-text">
                      <CreditCard size={14} /> Withdrawal Method
                    </span>
                  </label>
                  <select
                    id="wd-method"
                    className="withdrawal-method-select"
                    value={method}
                    disabled={editingWithdrawal?.method === "investment"}
                    onChange={(e) => setMethod(e.target.value as Withdrawal["method"])}
                  >
                    {editingWithdrawal?.method === "investment" && <option value="investment">Investment sale</option>}
                    <option value="bank">Bank Transfer</option>
                    <option value="crypto">Cryptocurrency</option>
                    <option value="cash">Cash</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="wd-date">
                    <span className="field-label-text">
                      <Calendar size={14} /> Date
                    </span>
                  </label>
                  <input
                    id="wd-date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </div>

                {editingWithdrawal && editingWithdrawal.method !== "investment" && <div className="form-group">
                  <label htmlFor="wd-status"><span className="field-label-text">Status</span></label>
                  <select id="wd-status" value={withdrawalStatus} onChange={(e) => setWithdrawalStatus(e.target.value as Withdrawal["status"])}>
                    <option value="completed">Completed</option>
                    <option value="pending">Pending</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>}

                <div className="form-group form-span-full">
                  <label htmlFor="wd-note">
                    <span className="field-label-text">Note</span>
                    <span className="field-hint">Optional notes about this withdrawal</span>
                  </label>
                  <input
                    id="wd-note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="e.g. Withdrawal for personal use"
                  />
                </div>

                <div className="form-group form-span-full" style={{ background: "rgba(52, 211, 153, 0.05)", padding: 12, borderRadius: 6, border: "1px solid rgba(52, 211, 153, 0.1)" }}>
                  <div style={{ fontSize: 12, color: "#5e6b80", marginBottom: 4 }}>Available Balance</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "#34d399" }}>
                    {formatCurrency(availableBalance, user.currency)}
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="primary-button">
                  <Check size={16} /> {editingWithdrawal ? "Save changes" : "Record Withdrawal"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Withdrawals;
