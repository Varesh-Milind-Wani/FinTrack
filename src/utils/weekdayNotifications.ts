import type { Transaction } from "../types/finance";
import { formatCurrency } from "./money";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
const MIN_ACTIVE_DATES = 5;

export type WeekdayStat = {
  weekday: number;
  name: string;
  activeDates: number;
  trades: number;
  medianNet: number | null;
  averageNet: number | null;
  profitableDates: number;
};

export type WeekdayOutlook = {
  date: Date;
  weekday: number;
  dayName: string;
  shouldToast: boolean;
  status: "strong" | "caution" | "neutral" | "insufficient" | "weekend";
  message: string;
  stat: WeekdayStat;
  typicalMedian: number | null;
  strongest: WeekdayStat | null;
  weakest: WeekdayStat | null;
  stats: WeekdayStat[];
};

export type WeekdayNotificationRecord = {
  id: string;
  createdAt: string;
  forDate: string;
  dayName: string;
  status: WeekdayOutlook["status"] | DailyTradingReminder["status"];
  message: string;
  activeDates: number;
  trades: number;
  medianNet: number | null;
  currency: string;
  performedDate?: string;
  todayNet?: number;
  todayTrades?: number;
  nextDayName?: string;
  catchUp?: boolean;
};

export type DailyTradingReminder = {
  date: Date;
  dayName: string;
  shouldToast: boolean;
  status: "positive" | "loss" | "flat" | "no-trades";
  message: string;
  todayNet: number;
  todayTrades: number;
  nextTradingDate: Date;
  nextDayName: string;
  catchUp: boolean;
};

const historyKey = (userId: string) => `fintrack_weekday_notification_history_${userId}`;
const historyReadKey = (userId: string) => `fintrack_weekday_notification_history_read_${userId}`;

export const getWeekdayNotificationHistory = (userId: string): WeekdayNotificationRecord[] => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(historyKey(userId)) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is WeekdayNotificationRecord => Boolean(entry)
      && typeof entry === "object"
      && typeof (entry as WeekdayNotificationRecord).id === "string"
      && typeof (entry as WeekdayNotificationRecord).createdAt === "string"
      && typeof (entry as WeekdayNotificationRecord).forDate === "string"
      && typeof (entry as WeekdayNotificationRecord).dayName === "string"
      && typeof (entry as WeekdayNotificationRecord).message === "string");
  } catch {
    return [];
  }
};

export const getUnreadWeekdayNotificationCount = (userId: string) => {
  try {
    const lastReadAt = Number(localStorage.getItem(historyReadKey(userId)) ?? 0);
    return getWeekdayNotificationHistory(userId).filter((entry) => Date.parse(entry.createdAt) > lastReadAt).length;
  } catch {
    return 0;
  }
};

export const markWeekdayNotificationsRead = (userId: string) => {
  try {
    localStorage.setItem(historyReadKey(userId), String(Date.now()));
    window.dispatchEvent(new CustomEvent("fintrack-weekday-notification-read", { detail: { userId } }));
  } catch {
    // The drawer can still open when browser storage is unavailable.
  }
};

export const recordWeekdayNotification = (
  userId: string,
  outlook: DailyTradingReminder,
  currency: string,
  createdAt = new Date(),
) => {
  const performedDate = `${outlook.date.getFullYear()}-${String(outlook.date.getMonth() + 1).padStart(2, "0")}-${String(outlook.date.getDate()).padStart(2, "0")}`;
  const id = performedDate;
  const history = getWeekdayNotificationHistory(userId);
  const record: WeekdayNotificationRecord = {
    id,
    createdAt: createdAt.toISOString(),
    forDate: outlook.nextTradingDate.toISOString(),
    dayName: outlook.nextDayName,
    status: outlook.status,
    message: outlook.message,
    activeDates: outlook.todayTrades ? 1 : 0,
    trades: outlook.todayTrades,
    medianNet: outlook.todayTrades ? outlook.todayNet : null,
    currency,
    performedDate,
    todayNet: outlook.todayNet,
    todayTrades: outlook.todayTrades,
    nextDayName: outlook.nextDayName,
    catchUp: outlook.catchUp,
  };
  try {
    localStorage.setItem(historyKey(userId), JSON.stringify([...history.filter((entry) => entry.id !== id), record]));
    window.dispatchEvent(new CustomEvent("fintrack-weekday-notification-history", { detail: { userId } }));
  } catch {
    // The toast still works for this session if local storage is unavailable.
  }
};

