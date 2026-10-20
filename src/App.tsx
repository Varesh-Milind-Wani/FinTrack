import { ArrowUp, CircleDollarSign, Menu, ShieldCheck, X } from "lucide-react";
import { useState, useEffect } from "react";

import Sidebar from "./components/Sidebar";
import AddTransactionModal from "./components/AddTransactionModal";

import Dashboard from "./pages/Dashboard";
import Analytics from "./pages/Analytics.tsx";
import ProfitLoss from "./pages/ProfitLoss";
import Settings from "./pages/Settings";
import Login from "./pages/Login";
import Transactions from "./pages/Transactions";
import Withdrawals from "./pages/Withdrawals";
import Chat from "./pages/Chat";
import InvestmentPage from "./pages/Investment";
import Expenses from "./pages/Expenses";
import Reports from "./pages/Reports";
import Profile from "./pages/Profile";

import {
  addStorageChangeListener,
  getCurrentUser,
  logoutUser,
  updateUser,
} from "./utils/storage";
import { calculateCurrentBalance } from "./utils/balance";
import { getMonthKey, getMonthLabel, isTransactionMonthLocked } from "./utils/monthLocks";

import type {
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
  | "analytics"
  | "profitloss"
  | "reports"
  | "withdrawals"
  | "settings"
  | "chat"
  | "investment"
  | "expenses"
  | "profile";

const APP_PAGES: AppPage[] = [
  "dashboard",
  "transactions",
  "analytics",
  "profitloss",
  "reports",
  "withdrawals",
  "settings",
  "chat",
  "investment",
  "expenses",
  "profile",
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
      <Login
        onAuthenticated={(newUser) => {
          setUser(newUser);
          setActivePage("dashboard");
          setMobileMenuOpen(false);
        }}
      />
    );
  }

  const handleSaveTransaction = (
    transaction: Transaction
  ) => {
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
      alert(`${getMonthLabel(lockedMonthKey)} is locked. Unlock that month in Reports before changing its transactions.`);
      return;
    }

    const nextTransactions = transactionExists
      ? user.transactions.map((item) =>
          item.id === transaction.id ? transaction : item
        )
      : [transaction, ...user.transactions];

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
  };

  const handleDeleteTransaction = (
    id: string
  ) => {
    const transaction = user.transactions.find((item) => item.id === id);
    if (transaction && isTransactionMonthLocked(transaction, user.lockedMonths)) {
      alert(`${getMonthLabel(getMonthKey(transaction.date))} is locked. Unlock that month in Reports before deleting this transaction.`);
      return;
    }

    const confirmed =
      window.confirm(
        "Are you sure you want to delete this transaction?"
      );

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
      alert(`${getMonthLabel(getMonthKey(transaction.date))} is locked. Unlock that month in Reports before editing this transaction.`);
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
        onLogout={handleLogout}
        mobileOpen={mobileMenuOpen}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((collapsed) => !collapsed)}
      />

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
              const existingTransactions = new Map(
                user.transactions.map((transaction) => [transaction.id, transaction]),
              );
              const unlockedTransactions = importedTransactions.filter(
                (transaction) => {
                  const existingTransaction = existingTransactions.get(transaction.id);
                  return !isTransactionMonthLocked(transaction, user.lockedMonths)
                    && !isTransactionMonthLocked(existingTransaction ?? transaction, user.lockedMonths);
                },
              );
              const importedIds = new Set(unlockedTransactions.map((transaction) => transaction.id));
              const transactionsUpdatedUser: UserAccount = {
                ...user,
                ...(backup.profile ?? {}),
                // Exported IDs are stable. Replace matching open records instead
                // of creating duplicate rows when a backup is imported twice.
                transactions: [
                  ...unlockedTransactions,
                  ...user.transactions.filter((transaction) => !importedIds.has(transaction.id)),
                ],
                investments: mergeById(user.investments ?? [], backup.investments),
                expenses: mergeById(user.expenses ?? [], backup.expenses),
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
                skipped: importedTransactions.length - unlockedTransactions.length,
                otherRecords: backup.investments.length + backup.expenses.length + backup.withdrawals.length + backup.defaultCostSchedules.length,
              };
            }}
          />
        ) : activePage === "analytics" ? (
          <Analytics user={user} />
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
        ) : (
          <Settings
            user={user}
            onSave={(updatedUser) => {
              updateUser(updatedUser);
              setUser(updatedUser);
            }}
          />
        )}

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
            <div className="app-footer-privacy">
              <ShieldCheck size={17} />
              <div><strong>Your data stays on this device</strong><span>Saved locally in your browser.</span></div>
            </div>
          </div>
          <div className="app-footer-bottom">
            <span className="app-footer-copy">&copy; {new Date().getFullYear()} FinTrack. All rights reserved.</span>
            <button
              type="button"
              className="app-footer-top"
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            >
              <ArrowUp size={14} /> Back to top
            </button>
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
    </div>
  );
};

export default App;
