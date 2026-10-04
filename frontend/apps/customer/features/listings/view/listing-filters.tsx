"use client";

import { useMemo, useState } from "react";
import { Filter, Search, X } from "lucide-react";

export interface CategoryOption {
  label: string;
  value: string;
}

export const POPULAR_CATEGORIES: CategoryOption[] = [
  { label: "All Roles", value: "" },
  { label: "IT & Software", value: "software" },
  { label: "Sales & Marketing", value: "sales" },
  { label: "Driver & Delivery", value: "driver" },
  { label: "Office & Admin", value: "admin" },
  { label: "Customer Support", value: "support" },
  { label: "Retail & Shop", value: "retail" },
  { label: "Engineering & Tech", value: "engineering" },
  { label: "Accounting & Finance", value: "finance" },
  { label: "Operations & Logistics", value: "logistics" },
  { label: "Design & Creative", value: "design" },
];

export interface ListingFiltersProps {
  categories?: CategoryOption[];
  selectedCategory: string;
  onSelectCategory: (value: string) => void;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
}

export function ListingFilters({
  categories = POPULAR_CATEGORIES,
  selectedCategory,
  onSelectCategory,
  hasActiveFilters,
  onClearFilters,
}: ListingFiltersProps) {
  const [roleSearch, setRoleSearch] = useState("");

  const filteredCategories = useMemo(() => {
    if (!roleSearch.trim()) return categories;
    const q = roleSearch.toLowerCase().trim();
    return categories.filter(
      (cat) => cat.value === "" || cat.label.toLowerCase().includes(q) || cat.value.toLowerCase().includes(q),
    );
  }, [categories, roleSearch]);

  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-text-muted">
            <Filter className="size-3.5 text-text-muted" /> Role &amp; Category
          </span>
          {selectedCategory && (
            <span className="rounded-full bg-navy-100 px-2.5 py-0.5 text-[11px] font-bold text-navy-900 border border-navy-300">
              Active: {categories.find((c) => c.value === selectedCategory)?.label || selectedCategory}
            </span>
          )}
        </div>

        {/* Role search filter */}
        <div className="relative flex items-center">
          <Search className="pointer-events-none absolute left-2.5 size-3.5 text-text-muted" />
          <input
            type="text"
            value={roleSearch}
            onChange={(e) => setRoleSearch(e.target.value)}
            placeholder="Filter roles..."
            className="h-7 w-36 rounded-full border border-line bg-surface-sunken pl-8 pr-6 text-xs text-text placeholder:text-text-muted/70 focus:w-48 focus:border-line-strong focus:outline-none transition-all"
          />
          {roleSearch && (
            <button
              type="button"
              onClick={() => setRoleSearch("")}
              className="absolute right-2 text-text-muted hover:text-text"
              aria-label="Clear role search"
            >
              <X className="size-3" />
            </button>
          )}
        </div>
      </div>

      <section className="flex flex-wrap items-center gap-1.5 pt-1">
        {filteredCategories.map((cat) => (
          <button
            type="button"
            key={cat.label}
            onClick={() => onSelectCategory(cat.value)}
            className={`rounded-full px-3.5 py-1 text-xs font-semibold transition ${
              selectedCategory === cat.value
                ? "bg-navy-900 text-warm-0 shadow-xs"
                : "border border-line bg-surface-sunken text-text-secondary hover:border-line-strong hover:bg-surface-hover hover:text-text"
            }`}
          >
            {cat.label}
          </button>
        ))}

        {hasActiveFilters ? (
          <button
            type="button"
            onClick={onClearFilters}
            className="ml-auto text-xs font-semibold text-text-link hover:underline"
          >
            Clear all filters
          </button>
        ) : null}
      </section>
    </div>
  );
}
