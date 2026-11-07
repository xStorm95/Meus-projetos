"use client";

import * as React from "react";

type Theme = "light" | "dark";
type Accent = "gold" | "rose" | "emerald" | "navy";

type ThemeContextValue = {
  theme: Theme;
  accent: Accent;
  setTheme: (t: Theme) => void;
  setAccent: (a: Accent) => void;
  toggleTheme: () => void;
};

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "passarela:theme";
const ACCENT_KEY = "passarela:accent";

/**
 * A preferência de tema é apenas de interface (não é dado de negócio),
 * portanto é armazenada no navegador. Os dados do ERP ficam no banco.
 */
export function ThemeProvider({
  children,
  initialTheme = "light",
  initialAccent = "gold",
}: {
  children: React.ReactNode;
  initialTheme?: Theme;
  initialAccent?: Accent;
}) {
  const [theme, setThemeState] = React.useState<Theme>(initialTheme);
  const [accent, setAccentState] = React.useState<Accent>(initialAccent);

  React.useEffect(() => {
    const storedTheme = localStorage.getItem(STORAGE_KEY) as Theme | null;
    const storedAccent = localStorage.getItem(ACCENT_KEY) as Accent | null;
    if (storedTheme === "dark" || storedTheme === "light") setThemeState(storedTheme);
    else if (window.matchMedia("(prefers-color-scheme: dark)").matches) setThemeState("dark");
    if (storedAccent) setAccentState(storedAccent);
  }, []);

  React.useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;
    root.dataset.accent = accent;
  }, [theme, accent]);

  const setTheme = React.useCallback((t: Theme) => {
    setThemeState(t);
    localStorage.setItem(STORAGE_KEY, t);
  }, []);

  const setAccent = React.useCallback((a: Accent) => {
    setAccentState(a);
    localStorage.setItem(ACCENT_KEY, a);
  }, []);

  const value = React.useMemo(
    () => ({
      theme,
      accent,
      setTheme,
      setAccent,
      toggleTheme: () => setTheme(theme === "dark" ? "light" : "dark"),
    }),
    [theme, accent, setTheme, setAccent],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme deve ser usado dentro de ThemeProvider");
  return ctx;
}
