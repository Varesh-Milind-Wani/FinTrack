import { useMemo, useState } from "react";
import {
  Calendar,
  Check,
  CreditCard,
  DollarSign,
  Eye,
  Plus,
  Search,
  Trash2,
  TrendingDown,
  X,
} from "lucide-react";
import type { UserAccount, Withdrawal } from "../types/finance";
import { formatCurrency } from "../utils/money";

interface Props {
  user: UserAccount;
  onSave: (updatedUser: UserAccount) => void;
}

const Withdrawals = ({ user, onSave }: Props) => {
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "completed" | "pending" | "cancelled">("all");

  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"bank" | "crypto" | "cash" | "other">("bank");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const withdrawals = useMemo(() => user.withdrawals ?? [], [user.withdrawals]);

  const filteredWithdrawals = useMemo(() => {
    return withdrawals
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
  }, [withdrawals, search, filter]);

  const totalWithdrawn = useMemo(
    () => withdrawals.filter((w) => w.status === "completed").reduce((sum, w) => sum + w.amount, 0),
    [withdrawals]
  );

  const pendingWithdrawals = useMemo(
    () => withdrawals.filter((w) => w.status === "pending").reduce((sum, w) => sum + w.amount, 0),
    [withdrawals]
  );

  const availableBalance = useMemo(() => {
    const currentBalance = user.currentBalance ?? (user.startingBalance + withdrawals.length);
    return Math.max(0, currentBalance - pendingWithdrawals);
  }, [user.currentBalance, user.startingBalance, withdrawals, pendingWithdrawals]);

  const handleAddWithdrawal = (e: React.FormEvent) => {
    e.preventDefault();

    const withdrawalAmount = Number(amount);

    if (!withdrawalAmount || withdrawalAmount <= 0) {
      setStatus("Please enter a valid amount.");
      return;
    }

    if (withdrawalAmount > availableBalance) {
      setStatus(`Insufficient balance. Available: ${formatCurrency(availableBalance, user.currency)}`);
      return;
    }

    const newWithdrawal: Withdrawal = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      amount: withdrawalAmount,
      method,
      note: note.trim() || "Withdrawal",
      status: "completed",
    };

    const updatedUser: UserAccount = {
      ...user,
      withdrawals: [newWithdrawal, ...withdrawals],
      currentBalance: user.currentBalance ? user.currentBalance - withdrawalAmount : undefined,
    };

    onSave(updatedUser);
    setAmount("");
    setNote("");
    setMethod("bank");
    setStatus("Withdrawal recorded successfully!");
    setShowModal(false);

    setTimeout(() => setStatus(null), 3000);
  };

  const handleDeleteWithdrawal = (id: string) => {
    if (!window.confirm("Are you sure you want to delete this withdrawal record?")) return;

    const withdrawal = withdrawals.find((w) => w.id === id);
    if (!withdrawal) return;

    const updatedUser: UserAccount = {
      ...user,
      withdrawals: withdrawals.filter((w) => w.id !== id),
      currentBalance: user.currentBalance ? user.currentBalance + withdrawal.amount : undefined,
    };

    onSave(updatedUser);
  };

  const getMethodColor = (method: string) => {
    switch (method) {
      case "bank":
        return "#4f8fff";
      case "crypto":
        return "#a78bfa";
      case "cash":
        return "#f5a623";
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
          onClick={() => setShowModal(true)}
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
            background: "linear-gradient(135deg, rgba(52, 211, 153, 0.1), rgba(0, 229, 160, 0.05))",
            border: "1px solid rgba(0, 229, 160, 0.2)",
            borderRadius: 12,
            padding: 20,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: "#5e6b80", fontWeight: 600, textTransform: "uppercase" }}>Available Balance</span>
            <DollarSign size={18} color="#34d399" />
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#34d399", marginBottom: 4 }}>
            {formatCurrency(availableBalance, user.currency)}
          </div>
          <div style={{ fontSize: 12, color: "#7f8799" }}>Ready to withdraw</div>
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
          <div style={{ fontSize: 12, color: "#7f8799" }}>{withdrawals.filter((w) => w.status === "completed").length} completed</div>
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
            <div className="search-box">
              <Search size={16} className="search-icon" />
              <input
                type="text"
                placeholder="Search withdrawals..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as any)}
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
                filteredWithdrawals.map((withdrawal) => {
                  const statusBadge = getStatusBadge(withdrawal.status);
                  const date = new Date(withdrawal.date);
                  return (
                    <tr key={withdrawal.id} style={{ borderBottom: "1px solid rgba(30, 39, 56, 0.4)", transition: "background 0.2s" }}>
                      <td style={{ padding: "16px 24px", color: "#e8edf5", fontSize: 14 }}>
                        {date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                      </td>
                      <td style={{ padding: "16px 24px", color: "#ff4d6a", fontSize: 14, fontWeight: 700 }}>
                        -{formatCurrency(withdrawal.amount, user.currency)}
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
                          {withdrawal.method.charAt(0).toUpperCase() + withdrawal.method.slice(1)}
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
                        <button
                          onClick={() => handleDeleteWithdrawal(withdrawal.id)}
                          style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            color: "#ff4d6a",
                            padding: "6px 8px",
                          }}
                          title="Delete withdrawal"
                        >
                          <Trash2 size={16} />
                        </button>
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
      </div>

      {showModal && (
        <div
          className="modal-overlay"
          onMouseDown={(e) => e.target === e.currentTarget && setShowModal(false)}
        >
          <div className="transaction-modal" style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <div className="modal-header-text">
                <span className="eyebrow">CASH FLOW</span>
                <h2>Record Withdrawal</h2>
                <p>Add a new withdrawal record to your account.</p>
              </div>
              <button
                type="button"
                className="close-button"
                onClick={() => setShowModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form className="modal-form" onSubmit={handleAddWithdrawal}>
              <div className="form-grid">
                <div className="form-group form-span-full">
                  <label htmlFor="wd-amount">
                    <span className="field-label-text">
                      <DollarSign size={14} /> Withdrawal Amount
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
                    value={method}
                    onChange={(e) => setMethod(e.target.value as any)}
                  >
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
                    value={new Date().toISOString().split("T")[0]}
                    disabled
                  />
                </div>

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
                  <Check size={16} /> Record Withdrawal
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