export const getDailyTradingReminder = (
  transactions: Transaction[],
  now = new Date(),
  currency = "INR",
  catchUp = false,
): DailyTradingReminder => {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  let todayNet = 0;
  let todayTrades = 0;

  for (const transaction of transactions) {
    if (transaction.type !== "profit" && transaction.type !== "loss") continue;
    if (!Number.isFinite(transaction.amount) || transaction.amount < 0) continue;
    const transactionDate = parseLocalDate(transaction.date);
    if (!transactionDate) continue;
    const transactionKey = `${transactionDate.getFullYear()}-${String(transactionDate.getMonth() + 1).padStart(2, "0")}-${String(transactionDate.getDate()).padStart(2, "0")}`;
    if (transactionKey !== todayKey) continue;
    todayNet += transaction.type === "profit" ? transaction.amount : -transaction.amount;
    todayTrades += 1;
  }

  const nextTradingDate = new Date(today);
  do {
    nextTradingDate.setDate(nextTradingDate.getDate() + 1);
  } while (nextTradingDate.getDay() === 0 || nextTradingDate.getDay() === 6);
  const nextDayName = new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(nextTradingDate);
  const shouldToast = true;
  const formattedNet = formatCurrency(Math.abs(todayNet), currency);
  const dayContext = catchUp ? ` on ${new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(today)}` : " today";
  const weekdayHistory = getWeekdayOutlook(transactions, now);
  const historicalContext = weekdayHistory.status === "strong"
    ? `${nextDayName} has been one of your stronger days: median ${formatCurrency(weekdayHistory.stat.medianNet ?? 0, currency)} across ${weekdayHistory.stat.activeDates} active dates. That's context, not a forecast.`
    : weekdayHistory.status === "caution"
      ? `${nextDayName} has been weaker: median ${formatCurrency(weekdayHistory.stat.medianNet ?? 0, currency)} across ${weekdayHistory.stat.activeDates} active dates. Be selective; this is not a forecast.`
      : weekdayHistory.status === "neutral"
        ? `Your ${nextDayName} results have been close to your weekday baseline; let the setup decide.`
        : `There isn't enough ${nextDayName} history yet to identify a reliable pattern.`;

  let status: DailyTradingReminder["status"];
  let message: string;
  if (!todayTrades) {
    status = "no-trades";
    message = `No trades recorded${dayContext}. Waiting for a valid setup is a decision, too.\n${historicalContext}\nFor ${nextDayName}, prepare your checklist, trade only your setup, and keep your normal risk limit.`;
  } else if (todayNet > 0) {
    status = "positive";
    const nextDayGuidance = weekdayHistory.status === "strong"
      ? `Carry the confidence, not extra risk: follow your plan and protect your capital on ${nextDayName}.`
      : weekdayHistory.status === "caution"
        ? `Reset for ${nextDayName}: wait for clear setups and keep your normal position size.`
        : `${nextDayName} is a fresh session: trust your checklist, not today's result.`;
    message = `Strong finish: +${formattedNet} across ${todayTrades} ${todayTrades === 1 ? "trade" : "trades"}${dayContext}. Take the win without getting overconfident.\n${historicalContext}\n${nextDayGuidance}`;
  } else if (todayNet < 0) {
    status = "loss";
    message = `Tough session: -${formattedNet} across ${todayTrades} ${todayTrades === 1 ? "trade" : "trades"}${dayContext}. One result does not define your progress.\n${historicalContext}\nFor ${nextDayName}, review one decision, don't chase losses, and respect your normal risk limit.`;
  } else {
    status = "flat";
    message = `Break-even${dayContext}: you kept the session level; don't force a result.\n${historicalContext}\nFor ${nextDayName}, stay patient, wait for your setup, and keep your usual risk limit.`;
  }

  return { date: today, dayName: new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(today), shouldToast, status, message, todayNet, todayTrades, nextTradingDate, nextDayName, catchUp };
};

