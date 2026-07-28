import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Recent Node versions expose their own localStorage global, which shadows
// jsdom's implementation here and lacks the Storage methods. Install a
// functional in-memory Storage shared by tests and components.
if (typeof localStorage === "undefined" || typeof localStorage.clear !== "function") {
  const data = new Map<string, string>();
  const memoryStorage: Storage = {
    get length() {
      return data.size;
    },
    key: (index: number) => [...data.keys()][index] ?? null,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, String(value));
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    clear: () => {
      data.clear();
    },
  };
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: memoryStorage });
  if (typeof window !== "undefined") {
    Object.defineProperty(window, "localStorage", { configurable: true, value: memoryStorage });
  }
}

afterEach(() => {
  cleanup();
});
