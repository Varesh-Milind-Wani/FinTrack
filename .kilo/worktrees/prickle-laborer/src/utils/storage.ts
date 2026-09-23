import type { Transaction, UserAccount } from "../types/finance";

const USERS_KEY = "fintrack_users";
const SESSION_KEY = "fintrack_current_user";
const CURRENT_USER_KEY = "fintrack_current_user_profile";
const STORAGE_CHANGE_EVENT = "fintrack-storage-updated";

const readJson = <T>(key: string, fallback: T): T => {
  try {
    const data = localStorage.getItem(key);

    if (!data) {
      return fallback;
    }

    return JSON.parse(data) as T;
  } catch (error) {
    console.error(`Failed to read ${key}:`, error);
    return fallback;
  }
};

const normalizeUser = (user: UserAccount): UserAccount => ({
  ...user,
  ...(() => {
    const schedules = Array.isArray(user.defaultCostSchedules)
      ? user.defaultCostSchedules.filter(
          (schedule) =>
            Boolean(schedule) &&
            typeof schedule.id === "string" &&
            typeof schedule.startDate === "string" &&
            typeof schedule.name === "string" &&
            Number.isFinite(schedule.amount)
        )
      : [];
    const transactions = Array.isArray(user.transactions)
      ? user.transactions.map((transaction) => {
          // Preserve transaction as-is - don't recalculate amounts
          // The amount field already contains the correct net amount
          // grossAmount and costAmount are stored separately
          return {
            ...transaction,
            amount: transaction.amount ?? 0,
            price: transaction.price ?? transaction.grossAmount ?? transaction.amount ?? 0,
            grossAmount: transaction.grossAmount ?? transaction.amount ?? 0,
            costAmount: transaction.costAmount ?? 0,
          };
        })
      : [];

    return { defaultCostSchedules: schedules, transactions };
  })(),
  name: user.name ?? "",
  email: user.email ?? "",
  password: user.password ?? "",
  startingBalance: Number.isFinite(user.startingBalance)
    ? user.startingBalance
    : 0,
  currency: user.currency ?? "INR",
  defaultCostAmount: Number.isFinite(user.defaultCostAmount)
    ? user.defaultCostAmount
    : 0,
  expenseIncludedByDefault:
    user.expenseIncludedByDefault ?? true,
  createdAt: user.createdAt ?? new Date().toISOString(),
});

const upsertUser = (
  users: UserAccount[],
  nextUser: UserAccount
) => {
  const normalizedUser = normalizeUser(nextUser);
  const index = users.findIndex(
    (user) => user.id === normalizedUser.id
  );

  if (index === -1) {
    return [...users, normalizedUser];
  }

  const nextUsers = [...users];
  nextUsers[index] = normalizedUser;
  return nextUsers;
};

const persistSessionUser = (user: UserAccount) => {
  const normalizedUser = normalizeUser(user);
  const users = getUsers();

  localStorage.setItem(
    USERS_KEY,
    JSON.stringify(upsertUser(users, normalizedUser))
  );
  localStorage.setItem(SESSION_KEY, normalizedUser.id);
  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(normalizedUser));
  window.dispatchEvent(new Event(STORAGE_CHANGE_EVENT));

  return normalizedUser;
};

export const getUsers = (): UserAccount[] => {
  const users = readJson<unknown>(USERS_KEY, []);

  if (!Array.isArray(users)) {
    return [];
  }

  return users
    .filter(
      (user): user is UserAccount =>
        Boolean(user) &&
        typeof user === "object" &&
        "id" in user
    )
    .map((user) => normalizeUser(user as UserAccount));
};

export const saveUsers = (users: UserAccount[]) => {
  localStorage.setItem(
    USERS_KEY,
    JSON.stringify(users.map((user) => normalizeUser(user)))
  );
  window.dispatchEvent(new Event(STORAGE_CHANGE_EVENT));
};

export const getCurrentUserId = (): string | null => {
  return localStorage.getItem(SESSION_KEY);
};

export const setCurrentUserId = (userId: string) => {
  localStorage.setItem(SESSION_KEY, userId);
  window.dispatchEvent(new Event(STORAGE_CHANGE_EVENT));
};

export const saveCurrentUser = (user: UserAccount) => {
  persistSessionUser(user);
};

export const logoutUser = () => {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(CURRENT_USER_KEY);
  window.dispatchEvent(new Event(STORAGE_CHANGE_EVENT));
};

export const getCurrentUser = (): UserAccount | null => {
  try {
    const parsedUser = readJson<UserAccount | null>(
      CURRENT_USER_KEY,
      null
    );
    const userId = parsedUser?.id ?? getCurrentUserId();
    const users = getUsers();

    if (!userId) {
      return parsedUser ? persistSessionUser(parsedUser) : null;
    }

    const matchedUser = users.find((user) => user.id === userId);

    if (matchedUser) {
      if (!parsedUser || matchedUser.id !== parsedUser.id) {
        localStorage.setItem(
          CURRENT_USER_KEY,
          JSON.stringify(matchedUser)
        );
      }

      return matchedUser;
    }

    if (parsedUser) {
      persistSessionUser(parsedUser);
      return parsedUser;
    }

    return null;
  } catch (error) {
    console.error("Failed to read current user:", error);
    return null;
  }
};

