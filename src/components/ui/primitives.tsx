"use client";

import * as React from "react";
import { X, AlertCircle, CheckCircle2, Info, AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/* ============================== CARD ============================== */
export function Card({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-[var(--shadow-soft)]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex items-start justify-between gap-4 px-5 pt-5 pb-3", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardTitle({ className, children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn("text-sm font-semibold tracking-tight text-[var(--text-primary)]", className)} {...props}>
      {children}
    </h3>
  );
}

export function CardDescription({ className, children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("text-xs text-[var(--text-muted)] mt-0.5", className)} {...props}>
      {children}
    </p>
  );
}

export function CardContent({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("px-5 pb-5", className)} {...props}>
      {children}
    </div>
  );
}

/* ============================== BADGE ============================== */
type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "gold" | "rose";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-[var(--bg-muted)] text-[var(--text-secondary)] border-[var(--border-default)]",
  success: "bg-[var(--success-soft)] text-[var(--success)] border-transparent",
  warning: "bg-[var(--warning-soft)] text-[var(--warning)] border-transparent",
  danger: "bg-[var(--danger-soft)] text-[var(--danger)] border-transparent",
  info: "bg-[var(--info-soft)] text-[var(--info)] border-transparent",
  gold: "bg-[var(--accent-soft)] text-[var(--accent)] border-transparent",
  rose: "bg-[var(--rose-100)] text-[var(--rose-700)] border-transparent dark:bg-[var(--rose-900)] dark:text-[var(--rose-200)]",
};

export function Badge({
  tone = "neutral",
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-5 whitespace-nowrap",
        toneClasses[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

/* ============================== MODAL ============================== */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  closeOnBackdrop = true,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "full";
  closeOnBackdrop?: boolean;
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const widths = {
    sm: "max-w-md",
    md: "max-w-2xl",
    lg: "max-w-4xl",
    xl: "max-w-6xl",
    full: "max-w-[95vw]",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={cn(
          "animate-scale-in flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-2xl sm:rounded-2xl",
          widths[size],
        )}
      >
        {(title || description) && (
          <div className="flex items-start justify-between gap-4 border-b border-[var(--border-default)] px-5 py-4">
            <div>
              {title && <h2 className="text-base font-semibold text-[var(--text-primary)]">{title}</h2>}
              {description && <p className="mt-0.5 text-xs text-[var(--text-muted)]">{description}</p>}
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-muted)] hover:text-[var(--text-primary)]"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-[var(--border-default)] bg-[var(--bg-muted)]/50 px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================== CONFIRM ============================== */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  tone = "danger",
  loading,
  children,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "primary" | "success";
  loading?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <button
            onClick={onClose}
            className="h-9 rounded-lg border border-[var(--border-strong)] px-3 text-sm font-medium hover:bg-[var(--bg-muted)]"
          >
            {cancelLabel}
          </button>
          <button
            onClick={() => void onConfirm()}
            disabled={loading}
            className={cn(
              "inline-flex h-9 items-center gap-2 rounded-lg px-4 text-sm font-semibold text-white disabled:opacity-50",
              tone === "danger" && "bg-[var(--danger)]",
              tone === "primary" && "bg-[var(--accent)] text-[var(--accent-contrast)]",
              tone === "success" && "bg-[var(--success)]",
            )}
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="text-sm text-[var(--text-secondary)]">{message}</div>
      {children && <div className="mt-3">{children}</div>}
    </Modal>
  );
}

/* ============================== EMPTY / ERROR / LOADING ============================== */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-14 text-center", className)}>
      {icon && (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
          {icon}
        </div>
      )}
      <h3 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm text-xs leading-relaxed text-[var(--text-muted)]">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Alert({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: "info" | "success" | "warning" | "danger";
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const icons = {
    info: <Info className="h-4 w-4" />,
    success: <CheckCircle2 className="h-4 w-4" />,
    warning: <AlertTriangle className="h-4 w-4" />,
    danger: <AlertCircle className="h-4 w-4" />,
  };
  const colors = {
    info: "bg-[var(--info-soft)] text-[var(--info)] border-[var(--info)]/20",
    success: "bg-[var(--success-soft)] text-[var(--success)] border-[var(--success)]/20",
    warning: "bg-[var(--warning-soft)] text-[var(--warning)] border-[var(--warning)]/20",
    danger: "bg-[var(--danger-soft)] text-[var(--danger)] border-[var(--danger)]/20",
  };
  return (
    <div className={cn("flex gap-3 rounded-xl border px-4 py-3 text-sm", colors[tone], className)}>
      <span className="mt-0.5 shrink-0">{icons[tone]}</span>
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        <div className={cn("text-[13px] leading-relaxed", title && "mt-0.5 opacity-90")}>{children}</div>
      </div>
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-5 w-5 animate-spin text-[var(--accent)]", className)} />;
}

export function LoadingBlock({ label = "Carregando..." }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16">
      <Spinner className="h-6 w-6" />
      <p className="text-xs text-[var(--text-muted)]">{label}</p>
    </div>
  );
}

export function SkeletonRows({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3">
          {Array.from({ length: cols }).map((_, c) => (
            <div key={c} className="skeleton h-8 flex-1" style={{ opacity: 1 - r * 0.1 }} />
          ))}
        </div>
      ))}
    </div>
  );
}

/* ============================== TABS ============================== */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: Array<{ value: T; label: string; count?: number }>;
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex gap-1 overflow-x-auto rounded-xl bg-[var(--bg-muted)] p-1", className)}>
      {tabs.map((tab) => (
        <button
          key={tab.value}
          onClick={() => onChange(tab.value)}
          className={cn(
            "flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
            value === tab.value
              ? "bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm"
              : "text-[var(--text-muted)] hover:text-[var(--text-primary)]",
          )}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span className="rounded-full bg-[var(--bg-muted)] px-1.5 text-[10px]">{tab.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

/* ============================== PAGINATION ============================== */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-default)] px-4 py-3 text-xs text-[var(--text-muted)]">
      <span>
        Exibindo <strong className="text-[var(--text-primary)]">{from}</strong>–
        <strong className="text-[var(--text-primary)]">{to}</strong> de{" "}
        <strong className="text-[var(--text-primary)]">{total}</strong>
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="h-8 rounded-lg border border-[var(--border-default)] px-2.5 font-medium disabled:opacity-40 enabled:hover:bg-[var(--bg-muted)]"
        >
          Anterior
        </button>
        <span className="px-2">
          {page} / {pages}
        </span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pages}
          className="h-8 rounded-lg border border-[var(--border-default)] px-2.5 font-medium disabled:opacity-40 enabled:hover:bg-[var(--bg-muted)]"
        >
          Próxima
        </button>
      </div>
    </div>
  );
}
