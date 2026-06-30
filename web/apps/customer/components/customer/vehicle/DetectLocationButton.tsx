"use client";

import { useState } from "react";
import { PinIcon } from "@/components/ui/AppIcons";
import { LocationError, detectCurrentLocation } from "@/lib/location/geocode";

type Props = {
  /** Receives a human-readable address string to drop into the input. */
  onDetected: (address: string) => void;
  label?: string;
};

/**
 * Inline "use my current location" button for free-text location inputs
 * (ride pickup/drop, repair/transport addresses). Requests geolocation
 * permission, reverse-geocodes, and returns a formatted address string.
 */
export function DetectLocationButton({ onDetected, label = "Use my current location" }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function detect() {
    setError("");
    setLoading(true);
    try {
      const loc = await detectCurrentLocation();
      const text =
        loc.fullAddress ||
        [loc.area, loc.city, loc.pincode].filter(Boolean).join(", ") ||
        `${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}`;
      onDetected(text);
    } catch (err) {
      setError(err instanceof LocationError ? err.message : "Couldn't get your location.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="stack-xs">
      <button type="button" className="detect-location-btn" onClick={detect} disabled={loading}>
        <PinIcon />
        {loading ? "Detecting your location…" : label}
      </button>
      {error && <p className="text-sm alert alert-error" style={{ margin: 0 }}>{error}</p>}
    </div>
  );
}
