"use client";

import { useQuery } from "@tanstack/react-query";
import { Layers } from "lucide-react";
import { cn, IsoDateField, Skeleton } from "@vsolve/ui";

import { fetchRentalTaxonomy } from "../queries";

export interface ActiveRentalFilters {
  categorySlug?: string;
  serviceSlug?: string;
  startDate?: string;
  endDate?: string;
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

export function RentalFilters({
  activeFilters,
  onChangeFilter,
  count,
}: RentalFiltersProps) {
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

  const activeCategory = (taxonomy as TaxonomyCategory[]).find(
    (cat) => cat.slug === activeFilters.categorySlug
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
        </div>

        {/* Row 2: Subcategories (Services/Variants) */}
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
          Showing <strong className="text-text font-bold">{count}</strong> rental item{count === 1 ? "" : "s"}
        </span>
        <span>Standard Indian daily rental cycle (24h)</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-xs">
          <span className="font-bold text-text">Available from</span>
          <IsoDateField
            value={activeFilters.startDate ?? ""}
            onChange={(value) =>
              onChangeFilter({ ...activeFilters, startDate: value || undefined })
            }
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs">
          <span className="font-bold text-text">Available until</span>
          <IsoDateField
            value={activeFilters.endDate ?? ""}
            min={activeFilters.startDate}
            onChange={(value) =>
              onChangeFilter({ ...activeFilters, endDate: value || undefined })
            }
          />
        </label>
      </div>
    </div>
  );
}
