"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { initials } from "@/lib/validation";

/* ---------------- avatar ---------------- */
export function Avatar({
  name,
  src,
  size = "md",
  ring,
  className = "",
}: {
  name: string;
  src?: string | null;
  size?: "xs" | "sm" | "md" | "lg";
  ring?: boolean;
  className?: string;
}) {
  return (
    <div className={`avatar avatar-${size} ${ring ? "avatar-ring" : ""} ${className}`}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name ? `Foto de ${name}` : "Foto do perfil"} />
      ) : (
        <span aria-hidden="true">{initials(name || "?")}</span>
      )}
    </div>
  );
}

/* ---------------- toasts ---------------- */
type Toast = { id: number; kind: "success" | "error" | "info"; text: string };
type ToastCtx = { push: (text: string, kind?: Toast["kind"]) => void };

const ToastContext = createContext<ToastCtx>({ push: () => {} });
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const timers = useRef<number[]>([]);
  const idRef = useRef(0);

  const push = useCallback((text: string, kind: Toast["kind"] = "success") => {
    const id = ++idRef.current;
    setItems((prev) => [...prev.slice(-3), { id, kind, text }]);
    const timer = window.setTimeout(() => {
      setItems((prev) => prev.filter((item) => item.id !== id));
    }, 4600);
    timers.current.push(timer);
  }, []);

  useEffect(() => () => timers.current.forEach((t) => clearTimeout(t)), []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((item) => (
          <div key={item.id} className="toast" data-kind={item.kind}>
            <span className="dot" />
            <span>{item.text}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* ---------------- tema ---------------- */
export function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const stored = window.localStorage.getItem("palco:theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const next = stored === "dark" || stored === "light" ? stored : prefersDark ? "dark" : "light";
    setTheme(next);
    document.documentElement.dataset.theme = next;
  }, []);

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next = current === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      window.localStorage.setItem("palco:theme", next);
      return next;
    });
  }, []);

  return { theme, toggle };
}

/* ---------------- campos ---------------- */
export function Field({
  label,
  name,
  children,
  error,
  hint,
  required,
}: {
  label: string;
  name: string;
  children: React.ReactNode;
  error?: string;
  hint?: string;
  required?: boolean;
}) {
  return (
    <div className="field">
      <label htmlFor={name}>
        {label}
        {required ? <span className="req">*</span> : null}
      </label>
      {children}
      {error ? (
        <div className="field-error" role="alert">
          {error}
        </div>
      ) : hint ? (
        <div className="field-hint">{hint}</div>
      ) : null}
    </div>
  );
}

export function Alert({ kind = "info", children }: { kind?: "error" | "success" | "info"; children: React.ReactNode }) {
  return (
    <div className="alert" data-kind={kind} role={kind === "error" ? "alert" : "status"}>
      <span aria-hidden="true">{kind === "error" ? "!" : kind === "success" ? "✓" : "i"}</span>
      <span>{children}</span>
    </div>
  );
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: lines }).map((_, index) => (
        <div key={index} className={`skeleton skeleton-line ${index % 2 ? "w-70" : "w-40"}`} />
      ))}
    </div>
  );
}

/* ---------------- modal ---------------- */
export function Modal({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}

/* ---------------- número animado ---------------- */
export function CountUp({ value, suffix = "" }: { value: number; suffix?: string }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    let frame = 0;
    const start = performance.now();
    const duration = 700;
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(value * eased));
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return (
    <span>
      {display}
      {suffix}
    </span>
  );
}
