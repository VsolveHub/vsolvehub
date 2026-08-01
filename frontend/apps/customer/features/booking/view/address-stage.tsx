"use client";

import type { Schemas } from "@vsolve/api-client";
import { Badge, Button, EmptyState, Field, Input, Spinner } from "@vsolve/ui";
import { useState, type FormEvent } from "react";

import { ChoiceCard } from "./choice-card";
import { useWorkspace } from "./workspace-context";

/**
 * Where the work happens, and whether Vsolve Hub covers it.
 *
 * Doc 03 §1 puts location before requirements, and doc 11 §2.1 makes a geocoded
 * serviceable address a hard precondition for Instant. Both are served by asking
 * first — see the note in `model/stages.ts` about reconciling the ordering.
 *
 * Serviceability is a server verdict, never inferred from the postal code
 * client-side. Until the check answers, this shows that it is checking rather
 * than assuming yes; an optimistic "we cover you" that later turns out false is
 * worse than a two-second wait.
 */

type Address = Schemas["Address"];
type AddressPatch = Schemas["PatchedAddressRequest"];

/** An address is geocoded when the server stored coordinates for it. */
export function isGeocoded(address: Address): boolean {
  return Boolean(address.latitude) && Boolean(address.longitude);
}

export interface AddressStageProps {
  addresses: readonly Address[];
  isLoading: boolean;
  /** Verdict for the selected address, or null while it is being checked. */
  serviceability: Schemas["ServiceabilityResponse"] | null;
  isCheckingServiceability: boolean;
  onSelect: (address: Address) => void;
  onUseCurrentLocation: () => void;
  isUsingCurrentLocation: boolean;
  locationError?: string | null;
  onUpdateAddress: (addressId: string, patch: AddressPatch) => void;
  isUpdatingAddress: boolean;
  updateError?: string | null;
}

function formatAddress(address: Address): string {
  return [address.line1, address.locality, address.city, address.postal_code]
    .filter(Boolean)
    .join(", ");
}

function toEditableAddress(address: Address | null): AddressPatch {
  if (!address) return {};

  return {
    label: address.label,
    line1: address.line1,
    line2: address.line2 ?? "",
    landmark: address.landmark ?? "",
    locality: address.locality,
    city: address.city,
    state: address.state,
    postal_code: address.postal_code,
  };
}

