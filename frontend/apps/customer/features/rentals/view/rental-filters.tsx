"use client";

import { useCallback, useId, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { IndianRupee, Layers } from "lucide-react";
import { cn, Skeleton } from "@vsolve/ui";

import { fetchRentalTaxonomy } from "../queries";

export interface ActiveRentalFilters {
  categorySlug?: string;
  serviceSlug?: string;
  minPrice?: number;
  maxPrice?: number;
}

interface RentalFiltersProps {
  activeFilters: ActiveRentalFilters;
  onChangeFilter: (filters: ActiveRentalFilters) => void;
  count: number;
}

interface TaxonomyCategory {
  id: number | string;
  name: string;
  slug: string;
  services: {
    id: number | string;
    name: string;
    slug: string;
  }[];
}

/** Paise range constants for the slider. 0 – ₹5,000/day */
const SLIDER_MIN_PAISE = 0;
const SLIDER_MAX_PAISE = 500_000; // ₹5,000 / day

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
      onChange(Math.min(value, max - 5000), max);
    },
    [max, onChange],
  );

  const handleMax = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = Number(e.target.value);
      onChange(min, Math.max(value, min + 5000));
    },
    [min, onChange],
  );

  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-line bg-surface p-3">
      <div className="flex items-center justify-between text-xs font-semibold text-text">
        <span>Daily rate range</span>
        <span className="tabular-nums text-action">
          {paiseToDisplay(min)} –{" "}
          {max >= SLIDER_MAX_PAISE ? `${paiseToDisplay(SLIDER_MAX_PAISE)}+` : paiseToDisplay(max)}
        </span>
      </div>
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
          step={5000}
          value={min}
          onChange={handleMin}
          className="pointer-events-none absolute inset-0 h-full w-full appearance-none bg-transparent [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-action [&::-moz-range-thumb]:bg-surface [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-action [&::-webkit-slider-thumb]:bg-surface [&::-webkit-slider-thumb]:shadow-xs"
          aria-label="Minimum daily rate"
        />
        {/* Max thumb */}
        <input
          id={idMax}
          type="range"
          min={SLIDER_MIN_PAISE}
          max={SLIDER_MAX_PAISE}
          step={5000}
          value={max}
          onChange={handleMax}
          className="pointer-events-none absolute inset-0 h-full w-full appearance-none bg-transparent [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-action [&::-moz-range-thumb]:bg-surface [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-action [&::-webkit-slider-thumb]:bg-surface [&::-webkit-slider-thumb]:shadow-xs"
          aria-label="Maximum daily rate"
        />
      </div>
      <div className="flex justify-between text-[11px] text-text-secondary/70">
        <span>{paiseToDisplay(SLIDER_MIN_PAISE)}</span>
        <span>{paiseToDisplay(SLIDER_MAX_PAISE)}+</span>
      </div>
    </div>
  );
}

export function RentalFilters({ activeFilters, onChangeFilter, count }: RentalFiltersProps) {
  const { data: taxonomy = [], isLoading } = useQuery({
    queryKey: ["rentalTaxonomy"],
    queryFn: fetchRentalTaxonomy,
    staleTime: 5 * 60 * 1000,
  });

  const isAll = !activeFilters.categorySlug && !activeFilters.serviceSlug;

  const setCategory = (slug?: string) => {
    onChangeFilter({ ...activeFilters, categorySlug: slug, serviceSlug: undefined });
  };

  const setService = (slug: string) => {
    onChangeFilter({ ...activeFilters, serviceSlug: slug });
  };

  const hasPriceFilter =
    (activeFilters.minPrice ?? 0) > SLIDER_MIN_PAISE ||
    (activeFilters.maxPrice ?? SLIDER_MAX_PAISE) < SLIDER_MAX_PAISE;

  const activeCategory = (taxonomy as TaxonomyCategory[]).find(
    (cat) => cat.slug === activeFilters.categorySlug,
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        {/* Row 1: Categories */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setCategory(undefined)}
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition",
              isAll
                ? "bg-action text-white shadow-xs"
                : "bg-surface border border-line text-text-secondary hover:border-line-strong hover:text-text",
            )}
          >
            <Layers className="size-3.5" />
            All Equipment
          </button>

          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-[34px] w-24 rounded-full" />
            ))
          ) : (
            (taxonomy as TaxonomyCategory[]).map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategory(cat.slug)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition",
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

          {/* Price range toggle */}
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
              "inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition",
              hasPriceFilter
                ? "bg-action text-white shadow-xs"
                : "bg-surface border border-line text-text-secondary hover:border-line-strong hover:text-text",
            )}
          >
            <IndianRupee className="size-3.5" />
            {hasPriceFilter ? "Daily rate ✕" : "Daily rate"}
          </button>
        </div>

        {/* Price range slider */}
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

        {/* Row 2: Sub-categories */}
        {activeCategory && activeCategory.services && activeCategory.services.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {activeCategory.services.map((svc) => (
              <button
                key={svc.id}
                type="button"
                onClick={() => setService(svc.slug)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold transition",
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
        <span>
          Showing <strong className="text-text font-bold">{count}</strong> rental item
          {count === 1 ? "" : "s"}
        </span>
        <span>Standard Indian daily rental cycle (24h)</span>
      </div>
    </div>
  );
}
