"use client";

import { useQuery } from "@tanstack/react-query";
import { Building2, Calendar, Coffee, Layers, Wind } from "lucide-react";
import { cn, Skeleton } from "@vsolve/ui";

import { fetchStayTaxonomy } from "../queries";

export interface ActiveFilters {
  ac?: boolean;
  food?: boolean;
  maxPrice?: number;
  categorySlug?: string;
  serviceSlug?: string;
  checkIn?: string;
  checkOut?: string;
}

interface StayFiltersProps {
  activeFilters: ActiveFilters;
  onChangeFilter: (filters: ActiveFilters) => void;
  count: number;
}

export function StayFilters({
  activeFilters,
  onChangeFilter,
  count,
}: StayFiltersProps) {
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

  const toggleBudget = () => {
    onChangeFilter({ ...activeFilters, maxPrice: activeFilters.maxPrice === 100000 ? undefined : 100000 });
  };

  const setCategory = (slug?: string) => {
    onChangeFilter({ ...activeFilters, categorySlug: slug, serviceSlug: undefined });
  };

  const setService = (slug: string) => {
    onChangeFilter({ ...activeFilters, serviceSlug: slug });
  };

  const activeCategory = taxonomy.find((cat) => cat.slug === activeFilters.categorySlug);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        {/* Row 1: Categories + Amenities */}
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
            All Stays
          </button>

          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-[34px] w-24 rounded-full" />
            ))
          ) : (
            taxonomy.map((cat) => (
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

          <button
            type="button"
            onClick={toggleAc}
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition",
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
              "inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition",
              activeFilters.food
                ? "bg-action text-white shadow-xs"
                : "bg-surface border border-line text-text-secondary hover:border-line-strong hover:text-text",
            )}
          >
            <Coffee className="size-3.5" />
            Meals Included
          </button>

          <button
            type="button"
            onClick={toggleBudget}
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition",
              activeFilters.maxPrice === 100000
                ? "bg-action text-white shadow-xs"
                : "bg-surface border border-line text-text-secondary hover:border-line-strong hover:text-text",
            )}
          >
            <Building2 className="size-3.5" />
            Budget (under ₹1,000)
          </button>
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

        {/* Row 3: Travel Dates Filter */}
        <div className="flex flex-wrap items-center gap-3 rounded-control border border-line bg-surface p-2.5">
          <div className="flex items-center gap-1.5 text-xs font-bold text-text">
            <Calendar className="size-3.5 text-action" />
            <span>Stay Dates:</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <label className="flex items-center gap-1.5 text-xs text-text-secondary">
              <span className="font-semibold text-text">Check-in:</span>
              <input
                type="date"
                value={activeFilters.checkIn ?? ""}
                min={new Date().toISOString().split("T")[0]}
                onChange={(e) =>
                  onChangeFilter({
                    ...activeFilters,
                    checkIn: e.target.value || undefined,
                  })
                }
                className="rounded-control border border-line bg-surface-sunken px-2.5 py-1 text-xs text-text focus:outline-none"
              />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-text-secondary">
              <span className="font-semibold text-text">Check-out:</span>
              <input
                type="date"
                value={activeFilters.checkOut ?? ""}
                min={activeFilters.checkIn || new Date().toISOString().split("T")[0]}
                onChange={(e) =>
                  onChangeFilter({
                    ...activeFilters,
                    checkOut: e.target.value || undefined,
                  })
                }
                className="rounded-control border border-line bg-surface-sunken px-2.5 py-1 text-xs text-text focus:outline-none"
              />
            </label>
            {(activeFilters.checkIn || activeFilters.checkOut) && (
              <button
                type="button"
                onClick={() =>
                  onChangeFilter({
                    ...activeFilters,
                    checkIn: undefined,
                    checkOut: undefined,
                  })
                }
                className="text-xs font-semibold text-text-secondary hover:text-danger underline transition"
              >
                Clear Dates
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-text-secondary font-medium px-1">
        <span>
          Showing <strong className="text-text font-bold">{count}</strong> verified propert{count === 1 ? "y" : "ies"}
        </span>
        <span>Transparent date quotes · Direct host communication</span>
      </div>
    </div>
  );
}
