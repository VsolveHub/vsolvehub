"use client";

import { useCallback, useId, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, Coffee, Layers, Wind } from "lucide-react";
import { cn, Skeleton } from "@vsolve/ui";

import { fetchStayTaxonomy } from "../queries";

export interface ActiveFilters {
  ac?: boolean;
  food?: boolean;
  minPrice?: number;
  maxPrice?: number;
  tenantPreference?: string;
  categorySlug?: string;
  serviceSlug?: string;
}

interface StayFiltersProps {
  activeFilters: ActiveFilters;
  onChangeFilter: (filters: ActiveFilters) => void;
  /** `null` while the list is still loading. */
  count: number | null;
}

/** Paise range constants for the slider. 0 – ₹20,000/mo */
const SLIDER_MIN_PAISE = 0;
const SLIDER_MAX_PAISE = 2_000_000; // ₹20,000

function paiseToDisplay(paise: number): string {
  const rupees = paise / 100;
  if (rupees >= 1000) return `₹${(rupees / 1000).toFixed(rupees % 1000 === 0 ? 0 : 1)}k`;
  return `₹${rupees}`;
}

function PriceRangeSlider({
  min,
  max,
  onChange,
}: {
  min: number;
  max: number;
  onChange: (min: number, max: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const idMin = useId();
  const idMax = useId();

  const minPct = ((min - SLIDER_MIN_PAISE) / (SLIDER_MAX_PAISE - SLIDER_MIN_PAISE)) * 100;
  const maxPct = ((max - SLIDER_MIN_PAISE) / (SLIDER_MAX_PAISE - SLIDER_MIN_PAISE)) * 100;

  const handleMin = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = Number(e.target.value);
      onChange(Math.min(value, max - 10000), max);
    },
    [max, onChange],
  );

  const handleMax = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = Number(e.target.value);
      onChange(min, Math.max(value, min + 10000));
    },
    [min, onChange],
  );

  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-line bg-surface p-3">
      <div className="flex items-center justify-between text-xs font-semibold text-text">
        <span>Price range / month</span>
        <span className="tabular-nums text-action">
          {paiseToDisplay(min)} –{" "}
          {max >= SLIDER_MAX_PAISE ? `${paiseToDisplay(SLIDER_MAX_PAISE)}+` : paiseToDisplay(max)}
        </span>
      </div>
      {/* Double-thumb range — two overlapping inputs share the same track */}
      <div ref={trackRef} className="relative h-5 w-full">
        {/* Inactive track */}
        <div className="absolute top-1/2 h-1.5 w-full -translate-y-1/2 rounded-full bg-line" />
        {/* Active range highlight */}
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-action"
          style={{ left: `${minPct}%`, width: `${maxPct - minPct}%` }}
        />
        {/* Min thumb */}
        <input
          id={idMin}
          type="range"
          min={SLIDER_MIN_PAISE}
          max={SLIDER_MAX_PAISE}
          step={10000}
          value={min}
          onChange={handleMin}
          className="pointer-events-none absolute inset-0 h-full w-full appearance-none bg-transparent [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-action [&::-moz-range-thumb]:bg-surface [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-action [&::-webkit-slider-thumb]:bg-surface [&::-webkit-slider-thumb]:shadow-xs"
          aria-label="Minimum price"
        />
        {/* Max thumb */}
        <input
          id={idMax}
          type="range"
          min={SLIDER_MIN_PAISE}
          max={SLIDER_MAX_PAISE}
          step={10000}
          value={max}
          onChange={handleMax}
          className="pointer-events-none absolute inset-0 h-full w-full appearance-none bg-transparent [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-action [&::-moz-range-thumb]:bg-surface [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-action [&::-webkit-slider-thumb]:bg-surface [&::-webkit-slider-thumb]:shadow-xs"
          aria-label="Maximum price"
        />
      </div>
      <div className="flex justify-between text-[11px] text-text-secondary/70">
        <span>{paiseToDisplay(SLIDER_MIN_PAISE)}</span>
        <span>{paiseToDisplay(SLIDER_MAX_PAISE)}+</span>
      </div>
    </div>
  );
}

