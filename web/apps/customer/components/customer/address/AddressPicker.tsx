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
import { motion, AnimatePresence } from "framer-motion";

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
  onSelected?: (address: Address) => void;
  onLocationChanged?: (label: string) => void;
}) {
  const { data: sessionData, isLoading: sessionLoading } = useSessionQuery();
  const isLoggedIn = !!sessionData?.user;
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
    <button
      type="button"
      className="flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl font-bold text-sm bg-[var(--color-brand-light)] text-[var(--color-brand)] border border-[var(--color-brand-light)] hover:border-[var(--color-brand)]/30 transition-all shadow-sm"
      onClick={() => detectLocation(false)}
      disabled={detecting}
    >
      <PinIcon />
      {detecting ? "Detecting your location…" : "Use my current location"}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm"
      />
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 10 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        className="relative w-full max-w-md bg-white rounded-[24px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-white sticky top-0 z-10">
          <h2 className="text-xl font-black text-gray-900 tracking-tight">
            {view === "form" ? "Add address" : "Select Address"}
          </h2>
          <button
            className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors focus:outline-none"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="p-6 overflow-y-auto bg-gray-50/50 flex-1">
          <AnimatePresence mode="popLayout">
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10, height: 0 }}
                animate={{ opacity: 1, y: 0, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-4 bg-red-50 text-red-700 px-4 py-3 rounded-xl text-xs font-semibold border border-red-200"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="w-8 h-8 border-4 border-gray-200 border-t-[var(--color-brand)] rounded-full animate-spin" />
              <p className="text-sm font-semibold text-gray-500">Loading addresses…</p>
            </div>
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
      </motion.div>
    </div>
  );
}
