"use client";

// ─────────────────────────────────────────────────────────────────────────────
// RequirementSheet — the priced requirement configurator.
//
// The catalog advertises "Starts at ₹X"; this is where the customer turns that
// into an exact number. Every tap re-runs the same pure estimatePrice() the
// server uses, so the total is never a guess.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState, useRef, useEffect } from "react";
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

/** Horizontal card carousel for Scope options with scroll controls & progress bar. */
function ScopeCardList({
  field,
  selectedValue,
  onSelect,
}: {
  field: Extract<PricedDetailField, { type: "variant" | "select" }>;
  selectedValue: unknown;
  onSelect: (val: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  function checkScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    setCanScrollLeft(el.scrollLeft > 5);
    setCanScrollRight(maxScroll - el.scrollLeft > 5);
    if (maxScroll > 0) {
      setScrollProgress(Math.min(1, Math.max(0, el.scrollLeft / maxScroll)));
    } else {
      setScrollProgress(1);
    }
  }

  useEffect(() => {
    checkScroll();
    window.addEventListener("resize", checkScroll);
    return () => window.removeEventListener("resize", checkScroll);
  }, [field]);

  function scroll(direction: "left" | "right") {
    const el = scrollRef.current;
    if (!el) return;
    const distance = 240;
    el.scrollBy({ left: direction === "left" ? -distance : distance, behavior: "smooth" });
  }

  return (
    <div className="relative mt-3">
      {/* Cards Scroll Container */}
      <div
        ref={scrollRef}
        onScroll={checkScroll}
        className="flex gap-3 overflow-x-auto hide-scrollbar scroll-smooth py-1.5 px-0.5"
      >
        {field.options.map((o) => {
          const selected = selectedValue === o.value;
          const description = "description" in o ? o.description : undefined;
          const price = ("pricePaise" in o ? o.pricePaise : ("priceDeltaPaise" in o ? o.priceDeltaPaise : 0)) ?? 0;
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(o.value)}
              className={`w-[210px] sm:w-[235px] shrink-0 text-left rounded-[12px] p-4 flex flex-col justify-between transition-all cursor-pointer ${
                selected
                  ? "border-2 border-[#0f172a] bg-slate-50/90 shadow-sm"
                  : "border border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"
              }`}
            >
              <div>
                <span className="block text-sm font-bold text-slate-900 leading-snug">{o.value}</span>
                {description && (
                  <span className="mt-1 block text-xs text-slate-500 font-normal leading-relaxed line-clamp-2">
                    {description}
                  </span>
                )}
              </div>
              <span className="mt-4 block text-sm font-extrabold text-slate-900">
                {formatPrice(price)}
              </span>
            </button>
          );
        })}
      </div>

      {/* Nav Controls & Scroll Progress Bar (shown if cards overflow) */}
      {(canScrollLeft || canScrollRight) && (
        <div className="mt-3 flex items-center justify-between gap-4">
          <div className="h-1 flex-1 max-w-[100px] bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-slate-400 transition-all duration-150 rounded-full"
              style={{ width: `${Math.max(25, scrollProgress * 100)}%` }}
            />
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={!canScrollLeft}
              onClick={() => scroll("left")}
              aria-label="Scroll left"
              className="w-7 h-7 rounded-full bg-white border border-slate-200 shadow-sm text-slate-600 flex items-center justify-center hover:bg-slate-50 disabled:opacity-30 disabled:pointer-events-none transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              type="button"
              disabled={!canScrollRight}
              onClick={() => scroll("right")}
              aria-label="Scroll right"
              className="w-7 h-7 rounded-full bg-white border border-slate-200 shadow-sm text-slate-600 flex items-center justify-center hover:bg-slate-50 disabled:opacity-30 disabled:pointer-events-none transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

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

  // Independent open state for each section key so toggling one doesn't affect others
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    priced.forEach((f, idx) => {
      // Scope (first section) open by default, Add-ons collapsed by default
      init[f.key] = idx === 0;
    });
    return init;
  });

  function toggleSection(key: string) {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function set(key: string, next: string | number | string[]) {
    onChange({ ...value, [key]: next });
  }

  function toggleAddon(key: string, option: string) {
    const current = Array.isArray(value[key]) ? (value[key] as string[]) : [];
    set(key, current.includes(option) ? current.filter((v) => v !== option) : [...current, option]);
  }

  /** One-line summary of the current choice, shown when section is collapsed. */
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
      {showFooter && (
        <header className="border-b border-gray-100 pb-4 mb-2">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">{serviceName}</h2>
          <p className="mt-1 text-sm text-slate-500 font-medium">
            Starts at <strong className="text-slate-900 font-bold">{formatPrice(estimate.basePaise)}</strong>
            {durationMins > 0 && <> · {durationMins} mins</>}
          </p>
        </header>
      )}

      <div className="py-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-4">
          {priced.map((field) => {
            const open = !!openSections[field.key];
            const invalid = fieldErrors[field.key];
            return (
              <div key={field.key} className="flex flex-col">
                <label className="text-xs font-bold uppercase tracking-wider text-[#45464d] mb-2 block">
                  {field.label}
                  {field.required && <span className="ml-1 text-red-500">*</span>}
                </label>

                {/* Dropdown Header Box */}
                <button
                  type="button"
                  onClick={() => toggleSection(field.key)}
                  className={`h-12 w-full rounded-[8px] border bg-[#f8f9ff] px-4 font-semibold text-[#0b1c30] text-sm flex items-center justify-between cursor-pointer transition-all hover:bg-slate-100/60 ${
                    invalid
                      ? "border-red-500"
                      : open
                        ? "border-[#006b5f] ring-2 ring-[#006b5f]/15"
                        : "border-[#c6c6cd]"
                  }`}
                  aria-expanded={open}
                >
                  <span className="truncate pr-2">
                    {summaryFor(field)}
                  </span>
                  <svg
                    className={`w-4 h-4 text-[#76777d] shrink-0 transition-transform duration-200 ${
                      open ? "rotate-180" : ""
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth="2"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Expanded Scope Options */}
                {open && (field.type === "variant" || field.type === "select") && (
                  <ScopeCardList
                    field={field}
                    selectedValue={value[field.key] ?? ("defaultValue" in field ? field.defaultValue : undefined)}
                    onSelect={(val) => set(field.key, val)}
                  />
                )}

                {/* Expanded Add-on Options */}
                {open && field.type === "addons" && (
                  <div className="mt-3 space-y-2.5">
                    {field.options.map((o) => {
                      const checked = (value[field.key] as string[] | undefined)?.includes(o.value);
                      return (
                        <label
                          key={o.value}
                          className={`flex cursor-pointer items-center justify-between gap-3 rounded-[8px] p-3 transition-colors ${
                            checked
                              ? "border border-[#006b5f] bg-[#e6f4f1]/50"
                              : "border border-[#c6c6cd] bg-white hover:bg-[#f8f9ff]"
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <input
                              type="checkbox"
                              checked={!!checked}
                              onChange={() => toggleAddon(field.key, o.value)}
                              className="h-4 w-4 rounded border-[#c6c6cd] text-[#006b5f] accent-[#006b5f] focus:ring-[#006b5f]"
                            />
                            <div className="min-w-0 flex-1">
                              <span className="block text-sm font-semibold text-[#0b1c30]">{o.value}</span>
                              {o.description && (
                                <span className="block text-xs font-normal text-[#45464d] mt-0.5 truncate">
                                  {o.description}
                                </span>
                              )}
                            </div>
                          </div>
                          <span className="text-sm font-extrabold text-[#0b1c30] shrink-0">
                            +{formatPrice(o.pricePaise)}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}

                {/* Expanded Counter Option */}
                {open && field.type === "counter" && (
                  <div className="mt-3 flex items-center justify-between rounded-[8px] border border-[#c6c6cd] bg-[#f8f9ff] p-3">
                    <span className="text-xs font-semibold text-[#45464d]">
                      {field.perUnitPaise ? `${formatPrice(field.perUnitPaise)} each` : "Included"}
                    </span>
                    <div className="flex items-center gap-3 rounded-full bg-white p-1 border border-slate-200">
                      <button
                        type="button"
                        aria-label={`Decrease ${field.label}`}
                        onClick={() =>
                          set(field.key, Math.max(field.min ?? 0, Number(value[field.key] ?? 0) - 1))
                        }
                        className="h-7 w-7 rounded-full bg-slate-100 font-bold text-[#0b1c30] hover:bg-slate-200 transition-colors flex items-center justify-center text-xs"
                      >
                        −
                      </button>
                      <span className="w-5 text-center text-xs font-bold text-[#0b1c30]">
                        {Number(value[field.key] ?? field.min ?? 0)}
                      </span>
                      <button
                        type="button"
                        aria-label={`Increase ${field.label}`}
                        onClick={() =>
                          set(field.key, Math.min(field.max ?? 99, Number(value[field.key] ?? 0) + 1))
                        }
                        className="h-7 w-7 rounded-full bg-slate-100 font-bold text-[#0b1c30] hover:bg-slate-200 transition-colors flex items-center justify-center text-xs"
                      >
                        +
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {showFooter && (
        <footer className="sticky bottom-0 flex items-center gap-4 border-t border-slate-100 bg-white py-4 mt-4">
          <div>
            <p className="text-lg font-extrabold text-slate-900">{formatPrice(estimate.totalPaise)}</p>
            <p className="text-[11px] text-slate-500">Estimated · confirmed before payment</p>
          </div>
          <button
            type="button"
            onClick={onDone}
            disabled={missingRequired}
            className="ml-auto flex-1 rounded-full bg-[#0f172a] py-3 text-sm font-bold text-white transition hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400"
          >
            {doneLabel}
          </button>
        </footer>
      )}
    </div>
  );
}
