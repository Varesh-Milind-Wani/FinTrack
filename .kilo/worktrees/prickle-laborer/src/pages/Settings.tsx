import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Check,
  Lock,
  LockOpen,
  Pencil,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  TrendingUp,
  User,
  Wallet,
} from "lucide-react";

import type { DefaultCostSchedule, UserAccount } from "../types/finance";
import { formatCurrency } from "../utils/money";
import { getAuthoritativeBalance } from "../utils/balance";
import { addSampleTradesToUser } from "../utils/storage";

const getCostForDate = (
  date: string,
  schedules: DefaultCostSchedule[],
  fallback = 0
) => {
  return [...schedules]
    .filter((schedule) => schedule.startDate <= date.slice(0, 10))
    .sort((left, right) => right.startDate.localeCompare(left.startDate))[0]
    ?.amount ?? fallback;
};

const recalculateTransactions = (
  transactions: UserAccount["transactions"],
  schedules: DefaultCostSchedule[],
  fallbackCost = 0
) => transactions.map((transaction) => {
  const grossAmount = transaction.grossAmount ?? transaction.amount;
  const costAmount = getCostForDate(transaction.date, schedules, fallbackCost);
  const amount = transaction.type === "profit"
    ? Math.max(0, grossAmount - costAmount)
    : grossAmount + costAmount;

  return {
    ...transaction,
    amount,
    price: amount,
    grossAmount,
    costAmount,
  };
});

interface Props {
  user: UserAccount;
  onSave: (updatedUser: UserAccount) => void;
}