export const createDefaultSampleTrades = (): Transaction[] => {
  const now = new Date();
  const getPastIso = (daysAgo: number, hours = 10, minutes = 15) => {
    const d = new Date(now);
    d.setDate(d.getDate() - daysAgo);
    d.setHours(hours, minutes, 0, 0);
    return d.toISOString();
  };

  return [
    {
      id: crypto.randomUUID(),
      date: getPastIso(0, 14, 30),
      type: "profit",
      amount: 14500,
      grossAmount: 14500,
      costAmount: 0,
      price: 14500,
      category: "Options - CE Trade",
      note: "BankNifty 48200 CE intraday breakout scalp",
    },
    {
      id: crypto.randomUUID(),
      date: getPastIso(1, 11, 45),
      type: "profit",
      amount: 8350,
      grossAmount: 8350,
      costAmount: 0,
      price: 8350,
      category: "Options - CE Trade",
      note: "Nifty 22500 CE momentum scalp near VWAP bounce",
    },
    {
      id: crypto.randomUUID(),
      date: getPastIso(1, 15, 10),
      type: "loss",
      amount: 3150,
      grossAmount: 3150,
      costAmount: 0,
      price: 3150,
      category: "Futures & Crypto",
      note: "Crude Oil trailing stop hit on inventory news spike",
    },
    {
      id: crypto.randomUUID(),
      date: getPastIso(2, 10, 20),
      type: "loss",
      amount: 4200,
      grossAmount: 4200,
      costAmount: 0,
      price: 4200,
      category: "Options - PE Trade",
      note: "BankNifty 47900 PE breakdown trap - strict SL executed",
    },
    {
      id: crypto.randomUUID(),
      date: getPastIso(3, 13, 15),
      type: "profit",
      amount: 18400,
      grossAmount: 18400,
      costAmount: 0,
      price: 18400,
      category: "Swing Trading",
      note: "Tata Motors positional swing breakout on quarterly sales",
    },
    {
      id: crypto.randomUUID(),
      date: getPastIso(4, 9, 45),
      type: "profit",
      amount: 6800,
      grossAmount: 6800,
      costAmount: 0,
      price: 6800,
      category: "Intraday Equity",
      note: "Reliance opening range breakout on heavy volume",
    },
    {
      id: crypto.randomUUID(),
      date: getPastIso(4, 14, 50),
      type: "loss",
      amount: 2800,
      grossAmount: 2800,
      costAmount: 0,
      price: 2800,
      category: "Options - PE Trade",
      note: "Nifty 22350 PE reversal setup failed - disciplined stoploss",
    },
  ];
};

export const createAccount = (
  name: string,
  email: string,
  password: string,
  startingBalance: number
): UserAccount => {
  const users = getUsers();

  const existingUser = users.find(
    (user) => user.email.toLowerCase() === email.toLowerCase()
  );

  if (existingUser) {
    throw new Error("An account with this email already exists.");
  }

  const newUser: UserAccount = {
    id: crypto.randomUUID(),
    name,
    email,
    password,
    startingBalance,
    currency: "INR",
    defaultCostAmount: 0,
    defaultCostSchedules: [],
    expenseIncludedByDefault: true,
    createdAt: new Date().toISOString(),
    transactions: createDefaultSampleTrades(),
  };

  saveCurrentUser(newUser);

  return newUser;
};

export const loginUser = (
  email: string,
  password: string
): UserAccount => {
  const users = getUsers();

  const user = users.find(
    (item) =>
      item.email.toLowerCase() === email.toLowerCase() &&
      item.password === password
  );

  if (!user) {
    throw new Error("Invalid email or password.");
  }

  saveCurrentUser(user);

  return user;
};

export const addSampleTradesToUser = (user: UserAccount): UserAccount => {
  const sampleTrades = createDefaultSampleTrades();
  const existingIds = new Set(user.transactions.map((t) => t.id));
  const newTrades = sampleTrades.filter((t) => !existingIds.has(t.id));

  const updatedUser: UserAccount = {
    ...user,
    transactions: [...newTrades, ...user.transactions],
  };
  saveCurrentUser(updatedUser);
  return updatedUser;
};

export const updateUser = (updatedUser: UserAccount) => {
  saveCurrentUser(updatedUser);
};

export const clearAllFinanceData = () => {
  localStorage.removeItem(USERS_KEY);
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(CURRENT_USER_KEY);
  window.dispatchEvent(new Event(STORAGE_CHANGE_EVENT));
};

export const addStorageChangeListener = (
  callback: () => void
) => {
  const handleStorageChange = () => callback();

  window.addEventListener(
    STORAGE_CHANGE_EVENT,
    handleStorageChange
  );

  return () => {
    window.removeEventListener(
      STORAGE_CHANGE_EVENT,
      handleStorageChange
    );
  };
};
