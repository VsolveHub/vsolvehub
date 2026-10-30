"use client";

import Link from "next/link";
import { useState } from "react";
import { hrefForMetric, humanize } from "./kind-dashboard";
import { useDashboardPreference, useDashboardAggregates, useUpdateDashboardPreference } from "./queries";
import { Button, ErrorState, formatMoney } from "@vsolve/ui";

const DEFAULT_PINS = ["open_cases", "collected_gmv_paise", "wallet_liability_paise", "active_partners"];

export function DashboardPinStrip() {
  const { data: pref, isLoading: prefLoading } = useDashboardPreference();
  const { data: businessData } = useDashboardAggregates("overview");
  const { data: customerData } = useDashboardAggregates("customer");
  const { data: vendorData } = useDashboardAggregates("vendor");
  const { data: bookingData } = useDashboardAggregates("booking");
  const updatePreference = useUpdateDashboardPreference();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);

  if (prefLoading) return null;

  const pins = pref?.pinned_tiles && pref.pinned_tiles.length > 0 ? pref.pinned_tiles : DEFAULT_PINS;

  const allData: Record<string, unknown> = {
    ...(businessData || {}),
    ...(customerData || {}),
    ...(vendorData || {}),
    ...(bookingData || {}),
  };
  // Only single numbers can be a tile; series and breakdowns belong to the dashboards. Pins that
  // are already saved stay choosable even if today's aggregates do not carry them.
  const choices = Array.from(
    new Set([...pins, ...Object.keys(allData).filter((key) => typeof allData[key] === "number")]),
  );

  const startEditing = () => {
    setDraft(pins);
    updatePreference.reset();
    setEditing(true);
  };

  const toggle = (key: string) =>
    setDraft((current) =>
      current.includes(key) ? current.filter((pin) => pin !== key) : [...current, key],
    );

  // Close only once the server has the new pins, so a refused save is not silently lost.
  const handleSave = () => updatePreference.mutate(draft, { onSuccess: () => setEditing(false) });

  return (
    <div className="mb-8 bg-surface-hover p-4 rounded-xl border border-line">
      <div className="flex justify-between items-center mb-4 gap-3">
        <h2 className="text-sm font-bold text-text-muted uppercase tracking-wider">Pinned metrics</h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => (editing ? setEditing(false) : startEditing())}
          aria-expanded={editing}
        >
          {editing ? "Cancel" : "Edit pins"}
        </Button>
      </div>

      {editing ? (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-sm text-text-secondary">
            Choose the numbers to keep on Home. {draft.length} selected.
          </legend>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
            {choices.map((key) => {
              const checked = draft.includes(key);
              return (
                <label
                  key={key}
                  className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 text-sm text-text hover:bg-surface"
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[var(--color-action)]"
                    checked={checked}
                    onChange={() => toggle(key)}
                  />
                  {humanize(key)}
                </label>
              );
            })}
          </div>
          {updatePreference.isError ? (
            <ErrorState
              inline
              title="We could not save your pins"
              message="Your pinned metrics are unchanged. Try again."
            />
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={handleSave}
              disabled={draft.length === 0}
              loading={updatePreference.isPending}
              loadingLabel="Saving"
            >
              Save pins
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDraft(DEFAULT_PINS)}>
              Reset to default
            </Button>
          </div>
        </fieldset>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {pins.map((pin: string) => {
            const rawValue = allData[pin];
            const isMoney = pin.includes("paise");
            // A pin with no figure today shows a dash, not a zero that reads as a real count.
            const displayValue =
              rawValue == null
                ? "—"
                : isMoney && typeof rawValue === "number"
                  ? formatMoney(rawValue, { showPaise: true })
                  : typeof rawValue === "number"
                    ? rawValue.toLocaleString("en-IN")
                    : String(rawValue);
            const href = hrefForMetric("", pin) ?? hrefForMetric("overview", pin);
            const className =
              "bg-surface rounded-lg p-4 border border-line flex flex-col justify-between transition-colors hover:bg-surface-hover/40";
            const body = (
              <>
                <div>
                  <span className="text-xs text-text-muted">{humanize(pin)}</span>
                  <div className="text-xl font-bold text-text mt-1 break-words">{displayValue}</div>
                </div>
                {href ? (
                  <span className="mt-2 text-xs font-medium text-action">Open →</span>
                ) : null}
              </>
            );
            return href ? (
              <Link key={pin} href={href} className={className}>
                {body}
              </Link>
            ) : (
              <div key={pin} className={className}>
                {body}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