const Settings = ({ user, onSave }: Props) => {
  const currentBalance = useMemo(() => {
    return getAuthoritativeBalance(user);
  }, [user.startingBalance, user.transactions, user.currentBalance]);

  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [startingBalance, setStartingBalance] = useState(
    String(user.startingBalance)
  );
  const [isStartingBalanceLocked, setIsStartingBalanceLocked] = useState(
    user.startingBalanceLocked ?? false
  );
  const [currentBalanceInput, setCurrentBalanceInput] = useState(
    String(user.currentBalance ?? currentBalance)
  );
  const [isEditingBalance, setIsEditingBalance] = useState(false);
  const [currency, setCurrency] = useState(
    user.currency ?? "INR"
  );
  const [status, setStatus] = useState<string | null>(null);
  const [schedules, setSchedules] = useState<DefaultCostSchedule[]>(
    user.defaultCostSchedules ?? []
  );
  const [scheduleName, setScheduleName] = useState("");
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleAmount, setScheduleAmount] = useState("");
  const [scheduleStatus, setScheduleStatus] = useState<string | null>(null);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);

  useEffect(() => {
    setName(user.name);
    setEmail(user.email);
    setStartingBalance(String(user.startingBalance));
    setIsStartingBalanceLocked(user.startingBalanceLocked ?? false);
    setCurrentBalanceInput(String(user.currentBalance ?? currentBalance));
    setCurrency(user.currency ?? "INR");
    setSchedules(user.defaultCostSchedules ?? []);
  }, [
    user.currency,
    user.email,
    user.name,
    user.startingBalance,
    user.defaultCostSchedules,
    user.currentBalance,
    currentBalance,
  ]);

  const handleSave = () => {
    const nextBalance = Number(startingBalance);
    const nextCurrentBalance = Number(currentBalanceInput);

    if (!name.trim() || !email.trim()) {
      setStatus("Name and email cannot be empty.");
      return;
    }

    // If starting balance is locked, don't allow changes to it
    if (isStartingBalanceLocked && nextBalance !== user.startingBalance) {
      setStatus("Starting balance is locked. Unlock to make changes.");
      return;
    }

    if (!Number.isFinite(nextBalance) || nextBalance < 0) {
      setStatus("Starting balance must be a valid positive number.");
      return;
    }

    if (!Number.isFinite(nextCurrentBalance) || nextCurrentBalance < 0) {
      setStatus("Current balance must be a valid positive number.");
      return;
    }

    const updatedUser = {
      ...user,
      name: name.trim(),
      email: email.trim(),
      startingBalance: nextBalance,
      startingBalanceLocked: isStartingBalanceLocked,
      currentBalance: nextCurrentBalance, // Allow manual balance override for rebalancing
      currency,
      defaultCostAmount: user.defaultCostAmount ?? 0,
      defaultCostSchedules: schedules,
      transactions: recalculateTransactions(
        user.transactions,
        schedules,
        user.defaultCostAmount ?? 0
      ),
    };

    onSave(updatedUser);
    setStatus("Settings saved successfully.");
  };

  const getScheduleStatus = (startDate: string) => {
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const activeSchedule = [...schedules]
      .filter((schedule) => schedule.startDate <= todayKey)
      .sort((left, right) => right.startDate.localeCompare(left.startDate))[0];

    if (startDate > todayKey) return "Scheduled";
    if (activeSchedule?.startDate === startDate) return "Active";
    return "Past";
  };

  const handleCreateSchedule = () => {
    const amount = Number(scheduleAmount);

    if (!scheduleName.trim() || !scheduleDate) {
      setScheduleStatus("Enter a name and start date.");
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      setScheduleStatus("Cost must be greater than zero.");
      return;
    }

    const nextSchedule = {
      id: editingScheduleId ?? crypto.randomUUID(),
      startDate: scheduleDate,
      name: scheduleName.trim(),
      amount,
    };
    const nextSchedules = (editingScheduleId
      ? schedules.map((schedule) =>
          schedule.id === editingScheduleId ? nextSchedule : schedule
        )
      : [...schedules, nextSchedule]
    ).sort((left, right) => right.startDate.localeCompare(left.startDate));

    setSchedules(nextSchedules);
    onSave({
      ...user,
      defaultCostSchedules: nextSchedules,
      transactions: recalculateTransactions(user.transactions, nextSchedules),
    });
    setScheduleName("");
    setScheduleDate("");
    setScheduleAmount("");
    setEditingScheduleId(null);
    setScheduleStatus(
      editingScheduleId
        ? "Cost schedule updated successfully."
        : "Cost schedule created successfully."
    );
  };

  const handleEditSchedule = (schedule: DefaultCostSchedule) => {
    setEditingScheduleId(schedule.id);
    setScheduleDate(schedule.startDate);
    setScheduleName(schedule.name);
    setScheduleAmount(String(schedule.amount));
    setScheduleStatus(null);
  };

  const handleCancelScheduleEdit = () => {
    setEditingScheduleId(null);
    setScheduleDate("");
    setScheduleName("");
    setScheduleAmount("");
    setScheduleStatus(null);
  };

  const handleDeleteSchedule = (id: string) => {
    const nextSchedules = schedules.filter((schedule) => schedule.id !== id);
    setSchedules(nextSchedules);
    onSave({
      ...user,
      defaultCostSchedules: nextSchedules,
      transactions: recalculateTransactions(user.transactions, nextSchedules),
    });
  };

  return (
    <div className="page-content">
      <div className="page-heading">
        <div>
          <span className="eyebrow">ACCOUNT</span>

          <h1>Settings</h1>

          <p>Update your profile basics and account defaults.</p>
        </div>
      </div>

      <div className="charts-two-column">
        <div className="chart-panel">
          <div className="chart-panel-header">
            <div>
              <h3>Profile details</h3>
              <p>These values are stored locally with your account.</p>
            </div>
          </div>

          <div className="form-grid">
            <label>
              Full name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Your full name"
              />
            </label>

            <label>
              Email address
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
              />
            </label>

            <label className="form-span-full">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                <span>Starting balance</span>
                <button
                  type="button"
                  onClick={() => setIsStartingBalanceLocked(!isStartingBalanceLocked)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    padding: "4px 8px",
                    background: isStartingBalanceLocked ? "rgba(239, 68, 68, 0.1)" : "rgba(59, 130, 246, 0.1)",
                    border: `1px solid ${isStartingBalanceLocked ? "#ef4444" : "#3b82f6"}`,
                    borderRadius: "4px",
                    color: isStartingBalanceLocked ? "#ef4444" : "#3b82f6",
                    cursor: "pointer",
                    fontSize: "12px",
                    fontWeight: 600,
                  }}
                  title={isStartingBalanceLocked ? "Click to unlock starting balance" : "Click to lock starting balance"}
                >
                  {isStartingBalanceLocked ? <Lock size={14} /> : <LockOpen size={14} />}
                  {isStartingBalanceLocked ? "Locked" : "Unlocked"}
                </button>
              </div>
              <input
                type="number"
                min="0"
                value={startingBalance}
                onChange={(event) => {
                  if (!isStartingBalanceLocked) {
                    setStartingBalance(event.target.value);
                  }
                }}
                disabled={isStartingBalanceLocked}
                placeholder="5000"
                style={{
                  opacity: isStartingBalanceLocked ? 0.5 : 1,
                  cursor: isStartingBalanceLocked ? "not-allowed" : "text",
                }}
              />
            </label>

            <label>
              Currency

              <select
                value={currency}
                onChange={(event) => setCurrency(event.target.value)}
              >
                <option value="INR">Indian Rupee (INR)</option>
                <option value="USD">US Dollar (USD)</option>
                <option value="EUR">Euro (EUR)</option>
                <option value="GBP">British Pound (GBP)</option>
                <option value="AED">UAE Dirham (AED)</option>
              </select>
            </label>

          </div>

          <div className="modal-footer">
            <button className="primary-button" onClick={handleSave}>
              <Save size={16} />
              Save changes
            </button>
          </div>

          {status && (
            <div
              className={
                status.includes("success")
                  ? "field-hint"
                  : "error-message"
              }
              style={{ marginTop: 12 }}
            >
              {status}
            </div>
          )}
        </div>

        <div className="chart-panel">
          <div className="chart-panel-header">
            <div>
              <h3>Account summary</h3>
              <p>Quick snapshot of the current account. Update balance as needed.</p>
            </div>
          </div>

          <div className="analytics-summary">
            <div className="snapshot-item">
              <span>User</span>
              <strong>{user.name}</strong>
            </div>

            <div className="snapshot-item">
              <span>Email</span>
              <strong>{user.email}</strong>
            </div>

            <div className="snapshot-item">
              <span>Current balance</span>
              {isEditingBalance ? (
                <div style={{ display: "flex", gap: 8, alignItems: "center", width: "100%" }}>
                  <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{currency}</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={currentBalanceInput}
                    onChange={(event) => setCurrentBalanceInput(event.target.value)}
                    autoFocus
                    placeholder="0.00"
                    style={{
                      flex: 1,
                      padding: "8px 12px",
                      border: "1px solid var(--color-border)",
                      borderRadius: 6,
                      backgroundColor: "var(--color-background-secondary)",
                      color: "var(--color-text-primary)",
                      fontSize: 16,
                      fontWeight: 600,
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setIsEditingBalance(false)}
                    style={{
                      padding: "6px 8px",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "var(--color-text-secondary)",
                    }}
                    title="Done editing"
                  >
                    <Check size={18} />
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <strong style={{ fontSize: 18 }}>{formatCurrency(Number(currentBalanceInput), currency)}</strong>
                  <button
                    type="button"
                    onClick={() => setIsEditingBalance(true)}
                    style={{
                      padding: "6px 8px",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "var(--color-text-secondary)",
                      display: "flex",
                      alignItems: "center",
                    }}
                    title="Edit current balance"
                  >
                    <Pencil size={16} />
                  </button>
                </div>
              )}
            </div>

            <div className="snapshot-item">
              <span>Transactions saved</span>
              <strong>{user.transactions.length}</strong>
            </div>
          </div>

          <div className="storage-info" style={{ marginTop: 16 }}>
            <div className="storage-icon">
              <ShieldCheck size={16} />
            </div>

            <div>
              <strong>Your data stays on this device</strong>
              <p>
                FinTrack saves the account and transaction history in
                localStorage, so editing settings updates the same local
                profile.
              </p>
            </div>
          </div>

          <div className="storage-info" style={{ marginTop: 12 }}>
            <div className="storage-icon">
              <User size={16} />
            </div>

            <div>
              <strong>Profile changes are immediate</strong>
              <p>
                Save changes once and the sidebar profile details will reflect
                the new values right away.
              </p>
            </div>
          </div>

          <div className="storage-info" style={{ marginTop: 12 }}>
            <div className="storage-icon">
              <Wallet size={16} />
            </div>

            <div>
              <strong>Current balance is editable</strong>
              <p>
                Update your current balance directly. This reflects your actual portfolio value
                and is used for analytics throughout the app.
              </p>
            </div>
          </div>

          <div style={{ marginTop: 18 }}>
            <button
              type="button"
              className="secondary-button"
              style={{ width: "100%", justifyContent: "center", gap: 8, padding: "10px 16px" }}
              onClick={() => {
                const updatedUser = addSampleTradesToUser(user);
                onSave(updatedUser);
                setStatus("Sample profit & loss trades added successfully!");
              }}
            >
              <TrendingUp size={16} /> Add Sample Profit &amp; Loss Trades
            </button>
          </div>
        </div>
      </div>

      <section className="chart-panel default-cost-panel">
        <div className="chart-panel-header">
          <div>
            <h3>Default Cost Amount</h3>
            <p>Create dated costs. The matching cost is selected automatically when you add a transaction.</p>
          </div>
          <span className="live-badge">DATE BASED</span>
        </div>

        <div className="default-cost-create">
          <div className="create-card-icon"><Plus size={18} /></div>
          <div className="default-cost-fields">
            <label>
              Start date
              <input type="date" value={scheduleDate} onChange={(event) => setScheduleDate(event.target.value)} />
            </label>
            <label>
              Name
              <input value={scheduleName} onChange={(event) => setScheduleName(event.target.value)} placeholder="Default Cost Amount" />
            </label>
            <label>
              Cost ({currency})
              <input type="number" min="0.01" step="0.01" value={scheduleAmount} onChange={(event) => setScheduleAmount(event.target.value)} placeholder="500" />
            </label>
            <button type="button" className="primary-button create-cost-button" onClick={handleCreateSchedule}>
              <Plus size={16} /> {editingScheduleId ? "Update cost" : "Create new"}
            </button>
            {editingScheduleId && (
              <button type="button" className="secondary-button cancel-cost-button" onClick={handleCancelScheduleEdit}>
                Cancel
              </button>
            )}
          </div>
        </div>

        {scheduleStatus && (
          <div className={scheduleStatus.includes("successfully") ? "field-hint" : "error-message"}>
            {scheduleStatus}
          </div>
        )}

        <div className="default-cost-history">
          <div className="history-heading">
            <div>
              <strong>Full history</strong>
              <span>Every dated default cost</span>
            </div>
            <CalendarDays size={18} />
          </div>

          {schedules.length > 0 ? (
            <div className="table-wrapper">
              <table className="transaction-table default-cost-table">
                <thead>
                  <tr><th>Start Date</th><th>Name</th><th>Cost</th><th>Status</th><th /></tr>
                </thead>
                <tbody>
                  {schedules.map((schedule) => {
                    const scheduleStatusValue = getScheduleStatus(schedule.startDate);
                    return (
                      <tr key={schedule.id}>
                        <td>{new Date(`${schedule.startDate}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</td>
                        <td><strong>{schedule.name}</strong></td>
                        <td className="amount">{formatCurrency(schedule.amount, currency)}</td>
                        <td><span className={`schedule-badge ${scheduleStatusValue.toLowerCase()}`}>{scheduleStatusValue}</span></td>
                        <td>
                          <div className="row-actions">
                            <button type="button" className="edit-button" onClick={() => handleEditSchedule(schedule)} title="Edit cost schedule"><Pencil size={15} /></button>
                            <button type="button" className="delete-button" onClick={() => handleDeleteSchedule(schedule.id)} title="Delete cost schedule"><Trash2 size={15} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-schedule">No dated costs yet. Create your first schedule above.</div>
          )}
        </div>
      </section>

    </div>
  );
};

export default Settings;
