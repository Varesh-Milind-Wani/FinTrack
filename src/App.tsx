import { BellRing, CircleDollarSign, Menu, X } from "lucide-react";
import { lazy, Suspense, useState, useEffect } from "react";

import Sidebar from "./components/Sidebar";
import AddTransactionModal from "./components/AddTransactionModal";
import { useAppDialog } from "./components/AppDialog";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Analytics = lazy(() => import("./pages/Analytics"));
const ProfitLoss = lazy(() => import("./pages/ProfitLoss"));
const Settings = lazy(() => import("./pages/Settings"));
const Login = lazy(() => import("./pages/Login"));
const Transactions = lazy(() => import("./pages/Transactions"));
const TradeSignal = lazy(() => import("./pages/TradeSignal"));
const Withdrawals = lazy(() => import("./pages/Withdrawals"));
const Chat = lazy(() => import("./pages/Chat"));
const AIAnalysis = lazy(() => import("./pages/AIAnalysis"));
const InvestmentPage = lazy(() => import("./pages/Investment"));
const Expenses = lazy(() => import("./pages/Expenses"));
const Income = lazy(() => import("./pages/Income"));
const Reports = lazy(() => import("./pages/Reports"));
const Profile = lazy(() => import("./pages/Profile"));
const ScenarioLab = lazy(() => import("./pages/ScenarioLab"));
const Notifications = lazy(() => import("./pages/Notifications"));

import {
  addStorageChangeListener,
  getCurrentUser,
  logoutUser,
  updateUser,
} from "./utils/storage";
import { calculateCurrentBalance } from "./utils/balance";
import { getMonthKey, getMonthLabel, isTransactionMonthLocked } from "./utils/monthLocks";
import { getTransactionDateValidationError } from "./utils/tradingDates";
import { getDailyTradingReminder, getUnreadWeekdayNotificationCount, markWeekdayNotificationsRead, recordWeekdayNotification, type DailyTradingReminder } from "./utils/weekdayNotifications";

import type {
  Investment,
  Transaction,
  UserAccount,
} from "./types/finance";

const mergeById = <T extends { id: string }>(existing: T[], imported: T[]): T[] => {
  const importedIds = new Set(imported.map((item) => item.id));
  return [...imported, ...existing.filter((item) => !importedIds.has(item.id))];
};

type AppPage =
  | "dashboard"
  | "transactions"
  | "trade-signal"
  | "analytics"
  | "profitloss"
  | "reports"
  | "withdrawals"
  | "income"
  | "settings"
  | "chat"
  | "ai-analysis"
  | "investment"
  | "expenses"
  | "profile"
  | "scenario-lab";

const AppLoader = () => (
  <div className="app-loading-screen" role="status" aria-live="polite" aria-label="Loading FinTrack">
    <div className="app-loading-mark"><CircleDollarSign size={25} /></div>
    <strong>FinTrack</strong>
    <span>Loading your workspace…</span>
    <div className="app-loading-track" aria-hidden="true"><span /></div>
  </div>
);

const APP_PAGES: AppPage[] = [
  "dashboard",
  "transactions",
  "trade-signal",
  "analytics",
  "profitloss",
  "reports",
  "withdrawals",
  "income",
  "settings",
  "chat",
  "ai-analysis",
  "investment",
  "expenses",
  "profile",
  "scenario-lab",
];

const getSavedPage = (userId: string): AppPage => {
  try {
    const savedPage = localStorage.getItem(`fintrack_active_page_${userId}`);
    return APP_PAGES.includes(savedPage as AppPage) ? (savedPage as AppPage) : "dashboard";
  } catch {
    return "dashboard";
  }
};

