import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Check,
  Database,
  KeyRound,
  ListFilter,
  Lock,
  LockOpen,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Search,
  Trash2,
} from "lucide-react";

import type { DefaultCostSchedule, UserAccount } from "../types/finance";
import { formatCurrency } from "../utils/money";
import { calculateCurrentBalance, getAuthoritativeBalance } from "../utils/balance";
import { createBalancePinSalt, hashBalancePin, verifyBalancePin } from "../utils/balancePin";

interface Props {
  user: UserAccount;
  onSave: (updatedUser: UserAccount) => void;
}

const Settings = ({ user, onSave }: Props) => {
  const currentBalance = useMemo(() => {
    return getAuthoritativeBalance(user);
  }, [user.startingBalance, user.transactions, user.currentBalance]);

  const [startingBalance, setStartingBalance] = useState(
    String(user.startingBalance)
  );
  const [isStartingBalanceLocked, setIsStartingBalanceLocked] = useState(
    user.startingBalanceLocked ?? false
  );
  const [showUnlockPrompt, setShowUnlockPrompt] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState("");
  const [unlockStatus, setUnlockStatus] = useState<string | null>(null);
  const [currentBalancePassword, setCurrentBalancePassword] = useState("");
  const [newBalancePassword, setNewBalancePassword] = useState("");
  const [confirmBalancePassword, setConfirmBalancePassword] = useState("");
  const [resetBalancePinMode, setResetBalancePinMode] = useState(false);
  const [passwordStatus, setPasswordStatus] = useState<string | null>(null);
  const [currentBalanceInput, setCurrentBalanceInput] = useState(
    String(user.currentBalance ?? currentBalance)
  );
  const [isEditingBalance, setIsEditingBalance] = useState(false);
  const [currency, setCurrency] = useState(
    user.currency ?? "INR"
  );
  const [investmentIncluded, setInvestmentIncluded] = useState(
    user.investmentIncluded ?? false
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
  const [scheduleSearch, setScheduleSearch] = useState("");
  const [scheduleDateFilter, setScheduleDateFilter] = useState("all");
  const [scheduleSort, setScheduleSort] = useState<{ key: "date" | "name" | "amount"; direction: "asc" | "desc" }>({ key: "date", direction: "desc" });

  useEffect(() => {
    setStartingBalance(String(user.startingBalance));
    setIsStartingBalanceLocked(user.startingBalanceLocked ?? false);
    setCurrentBalanceInput(String(user.currentBalance ?? currentBalance));
    setCurrency(user.currency ?? "INR");
    setInvestmentIncluded(user.investmentIncluded ?? false);
    setSchedules(user.defaultCostSchedules ?? []);
  }, [
    user.currency,
    user.startingBalance,
    user.defaultCostSchedules,
    user.currentBalance,
    currentBalance,
  ]);

  const handleSave = () => {
    const nextBalance = Number(startingBalance);
    const nextCurrentBalance = Number(currentBalanceInput);

    // If starting balance is locked, don't allow changes to it
    if (isStartingBalanceLocked && user.startingBalanceLocked && nextBalance !== user.startingBalance) {
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

    const balanceBeforeManualAdjustment = calculateCurrentBalance({
      ...user,
      startingBalance: nextBalance,
      balanceAdjustment: 0,
    });
    const updatedUser = {
      ...user,
      startingBalance: nextBalance,
      startingBalanceLocked: isStartingBalanceLocked,
      currentBalance: nextCurrentBalance,
      // Keep the manual rebalance as an offset so future transaction changes
      // preserve it instead of resetting the balance back to the raw total.
      balanceAdjustment: nextCurrentBalance - balanceBeforeManualAdjustment,
      currency,
      investmentIncluded,
      defaultCostAmount: user.defaultCostAmount ?? 0,
      defaultCostSchedules: schedules,
      transactions: user.transactions,
    };

    onSave(updatedUser);
    setStatus("Settings saved successfully.");
  };

  const handleLockToggle = () => {
    setPasswordStatus(null);
    setUnlockStatus(null);
    if (isStartingBalanceLocked) {
      if (!user.startingBalancePasswordHash || !user.startingBalancePasswordSalt) {
        setPasswordStatus("Set a 4-digit PIN below before unlocking the starting balance.");
        return;
      }
      setShowUnlockPrompt(true);
      return;
    }

    if (!user.startingBalancePasswordHash || !user.startingBalancePasswordSalt) {
      setPasswordStatus("Set a 4-digit PIN below before locking the starting balance.");
      return;
    }
    setIsStartingBalanceLocked(true);
  };

  const handleUnlockBalance = async () => {
    if (!user.startingBalancePasswordHash || !user.startingBalancePasswordSalt) return;
    setUnlockStatus(null);
    try {
      if (!/^\d{4}$/.test(unlockPassword)) {
        setUnlockStatus("Enter your 4-digit PIN.");
        return;
      }
      if (!(await verifyBalancePin(unlockPassword, user))) {
        setUnlockStatus("Incorrect PIN. Please try again.");
        return;
      }
      setIsStartingBalanceLocked(false);
      setShowUnlockPrompt(false);
      setUnlockPassword("");
      setUnlockStatus("PIN verified. Save settings to apply your changes.");
      setPasswordStatus("Starting balance unlocked. Save settings to apply your changes.");
    } catch {
      setUnlockStatus("PIN verification is unavailable in this browser.");
    }
  };

  const handleSaveBalancePassword = async () => {
    setPasswordStatus(null);
    if (!/^\d{4}$/.test(newBalancePassword)) {
      setPasswordStatus("Choose a PIN with exactly 4 digits.");
      return;
    }
    if (newBalancePassword !== confirmBalancePassword) {
      setPasswordStatus("The new PINs do not match.");
      return;
    }

    try {
      if (user.startingBalancePasswordHash) {
        if (resetBalancePinMode) {
          if (!currentBalancePassword || currentBalancePassword !== user.password) {
            setPasswordStatus("Enter your account password to reset the PIN.");
            return;
          }
        } else if (user.startingBalancePasswordSalt) {
          if (!(await verifyBalancePin(currentBalancePassword, user))) {
            setPasswordStatus("Enter your current PIN to change it, or use Reset PIN with your account password.");
            return;
          }
        } else {
          setPasswordStatus("This PIN cannot be verified. Use Reset PIN with your account password.");
          return;
        }
      }

      const salt = createBalancePinSalt();
      const passwordHash = await hashBalancePin(newBalancePassword, salt);
      onSave({
        ...user,
        startingBalancePasswordSalt: salt,
        startingBalancePasswordHash: passwordHash,
      });
      setCurrentBalancePassword("");
      setNewBalancePassword("");
      setConfirmBalancePassword("");
      setPasswordStatus(resetBalancePinMode ? "Starting balance PIN reset successfully." : "Starting balance PIN saved.");
      setResetBalancePinMode(false);
    } catch {
      setPasswordStatus("Could not save the PIN in this browser.");
    }
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
    onSave({ ...user, defaultCostSchedules: nextSchedules });
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

  const handleClearScheduleForm = () => {
    setEditingScheduleId(null);
    setScheduleDate("");
    setScheduleName("");
    setScheduleAmount("");
    setScheduleStatus(null);
  };

  const handleDeleteSchedule = (id: string) => {
    const nextSchedules = schedules.filter((schedule) => schedule.id !== id);
    setSchedules(nextSchedules);
    onSave({ ...user, defaultCostSchedules: nextSchedules });
  };

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoKey = `${thirtyDaysAgo.getFullYear()}-${String(thirtyDaysAgo.getMonth() + 1).padStart(2, "0")}-${String(thirtyDaysAgo.getDate()).padStart(2, "0")}`;
  const visibleSchedules = schedules
    .filter((schedule) => {
      const matchesName = schedule.name.toLowerCase().includes(scheduleSearch.trim().toLowerCase());
      const matchesDate = scheduleDateFilter === "all"
        || (scheduleDateFilter === "30days" && schedule.startDate >= thirtyDaysAgoKey && schedule.startDate <= todayKey)
        || (scheduleDateFilter === "year" && schedule.startDate.startsWith(String(today.getFullYear())));
      return matchesName && matchesDate;
    })
    .sort((left, right) => {
      const comparison = scheduleSort.key === "date"
        ? left.startDate.localeCompare(right.startDate)
        : scheduleSort.key === "name"
          ? left.name.localeCompare(right.name)
          : left.amount - right.amount;
      return scheduleSort.direction === "asc" ? comparison : -comparison;
    });

  const toggleScheduleSort = (key: "date" | "name" | "amount") => {
    setScheduleSort((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
  };

  return (
    <div className="page-content settings-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">ACCOUNT</span>

          <h1>Settings</h1>

          <p>Manage your account balance, currency, and security settings.</p>
        </div>
      </div>

      <div className="charts-two-column">
        <div className="chart-panel">
          <div className="chart-panel-header">
            <div>
              <h3>Account defaults</h3>
              <p>Set your starting balance and preferred display currency.</p>
            </div>
          </div>
          <div className="form-grid">
            <div className="form-span-full">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                <span>Starting balance</span>
                <button
                  type="button"
                  onClick={handleLockToggle}
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
              {showUnlockPrompt && isStartingBalanceLocked && (
                <div className="balance-unlock-form">
                  <label>
                    4-digit PIN
                    <input
                      type="password"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={4}
                      autoComplete="current-password"
                      value={unlockPassword}
                      onChange={(event) => { setUnlockPassword(event.target.value.replace(/\D/g, "").slice(0, 4)); setUnlockStatus(null); }}
                      onKeyDown={(event) => { if (event.key === "Enter") void handleUnlockBalance(); }}
                      placeholder="Enter 4-digit PIN"
                    />
                  </label>
                  <button type="button" className="primary-button" onClick={() => void handleUnlockBalance()}>
                    <LockOpen size={15} /> Unlock balance
                  </button>
                  <button type="button" className="secondary-button" onClick={() => { setShowUnlockPrompt(false); setUnlockPassword(""); setUnlockStatus(null); }}>
                    Cancel
                  </button>
                </div>
              )}
              {unlockStatus && (
                <div className={unlockStatus.startsWith("PIN verified") ? "field-hint" : "error-message"} role="status">
                  {unlockStatus}
                </div>
              )}
            </div>

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
        </div>

        <div className="chart-panel settings-account-summary">
          <div className="chart-panel-header">
            <div>
              <h3>Account summary</h3>
              <p>Quick snapshot of the current account. Update balance as needed.</p>
            </div>
          </div>

          <div className="analytics-summary settings-summary-grid">
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

            {/* Investment Included Toggle */}
            <div className="snapshot-item" style={{ alignItems: "center" }}>
              <div style={{ flex: 1 }}>
                <span style={{ display: "block", fontWeight: 600, color: "#e2e8f0", marginBottom: 2 }}>
                  Amount Investment Included
                </span>
                <span style={{ fontSize: 12, color: "#64748b" }}>
                  {investmentIncluded
                    ? "Current balance = Trading balance + Investment total"
                    : "Current balance = Trading balance only"}
                </span>
              </div>
              {/* Toggle switch */}
              <button
                type="button"
                onClick={() => setInvestmentIncluded(v => !v)}
                style={{
                  position: "relative",
                  width: 48,
                  height: 26,
                  borderRadius: 13,
                  border: "none",
                  background: investmentIncluded
                    ? "linear-gradient(135deg, #3b82f6, #2563eb)"
                    : "rgba(51,65,85,0.8)",
                  cursor: "pointer",
                  transition: "background 0.3s ease",
                  flexShrink: 0,
                  boxShadow: investmentIncluded
                    ? "0 0 12px rgba(59,130,246,0.5)"
                    : "none",
                }}
                aria-checked={investmentIncluded}
                role="switch"
                title="Toggle investment in balance"
              >
                <span style={{
                  position: "absolute",
                  top: 3,
                  left: investmentIncluded ? 25 : 3,
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  background: "#ffffff",
                  transition: "left 0.3s ease",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
                }} />
              </button>
            </div>
          </div>

        </div>
      </div>

      <section className="chart-panel balance-password-panel">
        <div className="chart-panel-header">
          <div>
            <h3><KeyRound size={17} /> Starting balance PIN</h3>
            <p>{resetBalancePinMode ? "Verify your account password and choose a new 4-digit PIN." : user.startingBalancePasswordHash ? "Update the 4-digit PIN required to unlock your starting balance." : "Set a 4-digit PIN before locking or unlocking your starting balance."}</p>
          </div>
          <span className={`password-state ${user.startingBalancePasswordHash ? "configured" : "not-configured"}`}>
            {user.startingBalancePasswordHash ? "PIN SET" : "SETUP REQUIRED"}
          </span>
        </div>
        <div className="balance-password-fields">
          {user.startingBalancePasswordHash && (
            <label>
              {resetBalancePinMode ? "Account password" : "Current PIN"}
              <input
                type="password"
                autoComplete="current-password"
                value={currentBalancePassword}
                onChange={(event) => setCurrentBalancePassword(event.target.value)}
                placeholder={resetBalancePinMode ? "Enter your account password" : "Enter current 4-digit PIN"}
              />
            </label>
          )}
          <label>
            New 4-digit PIN
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              autoComplete="new-password"
              value={newBalancePassword}
              onChange={(event) => setNewBalancePassword(event.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="Enter 4 digits"
            />
          </label>
          <label>
            Confirm 4-digit PIN
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              autoComplete="new-password"
              value={confirmBalancePassword}
              onChange={(event) => setConfirmBalancePassword(event.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="Re-enter 4 digits"
            />
          </label>
          <button type="button" className="primary-button" onClick={() => void handleSaveBalancePassword()}>
            <KeyRound size={15} /> {resetBalancePinMode ? "Reset PIN" : user.startingBalancePasswordHash ? "Update PIN" : "Set PIN"}
          </button>
        </div>
        {user.startingBalancePasswordHash && (
          <button
            type="button"
            className="balance-pin-reset-button"
            onClick={() => {
              setResetBalancePinMode((active) => !active);
              setCurrentBalancePassword("");
              setNewBalancePassword("");
              setConfirmBalancePassword("");
              setPasswordStatus(null);
            }}
          >
            {resetBalancePinMode ? "Cancel PIN reset" : "Forgot PIN? Reset with account password"}
          </button>
        )}
        {passwordStatus && <div className={passwordStatus.includes("saved") || passwordStatus.includes("reset successfully") || passwordStatus.includes("unlocked") ? "field-hint" : "error-message"} role="status">{passwordStatus}</div>}
      </section>

      <section className="chart-panel default-cost-panel">
        <div className="chart-panel-header">
          <div>
            <h3 className="cost-section-title"><span className="cost-section-icon"><Database size={19} /></span>Default Cost Amount</h3>
            <p>Create dated costs. The matching cost is selected automatically when you add a transaction.</p>
          </div>
          <span className="live-badge">DATE BASED</span>
        </div>

        <div className="default-cost-create">
          <div className="cost-create-heading">
            <div className="create-card-icon"><Plus size={18} /></div>
            <div>
              <strong>{editingScheduleId ? "Edit Cost Schedule" : "Add Cost Schedule"}</strong>
              <span>Set a start date, name, and cost amount to create a default cost.</span>
            </div>
          </div>
          <div className="default-cost-fields">
            <label>
              <span className="cost-field-label">Start date <span className="required-mark">*</span></span>
              <input type="date" required value={scheduleDate} onChange={(event) => setScheduleDate(event.target.value)} />
            </label>
            <label>
              <span className="cost-field-label">Name <span className="required-mark">*</span></span>
              <input required value={scheduleName} onChange={(event) => setScheduleName(event.target.value)} placeholder="e.g. Brokerage, Service Fee" />
            </label>
            <label>
              <span className="cost-field-label">Cost ({currency}) <span className="required-mark">*</span></span>
              <div className="cost-amount-input">
                <span>{new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).formatToParts(0).find((part) => part.type === "currency")?.value ?? currency}</span>
                <input type="number" min="0.01" step="0.01" required value={scheduleAmount} onChange={(event) => setScheduleAmount(event.target.value)} placeholder="e.g. 500" />
              </div>
            </label>
            <div className="cost-form-actions">
              <button type="button" className="secondary-button clear-cost-button" onClick={handleClearScheduleForm}>
                <RotateCcw size={15} /> Clear
              </button>
              <button type="button" className="primary-button create-cost-button" onClick={handleCreateSchedule}>
                <Plus size={16} /> {editingScheduleId ? "Update cost" : "Add cost schedule"}
              </button>
            </div>
          </div>
        </div>

        {scheduleStatus && (
          <div className={scheduleStatus.includes("successfully") ? "field-hint" : "error-message"}>
            {scheduleStatus}
          </div>
        )}

        <div className="default-cost-history">
          <div className="history-heading">
            <div className="history-title">
              <span className="history-icon"><ListFilter size={17} /></span>
              <div>
                <strong>Full history</strong>
                <span>Every dated default cost</span>
              </div>
            </div>
            <div className="history-controls">
              <label className="history-search">
                <Search size={15} />
                <input value={scheduleSearch} onChange={(event) => setScheduleSearch(event.target.value)} placeholder="Search by name..." aria-label="Search cost schedules by name" />
              </label>
              <label className="history-date-filter">
                <CalendarDays size={15} />
                <select value={scheduleDateFilter} onChange={(event) => setScheduleDateFilter(event.target.value)} aria-label="Filter cost schedules by date">
                  <option value="all">All dates</option>
                  <option value="30days">Last 30 days</option>
                  <option value="year">This year</option>
                </select>
              </label>
            </div>
          </div>

          {schedules.length > 0 ? (
            <div className="table-wrapper">
              <table className="transaction-table default-cost-table">
                <thead>
                  <tr>
                    <th><button type="button" className="cost-sort-button" onClick={() => toggleScheduleSort("date")}>Start date <span>{scheduleSort.key === "date" ? (scheduleSort.direction === "asc" ? "↑" : "↓") : "↕"}</span></button></th>
                    <th><button type="button" className="cost-sort-button" onClick={() => toggleScheduleSort("name")}>Name <span>{scheduleSort.key === "name" ? (scheduleSort.direction === "asc" ? "↑" : "↓") : "↕"}</span></button></th>
                    <th><button type="button" className="cost-sort-button" onClick={() => toggleScheduleSort("amount")}>Cost ({currency}) <span>{scheduleSort.key === "amount" ? (scheduleSort.direction === "asc" ? "↑" : "↓") : "↕"}</span></button></th>
                    <th>Status</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleSchedules.map((schedule) => {
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
              {visibleSchedules.length === 0 && <div className="cost-filter-empty">No cost schedules match these filters.</div>}
              <div className="cost-table-footer">Showing {visibleSchedules.length} of {schedules.length} {schedules.length === 1 ? "record" : "records"}</div>
            </div>
          ) : (
            <div className="empty-schedule">No dated costs yet. Create your first schedule above.</div>
          )}
        </div>
      </section>

      <div className="settings-save-bar">
        {status && (
          <div className={status.includes("success") ? "field-hint" : "error-message"} role="status">
            {status}
          </div>
        )}
        <button className="primary-button" onClick={handleSave}>
          <Save size={16} /> Save all settings
        </button>
      </div>

    </div>
  );
};

export default Settings;
