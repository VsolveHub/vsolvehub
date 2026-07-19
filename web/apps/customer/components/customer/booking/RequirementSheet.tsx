"use client";

// ─────────────────────────────────────────────────────────────────────────────
// RequirementSheet — the priced requirement configurator.
//
// The catalog advertises "Starts at ₹X"; this is where the customer turns that
// into an exact number. Every tap re-runs the same pure estimatePrice() the
// server uses, so the footer total is never a guess — it is the amount that will
// be authorized, subject to a server-side recompute at submit.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { formatPrice } from "@/lib/format";
import { estimatePrice, type PricedDetailField, type Selections } from "@/lib/catalog/pricing";

type Props = {
  serviceName: string;
  durationMins?: number;
  fields: PricedDetailField[];
  value: Selections;
  onChange: (next: Selections) => void;
  onDone?: () => void;
  doneLabel?: string;
  /** Field keys that failed validation, highlighted inline. */
  fieldErrors?: Record<string, boolean>;
  /** Hide the sticky footer when the parent supplies its own action bar. */
  showFooter?: boolean;
};

export function RequirementSheet({
  serviceName,
  durationMins = 0,
  fields,
  value,
  onChange,
  onDone,
  doneLabel = "Done",
  fieldErrors = {},
  showFooter = true,
}: Props) {
  const estimate = useMemo(() => estimatePrice(fields, value), [fields, value]);
  const priced = useMemo(() => fields.filter((f) => f.type !== "text"), [fields]);
  const [openKey, setOpenKey] = useState(priced[0]?.key ?? "");

  function set(key: string, next: string | number | string[]) {
    onChange({ ...value, [key]: next });
  }

  function toggleAddon(key: string, option: string) {
    const current = Array.isArray(value[key]) ? (value[key] as string[]) : [];
    set(key, current.includes(option) ? current.filter((v) => v !== option) : [...current, option]);
  }

  /** One-line summary of the current choice, shown collapsed. */
  function summaryFor(field: PricedDetailField): string {
    const raw = value[field.key];
    if (field.type === "addons") {
      const picked = Array.isArray(raw) ? raw : [];
      return picked.length ? `${picked.length} selected` : "None";
    }
    if (field.type === "counter") return String(Number(raw ?? field.min ?? 0));
    return String(raw ?? "");
  }

  const missingRequired = fields.some((f) => {
    if (!f.required) return false;
    const raw = value[f.key];
    if (Array.isArray(raw)) return raw.length === 0;
    return raw === undefined || raw === null || String(raw).trim() === "";
  });

  return (
    <div className="flex flex-col bg-white">
      <header className="border-b border-gray-100 pb-4">
        <h2 className="text-2xl font-extrabold text-gray-900">{serviceName}</h2>
        <p className="mt-1 text-sm text-gray-500">
          Starts at <strong className="text-gray-900">{formatPrice(estimate.basePaise)}</strong>
          {durationMins > 0 && <> · {durationMins} mins</>}
        </p>
      </header>

      <div className="py-4">
        <h3 className="mb-2 text-xl font-extrabold text-gray-900">Select requirements</h3>

        {priced.map((field) => {
          const open = openKey === field.key;
          const invalid = fieldErrors[field.key];
          return (
            <section
              key={field.key}
              className={`border-b border-gray-100 py-4 ${
                invalid ? "rounded-lg outline outline-[1.5px] outline-offset-4 outline-danger" : ""
              }`}
            >
              <button
                type="button"
                onClick={() => setOpenKey(open ? "" : field.key)}
                className="flex w-full items-center justify-between gap-3 text-left"
                aria-expanded={open}
              >
                <span className="text-base font-bold text-gray-900">
                  {field.label}
                  {field.required && (
                    <span aria-hidden className="ml-1 text-danger">
                      *
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-2">
                  {!open && (
                    <span className="max-w-[10rem] truncate text-xs font-semibold text-gray-500">
                      {summaryFor(field)}
                    </span>
                  )}
                  <span aria-hidden className="text-gray-400">
                    {open ? "⌃" : "⌄"}
                  </span>
                </span>
              </button>

              {open && field.type === "variant" && (
                <div className="mt-3 flex gap-3 overflow-x-auto pb-1">
                  {field.options.map((o) => {
                    const selected = value[field.key] === o.value;
                    return (
                      <button
                        key={o.value}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => set(field.key, o.value)}
                        className={`min-w-[10rem] shrink-0 rounded-xl border-2 p-3 text-left transition ${
                          selected ? "border-brand bg-brand/5" : "border-gray-200 bg-white"
                        }`}
                      >
                        <span className="block text-sm font-bold text-gray-900">{o.value}</span>
                        {o.description && (
                          <span className="mt-1 block text-xs text-gray-500">{o.description}</span>
                        )}
                        <span className="mt-2 block text-sm font-extrabold text-gray-900">
                          {formatPrice(o.pricePaise)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {open && field.type === "addons" && (
                <div className="mt-3 flex flex-col gap-2">
                  {field.options.map((o) => {
                    const checked = (value[field.key] as string[] | undefined)?.includes(o.value);
                    return (
                      <label
                        key={o.value}
                        className="flex cursor-pointer items-center gap-3 rounded-xl border border-gray-200 p-3"
                      >
                        <input
                          type="checkbox"
                          checked={!!checked}
                          onChange={() => toggleAddon(field.key, o.value)}
                          className="h-4 w-4"
                        />
                        <span className="flex-1">
                          <span className="block text-sm font-semibold text-gray-900">{o.value}</span>
                          {o.description && (
                            <span className="block text-xs text-gray-500">{o.description}</span>
                          )}
                        </span>
                        <span className="text-sm font-bold text-gray-900">
                          +{formatPrice(o.pricePaise)}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}

              {open && field.type === "counter" && (
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-sm text-gray-600">
                    {field.perUnitPaise ? `${formatPrice(field.perUnitPaise)} each` : "Included"}
                  </span>
                  <div className="flex items-center gap-4 rounded-full border border-gray-100 bg-gray-50 p-1">
                    <button
                      type="button"
                      aria-label={`Decrease ${field.label}`}
                      onClick={() =>
                        set(field.key, Math.max(field.min ?? 0, Number(value[field.key] ?? 0) - 1))
                      }
                      className="h-8 w-8 rounded-full border border-gray-200 bg-white font-bold text-gray-700"
                    >
                      −
                    </button>
                    <span className="w-6 text-center font-extrabold text-brand">
                      {Number(value[field.key] ?? field.min ?? 0)}
                    </span>
                    <button
                      type="button"
                      aria-label={`Increase ${field.label}`}
                      onClick={() =>
                        set(field.key, Math.min(field.max ?? 99, Number(value[field.key] ?? 0) + 1))
                      }
                      className="h-8 w-8 rounded-full border border-gray-200 bg-white font-bold text-gray-700"
                    >
                      +
                    </button>
                  </div>
                </div>
              )}

              {open && field.type === "select" && (
                <div className="mt-3">
                  {field.variant === "dropdown" || (field.variant !== "pills" && field.options.length > 4) ? (
                    <select
                      className="w-full rounded-xl border border-gray-200 bg-white p-3 text-sm"
                      value={String(value[field.key] ?? field.defaultValue ?? "")}
                      onChange={(e) => set(field.key, e.target.value)}
                      aria-label={field.label}
                    >
                      {field.options.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.value}
                          {o.priceDeltaPaise ? ` (+${formatPrice(o.priceDeltaPaise)})` : ""}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {field.options.map((o) => {
                        const selected = value[field.key] === o.value;
                        return (
                          <button
                            key={o.value}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => set(field.key, o.value)}
                            className={`rounded-full border px-4 py-2 text-xs font-bold transition ${
                              selected
                                ? "border-brand bg-brand text-white"
                                : "border-gray-200 bg-white text-gray-700"
                            }`}
                          >
                            {o.value}
                            {o.priceDeltaPaise ? ` +${formatPrice(o.priceDeltaPaise)}` : ""}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {showFooter && (
        <footer className="sticky bottom-0 flex items-center gap-4 border-t border-gray-100 bg-white py-4">
          <div>
            <p className="text-lg font-extrabold text-gray-900">{formatPrice(estimate.totalPaise)}</p>
            <p className="text-[11px] text-gray-500">Estimated · confirmed before payment</p>
          </div>
          <button
            type="button"
            onClick={onDone}
            disabled={missingRequired}
            className="ml-auto flex-1 rounded-xl bg-brand py-3 text-base font-bold text-white transition disabled:bg-gray-200 disabled:text-gray-400"
          >
            {doneLabel}
          </button>
        </footer>
      )}
    </div>
  );
}
