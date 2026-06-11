"use client";

import { useState } from "react";

// Toggles the `.dark` class on <html> and remembers the choice. The initial
// class is set by the inline script in the root layout (no flash); we read it
// during the first client render — suppressHydrationWarning covers the
// server(false)/client(actual) icon difference.
export default function ThemeToggle() {
  const [dark, setDark] = useState(
    () => typeof document !== "undefined" && document.documentElement.classList.contains("dark")
  );

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      /* ignore */
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
      suppressHydrationWarning
      className="flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
    >
      <span suppressHydrationWarning>{dark ? "☀️" : "🌙"}</span>
    </button>
  );
}
