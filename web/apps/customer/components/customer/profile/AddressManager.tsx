"use client";

import { useState } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { PinIcon } from "@/components/ui/AppIcons";
import { LocationError, detectCurrentLocation } from "@/lib/location/geocode";

type Address = {
  id: string;
  label: string;
  fullAddress: string;
  isDefault: boolean;
};

type FormState = {
  label: string;
  houseNumber: string;
  landmark: string;
  area: string;
  city: string;
  pincode: string;
  lat?: number;
  lng?: number;
};

const EMPTY: FormState = {
  label: "Home",
  houseNumber: "",
  landmark: "",
  area: "",
  city: "",
  pincode: "",
};

export function AddressManager({ initialAddresses }: { initialAddresses: Address[] }) {
  const [addresses, setAddresses] = useState(initialAddresses);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [error, setError] = useState("");

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function detect() {
    setError("");
    setDetecting(true);
    try {
      const loc = await detectCurrentLocation();
      setForm((prev) => ({
        ...prev,
        houseNumber: loc.houseNumber || prev.houseNumber,
        area: loc.area || prev.area,
        city: loc.city || prev.city,
        pincode: loc.pincode || prev.pincode,
        lat: loc.lat,
        lng: loc.lng,
      }));
      if (!loc.area && !loc.city) {
        setError("We found your position but couldn't read the address — please complete the fields.");
      }
    } catch (err) {
      setError(err instanceof LocationError ? err.message : "Couldn't get your location.");
    } finally {
      setDetecting(false);
    }
  }

  async function addAddress() {
    setError("");
    if (!form.label.trim()) {
      setError("Label is required");
      return;
    }
    if ((!form.area.trim() || !form.city.trim()) && form.lat == null) {
      setError("Enter an area and city, or use your current location.");
      return;
    }
    if (form.pincode && !/^\d{6}$/.test(form.pincode)) {
      setError("Enter a valid 6-digit pincode");
      return;
    }

    setSaving(true);
    const res = await fetch("/api/profile/addresses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: form.label.trim(),
        houseNumber: form.houseNumber.trim() || undefined,
        landmark: form.landmark.trim() || undefined,
        area: form.area.trim() || undefined,
        city: form.city.trim() || undefined,
        pincode: form.pincode.trim() || undefined,
        lat: form.lat,
        lng: form.lng,
        isDefault: addresses.length === 0,
      }),
    });
    setSaving(false);
    if (res.ok) {
      const { address } = await res.json();
      setAddresses((prev) => [...prev, address]);
      setForm(EMPTY);
      setShowForm(false);
    } else {
      setError("Could not save address. Please check the fields.");
    }
  }

  async function removeAddress(id: string) {
    await fetch(`/api/profile/addresses?id=${id}`, { method: "DELETE" });
    setAddresses((prev) => prev.filter((a) => a.id !== id));
  }

  return (
    <div className="stack-lg">
      <div className="flex-between">
        <p className="text-muted">Manage delivery addresses for bookings.</p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setError("");
            setShowForm(!showForm);
          }}
        >
          {showForm ? "Cancel" : "Add address"}
        </Button>
      </div>

      {showForm && (
        <div className="card stack">
          <button type="button" className="detect-location-btn" onClick={detect} disabled={detecting}>
            <PinIcon />
            {detecting ? "Detecting your location…" : "Use my current location"}
          </button>

          <Input label="Label" value={form.label} onChange={(e) => setField("label", e.target.value)} placeholder="Home, Office…" />
          <div className="grid-2">
            <Input label="House / flat no." value={form.houseNumber} onChange={(e) => setField("houseNumber", e.target.value)} placeholder="Flat 204, Block B" />
            <Input
              label="Pincode"
              value={form.pincode}
              onChange={(e) => setField("pincode", e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="500032"
              inputMode="numeric"
            />
          </div>
          <Input label="Landmark" value={form.landmark} onChange={(e) => setField("landmark", e.target.value)} placeholder="Near metro station" />
          <div className="grid-2">
            <Input label="Area / locality" value={form.area} onChange={(e) => setField("area", e.target.value)} placeholder="Gachibowli" />
            <Input label="City" value={form.city} onChange={(e) => setField("city", e.target.value)} placeholder="Hyderabad" />
          </div>

          {error && <div className="alert alert-error">{error}</div>}

          <Button onClick={addAddress} loading={saving} disabled={saving || detecting}>
            Save address
          </Button>
        </div>
      )}

      {addresses.length === 0 ? (
        <div className="empty-state">
          <p>No addresses saved yet.</p>
        </div>
      ) : (
        <div className="stack">
          {addresses.map((addr) => (
            <div key={addr.id} className="address-premium-card">
              <div className="address-card-header">
                <div className="address-label-wrap">
                  <span className="address-icon">📍</span>
                  <h3 className="address-label-title">{addr.label}</h3>
                  {addr.isDefault && <span className="address-badge-default">Default</span>}
                </div>
                <button type="button" className="address-remove-btn" onClick={() => removeAddress(addr.id)}>
                  Remove
                </button>
              </div>
              <p className="address-full-text">{addr.fullAddress}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
