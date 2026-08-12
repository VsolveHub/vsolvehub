"use client";

import { useState } from "react";

import {
  useAddresses,
  useCreateAddress,
  useReverseGeocode,
  useUpdateAddress,
} from "@/features/addresses/queries";
import { AddressStage } from "@/features/booking/view/address-stage";
import { useServiceability } from "@/features/booking/queries";

import { useRequirement } from "./requirement-context";

/**
 * Screen 2's address control.
 *
 * `WhereWhenScreen` takes the picker as a slot rather than owning it, so the
 * screen stays free of a second data dependency. This is what fills the slot,
 * and it is the M1 `AddressStage` with M1's own queries behind it — the address
 * book is a published surface with one implementation, and a second picker
 * would be a second place a Customer can create an address that behaves
 * slightly differently.
 *
 * ## Serviceability is checked here and never blocks
 *
 * The same `POST /serviceability/check/` the cart runs, against this variant.
 * `AddressStage` renders the verdict; nothing here refuses on it. A requirement
 * is free and Operations can cover an area manually, so an unserviceable
 * postcode is a warning the Customer should see rather than a door closed by a
 * lookup that is itself only advisory. The submit command re-checks it, and
 * `_assert_submittable` is where a genuine refusal comes from.
 */

export interface RequirementAddressPickerProps {
  /** The variant serviceability is checked against. */
  variantId: string;
}

export function RequirementAddressPicker({ variantId }: RequirementAddressPickerProps) {
  const { state, dispatch } = useRequirement();
  const [locationError, setLocationError] = useState<string | null>(null);

  const addressesQuery = useAddresses();
  const addresses = addressesQuery.data ?? [];
  const selected = addresses.find((address) => address.id === state.addressId) ?? null;

  const reverseGeocode = useReverseGeocode();
  const createAddress = useCreateAddress();
  const updateAddress = useUpdateAddress();

  const serviceabilityQuery = useServiceability({
    postalCode: selected?.postal_code ?? null,
    serviceVariantId: variantId,
  });

  /** Turns a device fix into a saved address, then selects it. */
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
      dispatch({ type: "SET_ADDRESS", addressId: created.id });
    } catch {
      // Denied permission, a timeout and an unreachable geocoder all land here
      // and all mean the same thing to the Customer: type it instead. The
      // address form below is already on screen, so this is a notice rather
      // than a recovery path.
      setLocationError("We could not find you. Please choose or add an address below.");
    }
  }

  return (
    <AddressStage
      addresses={addresses}
      isLoading={addressesQuery.isPending}
      serviceability={serviceabilityQuery.data ?? null}
      isCheckingServiceability={serviceabilityQuery.isFetching}
      selectedAddressId={state.addressId}
      onSelect={(address) => dispatch({ type: "SET_ADDRESS", addressId: address.id })}
      onUseCurrentLocation={() => void handleUseCurrentLocation()}
      isUsingCurrentLocation={reverseGeocode.isPending || createAddress.isPending}
      locationError={locationError}
      onUpdateAddress={(id, patch) => updateAddress.mutate({ addressId: id, patch })}
      isUpdatingAddress={updateAddress.isPending}
    />
  );
}