export function StayFilters({ activeFilters, onChangeFilter, count }: StayFiltersProps) {
  const { data: taxonomy = [], isLoading } = useQuery({
    queryKey: ["stayTaxonomy"],
    queryFn: fetchStayTaxonomy,
    staleTime: 5 * 60 * 1000,
  });

  const isAll = !activeFilters.categorySlug && !activeFilters.serviceSlug;

  const toggleAc = () => {
    onChangeFilter({ ...activeFilters, ac: activeFilters.ac ? undefined : true });
  };

  const toggleFood = () => {
    onChangeFilter({ ...activeFilters, food: activeFilters.food ? undefined : true });
  };

  const setCategory = (slug?: string) => {
    onChangeFilter({ ...activeFilters, categorySlug: slug, serviceSlug: undefined });
  };

  const setService = (slug: string) => {
    onChangeFilter({ ...activeFilters, serviceSlug: slug });
  };

  const hasPriceFilter =
    (activeFilters.minPrice ?? 0) > SLIDER_MIN_PAISE ||
    (activeFilters.maxPrice ?? SLIDER_MAX_PAISE) < SLIDER_MAX_PAISE;

  const activeCategory = taxonomy.find((cat) => cat.slug === activeFilters.categorySlug);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        {/* Row 1: Categories + Amenity quick-filters */}
        {/* One swipeable row on phones: wrapped, a dozen categories became six rows of
            chips above the first listing. Wraps as before from `sm` up. */}
        <div className="-mx-4 flex flex-nowrap items-center gap-2 overflow-x-auto px-4 pb-1 no-scrollbar sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0 [&>*]:shrink-0 [&>button]:whitespace-nowrap">
          <button
            type="button"
            onClick={() => setCategory(undefined)}
            className={cn(
              "inline-flex min-h-11 items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition",
              isAll
                ? "bg-action text-white shadow-xs"
                : "bg-surface border border-line text-text-secondary hover:border-line-strong hover:text-text",
            )}
          >
            <Layers className="size-3.5" />
            All Stays
          </button>

          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-24 rounded-full" />
            ))
          ) : (
            taxonomy.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategory(cat.slug)}
                className={cn(
                  "inline-flex min-h-11 items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition",
                  activeFilters.categorySlug === cat.slug
                    ? "bg-action text-white shadow-xs"
                    : "bg-surface border border-line text-text-secondary hover:border-line-strong hover:text-text",
                )}
              >
                {cat.name}
              </button>
            ))
          )}

          <div className="h-6 w-px bg-line mx-1" />

          <button
            type="button"
            onClick={toggleAc}
            className={cn(
              "inline-flex min-h-11 items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition",
              activeFilters.ac
                ? "bg-action text-white shadow-xs"
                : "bg-surface border border-line text-text-secondary hover:border-line-strong hover:text-text",
            )}
          >
            <Wind className="size-3.5" />
            AC Included
          </button>

          <button
            type="button"
            onClick={toggleFood}
            className={cn(
              "inline-flex min-h-11 items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition",
              activeFilters.food
                ? "bg-action text-white shadow-xs"
                : "bg-surface border border-line text-text-secondary hover:border-line-strong hover:text-text",
            )}
          >
            <Coffee className="size-3.5" />
            Meals Included
          </button>

          {/* Price range toggle chip */}
          <button
            type="button"
            onClick={() =>
              hasPriceFilter
                ? onChangeFilter({ ...activeFilters, minPrice: undefined, maxPrice: undefined })
                : onChangeFilter({
                    ...activeFilters,
                    minPrice: SLIDER_MIN_PAISE,
                    maxPrice: SLIDER_MAX_PAISE,
                  })
            }
            className={cn(
              "inline-flex min-h-11 items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition",
              hasPriceFilter
                ? "bg-action text-white shadow-xs"
                : "bg-surface border border-line text-text-secondary hover:border-line-strong hover:text-text",
            )}
          >
            <Building2 className="size-3.5" />
            {hasPriceFilter ? "Price range ✕" : "Price range"}
          </button>
        </div>

        {/* Tenant preference chips */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wide text-text-muted">For</span>
          {([
            { value: "", label: "Anyone" },
            { value: "BACHELOR_MALE", label: "Bachelor (M)" },
            { value: "BACHELOR_FEMALE", label: "Ladies" },
            { value: "FAMILY", label: "Family" },
            { value: "WORKING_PROFESSIONAL", label: "Professional" },
          ] as const).map(({ value, label }) => (
            <button
              key={value || "any"}
              type="button"
              onClick={() =>
                onChangeFilter({
                  ...activeFilters,
                  tenantPreference: value || undefined,
                })
              }
              className={cn(
                "inline-flex min-h-11 items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold transition",
                (activeFilters.tenantPreference ?? "") === value
                  ? "bg-navy-900 text-warm-0 shadow-xs"
                  : "bg-surface border border-line text-text-secondary hover:border-line-strong hover:text-text",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Price range slider — revealed when the chip is active */}
        {hasPriceFilter && (
          <PriceRangeSlider
            min={activeFilters.minPrice ?? SLIDER_MIN_PAISE}
            max={activeFilters.maxPrice ?? SLIDER_MAX_PAISE}
            onChange={(min, max) =>
              onChangeFilter({
                ...activeFilters,
                minPrice: min > SLIDER_MIN_PAISE ? min : undefined,
                maxPrice: max < SLIDER_MAX_PAISE ? max : undefined,
              })
            }
          />
        )}

        {/* Row 2: Sub-categories within the chosen category */}
        {activeCategory && activeCategory.services && activeCategory.services.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {activeCategory.services.map((svc) => (
              <button
                key={svc.id}
                type="button"
                onClick={() => setService(svc.slug)}
                className={cn(
                  "inline-flex min-h-11 items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold transition",
                  activeFilters.serviceSlug === svc.slug
                    ? "bg-text text-surface shadow-xs"
                    : "bg-surface-sunken border border-line text-text-secondary hover:border-line-strong hover:text-text",
                )}
              >
                {svc.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-text-secondary font-medium px-1">
        {/* `null` while the list loads: "Showing 0" read as "nothing here". */}
        {count === null ? (
          <span>Loading stays…</span>
        ) : (
          <span>
            Showing <strong className="text-text font-bold">{count}</strong> verified propert
            {count === 1 ? "y" : "ies"}
          </span>
        )}
        <span>Transparent date quotes · Direct host communication</span>
      </div>
    </div>
  );
}
