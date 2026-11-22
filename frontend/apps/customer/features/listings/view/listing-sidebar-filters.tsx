"use client";

import { useId, useState } from "react";
import { RotateCcw, SlidersHorizontal } from "lucide-react";
import {
  ALL_CATEGORIES_CONFIG,
  CATEGORY_TONE_CONFIGS,
} from "./career-tones";

export interface CategoryFacetCount {
  [key: string]: number;
}

export interface ListingSidebarFiltersProps {
  selectedCategory: string;
  onSelectCategory: (cat: string) => void;
  workModes: string[];
  onToggleWorkMode: (mode: string) => void;
  employmentTypes: string[];
  onToggleEmploymentType: (type: string) => void;
  minSalary?: number;
  onSelectMinSalary: (salary?: number) => void;
  categoryCounts?: CategoryFacetCount;
  totalCount?: number;
  onResetAll: () => void;
  hasActiveFilters: boolean;
}

const SALARY_PRESETS = [
  { label: "₹20,000+", value: 2000000 },
  { label: "₹30,000+", value: 3000000 },
  { label: "₹40,000+", value: 4000000 },
  { label: "₹60,000+", value: 6000000 },
];

export function ListingSidebarFilters({
  selectedCategory,
  onSelectCategory,
  workModes,
  onToggleWorkMode,
  employmentTypes,
  onToggleEmploymentType,
  minSalary,
  onSelectMinSalary,
  categoryCounts = {},
  totalCount = 0,
  onResetAll,
  hasActiveFilters,
}: ListingSidebarFiltersProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const filterId = useId();

  return (
    <aside aria-label="Filters and categories" className="w-full">
      {/* Mobile Toggle Button */}
      <button
        type="button"
        onClick={() => setMobileOpen((o) => !o)}
        aria-expanded={mobileOpen}
        aria-controls={filterId}
        className="lg:hidden mb-4 inline-flex w-full min-h-[44px] items-center justify-between rounded-xl border border-[#E8E3DE] bg-[#FFFFFF] px-4 py-2.5 text-sm font-bold text-[#15264D] shadow-xs hover:bg-[#FAF9F7] transition"
      >
        <span className="inline-flex items-center gap-2">
          <SlidersHorizontal className="size-4 text-[#B54700]" />
          <span>Filters &amp; categories</span>
        </span>
        <span className="rounded-full bg-[#FAF9F7] px-2.5 py-0.5 text-xs font-semibold text-[#5F6B7E] border border-[#E8E3DE]">
          {hasActiveFilters ? "Active filters" : "All"}
        </span>
      </button>

      {/* Sidebar Content (Always visible on lg+, toggleable on mobile) */}
      <div id={filterId} className={`${mobileOpen ? "block" : "hidden"} lg:block space-y-4`}>
        {/* Panel 1: Job Categories */}
        <div className="rounded-[16px] border border-[#E8E3DE] bg-[#FFFFFF] p-4 shadow-[0_1px_2px_rgba(21,38,77,.05),0_4px_14px_rgba(21,38,77,.05)]">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-[#E8E3DE]/80">
            <h2 className="text-[12.5px] font-extrabold uppercase tracking-[0.07em] text-[#15264D]">
              Job categories
            </h2>
          </div>

          <div className="flex flex-col gap-1">
            {/* All jobs row */}
            <button
              type="button"
              onClick={() => onSelectCategory("")}
              aria-pressed={!selectedCategory || selectedCategory === "all"}
              className={`flex w-full items-center justify-between gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm font-semibold transition border ${
                !selectedCategory || selectedCategory === "all"
                  ? "bg-[#FFF1E6] text-[#15264D] border-[#FFD1A8] font-bold"
                  : "border-transparent text-[#46536A] hover:bg-[#FAF9F7] hover:text-[#15264D]"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <span className="size-7 rounded-lg grid place-items-center bg-[#FFF1E6] text-[#B54700] shrink-0">
                  <ALL_CATEGORIES_CONFIG.icon className="size-4" />
                </span>
                <span className="truncate">All jobs</span>
              </span>
              <span
                className={`text-xs tabular-nums font-bold ${
                  !selectedCategory || selectedCategory === "all"
                    ? "text-[#B54700]"
                    : "text-[#5F6B7E]"
                }`}
              >
                {totalCount}
              </span>
            </button>

            {/* Configured Categories */}
            {Object.entries(CATEGORY_TONE_CONFIGS).map(([key, config]) => {
              const isSelected = selectedCategory === key;
              const count = categoryCounts[key] ?? 0;
              const Icon = config.icon;

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onSelectCategory(isSelected ? "" : key)}
                  aria-pressed={isSelected}
                  className={`flex w-full items-center justify-between gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm font-semibold transition border ${
                    isSelected
                      ? "bg-[#FFF1E6] text-[#15264D] border-[#FFD1A8] font-bold"
                      : "border-transparent text-[#46536A] hover:bg-[#FAF9F7] hover:text-[#15264D]"
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <span
                      className={`size-7 rounded-lg grid place-items-center shrink-0 border ${config.badgeClass}`}
                    >
                      <Icon className="size-4" />
                    </span>
                    <span className="truncate">{config.label}</span>
                  </span>
                  <span
                    className={`text-xs tabular-nums font-bold ${
                      isSelected ? "text-[#B54700]" : "text-[#5F6B7E]"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Panel 2: Refinements */}
        <div className="rounded-[16px] border border-[#E8E3DE] bg-[#FFFFFF] p-4 shadow-[0_1px_2px_rgba(21,38,77,.05),0_4px_14px_rgba(21,38,77,.05)]">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-[#E8E3DE]/80">
            <h2 className="text-[12.5px] font-extrabold uppercase tracking-[0.07em] text-[#15264D]">
              Filters
            </h2>
            {hasActiveFilters ? (
              <button
                type="button"
                onClick={onResetAll}
                className="inline-flex items-center gap-1 text-xs font-bold text-[#B54700] hover:text-[#15264D] transition underline underline-offset-2"
              >
                <RotateCcw className="size-3" />
                Reset all
              </button>
            ) : null}
          </div>

          {/* Work Mode */}
          <div className="py-2.5">
            <fieldset>
              <legend className="text-[13px] font-bold text-[#15264D] mb-2">Work mode</legend>
              <div className="space-y-1.5">
                {[
                  { id: "onsite", label: "On-site" },
                  { id: "hybrid", label: "Hybrid" },
                  { id: "remote", label: "Remote" },
                ].map((item) => (
                  <label
                    key={item.id}
                    className="flex items-center gap-2.5 text-[13.5px] text-[#46536A] font-medium cursor-pointer hover:text-[#15264D]"
                  >
                    <input
                      type="checkbox"
                      checked={workModes.includes(item.id)}
                      onChange={() => onToggleWorkMode(item.id)}
                      className="size-4 rounded accent-[#15264D]"
                    />
                    <span>{item.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>

          <hr className="border-[#E8E3DE] my-1" />

          {/* Employment Type */}
          <div className="py-2.5">
            <fieldset>
              <legend className="text-[13px] font-bold text-[#15264D] mb-2">Employment type</legend>
              <div className="space-y-1.5">
                {[
                  { id: "full", label: "Full time" },
                  { id: "part", label: "Part time" },
                  { id: "shift", label: "Shift work" },
                ].map((item) => (
                  <label
                    key={item.id}
                    className="flex items-center gap-2.5 text-[13.5px] text-[#46536A] font-medium cursor-pointer hover:text-[#15264D]"
                  >
                    <input
                      type="checkbox"
                      checked={employmentTypes.includes(item.id)}
                      onChange={() => onToggleEmploymentType(item.id)}
                      className="size-4 rounded accent-[#15264D]"
                    />
                    <span>{item.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>

          <hr className="border-[#E8E3DE] my-1" />

          {/* Pays up to (per month) */}
          <div className="pt-2.5">
            <fieldset>
              <legend className="text-[13px] font-bold text-[#15264D] mb-2">
                Pays up to (per month)
              </legend>
              <div className="grid grid-cols-2 gap-2">
                {SALARY_PRESETS.map((p) => {
                  const active = minSalary === p.value;
                  return (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => onSelectMinSalary(active ? undefined : p.value)}
                      aria-pressed={active}
                      className={`h-9 rounded-lg border text-xs font-bold transition flex items-center justify-center ${
                        active
                          ? "bg-[#15264D] border-[#15264D] text-white"
                          : "border-[#E8E3DE] bg-[#FAF9F7] text-[#46536A] hover:border-[#15264D] hover:text-[#15264D]"
                      }`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          </div>
        </div>
      </div>
    </aside>
  );
}
