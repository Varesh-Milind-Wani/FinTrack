import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

const FILTER_STORAGE_PREFIX = "fintrack:filters:v1:";

/** Keep filter and view selections when a page unmounts during navigation. */
export const usePersistentState = <T,>(
  key: string,
  initialValue: T | (() => T),
): [T, Dispatch<SetStateAction<T>>] => {
  const storageKey = `${FILTER_STORAGE_PREFIX}${key}`;

  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") {
      return typeof initialValue === "function"
        ? (initialValue as () => T)()
        : initialValue;
    }

    try {
      const storedValue = window.localStorage.getItem(storageKey);
      if (storedValue !== null) return JSON.parse(storedValue) as T;
    } catch {
      // Use the default if storage is unavailable or contains invalid JSON.
    }

    return typeof initialValue === "function"
      ? (initialValue as () => T)()
      : initialValue;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      window.localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      // Filters still work for the current page when storage is unavailable.
    }
  }, [storageKey, value]);

  return [value, setValue];
};
