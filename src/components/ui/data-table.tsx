"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Pagination, SkeletonRows } from "./primitives";

export type Column<T> = {
  key: string;
  header: React.ReactNode;
  /** Renderiza a célula. Recebe a linha completa. */
  cell: (row: T, index: number) => React.ReactNode;
  /** Habilita ordenação no cliente */
  sortable?: boolean;
  sortValue?: (row: T) => string | number;
  align?: "left" | "right" | "center";
  className?: string;
  headerClassName?: string;
  hiddenOnMobile?: boolean;
};

export function DataTable<T>({
  data,
  columns,
  loading,
  emptyState,
  keyExtractor,
  onRowClick,
  rowClassName,
  pagination,
  className,
  footer,
}: {
  data: T[];
  columns: Column<T>[];
  loading?: boolean;
  emptyState?: React.ReactNode;
  keyExtractor: (row: T) => string;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string | undefined;
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    onPageChange: (p: number) => void;
  };
  className?: string;
  footer?: React.ReactNode;
}) {
  const [sort, setSort] = React.useState<{ key: string; dir: "asc" | "desc" } | null>(null);

  const sorted = React.useMemo(() => {
    if (!sort) return data;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return data;
    const copy = [...data];
    copy.sort((a, b) => {
      const av = col.sortValue!(a);
      const bv = col.sortValue!(b);
      if (typeof av === "number" && typeof bv === "number") {
        return sort.dir === "asc" ? av - bv : bv - av;
      }
      return sort.dir === "asc"
        ? String(av).localeCompare(String(bv), "pt-BR")
        : String(bv).localeCompare(String(av), "pt-BR");
    });
    return copy;
  }, [data, sort, columns]);

  if (loading) {
    return (
      <div className={cn("overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)]", className)}>
        <SkeletonRows rows={6} cols={Math.min(columns.length, 5)} />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)]",
        className,
      )}
    >
      {sorted.length === 0 ? (
        emptyState ?? (
          <div className="py-14 text-center text-sm text-[var(--text-muted)]">
            Nenhum registro encontrado.
          </div>
        )
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="table-pro">
              <thead>
                <tr>
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      className={cn(
                        col.align === "right" && "text-right",
                        col.align === "center" && "text-center",
                        col.hiddenOnMobile && "hidden md:table-cell",
                        col.sortable && "cursor-pointer select-none hover:text-[var(--text-primary)]",
                        col.headerClassName,
                      )}
                      onClick={() => {
                        if (!col.sortable) return;
                        setSort((s) =>
                          s?.key === col.key
                            ? s.dir === "asc"
                              ? { key: col.key, dir: "desc" }
                              : null
                            : { key: col.key, dir: "asc" },
                        );
                      }}
                    >
                      <span className={cn("inline-flex items-center gap-1", col.align === "right" && "flex-row-reverse")}>
                        {col.header}
                        {col.sortable &&
                          (sort?.key === col.key ? (
                            sort.dir === "asc" ? (
                              <ArrowUp className="h-3 w-3" />
                            ) : (
                              <ArrowDown className="h-3 w-3" />
                            )
                          ) : (
                            <ChevronsUpDown className="h-3 w-3 opacity-40" />
                          ))}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((row, index) => (
                  <tr
                    key={keyExtractor(row)}
                    onClick={() => onRowClick?.(row)}
                    className={cn(
                      onRowClick && "cursor-pointer",
                      rowClassName?.(row),
                    )}
                  >
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={cn(
                          col.align === "right" && "text-right",
                          col.align === "center" && "text-center",
                          col.hiddenOnMobile && "hidden md:table-cell",
                          col.className,
                        )}
                      >
                        {col.cell(row, index)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pagination && (
            <Pagination
              page={pagination.page}
              pageSize={pagination.pageSize}
              total={pagination.total}
              onPageChange={pagination.onPageChange}
            />
          )}
          {footer}
        </>
      )}
    </div>
  );
}
