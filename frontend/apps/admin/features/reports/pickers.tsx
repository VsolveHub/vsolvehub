"use client";

import { useMemo, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { Spinner, cn } from "@vsolve/ui";

import { usePartnerOptions, type ReportOption } from "./queries";

/**
 * Filter controls an admin picks from, never types a code into.
 *
 * `ChoicePicker` is a plain dropdown for a short list (statuses) and a searchable one for a
 * long list (869 services, grouped by category). `PartnerPicker` searches partners by name or
 * phone. Each shows "Any …" when nothing is chosen, and a × to clear.
 */

const SHORT_LIST = 15;
const MAX_SHOWN = 80;

const control =
  "h-9 w-full rounded-control border border-line-strong bg-surface px-3 text-sm text-text transition-colors hover:border-navy-700 focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-focus-ring";

export function ChoicePicker({
  id,
  label,
  options,
  value,
  onChange,
}: {
  id: string;
  label: string;
  options: ReportOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  if (options.length <= SHORT_LIST) {
    return (
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={control}>
        <option value="">Any {label.toLowerCase()}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }
  return (
    <SearchPicker
      id={id}
      label={label}
      value={value}
      selectedLabel={options.find((o) => o.value === value)?.label ?? ""}
      onChange={onChange}
      results={(term) => {
        const needle = term.trim().toLowerCase();
        const found = needle
          ? options.filter(
              (o) => o.label.toLowerCase().includes(needle) || o.group.toLowerCase().includes(needle),
            )
          : options;
        return { options: found.slice(0, MAX_SHOWN), more: Math.max(found.length - MAX_SHOWN, 0) };
      }}
    />
  );
}

export function PartnerPicker({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [term, setTerm] = useState("");
  const search = usePartnerOptions(term);
  // A partner chosen from a link or saved filter arrives as an id; ask the server its name.
  const chosen = usePartnerOptions("", value ? [value] : []);
  const chosenLabel = value ? (chosen.data?.[0]?.label ?? "Chosen partner") : "";
  return (
    <SearchPicker
      id={id}
      label={label}
      value={value}
      selectedLabel={chosenLabel}
      onChange={onChange}
      onTermChange={setTerm}
      hint="Type 2 or more letters of a name or phone."
      loading={search.isFetching}
      results={() => ({ options: term.trim().length >= 2 ? (search.data ?? []) : [], more: 0 })}
    />
  );
}

function SearchPicker({
  id,
  label,
  value,
  selectedLabel,
  onChange,
  results,
  onTermChange,
  hint,
  loading = false,
}: {
  id: string;
  label: string;
  value: string;
  selectedLabel: string;
  onChange: (value: string) => void;
  results: (term: string) => { options: ReportOption[]; more: number };
  onTermChange?: (term: string) => void;
  hint?: string;
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const { options, more } = results(term);
  const grouped = useMemo(() => {
    const groups = new Map<string, ReportOption[]>();
    for (const option of options) {
      const list = groups.get(option.group) ?? [];
      list.push(option);
      groups.set(option.group, list);
    }
    return [...groups.entries()];
  }, [options]);

  const typing = (next: string) => {
    setTerm(next);
    onTermChange?.(next);
    setOpen(true);
  };
  const pick = (next: string) => {
    onChange(next);
    setTerm("");
    onTermChange?.("");
    setOpen(false);
  };

  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-text-muted" aria-hidden />
        <input
          id={id}
          ref={input}
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          autoComplete="off"
          value={open ? term : selectedLabel}
          placeholder={`Any ${label.toLowerCase()}`}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          onChange={(e) => typing(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
          className={cn(control, "pl-8 pr-8")}
        />
        {value ? (
          <button
            type="button"
            aria-label={`Clear ${label.toLowerCase()}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => pick("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-text-muted hover:text-text"
          >
            <X className="size-3.5" />
          </button>
        ) : (
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-text-muted" aria-hidden />
        )}
      </div>
      {open ? (
        <div
          id={`${id}-list`}
          role="listbox"
          aria-label={label}
          className="absolute left-0 top-full z-30 mt-1 max-h-72 w-full min-w-64 overflow-auto rounded-control border border-line bg-surface py-1 shadow-md"
        >
          {loading ? (
            <p className="flex items-center gap-2 px-3 py-2 text-xs text-text-muted">
              <Spinner size="sm" /> Searching…
            </p>
          ) : options.length === 0 ? (
            <p className="px-3 py-2 text-xs text-text-muted">{hint && !term ? hint : "Nothing matches."}</p>
          ) : (
            grouped.map(([group, items]) => (
              <div key={group || "_"}>
                {group ? (
                  <p className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-text-muted">{group}</p>
                ) : null}
                {items.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={option.value === value}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(option.value)}
                    className={cn(
                      "block w-full px-3 py-1.5 text-left text-sm hover:bg-surface-hover",
                      option.value === value ? "font-semibold text-text" : "text-text-secondary",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            ))
          )}
          {more > 0 ? (
            <p className="px-3 py-2 text-[11px] text-text-muted">{more} more. Type to narrow the list.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
