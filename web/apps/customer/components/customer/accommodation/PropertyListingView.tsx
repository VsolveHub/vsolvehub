"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PropertyCard } from "./PropertyCard";
import { ACCOMMODATION_TYPES } from "@/lib/accommodation/constants";
import type { PropertyListItem } from "@/lib/accommodation/types";
import type { AccommodationTypeSlug } from "@/lib/accommodation/constants";
import { LoadingState } from "@/components/ui/LoadingState";
import { Spinner } from "@/components/ui/Spinner";

type FilterState = {
  budgetMax: string;
  ac: string;
  furnished: string;
  sharing: string;
  foodIncluded: boolean;
  gender: string;
};

const EMPTY_FILTERS: FilterState = {
  budgetMax: "",
  ac: "",
  furnished: "",
  sharing: "",
  foodIncluded: false,
  gender: "",
};

function countActiveFilters(f: FilterState) {
  let n = 0;
  if (f.budgetMax) n++;
  if (f.ac) n++;
  if (f.furnished) n++;
  if (f.sharing) n++;
  if (f.foodIncluded) n++;
  if (f.gender) n++;
  return n;
}

function filterLabels(f: FilterState): { key: keyof FilterState; label: string }[] {
  const chips: { key: keyof FilterState; label: string }[] = [];
  if (f.budgetMax) chips.push({ key: "budgetMax", label: `Under ₹${f.budgetMax}/mo` });
  if (f.ac === "ac") chips.push({ key: "ac", label: "AC" });
  if (f.ac === "non-ac") chips.push({ key: "ac", label: "Non-AC" });
  if (f.furnished === "furnished") chips.push({ key: "furnished", label: "Furnished" });
  if (f.furnished === "unfurnished") chips.push({ key: "furnished", label: "Unfurnished" });
  if (f.sharing === "single") chips.push({ key: "sharing", label: "Single" });
  if (f.sharing === "double") chips.push({ key: "sharing", label: "Double sharing" });
  if (f.foodIncluded) chips.push({ key: "foodIncluded", label: "Food included" });
  if (f.gender === "male") chips.push({ key: "gender", label: "Male only" });
  if (f.gender === "female") chips.push({ key: "gender", label: "Female only" });
  return chips;
}

