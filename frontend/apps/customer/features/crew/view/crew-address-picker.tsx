"use client";

import { useState } from "react";

import {
  useAddresses,
  useCreateAddress,
  useReverseGeocode,
  useUpdateAddress,
} from "@/features/addresses/queries";
import { useServiceability } from "@/features/booking/queries";
import { AddressStage } from "@/features/booking/view/address-stage";

/**
 * The preset's address control — `M2-FE-425`.
 *
 * The M1 `AddressStage` with M1's own queries behind it, exactly as
 * `RequirementAddressPicker` is. A second picker would be a second place a
 * Customer can create an address that behaves slightly differently.
 *
 * ## Why this is a second component rather than a reuse
 *
 * `RequirementAddressPicker` reads and writes the **four-screen flow's reducer**
 * through `useRequirement()`. The A3 preset is deliberately not that flow — it
 * is one screen with its own small state — so reusing it would mean mounting the
 * requirement provider around a screen that has no requirement reducer, which is
 * how a second flow quietly becomes the first one again. The address *plumbing*
 * is shared; only the six lines that say where the answer goes differ.
 *
 * ## Serviceability is checked and never blocks
 *
 * The same `POST /serviceability/check/` the cart runs. Nothing here refuses on
 * it. What does refuse is the rate card: an area with no published card answers
 * `is_available: false` and the screen routes to the quote flow, which is a
 * server verdict about price rather than a client lookup about coverage.
 */

export interface CrewAddressPickerProps {
  variantId: string;
  selectedAddressId: string | null;
  onSelect: (addressId: string) => void;
}

export function CrewAddressPicker({
  variantId,
  selectedAddressId,
  onSelect,
}: CrewAddressPickerProps) {
  const [locationError, setLocationError] = useState<string | null>(null);

  const addressesQuery = useAddresses();
  const addresses = addressesQuery.data ?? [];
  const selected = addresses.find((address) => address.id === selectedAddressId) ?? null;

  const reverseGeocode = useReverseGeocode();
  const createAddress = useCreateAddress();
  const updateAddress = useUpdateAddress();

  const serviceabilityQuery = useServiceability({
    postalCode: selected?.postal_code ?? null,
    serviceVariantId: variantId,
  });

  async function handleUseCurrentLocation() {
    setLocationError(null);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        if (typeof navigator === "undefined" || !navigator.geolocation) {
          reject(new Error("Location permission is not available on this device."));
          return;
        }
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          maximumAge: 30_000,
          timeout: 12_000,
        });
      });
      const resolved = await reverseGeocode.mutateAsync({
        latitude: position.coords.latitude.toFixed(6),
        longitude: position.coords.longitude.toFixed(6),
      });
      const created = await createAddress.mutateAsync({
        label: addresses.length === 0 ? "Home" : "Saved address",
        line1: resolved.line1,
        locality: resolved.locality,
        city: resolved.city,
        state: resolved.state,
        postal_code: resolved.postal_code,
        country_code: resolved.country_code,
        latitude: resolved.latitude,
        longitude: resolved.longitude,
        source: "REVERSE_GEOCODED",
        is_default: addresses.length === 0,
      });
      onSelect(created.id);
    } catch {
      // Denied permission, a timeout and an unreachable geocoder all mean the
      // same thing to the Customer: type it instead. The form is already on
      // screen, so this is a notice rather than a recovery path.
      setLocationError("We could not find you. Please choose or add an address below.");
    }
  }

  return (
    <AddressStage
      addresses={addresses}
      isLoading={addressesQuery.isPending}
      serviceability={serviceabilityQuery.data ?? null}
      isCheckingServiceability={serviceabilityQuery.isFetching}
      selectedAddressId={selectedAddressId}
      onSelect={(address) => onSelect(address.id)}
      onUseCurrentLocation={() => void handleUseCurrentLocation()}
      isUsingCurrentLocation={reverseGeocode.isPending || createAddress.isPending}
      locationError={locationError}
      onUpdateAddress={(id, patch) => updateAddress.mutate({ addressId: id, patch })}
      isUpdatingAddress={updateAddress.isPending}
    />
  );
}
