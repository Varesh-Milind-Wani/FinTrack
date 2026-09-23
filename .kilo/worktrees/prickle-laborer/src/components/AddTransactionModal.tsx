import { useState } from "react";
import type { FormEvent } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Calendar,
  Check,
  Plus,
  Tag,
  X,
} from "lucide-react";
import type {
  DefaultCostSchedule,
  Transaction,
  TransactionType,
} from "../types/finance";
import { formatCurrency } from "../utils/money";

interface Props {
  onClose: () => void;
  onSave: (transaction: Transaction) => void;
  currency: string;
  defaultCostAmount: number;
  defaultCostSchedules: DefaultCostSchedule[];
  expenseIncludedByDefault: boolean;
  initialTransaction?: Transaction | null;
}

const pad = (value: number) => value.toString().padStart(2, "0");

const toLocalDateTimeValue = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;

const getScheduledCost = (
  dateTime: string,
  schedules: DefaultCostSchedule[],
  fallback: number
) => {
  const selectedDate = new Date(dateTime).getTime();

  return [...schedules]
    .filter(
      (schedule) =>
        new Date(`${schedule.startDate}T00:00:00`).getTime() <= selectedDate
    )
    .sort((left, right) => right.startDate.localeCompare(left.startDate))[0]
    ?.amount ?? fallback;
};