const App = () => {
  const { alert: showAlert, confirm: showConfirm } = useAppDialog();
  const [user, setUser] =
    useState<UserAccount | null>(
      () => getCurrentUser()
    );

  const [activePage, setActivePage] = useState<AppPage>(() => {
    const currentUser = getCurrentUser();
    return currentUser ? getSavedPage(currentUser.id) : "dashboard";
  });

  const [modalOpen, setModalOpen] =
    useState(false);
  const [editingTransaction, setEditingTransaction] =
    useState<Transaction | null>(null);

  const [mobileMenuOpen, setMobileMenuOpen] =
    useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [weekdayToast, setWeekdayToast] = useState<DailyTradingReminder | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);

  useEffect(() => {
    if (!user) {
      setUnreadNotificationCount(0);
      return;
    }
    const refreshUnreadCount = () => setUnreadNotificationCount(getUnreadWeekdayNotificationCount(user.id));
    refreshUnreadCount();
    window.addEventListener("fintrack-weekday-notification-history", refreshUnreadCount);
    window.addEventListener("fintrack-weekday-notification-read", refreshUnreadCount);
    window.addEventListener("storage", refreshUnreadCount);
    return () => {
      window.removeEventListener("fintrack-weekday-notification-history", refreshUnreadCount);
      window.removeEventListener("fintrack-weekday-notification-read", refreshUnreadCount);
      window.removeEventListener("storage", refreshUnreadCount);
    };
  }, [user?.id]);

  const openNotifications = () => {
    if (user) markWeekdayNotificationsRead(user.id);
    setUnreadNotificationCount(0);
    setNotificationsOpen(true);
    setMobileMenuOpen(false);
  };

  useEffect(() => {
    if (!user) {
      setWeekdayToast(null);
      return;
    }
    const currentUser = user;
    const storageKey = `fintrack_weekday_notice_v5_${currentUser.id}`;
    const legacyStorageKey = `fintrack_weekday_notice_v4_${currentUser.id}`;
    let dismissTimer = 0;
    let reminderTimer = 0;
    const getDayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const scheduleNextDay = (now: Date) => {
      const nextReminder = new Date(now);
      nextReminder.setDate(nextReminder.getDate() + 1);
      nextReminder.setHours(19, 0, 0, 0);
      reminderTimer = window.setTimeout(showDailyReminder, Math.max(1000, nextReminder.getTime() - now.getTime()));
    };
    function showDailyReminder() {
      const now = new Date();
      const reminderTime = new Date(now);
      reminderTime.setHours(19, 0, 0, 0);
      if (now < reminderTime) {
        reminderTimer = window.setTimeout(showDailyReminder, reminderTime.getTime() - now.getTime());
        return;
      }
      const dayKey = getDayKey(now);
      let alreadyShown = false;
      try {
        alreadyShown = localStorage.getItem(storageKey) === dayKey || localStorage.getItem(legacyStorageKey) === dayKey;
        if (!alreadyShown) localStorage.setItem(storageKey, dayKey);
      } catch {
        // Still show this in-session reminder when browser storage is unavailable.
      }
      if (!alreadyShown) {
        const outlook = getDailyTradingReminder(currentUser.transactions, now, currentUser.currency);
        if (outlook.shouldToast) {
          recordWeekdayNotification(currentUser.id, outlook, currentUser.currency, now);
          setWeekdayToast(outlook);
          dismissTimer = window.setTimeout(() => setWeekdayToast(null), 12000);
        }
      }
      scheduleNextDay(now);
    }
    // Defer the first check by one task so React StrictMode's development
    // setup/cleanup replay cancels the first timer before it records the day.
    const initialTimer = window.setTimeout(showDailyReminder, 0);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearTimeout(dismissTimer);
      window.clearTimeout(reminderTimer);
    };
  }, [user]);

  useEffect(() => {
    const handleStorage = () => {
      setUser(getCurrentUser());
    };

    window.addEventListener("storage", handleStorage);
    const removeStorageListener = addStorageChangeListener(
      handleStorage
    );

    return () => {
      window.removeEventListener("storage", handleStorage);
      removeStorageListener();
    };
  }, []);

  useEffect(() => {
    if (!mobileMenuOpen) return;

    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleOutsideInteraction = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".sidebar, .mobile-menu-button")) {
        return;
      }
      setMobileMenuOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileMenuOpen(false);
    };

    document.addEventListener("click", handleOutsideInteraction);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.removeEventListener("click", handleOutsideInteraction);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (!user) return;
    try {
      localStorage.setItem(`fintrack_active_page_${user.id}`, activePage);
    } catch {
      // Navigation still works when browser storage is unavailable.
    }
  }, [activePage, user?.id]);

  if (!user) {
    return (
      <Suspense fallback={<AppLoader />}>
        <Login
          onAuthenticated={(newUser) => {
            setUser(newUser);
            setActivePage("dashboard");
            setMobileMenuOpen(false);
          }}
        />
      </Suspense>
    );
  }

  const handleSaveTransaction = (
    transaction: Transaction
  ) => {
    const dateError = getTransactionDateValidationError(transaction.date);
    if (dateError) {
      void showAlert(dateError, "Invalid transaction date");
      return false;
    }
    const existingTransaction = user.transactions.find((item) => item.id === transaction.id);
    const transactionExists = Boolean(existingTransaction);
    const lockedMonths = user.lockedMonths ?? [];

    if (
      isTransactionMonthLocked(transaction, lockedMonths) ||
      (existingTransaction && isTransactionMonthLocked(existingTransaction, lockedMonths))
    ) {
      const lockedMonthKey = isTransactionMonthLocked(transaction, lockedMonths)
        ? getMonthKey(transaction.date)
        : getMonthKey(existingTransaction!.date);
      void showAlert(`${getMonthLabel(lockedMonthKey)} is locked. Unlock that month in Reports before changing its transactions.`, "Month locked");
      return false;
    }

    const transactionToSave = transactionExists
      ? transaction
      : { ...transaction, createdAt: transaction.createdAt ?? new Date().toISOString() };
    const nextTransactions = transactionExists
      ? user.transactions.map((item) =>
          item.id === transaction.id ? transactionToSave : item
        )
      : [transactionToSave, ...user.transactions];

    const updatedUser: UserAccount = {
      ...user,
      transactions: nextTransactions,
    };

    const finalUser: UserAccount = {
      ...updatedUser,
      // Transaction amounts are already net of any applied cost. Recompute for
      // every save, including edits, so every page receives the same balance.
      currentBalance: calculateCurrentBalance(updatedUser),
    };

    updateUser(finalUser);
    setUser(finalUser);
    setModalOpen(false);
    setEditingTransaction(null);
    return true;
  };

  const handleSaveReviewedTrades = (transactions: Transaction[], openInvestments: Investment[]) => {
    if (!transactions.length && !openInvestments.length) return false;
    const weekendTransaction = transactions.find((transaction) => getTransactionDateValidationError(transaction.date));
    if (weekendTransaction) {
      void showAlert(getTransactionDateValidationError(weekendTransaction.date) ?? "Choose a weekday for every transaction.", "Invalid transaction date");
      return false;
    }
    const lockedTransaction = transactions.find((transaction) => isTransactionMonthLocked(transaction, user.lockedMonths));
    if (lockedTransaction) {
      void showAlert(`${getMonthLabel(getMonthKey(lockedTransaction.date))} is locked. Unlock that month in Reports before importing these trades.`, "Month locked");
      return false;
    }
    const createdAt = new Date().toISOString();
    const newlyCreatedTransactions: Transaction[] = transactions.map((transaction) => ({
      ...transaction,
      createdAt: transaction.createdAt ?? createdAt,
    }));
    const nextUser: UserAccount = {
      ...user,
      transactions: [...newlyCreatedTransactions, ...user.transactions],
      investments: [...openInvestments, ...(user.investments ?? [])],
    };
    const updatedUser = { ...nextUser, currentBalance: calculateCurrentBalance(nextUser) };
    updateUser(updatedUser);
    setUser(updatedUser);
    return true;
  };

  const handleDeleteTransaction = async (
    id: string
  ) => {
    const transaction = user.transactions.find((item) => item.id === id);
    if (transaction && isTransactionMonthLocked(transaction, user.lockedMonths)) {
      await showAlert(`${getMonthLabel(getMonthKey(transaction.date))} is locked. Unlock that month in Reports before deleting this transaction.`, "Month locked");
      return;
    }

    const confirmed = await showConfirm("Are you sure you want to delete this transaction?", "Delete transaction");

    if (!confirmed) {
      return;
    }

    const filteredTransactions = user.transactions.filter(
      (transaction) => transaction.id !== id
    );

    const transactionsUpdatedUser: UserAccount = {
      ...user,
      transactions: filteredTransactions,
    };
    const updatedUser: UserAccount = {
      ...transactionsUpdatedUser,
      currentBalance: calculateCurrentBalance(transactionsUpdatedUser),
    };

    updateUser(updatedUser);
    setUser(updatedUser);
  };

  const handleEditTransaction = (
    transaction: Transaction
  ) => {
    if (isTransactionMonthLocked(transaction, user.lockedMonths)) {
      void showAlert(`${getMonthLabel(getMonthKey(transaction.date))} is locked. Unlock that month in Reports before editing this transaction.`, "Month locked");
      return;
    }
    setEditingTransaction(transaction);
    setModalOpen(true);
  };

  const handleLogout = () => {
    logoutUser();

    setUser(null);
  };

  const handlePageChange = (
    page: AppPage
  ) => {
    setNotificationsOpen(false);
    setActivePage(page);
    try {
      localStorage.setItem(`fintrack_active_page_${user.id}`, page);
    } catch {
      // Navigation still works when browser storage is unavailable.
    }
    setMobileMenuOpen(false);
  };

  return (
    <div className={`app-layout ${sidebarCollapsed ? "sidebar-is-collapsed" : ""}`}>
      <Sidebar
        user={user}
        activePage={activePage}
        onPageChange={handlePageChange}
        notificationsOpen={notificationsOpen}
        unreadNotificationCount={unreadNotificationCount}
        onOpenNotifications={openNotifications}
        onLogout={handleLogout}
        mobileOpen={mobileMenuOpen}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((collapsed) => !collapsed)}
      />

      {weekdayToast && <aside className={`weekday-toast ${weekdayToast.status}`} role="status" aria-live="polite">
        <div className="weekday-toast-icon"><BellRing size={18} /></div>
        <button type="button" className="weekday-toast-open" onClick={() => { openNotifications(); setWeekdayToast(null); }}>
          <span className="weekday-toast-kicker">DAILY TRADING CHECK-IN</span>
          <strong>{weekdayToast.catchUp
            ? weekdayToast.status === "positive" ? `Good work Friday · Monday ahead` : weekdayToast.status === "loss" ? "Be careful Monday · Friday was a loss" : weekdayToast.status === "flat" ? "Break-even Friday · Monday ahead" : "No Friday trades · Monday ahead"
            : weekdayToast.status === "positive" ? `Good work today · ${weekdayToast.dayName}` : weekdayToast.status === "loss" ? `Be careful tomorrow · ${weekdayToast.nextDayName}` : weekdayToast.status === "flat" ? `Stay patient · ${weekdayToast.nextDayName}` : `All the best for ${weekdayToast.nextDayName}`}</strong>
          <span>{weekdayToast.message}</span>
          <b>View notification center <span aria-hidden="true">→</span></b>
        </button>
        <button type="button" className="weekday-toast-dismiss" aria-label="Dismiss weekday reminder" onClick={() => setWeekdayToast(null)}><X size={16} /></button>
      </aside>}

      {mobileMenuOpen && (
        <button
          type="button"
          className="mobile-nav-backdrop"
          onClick={() => setMobileMenuOpen(false)}
          aria-label="Close navigation"
        />
      )}

      <div className="app-content-shell">
      <main className="main-area">
        <button
          type="button"
          className="mobile-menu-button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label={mobileMenuOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={mobileMenuOpen}
        >
          {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>

        <Suspense fallback={<AppLoader />}>
        {activePage === "dashboard" ? (
          <Dashboard
            user={user}
            onAdd={() =>
              setModalOpen(true)
            }
          />
        ) : activePage === "profile" ? (
          <Profile
            user={user}
            onSave={(updatedUser) => {
              updateUser(updatedUser);
              setUser(updatedUser);
            }}
          />
        ) : activePage === "transactions" ? (
          <Transactions
            user={user}
            onAdd={() => {
              setEditingTransaction(null);
              setModalOpen(true);
            }}
            onDelete={handleDeleteTransaction}
            onEdit={handleEditTransaction}
            onImport={(backup) => {
              const importedTransactions = backup.transactions;
              const weekdayTransactions = importedTransactions.filter((transaction) => !getTransactionDateValidationError(transaction.date));
              const weekendSkipped = importedTransactions.length - weekdayTransactions.length;
              const existingTransactions = new Map(
                user.transactions.map((transaction) => [transaction.id, transaction]),
              );
              const unlockedTransactions = weekdayTransactions.filter(
                (transaction) => {
                  const existingTransaction = existingTransactions.get(transaction.id);
                  return !isTransactionMonthLocked(transaction, user.lockedMonths)
                    && !isTransactionMonthLocked(existingTransaction ?? transaction, user.lockedMonths);
                },
              );
              const now = new Date().toISOString();
              const transactionsWithCreationTime = unlockedTransactions.map((transaction) => ({
                ...transaction,
                createdAt: transaction.createdAt ?? (existingTransactions.get(transaction.id)?.createdAt
                  ?? (existingTransactions.has(transaction.id) ? undefined : now)),
              }));
              const importedIds = new Set(transactionsWithCreationTime.map((transaction) => transaction.id));
              const transactionsUpdatedUser: UserAccount = {
                ...user,
                ...(backup.profile ?? {}),
                // Exported IDs are stable. Replace matching open records instead
                // of creating duplicate rows when a backup is imported twice.
                transactions: [
                  ...transactionsWithCreationTime,
                  ...user.transactions.filter((transaction) => !importedIds.has(transaction.id)),
                ],
                investments: mergeById(user.investments ?? [], backup.investments),
                expenses: mergeById(user.expenses ?? [], backup.expenses),
                incomes: mergeById(user.incomes ?? [], backup.incomes ?? []),
                withdrawals: mergeById(user.withdrawals ?? [], backup.withdrawals),
                defaultCostSchedules: mergeById(user.defaultCostSchedules ?? [], backup.defaultCostSchedules),
                lockedMonths: [...new Set([...(user.lockedMonths ?? []), ...backup.lockedMonths])],
                ...(backup.settings ?? {}),
              };
              const updatedUser: UserAccount = {
                ...transactionsUpdatedUser,
                currentBalance: calculateCurrentBalance(transactionsUpdatedUser),
              };
              updateUser(updatedUser);
              setUser(updatedUser);
              return {
                imported: unlockedTransactions.length,
                skipped: weekdayTransactions.length - unlockedTransactions.length,
                weekendSkipped,
                otherRecords: backup.investments.length + backup.expenses.length + (backup.incomes?.length ?? 0) + backup.withdrawals.length + backup.defaultCostSchedules.length,
              };
            }}
          />
        ) : activePage === "trade-signal" ? (
          <TradeSignal user={user} />
        ) : activePage === "analytics" ? (
          <Analytics user={user} onOpenNotifications={openNotifications} />
        ) : activePage === "profitloss" ? (
          <ProfitLoss user={user} />
        ) : activePage === "reports" ? (
          <Reports
            user={user}
            onToggleMonthLock={(monthKey) => {
              const lockedMonths = user.lockedMonths ?? [];
              const isLocked = lockedMonths.includes(monthKey);
              const updatedUser = {
                ...user,
                lockedMonths: isLocked
                  ? lockedMonths.filter((month) => month !== monthKey)
                  : [...lockedMonths, monthKey],
              };
              updateUser(updatedUser);
              setUser(updatedUser);
            }}
          />
        ) : activePage === "withdrawals" ? (
          <Withdrawals
            user={user}
            onSave={(updatedUser) => {
              updateUser(updatedUser);
              setUser(updatedUser);
            }}
          />
        ) : activePage === "chat" ? (
          <Chat
            onAddTransaction={handleSaveTransaction}
            user={user}
          />
        ) : activePage === "ai-analysis" ? (
          <AIAnalysis user={user} onSave={handleSaveTransaction} onSaveReviewed={handleSaveReviewedTrades} />
        ) : activePage === "investment" ? (
          <InvestmentPage
            user={user}
            onSave={(updatedUser) => {
              updateUser(updatedUser);
              setUser(updatedUser);
            }}
          />
        ) : activePage === "expenses" ? (
          <Expenses user={user} onSave={(updatedUser) => { updateUser(updatedUser); setUser(updatedUser); }} />
        ) : activePage === "income" ? (
          <Income user={user} onSave={(updatedUser) => { updateUser(updatedUser); setUser(updatedUser); }} />
        ) : activePage === "scenario-lab" ? (
          <ScenarioLab user={user} />
        ) : (
          <Settings
            user={user}
            onSave={(updatedUser) => {
              updateUser(updatedUser);
              setUser(updatedUser);
            }}
          />
        )}
        </Suspense>

      </main>

      </div>

        <footer className="app-footer">
          <div className="app-footer-main">
            <div className="app-footer-branding">
              <span className="app-footer-mark"><CircleDollarSign size={21} /></span>
              <div>
                <strong>FinTrack</strong>
                <span>Trade, investment, and expense tracking in one place.</span>
              </div>
            </div>
          </div>
          <div className="app-footer-bottom">
            <span className="app-footer-copy">&copy; {new Date().getFullYear()} FinTrack. All rights reserved.</span>
          </div>
        </footer>

      {modalOpen && (
        <AddTransactionModal
          currency={user.currency}
          defaultCostAmount={user.defaultCostAmount}
          defaultCostSchedules={user.defaultCostSchedules}
          expenseIncludedByDefault={
            user.expenseIncludedByDefault
          }
          onClose={() => {
            setModalOpen(false);
            setEditingTransaction(null);
          }}
          onSave={handleSaveTransaction}
          initialTransaction={editingTransaction}
        />
      )}

      {notificationsOpen && <Suspense fallback={<AppLoader />}><Notifications user={user} onClose={() => setNotificationsOpen(false)} /></Suspense>}
    </div>
  );
};

export default App;
