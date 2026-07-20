"use client";

import { useCallback, useEffect, useState } from "react";
import { PinIcon } from "@/components/ui/AppIcons";
import {
  LocationError,
  detectCurrentLocation,
  reverseGeocode,
  storeActiveLocation,
  type StoredLocation,
} from "@/lib/location/geocode";
import {
  useSessionQuery,
  useAddressesQuery,
  useAddAddressMutation,
  useSelectAddressMutation,
} from "@/lib/query/hooks";
import {
  type Address,
  type AddrForm,
  EMPTY_FORM,
  validateAddressForm,
  buildAddressPayload,
  buildGuestFullAddress,
} from "./model";
import { AddressListView } from "./AddressListView";
import { AddressFormView } from "./AddressFormView";

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

  // The user moved the map pin: keep the coordinates and reverse-geocode them to
  // fill in the address fields (best-effort — coordinates are kept even if the
  // lookup fails, so the address can still be saved).
  const pickCoords = useCallback(async (lat: number, lng: number) => {
    setForm((prev) => ({ ...prev, lat, lng }));
    try {
      const geo = await reverseGeocode(lat, lng);
      setForm((prev) => ({
        ...prev,
        houseNumber: geo.houseNumber || prev.houseNumber,
        area: geo.area || prev.area,
        city: geo.city || prev.city,
        pincode: geo.pincode || prev.pincode,
      }));
    } catch {
      /* keep the picked coordinates even if the address lookup fails */
    }
  }, []);

  useEffect(() => {
    if (!open || loading) return;
    const shouldOpenForm = autoDetect || (isLoggedIn && addresses.length === 0);
    if (shouldOpenForm) {
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
    const validationError = validateAddressForm(form);
    if (validationError) {
      setError(validationError);
      return;
    }

    const payload = buildAddressPayload(form);

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
      const fullAddress = buildGuestFullAddress(payload);
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
          <AddressListView
            isLoggedIn={isLoggedIn}
            addresses={addresses}
            redirectAfterLogin={redirectAfterLogin}
            detectButton={detectButton}
            onSelectAddress={selectAddress}
            onAddNew={() => {
              setForm(EMPTY_FORM);
              setError("");
              setView("form");
            }}
            onClose={onClose}
          />
        ) : (
          <AddressFormView
            form={form}
            setField={setField}
            detectButton={detectButton}
            saving={saving}
            detecting={detecting}
            isLoggedIn={isLoggedIn}
            hasSavedAddresses={addresses.length > 0}
            onSubmit={saveAddress}
            onPickCoords={pickCoords}
            onBack={() => {
              setError("");
              setView("list");
            }}
          />
        )}
      </div>
    </div>
  );
}