const AddTransactionModal = ({
  onClose,
  onSave,
  currency,
  defaultCostAmount,
  defaultCostSchedules,
  expenseIncludedByDefault,
  initialTransaction,
}: Props) => {
  const isEditing = Boolean(initialTransaction);

  const initialDate = initialTransaction
    ? new Date(initialTransaction.date)
    : new Date();

  const [profitAmount, setProfitAmount] = useState<number>(
    initialTransaction?.type === "profit"
      ? initialTransaction.grossAmount ?? initialTransaction.amount
      : 0
  );
  const [lossAmount, setLossAmount] = useState<number>(
    initialTransaction?.type === "loss"
      ? initialTransaction.grossAmount ?? initialTransaction.amount
      : 0
  );

  const handleProfitChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setProfitAmount(val);
    if (val > 0) setLossAmount(0);
  };

  const handleLossChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setLossAmount(val);
    if (val > 0) setProfitAmount(0);
  };

  const currentType: TransactionType = lossAmount > 0 && profitAmount === 0 ? "loss" : "profit";
  const activeAmount = profitAmount || lossAmount;

  const [category, setCategory] = useState(
    initialTransaction?.category ?? "Business Trade"
  );
  const [note, setNote] = useState(initialTransaction?.note ?? "");
  const [expenseIncluded, setExpenseIncluded] = useState(
    initialTransaction
      ? (initialTransaction.costAmount ?? 0) > 0
      : expenseIncludedByDefault
  );
  const [dateTime, setDateTime] = useState(() =>
    toLocalDateTimeValue(initialDate)
  );
  
  // New confidence level states (always active, no checkbox)
  const [confidenceLevel, setConfidenceLevel] = useState(
    initialTransaction?.confidenceLevel ?? 50
  );

  const scheduledCost = getScheduledCost(
    dateTime,
    defaultCostSchedules,
    defaultCostAmount
  );

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();

    const selectedDate = new Date(dateTime);
    if (!activeAmount || Number.isNaN(selectedDate.getTime())) return;

    const appliedCost = expenseIncluded
      ? getScheduledCost(dateTime, defaultCostSchedules, defaultCostAmount)
      : 0;

    const netAmount = currentType === "profit" 
      ? Math.max(0, activeAmount - appliedCost)  // Profit after costs (can't be negative)
      : activeAmount;  // Loss is just the loss amount (costs don't increase losses)

    const transaction: Transaction = {
      id: initialTransaction?.id ?? crypto.randomUUID(),
      date: selectedDate.toISOString(),
      type: currentType,
      amount: netAmount,
      grossAmount: activeAmount,
      costAmount: appliedCost,
      price: activeAmount,
      category,
      note: note.trim() || (currentType === "profit" ? "Profit Trade" : "Loss Trade"),
      confidenceLevel: confidenceLevel,
    };

    onSave(transaction);
  };

  return (
    <div
      className="modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="transaction-modal" role="dialog" aria-modal="true">
        <div className="modal-header">
          <div className="modal-header-text">
            <span className="eyebrow">
              {isEditing ? "EDIT TRANSACTION" : "NEW TRANSACTION"}
            </span>
            <h2>{isEditing ? "Edit transaction" : "Add transaction"}</h2>
            <p>Record your profit or loss for any past or current date.</p>
          </div>

          <button
            type="button"
            className="close-button"
            onClick={onClose}
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        <form className="modal-form" onSubmit={handleSubmit}>

          <label
            className={`checkbox-row transaction-checkbox ${
              expenseIncluded ? `is-checked is-${currentType}` : ""
            }`}
          >
            <input
              type="checkbox"
              checked={expenseIncluded}
              onChange={(event) => setExpenseIncluded(event.target.checked)}
            />
            <div className="checkbox-content">
              <span className="checkbox-title">Expense included</span>
              <span className="checkbox-subtitle">
                {currentType === "profit"
                  ? expenseIncluded && scheduledCost > 0
                    ? `Cost/brokerage (-${formatCurrency(scheduledCost, currency)}) is deducted from gross profit.`
                    : "Include default charges/expenses in profit calculation."
                  : expenseIncluded && scheduledCost > 0
                  ? `Cost/brokerage (+${formatCurrency(scheduledCost, currency)}) is added to total loss.`
                  : "Include default charges/expenses in loss calculation."}
              </span>
            </div>
          </label>

          <div className="form-grid">
            <div className="form-group form-span-full">
              <label htmlFor="tx-datetime">
                <span className="field-label-text">
                  <Calendar size={14} /> Transaction date &amp; time
                </span>
                <span className="field-hint">
                  Choose when this transaction actually happened.
                </span>
              </label>
              <input
                id="tx-datetime"
                className="transaction-date-input"
                type="datetime-local"
                value={dateTime}
                onChange={(event) => setDateTime(event.target.value)}
                required
              />
            </div>

            <div className="form-section-divider" style={{ gridColumn: "1 / -1", height: "1px", background: "rgba(59,130,246,0.1)", margin: "8px 0" }}></div>

            <div style={{ gridColumn: "1 / -1" }}>
              <div style={{ fontSize: "12px", fontWeight: "700", color: "#5e6b80", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "16px" }}>Profit & Loss</div>
              <div className="form-grid" style={{ gap: "16px" }}>
                <div className="form-group">
                  <label htmlFor="tx-profit">
                    <span className="field-label-text">
                      <ArrowUpRight size={14} /> Profit Amount
                    </span>
                  </label>
                  <div className="input-with-prefix">
                    <span className="prefix">{currency}</span>
                    <input
                      id="tx-profit"
                      type="number"
                      min="0"
                      step="0.01"
                      value={profitAmount || ""}
                      onChange={handleProfitChange}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="tx-loss">
                    <span className="field-label-text">
                      <ArrowDownRight size={14} /> Loss Amount
                    </span>
                  </label>
                  <div className="input-with-prefix">
                    <span className="prefix">{currency}</span>
                    <input
                      id="tx-loss"
                      type="number"
                      min="0"
                      step="0.01"
                      value={lossAmount || ""}
                      onChange={handleLossChange}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="form-section-divider" style={{ gridColumn: "1 / -1", height: "1px", background: "rgba(59,130,246,0.1)", margin: "8px 0" }}></div>

            <div className="form-group">
              <label htmlFor="tx-category">
                <span className="field-label-text">
                  <Tag size={14} /> Category
                </span>
              </label>
              <select
                id="tx-category"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
                <option value="Business Trade">Business Trade</option>
                <option value="Intraday Equity">Intraday Equity</option>
                <option value="Swing Trading">Swing Trading</option>
                <option value="Futures & Crypto">Futures & Crypto</option>
                <option value="Investment">Investment</option>
                <option value="Salary">Salary</option>
                <option value="Income">Income</option>
                <option value="Bills & Expenses">Bills & Expenses</option>
                <option value="Food & Dining">Food & Dining</option>
                <option value="Shopping">Shopping</option>
                <option value="Travel">Travel</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div className="form-group form-span-full">
              <label htmlFor="tx-note">
                <span className="field-label-text">Note</span>
              </label>
              <input
                id="tx-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="e.g. Took BankNifty CE trade on 15m breakout"
              />
            </div>

            {/* Enhanced Confidence Level Section */}
            <div className="form-section-divider" style={{ gridColumn: "1 / -1", height: "1px", background: "rgba(59,130,246,0.1)", margin: "16px 0" }}></div>
            
            <div className="form-group form-span-full confidence-level-section">
              <label htmlFor="confidence-slider" className="confidence-main-label">
                <span className="field-label-text">
                  Confidence Level: <span className="confidence-value">{confidenceLevel}%</span>
                </span>
                <span className="field-hint">
                  How confident were you in this trade decision?
                </span>
              </label>
              
              <div className="enhanced-slider-container">
                <input
                  id="confidence-slider"
                  type="range"
                  min="1"
                  max="100"
                  value={confidenceLevel}
                  onChange={(event) => setConfidenceLevel(Number(event.target.value))}
                  className="enhanced-confidence-slider"
                />
                <div className="slider-track-labels">
                  <span className="track-label low">Low Confidence</span>
                  <span className="track-label medium">Moderate</span>
                  <span className="track-label high">High Confidence</span>
                </div>
                <div className="confidence-indicator">
                  <div className="confidence-bar" style={{ width: `${confidenceLevel}%` }}></div>
                </div>
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
            >
              Cancel
            </button>

            <button type="submit" className="primary-button save-tx-btn">
              {isEditing ? <Check size={16} /> : <Plus size={16} />}
              {isEditing ? "Save changes" : "Save transaction"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddTransactionModal;