const median = (values: number[]) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const parseLocalDate = (value: string) => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const result = new Date(year, month, day);
  return result.getFullYear() === year && result.getMonth() === month && result.getDate() === day ? result : null;
};

const mondayIndex = (date: Date) => (date.getDay() + 6) % 7;

export const getWeekdayPerformance = (transactions: Transaction[], today = new Date()): WeekdayStat[] => {
  const endOfToday = new Date(today);
  endOfToday.setHours(23, 59, 59, 999);
  const byDate = new Map<string, { weekday: number; net: number; trades: number }>();

  for (const transaction of transactions) {
    if (transaction.type !== "profit" && transaction.type !== "loss") continue;
    if (!Number.isFinite(transaction.amount) || transaction.amount < 0) continue;
    const date = parseLocalDate(transaction.date);
    if (!date || date.getTime() > endOfToday.getTime()) continue;
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    const weekday = mondayIndex(date);
    const result = transaction.type === "profit" ? transaction.amount : -transaction.amount;
    const existing = byDate.get(key) ?? { weekday, net: 0, trades: 0 };
    existing.net += result;
    existing.trades += 1;
    byDate.set(key, existing);
  }

  const days = Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    name: WEEKDAYS[weekday],
    sessions: [] as number[],
    trades: 0,
  }));
  byDate.forEach((date) => {
    days[date.weekday].sessions.push(date.net);
    days[date.weekday].trades += date.trades;
  });

  return days.map((day) => ({
    weekday: day.weekday,
    name: day.name,
    activeDates: day.sessions.length,
    trades: day.trades,
    medianNet: median(day.sessions),
    averageNet: day.sessions.length ? day.sessions.reduce((sum, value) => sum + value, 0) / day.sessions.length : null,
    profitableDates: day.sessions.filter((value) => value > 0).length,
  }));
};

export const getWeekdayOutlook = (transactions: Transaction[], today = new Date()): WeekdayOutlook => {
  const nextWeekday = new Date(today);
  nextWeekday.setHours(0, 0, 0, 0);
  do {
    nextWeekday.setDate(nextWeekday.getDate() + 1);
  } while (nextWeekday.getDay() === 0 || nextWeekday.getDay() === 6);
  const weekday = mondayIndex(nextWeekday);
  const todayDay = today.getDay();
  const shouldToast = todayDay >= 1 && todayDay <= 5;
  const stats = getWeekdayPerformance(transactions, today);
  const stat = stats[weekday];
  const qualified = stats.filter((item) => item.activeDates >= MIN_ACTIVE_DATES && item.medianNet != null);
  // Compare each weekday's median equally so high-volume weekdays do not
  // dominate the baseline simply because more trades were recorded on them.
  const typicalMedian = median(qualified.flatMap((item) => item.medianNet == null ? [] : [item.medianNet]));
  const strongest = qualified.length ? qualified.reduce((best, item) => item.medianNet! > best.medianNet! ? item : best) : null;
  const weakest = qualified.length ? qualified.reduce((worst, item) => item.medianNet! < worst.medianNet! ? item : worst) : null;
  let status: WeekdayOutlook["status"];
  let message: string;

  if (stat.activeDates < MIN_ACTIVE_DATES || stat.medianNet == null || typicalMedian == null) {
    status = "insufficient";
    message = `There isn't enough history for ${stat.name} to show a reliable pattern. Follow your usual plan and risk limits.`;
  } else if (stat.medianNet > 0 && stat.medianNet > typicalMedian) {
    status = "strong";
    message = `${stat.name} has been one of your stronger historical days. Past results aren't a prediction, so keep to your plan and normal risk limits.`;
  } else if (stat.medianNet < typicalMedian) {
    status = "caution";
    message = `${stat.name} has been weaker in your history. Be selective, review your setup, and keep your normal risk limit.`;
  } else {
    status = "neutral";
    message = `Your ${stat.name} history shows no clear weekday edge. Let your setup and risk plan guide the decision.`;
  }

  return { date: nextWeekday, weekday, dayName: stat.name, shouldToast, status, message, stat, typicalMedian, strongest, weakest, stats };
};

export const MIN_WEEKDAY_SAMPLE = MIN_ACTIVE_DATES;
