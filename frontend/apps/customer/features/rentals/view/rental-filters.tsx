"use client";

import { Wrench, Hammer, Sparkles, Layers } from "lucide-react";
import { cn } from "@vsolve/ui";

const CATEGORY_CHIPS = [
  { id: "", label: "All Equipment", icon: Layers },
  { id: "power-tools", label: "Power Tools", icon: Wrench },
  { id: "carpentry", label: "Carpentry & Hand Tools", icon: Hammer },
  { id: "appliance", label: "Home Appliances", icon: Sparkles },
] as const;

interface RentalFiltersProps {
  selectedCategory: string;
  onSelectCategory: (cat: string) => void;
  count: number;
}

export function RentalFilters({
  selectedCategory,
  onSelectCategory,
  count,
}: RentalFiltersProps) {
  return (
    <div className="flex flex-col gap-4">
      {/* Category Filter Chips */}
      <div className="flex flex-wrap items-center gap-2">
        {CATEGORY_CHIPS.map((chip) => {
          const active = selectedCategory === chip.id;
          const Icon = chip.icon;
          return (
            <button
              key={chip.id}
              type="button"
              onClick={() => onSelectCategory(chip.id)}
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition",
                active
                  ? "bg-action text-white shadow-xs"
                  : "bg-surface border border-line text-text-secondary hover:border-line-strong hover:text-text",
              )}
            >
              <Icon className="size-3.5" />
              {chip.label}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between text-xs text-text-secondary font-medium px-1">
        <span>
          Showing <strong className="text-text font-bold">{count}</strong> rental item{count === 1 ? "" : "s"}
        </span>
        <span>Standard Indian daily rental cycle (24h)</span>
      </div>
    </div>
  );
}
