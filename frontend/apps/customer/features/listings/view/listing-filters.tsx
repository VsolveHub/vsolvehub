import { Filter } from "lucide-react";

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
  return (
    <section className="flex flex-wrap items-center gap-2">
      <span className="flex items-center gap-1.5 text-xs font-semibold text-text-muted uppercase tracking-wider mr-2">
        <Filter className="size-3.5 text-text-muted" /> Filter by:
      </span>
      {categories.map((cat) => (
        <button
          type="button"
          key={cat.label}
          onClick={() => onSelectCategory(cat.value)}
          className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
            selectedCategory === cat.value
              ? "bg-navy-900 text-warm-0 shadow-xs"
              : "border border-line bg-surface text-text-secondary hover:border-line-strong hover:bg-surface-hover"
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
  );
}
