"use client";

import { Building2, Coffee, Layers, User, Users, Wind } from "lucide-react";
import { cn } from "@vsolve/ui";

export interface ActiveFilters {
  sharingCount?: number;
  ac?: boolean;
  food?: boolean;
  maxPrice?: number;
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
  const isAll =
    activeFilters.sharingCount === undefined &&
    activeFilters.ac === undefined &&
    activeFilters.food === undefined &&
    activeFilters.maxPrice === undefined;

  const setSingle = () => {
    onChangeFilter({
      ...activeFilters,
      sharingCount: activeFilters.sharingCount === 1 ? undefined : 1,
    });
  };

  const setDouble = () => {
    onChangeFilter({
      ...activeFilters,
      sharingCount: activeFilters.sharingCount === 2 ? undefined : 2,
    });
  };

  const toggleAc = () => {
    onChangeFilter({
      ...activeFilters,
      ac: activeFilters.ac ? undefined : true,
    });
  };

  const toggleFood = () => {
    onChangeFilter({
      ...activeFilters,
      food: activeFilters.food ? undefined : true,
    });
  };

  const toggleBudget = () => {
    onChangeFilter({
      ...activeFilters,
      maxPrice: activeFilters.maxPrice === 100000 ? undefined : 100000,
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onChangeFilter({})}
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

        <button
          type="button"
          onClick={setSingle}
          className={cn(
            "inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition",
            activeFilters.sharingCount === 1
              ? "bg-action text-white shadow-xs"
              : "bg-surface border border-line text-text-secondary hover:border-line-strong hover:text-text",
          )}
        >
          <User className="size-3.5" />
          Private Single Room
        </button>

        <button
          type="button"
          onClick={setDouble}
          className={cn(
            "inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition",
            activeFilters.sharingCount === 2
              ? "bg-action text-white shadow-xs"
              : "bg-surface border border-line text-text-secondary hover:border-line-strong hover:text-text",
          )}
        >
          <Users className="size-3.5" />
          Double Sharing PG
        </button>

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
          Budget (&lt; ₹1,000/night)
        </button>
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
