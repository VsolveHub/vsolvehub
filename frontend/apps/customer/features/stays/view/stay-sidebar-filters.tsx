"use client";

import { useCallback, useId } from "react";
import { Coffee, RotateCcw, Search, Wind } from "lucide-react";
import { cn } from "@vsolve/ui";
import { PlaceFilter, type PlaceFilterValue } from "@vsolve/ui/location-picker";

import type { TaxonomyServiceItem } from "@/features/browse/taxonomy-tiles";
import { hasPoint } from "@/features/browse/nearby";
import { GOOGLE_MAPS_KEY } from "@/lib/google-maps";

const SLIDER_MIN_PAISE = 0;
const SLIDER_MAX_PAISE = 2_000_000; // ₹20,000 / month

function paiseToDisplay(paise: number): string {
  const rupees = paise / 100;
  if (rupees >= 1000) return `₹${(rupees / 1000).toFixed(rupees % 1000 === 0 ? 0 : 1)}k`;
  return `₹${rupees}`;
}

function SidebarPriceSlider({
  min,
  max,
  onChange,
}: {
  min: number;
  max: number;
  onChange: (min: number, max: number) => void;
}) {
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
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-[12px] font-semibold text-navy-900">
        <span>Price / month</span>
        <span className="tabular-nums text-[#EA580C]">
          {paiseToDisplay(min)} –{" "}
          {max >= SLIDER_MAX_PAISE ? `${paiseToDisplay(SLIDER_MAX_PAISE)}+` : paiseToDisplay(max)}
        </span>
      </div>
      <div className="relative h-5 w-full">
        <div className="absolute top-1/2 h-1.5 w-full -translate-y-1/2 rounded-full bg-[#e7e2da]" />
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-[#EA580C]"
          style={{ left: `${minPct}%`, width: `${maxPct - minPct}%` }}
        />
        <input
          id={idMin}
          type="range"
          min={SLIDER_MIN_PAISE}
          max={SLIDER_MAX_PAISE}
          step={10000}
          value={min}
          onChange={handleMin}
          aria-label="Minimum price"
          className="pointer-events-none absolute inset-0 h-full w-full appearance-none bg-transparent [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-[#EA580C] [&::-moz-range-thumb]:bg-white [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[#EA580C] [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-xs"
        />
        <input
          id={idMax}
          type="range"
          min={SLIDER_MIN_PAISE}
          max={SLIDER_MAX_PAISE}
          step={10000}
          value={max}
          onChange={handleMax}
          aria-label="Maximum price"
          className="pointer-events-none absolute inset-0 h-full w-full appearance-none bg-transparent [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-[#EA580C] [&::-moz-range-thumb]:bg-white [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[#EA580C] [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-xs"
        />
      </div>
      <div className="flex justify-between text-[10px] text-text-muted">
        <span>{paiseToDisplay(SLIDER_MIN_PAISE)}</span>
        <span>{paiseToDisplay(SLIDER_MAX_PAISE)}+</span>
      </div>
    </div>
  );
}

const TENANT_OPTIONS = [
  { value: "", label: "Anyone" },
  { value: "BACHELOR_MALE", label: "Bachelor (M)" },
  { value: "BACHELOR_FEMALE", label: "Ladies" },
  { value: "FAMILY", label: "Family" },
  { value: "WORKING_PROFESSIONAL", label: "Professional" },
] as const;

export interface StaySidebarFiltersProps {
  draftQuery: string;
  onDraftQueryChange: (q: string) => void;
  draftPlace: PlaceFilterValue;
  appliedPlace: PlaceFilterValue;
  onPlaceChange: (place: PlaceFilterValue, applyNow: boolean) => void;
  onSearchSubmit: (e: React.FormEvent) => void;
  sort: string;
  onSortChange: (sort: string) => void;
  ac?: boolean;
  onToggleAc: () => void;
  food?: boolean;
  onToggleFood: () => void;
  tenantPreference?: string;
  onTenantPreferenceChange: (pref?: string) => void;
  services: readonly TaxonomyServiceItem[];
  activeServiceSlug?: string;
  onSelectService: (slug?: string) => void;
  minPrice?: number;
  maxPrice?: number;
  onPriceChange: (min?: number, max?: number) => void;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
}

