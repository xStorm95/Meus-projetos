"use client";

import * as React from "react";

/**
 * "system" segue a preferência do aparelho; é o padrão da marca ORION (que é
 * escura por identidade, mas sem impor o escuro a quem prefere claro).
 */
type Theme = "light" | "dark" | "system";
type Accent = "gold" | "rose" | "emerald" | "navy";

type ThemeContextValue = {
  theme: Theme;
  accent: Accent;
  setTheme: (t: Theme) => void;
  setAccent: (a: Accent) => void;
  toggleTheme: () => void;
  /** Tema efetivamente aplicado (resolve "system"). */
  resolved: "light" | "dark";
};

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "orion:theme";
const ACCENT_KEY = "orion:accent";
/** Chave antiga: lida uma vez para não perder a preferência de quem já usava. */
const STORAGE_KEY_LEGACY = "passarela:theme";
const ACCENT_KEY_LEGACY = "passarela:accent";

function sistemaEscuro(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * A preferência de tema é apenas de interface (não é dado de negócio),
 * portanto é armazenada no navegador. Os dados do ERP ficam no banco.
 */
export function ThemeProvider({
  children,
  initialTheme = "system",
  initialAccent = "gold",
}: {
  children: React.ReactNode;
  initialTheme?: Theme;
  initialAccent?: Accent;
}) {
  const [theme, setThemeState] = React.useState<Theme>(initialTheme);
  const [accent, setAccentState] = React.useState<Accent>(initialAccent);
  const [resolved, setResolved] = React.useState<"light" | "dark">(
    initialTheme === "light" ? "light" : initialTheme === "dark" ? "dark" : "light",
  );

  React.useEffect(() => {
    const stored = (localStorage.getItem(STORAGE_KEY) ??
      localStorage.getItem(STORAGE_KEY_LEGACY)) as Theme | null;
    if (stored === "dark" || stored === "light" || stored === "system") {
      setThemeState(stored);
    } else if (sistemaEscuro()) {
      // Sem preferência salva: acompanha o aparelho.
      setThemeState("system");
    }
    const storedAccent = (localStorage.getItem(ACCENT_KEY) ??
      localStorage.getItem(ACCENT_KEY_LEGACY)) as Accent | null;
    if (storedAccent) setAccentState(storedAccent);
  }, []);

  React.useEffect(() => {
    const root = document.documentElement;
    const escuro = theme === "dark" || (theme === "system" && sistemaEscuro());
    setResolved(escuro ? "dark" : "light");
    root.classList.toggle("dark", escuro);
    root.style.colorScheme = escuro ? "dark" : "light";
    root.dataset.accent = accent;
  }, [theme, accent]);

  // Segue o aparelho em tempo real enquanto o modo for "system".
  React.useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const aplicar = () => {
      const escuro = mq.matches;
      setResolved(escuro ? "dark" : "light");
      document.documentElement.classList.toggle("dark", escuro);
      document.documentElement.style.colorScheme = escuro ? "dark" : "light";
    };
    mq.addEventListener("change", aplicar);
    return () => mq.removeEventListener("change", aplicar);
  }, [theme]);

  const setTheme = React.useCallback((t: Theme) => {
    setThemeState(t);
    localStorage.setItem(STORAGE_KEY, t);
    // Mantém a chave antiga em sincronia por uma versão (rollback seguro).
    localStorage.setItem(STORAGE_KEY_LEGACY, t === "system" ? (sistemaEscuro() ? "dark" : "light") : t);
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
      resolved,
      // O botão alterna entre claro e escuro a partir do que está na tela.
      toggleTheme: () => setTheme(resolved === "dark" ? "light" : "dark"),
    }),
    [theme, accent, resolved, setTheme, setAccent],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme deve ser usado dentro de ThemeProvider");
  return ctx;
}
