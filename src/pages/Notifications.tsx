import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BellRing, TrendingUp, CalendarDays, Clock3 } from "lucide-react";

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

const Notifications = ({ user }: { user: UserAccount }) => {
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

  return (
    <div className="page-content weekday-notifications-page">
          <header className="weekday-notifications-heading">
            <div><span className="eyebrow">ACTIVITY CENTER</span><h1 id="weekday-notifications-title">Notifications</h1><p>Saved trading reminders, reflections, and prompts.</p></div>
            <div className="weekday-notifications-count"><BellRing size={15} /><span>{history.length} {history.length === 1 ? "notification" : "notifications"}</span></div>
          </header>

          <section className="weekday-notification-log" aria-label="Notification history">
            <header className="weekday-notification-log-header">
              <div><h2>Recent reminders</h2><p>Newest notifications appear first.</p></div>
              <span><CalendarDays size={14} /> {history.length} saved</span>
            </header>
            {visibleHistory.length ? <div className="weekday-notification-log-list">{visibleHistory.map((item) => {
              const reminderDate = new Date(`${item.performedDate ?? item.forDate.slice(0, 10)}T00:00:00`);
              const createdAt = new Date(item.createdAt);
              const statusLabel = item.status === "positive" ? "Strong finish" : item.status === "loss" ? "Reset and review" : item.status === "flat" ? "Patient session" : item.status === "no-trades" ? "Discipline is progress" : item.status === "caution" ? "Selective game plan" : item.status === "strong" ? "Build on your process" : item.status === "weekend" ? "Weekend note" : item.status === "insufficient" ? "Build your process" : "Plan the trade";
              const performanceDay = item.performedDate ? new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(reminderDate) : item.dayName;
              const historicalDayStatus = item.status === "caution" || item.status === "loss";
              const reminderLines = getSimpleReminder(item).split("\n");
              return <article className={`weekday-notification-log-item ${item.status}`} key={item.id}>
                <div className="weekday-notification-log-icon">{historicalDayStatus ? <AlertTriangle size={17} /> : item.status === "strong" || item.status === "positive" ? <TrendingUp size={17} /> : <BellRing size={17} />}</div>
                <div className="weekday-notification-log-copy">
                  <div className="weekday-notification-log-title"><strong>{statusLabel} · {performanceDay}</strong><time dateTime={item.createdAt}><Clock3 size={12} />{Number.isNaN(createdAt.getTime()) ? "" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(createdAt)}</time></div>
                  <div className="weekday-notification-log-message">{reminderLines.map((line, index) => {
                    const separator = line.indexOf(":");
                    const label = separator > 0 ? line.slice(0, separator) : "";
                    const detail = separator > 0 ? line.slice(separator + 1).trim() : line;
                    return <p key={`${item.id}-${index}`}>{label && <span>{label}</span>}{detail}</p>;
                  })}</div>
                </div>
              </article>;
            })}</div> : <div className="weekday-notification-log-empty"><BellRing size={18} /><span>No notifications saved yet. Your first weekday reminder will appear here.</span></div>}
            {visibleCount < history.length && <footer className="weekday-notification-history-footer">
              <button type="button" className="secondary-button" onClick={() => setVisibleCount((count) => count + NOTIFICATIONS_PER_BATCH)}>Load {Math.min(NOTIFICATIONS_PER_BATCH, history.length - visibleCount)} more</button>
            </footer>}
          </section>
    </div>
  );
};

export default Notifications;
