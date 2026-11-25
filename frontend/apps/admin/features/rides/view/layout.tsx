"use client";

import { cn } from "@vsolve/ui";
import type { ReactNode } from "react";

import { filterChipStyles } from "@/features/money/service-tabs";

import { VEHICLE_TYPES } from "../model";

/** "Bike", "Auto", "Cab": the full word for a vehicle code, never the code itself. */
export function vehicleLabel(code: string | null | undefined): string {
  return VEHICLE_TYPES.find((type) => type.code === code)?.label ?? code ?? "—";
}

/** A server code such as `PENDING_REVIEW` or `rider` as plain words: "Pending review", "Rider". */
export function codeText(code: string | null | undefined): string {
  if (!code) return "—";
  const words = code.replace(/_/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** A captain's application: green once approved, amber while waiting, grey otherwise. */
export function approvalTone(code: string): "success" | "warning" | "neutral" {
  if (code === "APPROVED") return "success";
  if (code.includes("PENDING") || code.includes("REVIEW") || code === "SUBMITTED") return "warning";
  return "neutral";
}

/** The row above every Rides list: filters on the left, the one main action on the right. */
export function Toolbar({ children, action }: { children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">{children}</div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/** A named group of filter chips, one of them chosen. */
export function FilterGroup<K extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { key: K; label: string }[];
  value: K;
  onChange: (key: K) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-text-secondary">{label}</span>
      <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.key}
            type="button"
            aria-pressed={option.key === value}
            className={filterChipStyles(option.key === value)}
            onClick={() => onChange(option.key)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** One table style for every Rides list: plain-case headings, even spacing, a hover on each row. */
export function Table({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-line bg-surface-sunken">
          <tr>{head}</tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}

export function Th({ children, numeric }: { children?: ReactNode; numeric?: boolean }) {
  return (
    <th
      scope="col"
      className={cn("whitespace-nowrap px-4 py-3 text-xs font-semibold text-text-secondary", numeric && "text-right")}
    >
      {children}
    </th>
  );
}

export function Td({ children, numeric, className }: { children?: ReactNode; numeric?: boolean; className?: string }) {
  return (
    <td className={cn("px-4 py-3 align-top", numeric && "whitespace-nowrap text-right tabular-nums", className)}>
      {children}
    </td>
  );
}

/** A main line with a quieter line under it, for a cell that holds two facts. */
export function Stacked({ main, sub }: { main: ReactNode; sub?: ReactNode }) {
  return (
    <>
      <div className="font-medium text-text">{main}</div>
      {sub ? <div className="mt-0.5 text-xs text-text-secondary">{sub}</div> : null}
    </>
  );
}