export function AddressStage({
  addresses,
  isLoading,
  serviceability,
  isCheckingServiceability,
  onSelect,
  onUseCurrentLocation,
  isUsingCurrentLocation,
  locationError = null,
  onUpdateAddress,
  isUpdatingAddress,
  updateError = null,
}: AddressStageProps) {
  const { state } = useWorkspace();
  const selectedId = state.address?.id ?? null;
  const selectedAddress = addresses.find((address) => address.id === selectedId) ?? null;
  const [editedDraft, setEditedDraft] = useState<{
    addressId: string | null;
    value: AddressPatch;
  }>({ addressId: null, value: {} });
  const draft =
    editedDraft.addressId === selectedId ? editedDraft.value : toEditableAddress(selectedAddress);

  function updateDraft(field: keyof AddressPatch, value: string) {
    setEditedDraft((current) => ({
      addressId: selectedId,
      value: {
        ...(current.addressId === selectedId ? current.value : draft),
        [field]: value,
      },
    }));
  }

  function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedAddress) return;
    onUpdateAddress(selectedAddress.id, draft);
  }

  const locationAction = (
    <div>
      <Button
        type="button"
        onClick={onUseCurrentLocation}
        loading={isUsingCurrentLocation}
        loadingLabel="Finding your location"
      >
        Use my current location
      </Button>
      <p className="mt-2 text-sm text-text-secondary">
        Your browser will ask for permission. We save the address only after the
        server reverse-geocodes the pinned location.
      </p>
      {locationError ? (
        <p role="alert" className="mt-2 text-sm font-medium text-danger-text">
          {locationError}
        </p>
      ) : null}
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 py-8 text-text-secondary">
        <Spinner />
        <span>Loading your saved addresses…</span>
      </div>
    );
  }

  if (addresses.length === 0) {
    return (
      <EmptyState
        title="Add the address for this job"
        description="We need it to check that we cover your area and to send someone to the right place."
        action={locationAction}
      />
    );
  }

  return (
    <fieldset className="border-0 p-0">
      <legend className="text-lg font-semibold text-text">Where do you need this?</legend>
      <p className="mt-1 text-sm text-text-secondary">
        Choose the address for this job.
      </p>

      <div className="mt-4 flex flex-col gap-3">
        {addresses.map((address) => (
          <ChoiceCard
            key={address.id}
            name="address"
            value={address.id}
            checked={selectedId === address.id}
            onSelect={() => onSelect(address)}
            title={address.label || "Saved address"}
            description={formatAddress(address)}
            trailing={
              // Doc 11 §2.1: without coordinates there is nothing to rank and
              // nothing to pre-check, so Instant is refused. Saying so here —
              // where it can be fixed — beats a confusing refusal three stages
              // later.
              isGeocoded(address) ? null : <Badge tone="warning">Not pinned on map</Badge>
            }
          />
        ))}
      </div>

      <div className="mt-4 rounded-card border border-line bg-surface p-4">
        <h3 className="text-sm font-semibold text-text">Add another pinned address</h3>
        <div className="mt-3">{locationAction}</div>
      </div>

      <div className="mt-5" aria-live="polite">
        {isCheckingServiceability ? (
          <p className="flex items-center gap-2 text-sm text-text-secondary">
            <Spinner />
            Checking whether we cover this area…
          </p>
        ) : serviceability === null ? null : serviceability.is_serviceable ? (
          <p className="text-sm font-medium text-success-text">
            We cover this area.
          </p>
        ) : (
          <div className="rounded-card border border-warning-line bg-warning-surface p-4">
            <p className="font-semibold text-warning-text">
              We do not cover this address yet
            </p>
            <p className="mt-1 text-sm text-text-secondary">
              We are expanding across Hyderabad. Try another saved address, or
              check back soon.
            </p>
          </div>
        )}
      </div>

      {selectedAddress ? (
        <form onSubmit={submitEdit} className="mt-6 rounded-card border border-line bg-surface p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-text">Edit selected address</h3>
              <p className="mt-1 text-sm text-text-secondary">
                Text changes keep the existing pin. Use current location again
                if the pin itself is wrong.
              </p>
            </div>
            {isGeocoded(selectedAddress) ? (
              <Badge tone="success">Pinned</Badge>
            ) : (
              <Badge tone="warning">Pin missing</Badge>
            )}
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Label" required>
              <Input
                value={draft.label ?? ""}
                onChange={(event) => updateDraft("label", event.target.value)}
              />
            </Field>
            <Field label="House, flat or building" required>
              <Input
                value={draft.line1 ?? ""}
                onChange={(event) => updateDraft("line1", event.target.value)}
              />
            </Field>
            <Field label="Locality" required>
              <Input
                value={draft.locality ?? ""}
                onChange={(event) => updateDraft("locality", event.target.value)}
              />
            </Field>
            <Field label="City" required>
              <Input
                value={draft.city ?? ""}
                onChange={(event) => updateDraft("city", event.target.value)}
              />
            </Field>
            <Field label="State" required>
              <Input
                value={draft.state ?? ""}
                onChange={(event) => updateDraft("state", event.target.value)}
              />
            </Field>
            <Field label="PIN code" required>
              <Input
                inputMode="numeric"
                value={draft.postal_code ?? ""}
                onChange={(event) => updateDraft("postal_code", event.target.value)}
              />
            </Field>
            <Field label="Line 2">
              <Input
                value={draft.line2 ?? ""}
                onChange={(event) => updateDraft("line2", event.target.value)}
              />
            </Field>
            <Field label="Landmark">
              <Input
                value={draft.landmark ?? ""}
                onChange={(event) => updateDraft("landmark", event.target.value)}
              />
            </Field>
          </div>

          {updateError ? (
            <p role="alert" className="mt-4 text-sm font-medium text-danger-text">
              {updateError}
            </p>
          ) : null}

          <div className="mt-4">
            <Button
              type="submit"
              variant="secondary"
              loading={isUpdatingAddress}
              loadingLabel="Saving address"
            >
              Save address
            </Button>
          </div>
        </form>
      ) : null}
    </fieldset>
  );
}
