import { Menu, X } from "lucide-react";
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

const App = () => {
  const [user, setUser] =
    useState<UserAccount | null>(
      () => getCurrentUser()
    );

  const [activePage, setActivePage] =
    useState<
      "dashboard" | "transactions" | "analytics" | "profitloss" | "reports" | "withdrawals" | "settings" | "chat" | "investment" | "expenses"
    >("dashboard");

  const [modalOpen, setModalOpen] =
    useState(false);
  const [editingTransaction, setEditingTransaction] =
    useState<Transaction | null>(null);

  const [mobileMenuOpen, setMobileMenuOpen] =
    useState(false);

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
    page:
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
  ) => {
    setActivePage(page);
    setMobileMenuOpen(false);
  };

  return (
    <div className="app-layout">
      <Sidebar
        user={user}
        activePage={activePage}
        onPageChange={handlePageChange}
        onLogout={handleLogout}
        mobileOpen={mobileMenuOpen}
      />

      <main className="main-area">
        <header className="top-header">
          <button
            className="mobile-menu-button"
            onClick={() =>
              setMobileMenuOpen(
                !mobileMenuOpen
              )
            }
          >
            {mobileMenuOpen ? (
              <X size={20} />
            ) : (
              <Menu size={20} />
            )}
          </button>

          <div>
            <span className="breadcrumb">
              FinTrack /{" "}
              {activePage === "dashboard" ? "Dashboard"
                : activePage === "transactions" ? "Transactions"
                : activePage === "analytics" ? "Analytics"
                : activePage === "profitloss" ? "P&L"
                : activePage === "reports" ? "Reports"
                : activePage === "withdrawals" ? "Withdrawals"
                : activePage === "chat" ? "Chat Assistant"
                : activePage === "investment" ? "Investment"
                : activePage === "expenses" ? "Expenses"
                : "Settings"}
            </span>

            <h2>
              {activePage === "dashboard" ? "Financial overview"
                : activePage === "transactions" ? "Transaction records"
                : activePage === "analytics" ? "Analytics"
                : activePage === "profitloss" ? "Profit & Loss Analysis"
                : activePage === "reports" ? "Monthly Reports"
                : activePage === "withdrawals" ? "Withdrawals"
                : activePage === "chat" ? "Chat Assistant"
                : activePage === "investment" ? "Investment Portfolio"
                : activePage === "expenses" ? "Expense Tracker"
                : "Settings"}
            </h2>
          </div>
        </header>

        {activePage === "dashboard" ? (
          <Dashboard
            user={user}
            onAdd={() =>
              setModalOpen(true)
            }
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
