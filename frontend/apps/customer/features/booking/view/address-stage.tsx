"use client";

import type { Schemas } from "@vsolve/api-client";
import { Badge, EmptyState, Spinner } from "@vsolve/ui";

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
  onAddAddress: () => void;
}

function formatAddress(address: Address): string {
  return [address.line1, address.locality, address.city, address.postal_code]
    .filter(Boolean)
    .join(", ");
}

export function AddressStage({
  addresses,
  isLoading,
  serviceability,
  isCheckingServiceability,
  onSelect,
  onAddAddress,
}: AddressStageProps) {
  const { state } = useWorkspace();
  const selectedId = state.address?.id ?? null;

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
        action={
          <button
            type="button"
            onClick={onAddAddress}
            className="min-h-11 rounded-control bg-action px-4 font-semibold text-on-action"
          >
            Add an address
          </button>
        }
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

      <button
        type="button"
        onClick={onAddAddress}
        className="mt-3 min-h-11 rounded-control border border-line-strong px-4 font-semibold text-text hover:border-warm-600"
      >
        Use a different address
      </button>

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
    </fieldset>
  );
}