export function StaySidebarFilters({
  draftQuery,
  onDraftQueryChange,
  draftPlace,
  appliedPlace,
  onPlaceChange,
  onSearchSubmit,
  sort,
  onSortChange,
  ac,
  onToggleAc,
  food,
  onToggleFood,
  tenantPreference,
  onTenantPreferenceChange,
  services,
  activeServiceSlug,
  onSelectService,
  minPrice,
  maxPrice,
  onPriceChange,
  hasActiveFilters,
  onClearFilters,
}: StaySidebarFiltersProps) {
  const sortId = useId();

  return (
    <div className="rounded-[1.25rem] border border-[#e7e2da] bg-white px-3.5 pb-4 pt-3.5 flex flex-col gap-3.5">
      <div className="flex items-center gap-3">
        <h3 className="shrink-0 text-[13px] font-medium text-text-secondary">Filter stays</h3>
        <div className="h-px min-w-0 flex-1 bg-[#e7e2da]" />
        {hasActiveFilters ? (
          <button
            type="button"
            onClick={onClearFilters}
            className="inline-flex shrink-0 cursor-pointer items-center gap-1 text-[11px] font-bold text-[#EA580C] hover:text-[#C2410C]"
          >
            <RotateCcw className="size-3" />
            Reset
          </button>
        ) : null}
      </div>

      {/* Search & Location */}
      <form onSubmit={onSearchSubmit} className="flex flex-col gap-2">
        <label className="flex items-center gap-2 rounded-xl border border-[#e7e2da] bg-[#FAF9F7] px-3 focus-within:border-navy-900">
          <Search className="size-3.5 shrink-0 text-text-secondary" />
          <input
            type="search"
            value={draftQuery}
            onChange={(e) => onDraftQueryChange(e.target.value)}
            placeholder="Search PG, hostel, hotel..."
            className="w-full bg-transparent py-2 text-[13px] text-navy-900 placeholder:text-text-muted focus:outline-none"
          />
        </label>

        <PlaceFilter
          apiKey={GOOGLE_MAPS_KEY}
          value={draftPlace}
          onChange={onPlaceChange}
          placeholder="City or Area (e.g. Gachibowli)"
        />

        <button
          type="submit"
          className="h-9 w-full cursor-pointer rounded-lg bg-navy-900 text-[12px] font-bold text-white transition-colors hover:bg-navy-800"
        >
          Apply Search
        </button>
      </form>

      {/* Sort */}
      <div className="flex items-center justify-between gap-2 border-t border-[#e7e2da]/70 pt-3">
        <label htmlFor={sortId} className="text-[12px] font-semibold text-navy-900">
          Sort by
        </label>
        <select
          id={sortId}
          value={sort}
          onChange={(e) => onSortChange(e.target.value)}
          className="h-8 rounded-lg border border-[#e7e2da] bg-[#FAF9F7] px-2.5 text-[12px] font-semibold text-navy-900 focus:border-navy-900 focus:outline-none"
        >
          <option value="newest">{hasPoint(appliedPlace) ? "Nearest First" : "Newest First"}</option>
          <option value="price_asc">Price: Low to High</option>
          <option value="price_desc">Price: High to Low</option>
          <option value="rating_desc">Top Rated</option>
        </select>
      </div>

      {/* Quick Amenities */}
      <div className="flex flex-col gap-2 border-t border-[#e7e2da]/70 pt-3">
        <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
          Amenities
        </span>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={onToggleAc}
            className={cn(
              "inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors",
              ac
                ? "border border-[#EA580C] bg-[#FFF8F3] text-[#EA580C]"
                : "border border-[#e7e2da] bg-[#FAF9F7] text-navy-800 hover:border-navy-300",
            )}
          >
            <Wind className="size-3" />
            AC Included
          </button>
          <button
            type="button"
            onClick={onToggleFood}
            className={cn(
              "inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors",
              food
                ? "border border-[#EA580C] bg-[#FFF8F3] text-[#EA580C]"
                : "border border-[#e7e2da] bg-[#FAF9F7] text-navy-800 hover:border-navy-300",
            )}
          >
            <Coffee className="size-3" />
            Meals Included
          </button>
        </div>
      </div>

      {/* Tenant Preference */}
      <div className="flex flex-col gap-2 border-t border-[#e7e2da]/70 pt-3">
        <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
          For
        </span>
        <div className="flex flex-wrap gap-1.5">
          {TENANT_OPTIONS.map(({ value, label }) => {
            const active = (tenantPreference ?? "") === value;
            return (
              <button
                key={value || "any"}
                type="button"
                onClick={() => onTenantPreferenceChange(value || undefined)}
                className={cn(
                  "cursor-pointer rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors",
                  active
                    ? "bg-navy-900 text-white"
                    : "border border-[#e7e2da] bg-[#FAF9F7] text-navy-800 hover:border-navy-300",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Child Stay Sub-types (when a category tile is chosen) */}
      {services.length > 0 ? (
        <div className="flex flex-col gap-2 border-t border-[#e7e2da]/70 pt-3">
          <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
            Stay type
          </span>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => onSelectService(undefined)}
              className={cn(
                "cursor-pointer rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors",
                !activeServiceSlug
                  ? "border border-[#EA580C] bg-[#FFF8F3] text-[#EA580C]"
                  : "border border-[#e7e2da] bg-[#FAF9F7] text-navy-800 hover:border-navy-300",
              )}
            >
              All
            </button>
            {services.map((svc) => {
              const active = activeServiceSlug === svc.slug;
              return (
                <button
                  key={svc.id}
                  type="button"
                  onClick={() => onSelectService(active ? undefined : svc.slug)}
                  className={cn(
                    "cursor-pointer rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors",
                    active
                      ? "border border-[#EA580C] bg-[#FFF8F3] text-[#EA580C]"
                      : "border border-[#e7e2da] bg-[#FAF9F7] text-navy-800 hover:border-navy-300",
                  )}
                >
                  {svc.name}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Monthly Price Range */}
      <div className="border-t border-[#e7e2da]/70 pt-3">
        <SidebarPriceSlider
          min={minPrice ?? SLIDER_MIN_PAISE}
          max={maxPrice ?? SLIDER_MAX_PAISE}
          onChange={(min, max) =>
            onPriceChange(
              min > SLIDER_MIN_PAISE ? min : undefined,
              max < SLIDER_MAX_PAISE ? max : undefined,
            )
          }
        />
      </div>
    </div>
  );
}

