"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PinIcon } from "@/components/ui/AppIcons";
import { getCookie } from "@/lib/cookies";
import {
  LocationError,
  detectCurrentLocation,
  storeActiveLocation,
  formatLocationLabel,
  type StoredLocation,
} from "@/lib/location/geocode";
import {
  useSessionQuery,
  useAddressesQuery,
  useAddAddressMutation,
  useSelectAddressMutation,
} from "@/lib/query/hooks";

type Address = {
  id: string;
  label: string;
  fullAddress: string;
  isDefault: boolean;
  area?: string | null;
  city?: string | null;
};

type AddrForm = {
  label: string;
  houseNumber: string;
  landmark: string;
  area: string;
  city: string;
  pincode: string;
  lat?: number;
  lng?: number;
};

const EMPTY_FORM: AddrForm = {
  label: "Home",
  houseNumber: "",
  landmark: "",
  area: "",
  city: "",
  pincode: "",
};

/**
 * Shared address select/add modal. Used by both the app header (location chip)
 * and the booking flow (so a first-time customer can add an address without
 * leaving the flow). Reverse-geocoding goes through the /api/geocode/reverse
 * proxy via `detectCurrentLocation`.
 */
export function AddressPicker({
  open,
  autoDetect = false,
  redirectAfterLogin = "/",
  onClose,
  onSelected,
  onLocationChanged,
}: {
  open: boolean;
  autoDetect?: boolean;
  redirectAfterLogin?: string;
  onClose: () => void;
  /** Fired with the chosen/added address (logged-in users). */
  onSelected?: (address: Address) => void;
  /** Fired with the display label (used by the header chip; also fires for guests). */
  onLocationChanged?: (label: string) => void;
}) {
  const { data: sessionData, isLoading: sessionLoading } = useSessionQuery();
  const isLoggedIn = !!sessionData?.user;
  // Only fetch addresses while the modal is actually open, so mounting it closed
  // on every page (header) adds no background request.
  const { data: addressesData, isLoading: addressesLoading } = useAddressesQuery({ enabled: isLoggedIn && open });
  const addresses: Address[] = addressesData?.addresses || [];
  const loading = sessionLoading || (isLoggedIn && addressesLoading);

  const addAddressMutation = useAddAddressMutation();
  const selectAddressMutation = useSelectAddressMutation();

  const [view, setView] = useState<"list" | "form">("list");
  const [form, setForm] = useState<AddrForm>(EMPTY_FORM);
  const [error, setError] = useState("");
  const [detecting, setDetecting] = useState(false);

  const saving = addAddressMutation.isPending || selectAddressMutation.isPending;

  function setField<K extends keyof AddrForm>(key: K, value: AddrForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const notifyChanged = useCallback(
    (loc: StoredLocation) => {
      const display = storeActiveLocation(loc);
      onLocationChanged?.(display);
    },
    [onLocationChanged],
  );

  const detectLocation = useCallback(async (autoLabel = false) => {
    setError("");
    setDetecting(true);
    try {
      const loc = await detectCurrentLocation();
      setForm((prev) => ({
        ...prev,
        label: autoLabel || !prev.label ? "Current location" : prev.label,
        houseNumber: loc.houseNumber || prev.houseNumber,
        landmark: prev.landmark,
        area: loc.area || prev.area,
        city: loc.city || prev.city,
        pincode: loc.pincode || prev.pincode,
        lat: loc.lat,
        lng: loc.lng,
      }));
      setView("form");
      if (!loc.area && !loc.city) {
        setError("We found your position but couldn't read the address — please complete the fields.");
      }
    } catch (err) {
      const message = err instanceof LocationError ? err.message : "Couldn't get your location.";
      setError(message);
      setView("form");
    } finally {
      setDetecting(false);
    }
  }, []);

  useEffect(() => {
    if (!open || loading) return;
    if (autoDetect || (isLoggedIn && addresses.length === 0)) {
      setView("form");
      if (autoDetect) detectLocation(true);
    }
  }, [open, autoDetect, isLoggedIn, addresses.length, loading, detectLocation]);

  if (!open) return null;

  function selectAddress(id: string) {
    setError("");
    selectAddressMutation.mutate(id, {
      onSuccess: (data) => {
        if (data?.address) {
          const a = data.address as Address;
          notifyChanged({ id: a.id, label: a.label, area: a.area, city: a.city, fullAddress: a.fullAddress });
          onSelected?.(a);
          onClose();
        } else {
          setError("Failed to select address");
        }
      },
      onError: (err: any) => setError(err?.message || "Failed to select address"),
    });
  }

  function saveAddress(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.label.trim()) {
      setError("Label is required");
      return;
    }
    const hasArea = form.area.trim() && form.city.trim();
    const hasCoords = form.lat != null && form.lng != null;
    if (!hasArea && !hasCoords) {
      setError("Enter at least an area and city, or use your current location.");
      return;
    }
    if (form.pincode && !/^\d{6}$/.test(form.pincode)) {
      setError("Enter a valid 6-digit pincode");
      return;
    }

    const payload = {
      label: form.label.trim(),
      houseNumber: form.houseNumber.trim() || undefined,
      landmark: form.landmark.trim() || undefined,
      area: form.area.trim() || undefined,
      city: form.city.trim() || undefined,
      pincode: form.pincode.trim() || undefined,
      lat: form.lat,
      lng: form.lng,
    };

    if (isLoggedIn) {
      addAddressMutation.mutate(
        { ...payload, isDefault: addresses.length === 0 },
        {
          onSuccess: (data) => {
            setForm(EMPTY_FORM);
            selectAddress(data.address.id);
          },
          onError: (err: any) => setError(err?.message || "Failed to save address. Please check the fields."),
        },
      );
    } else {
      const fullAddress = [
        payload.houseNumber,
        payload.landmark,
        payload.area,
        [payload.city, payload.pincode].filter(Boolean).join(" — "),
      ]
        .filter(Boolean)
        .join(", ");
      notifyChanged({ label: payload.label, area: payload.area, city: payload.city, fullAddress });
      onClose();
    }
  }

  const detectButton = (
    <button type="button" className="addr-detect-btn" onClick={() => detectLocation(false)} disabled={detecting}>
      <PinIcon />
      {detecting ? "Detecting your location…" : "Use my current location"}
    </button>
  );

  return (
    <div className="addr-modal-backdrop" onClick={onClose}>
      <div className="addr-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="addr-modal-header">
          <h2 className="addr-modal-title">{view === "form" ? "Add address" : "Select Address"}</h2>
          <button className="addr-modal-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        {error && (
          <div
            className="alert alert-error"
            style={{ fontSize: "0.8rem", padding: "0.6rem 0.75rem", borderRadius: "8px", margin: 0 }}
          >
            {error}
          </div>
        )}

        {loading ? (
          <p style={{ textAlign: "center", fontSize: "0.875rem" }}>Loading addresses…</p>
        ) : view === "list" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {detectButton}

            {isLoggedIn ? (
              <>
                <div className="addr-modal-list">
                  {addresses.map((addr) => {
                    const active = getCookie("location_id") === addr.id || addr.isDefault;
                    return (
                      <div
                        key={addr.id}
                        className={`addr-item ${active ? "addr-item--active" : ""}`}
                        onClick={() => selectAddress(addr.id)}
                      >
                        <span className="addr-item__icon">📍</span>
                        <div className="addr-item__info">
                          <span className="addr-item__label">{addr.label}</span>
                          <span className="addr-item__text">{addr.fullAddress}</span>
                        </div>
                        {active && <span className="addr-item__check">✓</span>}
                      </div>
                    );
                  })}
                  {addresses.length === 0 && (
                    <p className="text-muted" style={{ textAlign: "center", fontSize: "0.875rem", margin: 0 }}>
                      No saved addresses yet.
                    </p>
                  )}
                </div>

                <button
                  className="addr-modal-btn"
                  style={{
                    background: "transparent",
                    color: "var(--color-brand)",
                    border: "1.5px dashed var(--color-brand)",
                    boxShadow: "none",
                  }}
                  onClick={() => {
                    setForm(EMPTY_FORM);
                    setError("");
                    setView("form");
                  }}
                >
                  + Add new address
                </button>
              </>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", textAlign: "center" }}>
                <p className="text-muted" style={{ fontSize: "0.825rem", margin: 0 }}>
                  Log in to save addresses to your account, or set one for this session below.
                </p>
                <Link
                  href={`/booking/otp?redirect=${encodeURIComponent(redirectAfterLogin)}`}
                  className="addr-modal-btn"
                  style={{ textDecoration: "none" }}
                  onClick={onClose}
                >
                  Log In / Register
                </Link>
                <button
                  className="addr-modal-btn"
                  style={{
                    background: "transparent",
                    color: "var(--color-brand)",
                    border: "1.5px dashed var(--color-brand)",
                    boxShadow: "none",
                  }}
                  onClick={() => {
                    setForm(EMPTY_FORM);
                    setError("");
                    setView("form");
                  }}
                >
                  Enter address manually
                </button>
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={saveAddress} className="addr-modal-form" style={{ border: "none", paddingTop: 0 }}>
            {detectButton}

            <div className="addr-input-group">
              <label className="addr-input-label">Label</label>
              <input
                type="text"
                placeholder="Home, Office, Parent's house…"
                value={form.label}
                onChange={(e) => setField("label", e.target.value)}
                className="addr-input"
                required
              />
            </div>

            <div className="addr-form-row">
              <div className="addr-input-group">
                <label className="addr-input-label">House / flat no.</label>
                <input
                  type="text"
                  placeholder="Flat 204, Block B"
                  value={form.houseNumber}
                  onChange={(e) => setField("houseNumber", e.target.value)}
                  className="addr-input"
                />
              </div>
              <div className="addr-input-group">
                <label className="addr-input-label">Pincode</label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="500032"
                  value={form.pincode}
                  onChange={(e) => setField("pincode", e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="addr-input"
                />
              </div>
            </div>

            <div className="addr-input-group">
              <label className="addr-input-label">Landmark</label>
              <input
                type="text"
                placeholder="Near metro station"
                value={form.landmark}
                onChange={(e) => setField("landmark", e.target.value)}
                className="addr-input"
              />
            </div>

            <div className="addr-form-row">
              <div className="addr-input-group">
                <label className="addr-input-label">Area / locality</label>
                <input
                  type="text"
                  placeholder="Gachibowli"
                  value={form.area}
                  onChange={(e) => setField("area", e.target.value)}
                  className="addr-input"
                />
              </div>
              <div className="addr-input-group">
                <label className="addr-input-label">City</label>
                <input
                  type="text"
                  placeholder="Hyderabad"
                  value={form.city}
                  onChange={(e) => setField("city", e.target.value)}
                  className="addr-input"
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button type="submit" className="addr-modal-btn" style={{ flexGrow: 1 }} disabled={saving || detecting}>
                {saving ? "Saving…" : "Save & select"}
              </button>
              {(isLoggedIn ? addresses.length > 0 : true) && (
                <button
                  type="button"
                  className="addr-modal-btn"
                  style={{
                    background: "var(--m3-surface-variant, #e7e0ec)",
                    color: "var(--m3-on-surface, #1d1b20)",
                    width: "auto",
                    boxShadow: "none",
                  }}
                  onClick={() => {
                    setError("");
                    setView("list");
                  }}
                >
                  {isLoggedIn && addresses.length > 0 ? "Back" : "Cancel"}
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
