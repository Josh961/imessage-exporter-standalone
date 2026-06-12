import { useCallback, useEffect, useState } from "react";

export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? (JSON.parse(item) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = useCallback(
    (value: T) => {
      try {
        setStoredValue(value);
        const newValue = JSON.stringify(value);
        window.localStorage.setItem(key, newValue);
        // Browsers only fire "storage" in other windows; dispatch it here too so
        // hooks for the same key elsewhere in this window stay in sync
        window.dispatchEvent(new StorageEvent("storage", { key, newValue }));
      } catch (error) {
        console.error("Error saving to localStorage:", error);
      }
    },
    [key],
  );

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === key && e.newValue) {
        setStoredValue(JSON.parse(e.newValue) as T);
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [key]);

  return [storedValue, setValue];
}
