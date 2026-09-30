"use client";

import Link from "next/link";
import { useState } from "react";
import { hrefForMetric } from "./kind-dashboard";
import { useDashboardPreference, useDashboardAggregates, useUpdateDashboardPreference } from "./queries";
import { formatMoney } from "@vsolve/ui";

export function DashboardPinStrip() {
  const { data: pref, isLoading: prefLoading } = useDashboardPreference();
  const { data: businessData } = useDashboardAggregates("overview");
  const { data: customerData } = useDashboardAggregates("customer");
  const { data: vendorData } = useDashboardAggregates("vendor");
  const { data: bookingData } = useDashboardAggregates("booking");
  const updatePreference = useUpdateDashboardPreference();
  const [editing, setEditing] = useState(false);
  const [editPins, setEditPins] = useState<string>("");
  
  if (prefLoading) return null;
  
  const defaultPins = ["open_cases", "collected_gmv_paise", "wallet_liability_paise", "active_partners"];
  const pins = pref?.pinned_tiles && pref.pinned_tiles.length > 0 ? pref.pinned_tiles : defaultPins;
  
  const allData: Record<string, unknown> = {
    ...(businessData || {}),
    ...(customerData || {}),
    ...(vendorData || {}),
    ...(bookingData || {}),
  };

  const handleSave = () => {
    const newPins = editPins.split(",").map(s => s.trim()).filter(Boolean);
    updatePreference.mutate(newPins);
    setEditing(false);
  };

  return (
    <div className="mb-8 bg-surface-hover p-4 rounded-xl border border-line">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-sm font-bold text-text-muted uppercase tracking-wider">Pinned Metrics</h2>
        <button onClick={() => {
          setEditPins(pins.join(", "));
          setEditing(!editing);
        }} className="text-xs text-brand hover:underline">
          {editing ? "Cancel" : "Edit Pins"}
        </button>
      </div>

      {editing ? (
        <div className="flex gap-2 mb-4">
          <input 
            type="text" 
            value={editPins} 
            onChange={e => setEditPins(e.target.value)}
            className="flex-1 bg-surface border border-line rounded px-2 py-1 text-sm text-text"
            placeholder="Comma-separated keys (e.g. open_cases, collected_gmv_paise)"
          />
          <button onClick={handleSave} className="bg-brand text-brand-foreground px-3 py-1 rounded text-sm">Save</button>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {pins.map((pin: string) => {
            const rawValue = allData[pin];
            const value = typeof rawValue === "number" ? rawValue : (rawValue != null ? String(rawValue) : 0);
            const isMoney = pin.includes("paise");
            const displayValue = isMoney && typeof value === "number"
              ? formatMoney(value, { showPaise: true })
              : typeof value === "number"
              ? value.toLocaleString("en-IN")
              : String(value);
            const href = hrefForMetric("", pin) ?? hrefForMetric("overview", pin);
            const className =
              "bg-surface rounded-lg p-4 border border-line flex flex-col justify-between transition-colors hover:bg-surface-hover/40";
            const body = (
              <>
                <div>
                  <span className="text-xs text-text-muted capitalize">{pin.replace(/_paise/g, "").replace(/_/g, " ")}</span>
                  <div className="text-xl font-bold text-text mt-1">{displayValue}</div>
                </div>
                {href ? (
                  <span className="mt-2 text-[10px] font-medium text-action">Open →</span>
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
