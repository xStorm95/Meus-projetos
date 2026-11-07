"use client";

import * as React from "react";
import { ChevronDown, Search, X, Check } from "lucide-react";
import { cn } from "@/lib/utils";

/* ============================== FIELD WRAPPER ============================== */
export function Field({
  label,
  error,
  hint,
  required,
  children,
  className,
  htmlFor,
}: {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      {label && (
        <label className="label" htmlFor={htmlFor}>
          {label}
          {required && <span className="ml-0.5 text-[var(--danger)]">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="mt-1 text-[11px] font-medium text-[var(--danger)]">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-[11px] text-[var(--text-muted)]">{hint}</p>
      ) : null}
    </div>
  );
}

/* ============================== INPUT ============================== */
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  leftIcon?: React.ReactNode;
  invalid?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, leftIcon, invalid, ...props },
  ref,
) {
  if (!leftIcon) {
    return (
      <input
        ref={ref}
        className={cn("field", invalid && "border-[var(--danger)]", className)}
        {...props}
      />
    );
  }
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
        {leftIcon}
      </span>
      <input
        ref={ref}
        className={cn("field pl-9", invalid && "border-[var(--danger)]", className)}
        {...props}
      />
    </div>
  );
});

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn("field min-h-20 resize-y", className)} {...props} />;
  },
);

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <div className="relative">
        <select ref={ref} className={cn("field cursor-pointer appearance-none pr-9", className)} {...props}>
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
      </div>
    );
  },
);

/* ============================== MONEY / NUMBER INPUT ============================== */
export function MoneyInput({
  value,
  onChange,
  className,
  placeholder = "0,00",
  ...props
}: {
  value: number | "";
  onChange: (v: number) => void;
  className?: string;
  placeholder?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const [text, setText] = React.useState(() =>
    value === "" || value === undefined ? "" : formatNumberInput(value),
  );

  React.useEffect(() => {
    setText(value === "" || value === undefined ? "" : formatNumberInput(value));
  }, [value]);

  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-[var(--text-muted)]">
        R$
      </span>
      <input
        inputMode="decimal"
        className={cn("field pl-9 text-right font-medium tabular-nums", className)}
        placeholder={placeholder}
        value={text}
        onChange={(e) => {
          const raw = e.target.value;
          setText(raw);
          const digits = raw.replace(/\D/g, "");
          onChange(digits ? Number(digits) / 100 : 0);
        }}
        onFocus={(e) => e.currentTarget.select()}
        {...props}
      />
    </div>
  );
}

function formatNumberInput(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/* ============================== SEARCH INPUT ============================== */
export function SearchInput({
  value,
  onChange,
  placeholder = "Buscar...",
  onClear,
  className,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  onClear?: () => void;
  className?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
      <input
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="field pl-9 pr-8"
      />
      {value && (
        <button
          onClick={() => {
            onChange("");
            onClear?.();
          }}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-[var(--text-muted)] hover:bg-[var(--bg-muted)]"
          aria-label="Limpar busca"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/* ============================== CHECKBOX / SWITCH ============================== */
export function Checkbox({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: React.ReactNode;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-2.5 text-sm",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <span
        onClick={(e) => {
          if (disabled) return;
          e.preventDefault();
          onChange(!checked);
        }}
        className={cn(
          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
          checked
            ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]"
            : "border-[var(--border-strong)] bg-[var(--bg-surface)]",
        )}
      >
        {checked && <Check className="h-3 w-3" strokeWidth={3} />}
      </span>
      <span className="min-w-0">
        {label && <span className="block font-medium text-[var(--text-primary)]">{label}</span>}
        {description && <span className="block text-xs text-[var(--text-muted)]">{description}</span>}
      </span>
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        {label && <p className="text-sm font-medium text-[var(--text-primary)]">{label}</p>}
        {description && <p className="text-xs text-[var(--text-muted)]">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50",
          checked ? "bg-[var(--accent)]" : "bg-[var(--border-strong)]",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-[1.125rem]" : "translate-x-0.5",
          )}
        />
      </button>
    </div>
  );
}

/* ============================== SEGMENTED / QUICK AMOUNTS ============================== */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex rounded-lg border border-[var(--border-default)] bg-[var(--bg-muted)] p-0.5", className)}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-semibold transition-colors",
            value === opt.value
              ? "bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm"
              : "text-[var(--text-muted)] hover:text-[var(--text-primary)]",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
