import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BellRing, TrendingUp, X } from "lucide-react";

import type { UserAccount } from "../types/finance";
import { getWeekdayNotificationHistory, type WeekdayNotificationRecord } from "../utils/weekdayNotifications";
import { formatCurrency } from "../utils/money";

const NOTIFICATIONS_PER_BATCH = 10;

const getSimpleReminder = (item: WeekdayNotificationRecord) => {
  const nextDay = item.nextDayName ?? item.dayName;
  if (item.performedDate) {
    const net = item.todayNet ?? 0;
    const trades = item.todayTrades ?? item.trades;
    const amount = formatCurrency(Math.abs(net), item.currency);
    if (item.status === "positive") {
      return `Today: +${amount} across ${trades} ${trades === 1 ? "trade" : "trades"}. Take a moment to recognize the work behind the result.\nTomorrow: ${nextDay} is a fresh session; today's win does not predict it.\nFocus: repeat your process, keep risk unchanged, and protect your capital.`;
    }
    if (item.status === "loss") {
      return `Today: -${amount} across ${trades} ${trades === 1 ? "trade" : "trades"}. One difficult session does not define your progress.\nTomorrow: ${nextDay} is a reset, not a chance to win it back.\nFocus: review one decision, avoid chasing, and stay within your normal risk limit.`;
    }
    if (item.status === "flat") {
      return `Today: you finished around break-even; give yourself credit for not forcing a result.\nTomorrow: ${nextDay} brings a clean slate, not a guaranteed opportunity.\nFocus: wait for your setup and keep your usual risk limits.`;
    }
    return `Today: no trades were recorded. Waiting for a valid setup is part of disciplined trading.\nTomorrow: ${nextDay} is a fresh session; there is no need to make up for today.\nFocus: prepare your checklist, trade only your setup, and keep your usual risk limits.`;
  }
  if (item.status === "caution") return `Your ${item.dayName} history has been weaker; use that as a cue to be selective, not as a prediction.\nFOCUS: Wait for a clear setup and be willing to pass.\nRISK: Do not chase losses or increase your usual position size.`;
  if (item.status === "strong") return `Your ${item.dayName} history has been a relative strength; use it to prepare, not to assume a win.\nFOCUS: Execute your tested setup with patience.\nRISK: Keep your normal size and limits; confidence is not a reason to push harder.`;
  if (item.status === "insufficient") return `There is not enough ${item.dayName} history to identify a reliable edge.\nFOCUS: Let your checklist decide whether a trade qualifies.\nRISK: Keep your usual limits and do not force a trade.`;
  if (item.status === "weekend") return "Weekend reminders are not sent. This is a saved record from an earlier reminder.";
  return `Your ${item.dayName} history shows no clear weekday edge.\nFOCUS: Judge the setup on its merits, not the day of the week.\nRISK: Follow your usual plan and limits.`;
};

const Notifications = ({ user, onClose }: { user: UserAccount; onClose: () => void }) => {
  const [history, setHistory] = useState<WeekdayNotificationRecord[]>(() => getWeekdayNotificationHistory(user.id));
  const [visibleCount, setVisibleCount] = useState(NOTIFICATIONS_PER_BATCH);
  const orderedHistory = useMemo(
    () => [...history].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)),
    [history],
  );
  const visibleHistory = orderedHistory.slice(0, visibleCount);

  useEffect(() => {
    const refresh = () => setHistory(getWeekdayNotificationHistory(user.id));
    refresh();
    window.addEventListener("fintrack-weekday-notification-history", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("fintrack-weekday-notification-history", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [user.id]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    <div className="weekday-notifications-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="weekday-notifications-drawer" role="dialog" aria-modal="true" aria-labelledby="weekday-notifications-title">
        <div className="page-content weekday-notifications-page">
          <header className="weekday-notifications-heading">
            <div>
              <span className="eyebrow">SAVED REMINDERS</span>
              <h1 id="weekday-notifications-title">Notifications</h1>
            </div>
            <span className="weekday-notifications-count" aria-label={`${history.length} saved notifications`}>
              {history.length} {history.length === 1 ? "notification" : "notifications"}
            </span>
            <button type="button" className="weekday-notifications-close" onClick={onClose} aria-label="Close notifications"><X size={19} /></button>
          </header>

          <section className="weekday-notification-log" aria-label="Notification history">
            {visibleHistory.length ? <div className="weekday-notification-log-list">{visibleHistory.map((item) => {
              const reminderDate = new Date(`${item.performedDate ?? item.forDate.slice(0, 10)}T00:00:00`);
              const createdAt = new Date(item.createdAt);
              const statusLabel = item.status === "positive" ? "Strong finish" : item.status === "loss" ? "Reset and review" : item.status === "flat" ? "Patient session" : item.status === "no-trades" ? "Discipline is progress" : item.status === "caution" ? "Selective game plan" : item.status === "strong" ? "Build on your process" : item.status === "weekend" ? "Weekend note" : item.status === "insufficient" ? "Build your process" : "Plan the trade";
              const performanceDay = item.performedDate ? new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(reminderDate) : item.dayName;
              const historicalDayStatus = item.status === "caution" || item.status === "loss";
              return <article className={`weekday-notification-log-item ${item.status}`} key={item.id}>
                <div className="weekday-notification-log-icon">{historicalDayStatus ? <AlertTriangle size={17} /> : item.status === "strong" || item.status === "positive" ? <TrendingUp size={17} /> : <BellRing size={17} />}</div>
                <div className="weekday-notification-log-copy">
                  <div><strong>{statusLabel} · {performanceDay}</strong></div>
                  <p>{getSimpleReminder(item)}</p>
                </div>
                <time dateTime={item.createdAt}>{Number.isNaN(createdAt.getTime()) ? "" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(createdAt)}</time>
              </article>;
            })}</div> : <div className="weekday-notification-log-empty"><BellRing size={18} /><span>No notifications saved yet. Your first weekday reminder will appear here.</span></div>}
            {visibleCount < history.length && <footer className="weekday-notification-history-footer">
              <button type="button" className="secondary-button" onClick={() => setVisibleCount((count) => count + NOTIFICATIONS_PER_BATCH)}>Load {Math.min(NOTIFICATIONS_PER_BATCH, history.length - visibleCount)} more</button>
            </footer>}
          </section>
        </div>
      </section>
    </div>
  );
};

export default Notifications;
