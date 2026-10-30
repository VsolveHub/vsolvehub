"use client";

import { type ReactNode } from "react";
import { Filter, X } from "lucide-react";
import { Drawer } from "./drawer";
import { Button } from "./button";
import { useTOrDefault } from "./i18n";

export interface ActiveFilter {
  id: string;
  label: string;
  value: string;
}

export interface ToolbarProps {
  /** Search input or arbitrary left-side content */
  search?: ReactNode;
  /** Filter controls (dropdowns, date pickers) */
  filters?: ReactNode;
  /** Segmented controls or right-side content */
  controls?: ReactNode;
  /** List of currently active filters */
  activeFilters?: ActiveFilter[];
  /** Callback when a specific filter chip is removed */
  onRemoveFilter?: (id: string) => void;
  /** Callback when 'Clear all' is clicked */
  onClearFilters?: () => void;
}

/**
 * A responsive toolbar that handles search, filters, and segmented controls.
 *
 * On desktop, it lays out elements horizontally.
 * On mobile, filters are collapsed into a Drawer to save vertical space.
 * Active filters are displayed below the toolbar as removable chips.
 */
export function Toolbar({
  search,
  filters,
  controls,
  activeFilters = [],
  onRemoveFilter,
  onClearFilters,
}: ToolbarProps) {
  const tf = useTOrDefault();
  const hasActiveFilters = activeFilters.length > 0;

  return (
    <div className="flex flex-col gap-3 mb-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 w-full sm:w-auto overflow-hidden">
          {search && <div className="flex-1 sm:flex-none sm:w-72">{search}</div>}
          
          {filters && (
            <>
              {/* Desktop filters */}
              <div className="hidden sm:flex items-center gap-2">
                {filters}
              </div>
              
              {/* Mobile filters drawer */}
              <div className="sm:hidden shrink-0">
                <Drawer
                  title={tf("ui.toolbar.filtersTitle", "Filters")}
                  trigger={
                    <Button variant="outline" size="md" className="flex items-center gap-2">
                      <Filter className="h-4 w-4" />
                      {tf("ui.toolbar.filters", "Filters")}
                      {hasActiveFilters && (
                        <span className="bg-signal-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-1">
                          {activeFilters.length}
                        </span>
                      )}
                    </Button>
                  }
                >
                  <div className="flex flex-col gap-4">
                    {filters}
                    {hasActiveFilters && onClearFilters && (
                      <Button variant="outline" onClick={onClearFilters} className="mt-4">
                        {tf("ui.toolbar.clearAllFilters", "Clear all filters")}
                      </Button>
                    )}
                  </div>
                </Drawer>
              </div>
            </>
          )}
        </div>

        {controls && (
          <div className="flex shrink-0 items-center">
            {controls}
          </div>
        )}
      </div>

      {/* Active Filter Chips */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2 mt-1">
          <span className="text-xs font-medium text-text-secondary mr-1">
            {tf("ui.toolbar.activeFilters", "Active filters:")}
          </span>
          {activeFilters.map((filter) => (
            <div
              key={filter.id}
              className="flex items-center gap-1.5 bg-surface-sunken border border-line rounded-full px-2.5 py-1 text-xs font-medium text-text"
            >
              <span className="text-text-secondary">{filter.label}:</span>
              <span>{filter.value}</span>
              {onRemoveFilter && (
                <button
                  type="button"
                  onClick={() => onRemoveFilter(filter.id)}
                  className="p-0.5 ml-1 text-text-muted hover:text-text rounded-full focus:outline-none"
                  aria-label={tf("ui.toolbar.removeFilter", "Remove filter {label}", {
                    label: filter.label,
                  })}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
          {onClearFilters && activeFilters.length > 1 && (
            <button
              type="button"
              onClick={onClearFilters}
              className="text-xs font-semibold text-text-link hover:underline ml-1 focus:outline-none"
            >
              {tf("ui.toolbar.clearAll", "Clear all")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
