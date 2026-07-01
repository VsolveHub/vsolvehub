"use client";

import { useState } from "react";
import { LocateFixed, Loader2, MapPin } from "lucide-react";

const inputCls =
  "h-11 w-full rounded-lg border border-border bg-white px-3 text-sm text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";

export function LocationCapture({
  defaultArea,
  defaultCity,
  defaultPincode,
  defaultLat,
  defaultLng,
}: {
  defaultArea: string | null;
  defaultCity: string | null;
  defaultPincode: string | null;
  defaultLat: number | null;
  defaultLng: number | null;
}) {
  const [area, setArea] = useState(defaultArea ?? "");
  const [city, setCity] = useState(defaultCity ?? "");
  const [pincode, setPincode] = useState(defaultPincode ?? "");
  const [lat, setLat] = useState(defaultLat != null ? String(defaultLat) : "");
  const [lng, setLng] = useState(defaultLng != null ? String(defaultLng) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [detected, setDetected] = useState(false);

  function detect() {
    setError("");
    if (!("geolocation" in navigator)) {
      setError("Location isn't available on this device — enter it manually below.");
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          setLat(String(latitude));
          setLng(String(longitude));
          const res = await fetch(`/api/geocode/reverse?lat=${latitude}&lng=${longitude}`);
          if (res.ok) {
            const d = await res.json();
            setArea(d.area || "");
            setCity(d.city || "");
            setPincode(d.pincode || "");
            setDetected(true);
          } else {
            setError("Couldn't read your address — please fill it in manually.");
          }
        } catch {
          setError("Couldn't read your address — please fill it in manually.");
        } finally {
          setBusy(false);
        }
      },
      (err) => {
        setBusy(false);
        setError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission denied — enter your area manually below."
            : "Couldn't get your location — enter your area manually below.",
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-ink-900">Service area</p>
        {detected ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600">
            <MapPin className="h-3.5 w-3.5" /> Detected
          </span>
        ) : null}
      </div>

      <button
        type="button"
        onClick={detect}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-brand-200 bg-brand-50 py-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-100 disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
        {busy ? "Detecting your location…" : "Use my current location"}
      </button>

      {error ? <p className="text-xs text-amber-700">{error}</p> : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input
          name="area"
          value={area}
          onChange={(e) => setArea(e.target.value)}
          placeholder="Area / locality *"
          required
          className={inputCls}
        />
        <input
          name="cityName"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="City *"
          required
          className={inputCls}
        />
      </div>
      <input
        name="pincode"
        value={pincode}
        onChange={(e) => setPincode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        placeholder="Pincode *"
        inputMode="numeric"
        pattern="\d{6}"
        maxLength={6}
        required
        className={inputCls}
      />

      <input type="hidden" name="lat" value={lat} />
      <input type="hidden" name="lng" value={lng} />
    </div>
  );
}
