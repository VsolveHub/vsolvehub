"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { LocationError, detectCurrentLocation } from "@/lib/location/geocode";

type Address = {
  id: string;
  label: string;
  fullAddress: string;
  isDefault: boolean;
};

type Props = {
  addresses: Address[];
  selectedAddressId: string | null;
  onSelectAddress: (id: string) => void;
  onAddressSaved: (address: Address) => void;
  onNext: () => void;
};

export function BookingAddressStep({
  addresses,
  selectedAddressId,
  onSelectAddress,
  onAddressSaved,
  onNext,
}: Props) {
  const [mode, setMode] = useState<"saved" | "new" | "current">("saved");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [label, setLabel] = useState("Home");
  const [houseNumber, setHouseNumber] = useState("");
  const [landmark, setLandmark] = useState("");
  const [area, setArea] = useState("");
  const [city, setCity] = useState("Hyderabad");
  const [pincode, setPincode] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  async function useCurrentLocation() {
    setError("");
    setLoading(true);
    setMode("current");
    setLabel("Current location");
    try {
      const loc = await detectCurrentLocation();
      setCoords({ lat: loc.lat, lng: loc.lng });
      if (loc.houseNumber) setHouseNumber(loc.houseNumber);
      if (loc.area) setArea(loc.area);
      if (loc.city) setCity(loc.city);
      if (loc.pincode) setPincode(loc.pincode);
      if (!loc.area && !loc.city) {
        setError("We found your position but couldn't read the address — please complete the fields.");
      }
    } catch (err) {
      setError(
        err instanceof LocationError ? err.message : "Could not get your location. Please enter address manually."
      );
    } finally {
      setLoading(false);
    }
  }

  async function saveAddress() {
    setError("");
    const hasCoords = coords != null;
    if (!area || !city) {
      setError("Please fill in at least area and city");
      return;
    }
    if (pincode && pincode.length !== 6) {
      setError("Enter a valid 6-digit pincode");
      return;
    }
    if (!hasCoords && !pincode) {
      // keep pincode optional when GPS coords are present; otherwise require it
      setError("Please add a 6-digit pincode or use your current location");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/profile/addresses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: mode === "current" ? "Current location" : label,
        houseNumber,
        landmark,
        area,
        city,
        pincode,
        lat: coords?.lat,
        lng: coords?.lng,
        isDefault: addresses.length === 0,
      }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError("Could not save address");
      return;
    }

    onAddressSaved(data.address);
    onSelectAddress(data.address.id);
    setMode("saved");
  }

  function handleNext() {
    if (!selectedAddressId && mode !== "new" && mode !== "current") {
      setError("Please select or add an address");
      return;
    }
    if (mode === "new" || mode === "current") {
      saveAddress().then(() => onNext());
      return;
    }
    onNext();
  }

  return (
    <div className="stack-lg booking-address-step">
      <div className="booking-mode-tabs">
        <button
          type="button"
          className={`booking-mode-tab ${mode === "saved" ? "active" : ""}`}
          onClick={() => {
            setMode("saved");
            setError("");
          }}
        >
          Saved
        </button>
        <button
          type="button"
          className={`booking-mode-tab ${mode === "current" ? "active" : ""}`}
          onClick={useCurrentLocation}
        >
          Current location
        </button>
        <button
          type="button"
          className={`booking-mode-tab ${mode === "new" ? "active" : ""}`}
          onClick={() => {
            setMode("new");
            setError("");
          }}
        >
          Add new
        </button>
      </div>

      {mode === "saved" && (
        <div className="booking-address-list">
          {addresses.map((addr) => (
            <button
              key={addr.id}
              type="button"
              className={`card address-card ${selectedAddressId === addr.id ? "selected" : ""}`}
              onClick={() => onSelectAddress(addr.id)}
            >
              <p className="address-label">
                {addr.label} {addr.isDefault && <span className="text-sm text-muted">(Default)</span>}
              </p>
              <p className="address-text">{addr.fullAddress}</p>
            </button>
          ))}
        </div>
      )}

      {(mode === "new" || mode === "current") && (
        <div className="card stack">
          {mode === "new" && (
            <Input label="Label" placeholder="Home, Work…" value={label} onChange={(e) => setLabel(e.target.value)} />
          )}
          <Input
            label="House / flat no."
            placeholder="Flat 204, Block B"
            value={houseNumber}
            onChange={(e) => setHouseNumber(e.target.value)}
          />
          <Input
            label="Landmark"
            placeholder="Near metro station"
            value={landmark}
            onChange={(e) => setLandmark(e.target.value)}
          />
          <Input label="Area" placeholder="Gachibowli" value={area} onChange={(e) => setArea(e.target.value)} />
          <Input label="City" value={city} onChange={(e) => setCity(e.target.value)} />
          <Input
            label="Pincode"
            placeholder="500032"
            value={pincode}
            onChange={(e) => setPincode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          />
          {mode === "current" && coords && (
            <p className="text-sm text-muted">
              GPS: {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}
            </p>
          )}
        </div>
      )}

      {error && <div className="alert alert-error">{error}</div>}

      <Button onClick={handleNext} loading={loading} disabled={loading} block>
        Next
      </Button>
    </div>
  );
}