export function PropertyListingView() {
  const searchParams = useSearchParams();
  const initialType = (searchParams.get("type") as AccommodationTypeSlug) || "";

  const [properties, setProperties] = useState<PropertyListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState<AccommodationTypeSlug | "">(initialType);
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [draft, setDraft] = useState<FilterState>(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const activeCount = countActiveFilters(filters);
  const activeChips = useMemo(() => filterLabels(filters), [filters]);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (type) params.set("type", type);
    if (filters.budgetMax) params.set("budgetMax", String(Number(filters.budgetMax) * 100));
    if (filters.ac) params.set("ac", filters.ac);
    if (filters.furnished) params.set("furnished", filters.furnished);
    if (filters.sharing) params.set("sharing", filters.sharing);
    if (filters.foodIncluded) params.set("foodIncluded", "true");
    if (filters.gender) params.set("gender", filters.gender);

    const res = await fetch(`/api/accommodation/properties?${params}`);
    const data = await res.json();
    setProperties(data.properties ?? []);
    setLoading(false);
  }, [type, filters]);

  useEffect(() => {
    load();
  }, [load]);

  function openFilters() {
    setDraft(filters);
    setFiltersOpen(true);
  }

  function applyFilters() {
    setFilters(draft);
    setFiltersOpen(false);
  }

  function clearFilters() {
    setDraft(EMPTY_FILTERS);
    setFilters(EMPTY_FILTERS);
  }

  function removeFilter(key: keyof FilterState) {
    const next = { ...filters };
    if (key === "foodIncluded") next.foodIncluded = false;
    else next[key] = "" as never;
    setFilters(next);
  }

  function toggleDraftOption(
    field: "ac" | "furnished" | "sharing" | "gender",
    value: string
  ) {
    setDraft((d) => ({ ...d, [field]: d[field] === value ? "" : value }));
  }

  return (
    <div className="acc-listing">
      <div className="acc-type-tabs">
        <button
          type="button"
          className={`acc-type-tab ${!type ? "active" : ""}`}
          onClick={() => setType("")}
        >
          All
        </button>
        {ACCOMMODATION_TYPES.map((t) => (
          <button
            key={t.slug}
            type="button"
            className={`acc-type-tab ${type === t.slug ? "active" : ""}`}
            onClick={() => setType(t.slug)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="acc-filter-bar">
        <span className="acc-results-count">
          {loading ? (
            <>
              <Spinner size="sm" /> Searching…
            </>
          ) : (
            `${properties.length} propert${properties.length === 1 ? "y" : "ies"}`
          )}
        </span>
        <button type="button" className="acc-filter-trigger" onClick={openFilters}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M4 6h16M7 12h10M10 18h4"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          Filters
          {activeCount > 0 && <span className="acc-filter-badge">{activeCount}</span>}
        </button>
      </div>

      {activeChips.length > 0 && (
        <div className="acc-active-chips">
          {activeChips.map((chip) => (
            <button
              key={`${chip.key}-${chip.label}`}
              type="button"
              className="acc-chip acc-chip-active"
              onClick={() => removeFilter(chip.key)}
            >
              {chip.label}
              <span aria-hidden>×</span>
            </button>
          ))}
          <button type="button" className="acc-chip acc-chip-clear" onClick={clearFilters}>
            Clear all
          </button>
        </div>
      )}

      {filtersOpen && (
        <div className="acc-filter-overlay" role="presentation">
          <button
            type="button"
            className="acc-filter-backdrop"
            aria-label="Close filters"
            onClick={() => setFiltersOpen(false)}
          />
          <div className="acc-filter-sheet" role="dialog" aria-label="Filter properties">
            <div className="acc-filter-sheet-handle" />
            <div className="acc-filter-sheet-header">
              <h2>Filters</h2>
              <button type="button" className="acc-filter-reset" onClick={() => setDraft(EMPTY_FILTERS)}>
                Reset
              </button>
            </div>

            <div className="acc-filter-sheet-body">
              <section className="acc-filter-group">
                <h3>Budget</h3>
                <div className="acc-filter-chips">
                  {["8000", "12000", "15000", "20000"].map((amount) => (
                    <button
                      key={amount}
                      type="button"
                      className={`acc-chip ${draft.budgetMax === amount ? "selected" : ""}`}
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          budgetMax: d.budgetMax === amount ? "" : amount,
                        }))
                      }
                    >
                      Under ₹{Number(amount).toLocaleString("en-IN")}
                    </button>
                  ))}
                </div>
                <label className="acc-filter-budget-input">
                  <span>Custom max (₹/month)</span>
                  <input
                    type="number"
                    placeholder="e.g. 15000"
                    value={draft.budgetMax}
                    onChange={(e) => setDraft((d) => ({ ...d, budgetMax: e.target.value }))}
                  />
                </label>
              </section>

              <section className="acc-filter-group">
                <h3>AC</h3>
                <div className="acc-filter-chips">
                  <button
                    type="button"
                    className={`acc-chip ${draft.ac === "ac" ? "selected" : ""}`}
                    onClick={() => toggleDraftOption("ac", "ac")}
                  >
                    AC
                  </button>
                  <button
                    type="button"
                    className={`acc-chip ${draft.ac === "non-ac" ? "selected" : ""}`}
                    onClick={() => toggleDraftOption("ac", "non-ac")}
                  >
                    Non-AC
                  </button>
                </div>
              </section>

              <section className="acc-filter-group">
                <h3>Furnishing</h3>
                <div className="acc-filter-chips">
                  <button
                    type="button"
                    className={`acc-chip ${draft.furnished === "furnished" ? "selected" : ""}`}
                    onClick={() => toggleDraftOption("furnished", "furnished")}
                  >
                    Furnished
                  </button>
                  <button
                    type="button"
                    className={`acc-chip ${draft.furnished === "unfurnished" ? "selected" : ""}`}
                    onClick={() => toggleDraftOption("furnished", "unfurnished")}
                  >
                    Unfurnished
                  </button>
                </div>
              </section>

              <section className="acc-filter-group">
                <h3>Sharing</h3>
                <div className="acc-filter-chips">
                  <button
                    type="button"
                    className={`acc-chip ${draft.sharing === "single" ? "selected" : ""}`}
                    onClick={() => toggleDraftOption("sharing", "single")}
                  >
                    Single
                  </button>
                  <button
                    type="button"
                    className={`acc-chip ${draft.sharing === "double" ? "selected" : ""}`}
                    onClick={() => toggleDraftOption("sharing", "double")}
                  >
                    Double
                  </button>
                </div>
              </section>

              <section className="acc-filter-group">
                <h3>Gender preference</h3>
                <div className="acc-filter-chips">
                  {(["male", "female"] as const).map((g) => (
                    <button
                      key={g}
                      type="button"
                      className={`acc-chip ${draft.gender === g ? "selected" : ""}`}
                      onClick={() => toggleDraftOption("gender", g)}
                    >
                      {g === "male" ? "Male" : "Female"}
                    </button>
                  ))}
                </div>
              </section>

              <section className="acc-filter-group">
                <h3>Meals</h3>
                <button
                  type="button"
                  className={`acc-chip acc-chip-wide ${draft.foodIncluded ? "selected" : ""}`}
                  onClick={() => setDraft((d) => ({ ...d, foodIncluded: !d.foodIncluded }))}
                >
                  Food included
                </button>
              </section>
            </div>

            <div className="acc-filter-sheet-footer">
              <button type="button" className="btn btn-primary btn-block" onClick={applyFilters}>
                Show properties
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <LoadingState label="Loading properties…" className="acc-loading" />
      ) : properties.length === 0 ? (
        <div className="empty-state">
          <p>No properties match your filters.</p>
          {activeCount > 0 && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={clearFilters}>
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="acc-property-list">
          {properties.map((p) => (
            <PropertyCard key={p.id} property={p} />
          ))}
        </div>
      )}
    </div>
  );
}
