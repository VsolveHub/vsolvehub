"use client";

import type { Schemas } from "@vsolve/api-client";
import { describeError } from "@vsolve/query";
import { useEffect, useRef, useState } from "react";

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

type Address = Schemas["Address"];

export interface CrewAddressPickerProps {
  variantId: string;
  selectedAddressId: string | null;
  onSelect: (addressId: string) => void;
  /** See `AddressStage`'s own prop. The booking form uses the promoted row. */
  presentation?: "card" | "row" | "none";
  /** Opens the dialog from outside, for a caller with its own trigger row. */
  openSignal?: number;
  /**
   * Called whenever the resolved address changes, including on first load.
   *
   * The booking screen needs the address itself, not just its id — the rate
   * rail names the city the card is published for, and the city is the
   * Customer's own answer rather than a field `RatePreview` carries. Passing the
   * record up beats making the screen mount `useAddresses` a second time to look
   * up an id it already handed down.
   */
  onResolved?: (address: Address | null) => void;
}

export function CrewAddressPicker({
  variantId,
  selectedAddressId,
  onSelect,
  presentation = "card",
  openSignal,
  onResolved,
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

  /**
   * Coverage for the pincode being *typed*, which is a different question from
   * coverage for the address already chosen.
   *
   * A second query rather than a shared one: they answer about different
   * postcodes at the same time, and collapsing them would make the add form's
   * verdict flicker to the selected address's answer every time the draft
   * cleared. Six characters or nothing, so a half-typed pincode does not send a
   * request per keystroke.
   */
  const [draftPostalCode, setDraftPostalCode] = useState("");
  const draftServiceabilityQuery = useServiceability({
    postalCode: draftPostalCode.trim().length === 6 ? draftPostalCode.trim() : null,
    serviceVariantId: variantId,
  });

  // Reported from an effect rather than from `onSelect`, because the address
  // list arrives asynchronously: a Customer returning to a screen that already
  // holds an id would otherwise never see the record resolve, since nothing
  // called `onSelect` on that path. Keyed on the id so a refetch that returns an
  // equal-but-new object does not re-notify on every poll.
  const reportedId = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (onResolved === undefined) return;
    const resolvedId = selected?.id ?? null;
    if (reportedId.current === resolvedId) return;
    reportedId.current = resolvedId;
    onResolved(selected);
  }, [onResolved, selected]);

  /**
   * The device's position, resolved into address fields. **Saves nothing.**
   *
   * This used to reverse-geocode and immediately `POST /addresses/`, so the
   * Customer's address book filled up with records labelled "Saved address"
   * carrying whatever first line the geocoder guessed — and no screen ever
   * offered them the chance to correct it. Now it returns the fields and the
   * form in the dialog is where they are checked, which is also what makes
   * `latitude`/`longitude` obtainable at all: they are required on
   * `AddressRequest` and there is no forward geocoder.
   */
  async function locate(): Promise<Schemas["ReverseGeocodeResponse"] | null> {
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
      return await reverseGeocode.mutateAsync({
        latitude: position.coords.latitude.toFixed(6),
        longitude: position.coords.longitude.toFixed(6),
      });
    } catch {
      // Denied permission, a timeout and an unreachable geocoder all mean the
      // same thing to the Customer: the pin is not coming from here. The
      // message renders inside the dialog, next to the control they pressed.
      setLocationError(
        "We could not find you. Check location permission for this site and try again.",
      );
      return null;
    }
  }

  /** Writes the address the Customer checked. Returns null so the form can stay open. */
  async function create(
    request: Schemas["AddressRequest"],
  ): Promise<Schemas["Address"] | null> {
    try {
      return await createAddress.mutateAsync({
        ...request,
        // The first address a Customer saves becomes their default. Deciding it
        // here rather than offering a checkbox: nobody's first address is not
        // their default, and a second one should not silently steal the flag.
        is_default: addresses.length === 0,
      });
    } catch {
      return null; // `createError` renders inside the form.
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
      // Retained for the empty-state path in callers that have not adopted the
      // form. With `addNew` supplied the dialog offers the form instead.
      onUseCurrentLocation={() => void locate()}
      isUsingCurrentLocation={reverseGeocode.isPending}
      locationError={locationError}
      onUpdateAddress={(id, patch) => updateAddress.mutate({ addressId: id, patch })}
      isUpdatingAddress={updateAddress.isPending}
      presentation={presentation}
      openSignal={openSignal}
      addNew={{
        onLocate: locate,
        isLocating: reverseGeocode.isPending,
        locateError: locationError,
        onCreate: create,
        isCreating: createAddress.isPending,
        createError:
          createAddress.error === null
            ? null
            : describeError(createAddress.error, "mutation").message,
        onPostalCodeChange: setDraftPostalCode,
        draftServiceability: draftServiceabilityQuery.data ?? null,
        isCheckingDraftServiceability: draftServiceabilityQuery.isFetching,
      }}
    />
  );
}
