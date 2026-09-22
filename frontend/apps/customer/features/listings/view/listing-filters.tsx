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
      <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider mr-2">
        <Filter className="h-3.5 w-3.5" /> Filter by:
      </span>
      {categories.map((cat) => (
        <button
          key={cat.label}
          onClick={() => onSelectCategory(cat.value)}
          className={`rounded-full px-4 py-1.5 text-xs font-medium transition ${
            selectedCategory === cat.value
              ? "bg-slate-950 text-white shadow-xs"
              : "border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
          }`}
        >
          {cat.label}
        </button>
      ))}
      {hasActiveFilters ? (
        <button
          onClick={onClearFilters}
          className="ml-auto text-xs font-medium text-indigo-600 hover:underline"
        >
          Clear all filters
        </button>
      ) : null}
    </section>
  );
}
