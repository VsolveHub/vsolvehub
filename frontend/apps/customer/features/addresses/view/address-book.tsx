"use client";

import { describeError } from "@vsolve/query";
import { Badge, Button, Dialog, EmptyState, ErrorState, Skeleton } from "@vsolve/ui";
import { useState } from "react";

import {
  formatAddressLine,
  isGeocoded,
  useAddresses,
  useArchiveAddress,
  useCreateAddress,
  useUpdateAddress,
  type Address,
} from "../queries";
import { usePinLocation } from "../use-pin-location";
import {
  AddressForm,
  EMPTY_DRAFT,
  draftFromAddress,
  patchFromDraft,
  type AddressDraft,
} from "./address-form";

/**
 * The saved address book: list, add, edit, delete.
 *
 * Built as one self-contained component so checkout can mount it as-is instead
 * of rebuilding a picker around the same four mutations. It deliberately takes
 * no context and imports nothing from `features/account` — the account screen
 * supplies the page heading around it, and a future checkout will supply
 * whatever it needs.
 *
 * ## Deletion is confirmed, then verified
 *
 * Two separate guarantees. The dialog is the *confirmation* — an address is the
 * only thing here whose loss cannot be undone from the UI, and a stray tap on a
 * row action should not destroy it. `useArchiveAddress` is the *verification*:
 * it re-reads the list from Django before resolving, so this dialog closes when
 * the address is gone from the server's answer, not when the request left the
 * browser. A failed delete leaves the row exactly where it was.
 *
 * ## Privacy
 *
 * Address text is rendered and nothing else. It is not written to storage, not
 * logged, not put in a URL — the row action carries the address id, and the
 * confirmation reads the text out of the in-memory query cache. See
 * `queries.ts`; `addresses.storage.test.ts` enforces it.
 */

type Editing =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; address: Address };

interface Pin {
  latitude: string;
  longitude: string;
}

function AddressRow({
  address,
  onEdit,
  onDelete,
  isOnlyAddress,
}: {
  address: Address;
  onEdit: () => void;
  onDelete: () => void;
  isOnlyAddress: boolean;
}) {
  return (
    <li className="rounded-card border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-text">
              {address.label || "Saved address"}
            </h3>
            {address.is_default ? <Badge tone="info">Default</Badge> : null}
            {isGeocoded(address) ? null : <Badge tone="warning">Not pinned</Badge>}
          </div>
          <p className="mt-1 text-sm text-text-secondary">{formatAddressLine(address)}</p>
          {address.landmark ? (
            <p className="mt-0.5 text-sm text-text-muted">Near {address.landmark}</p>
          ) : null}
        </div>

        <div className="flex shrink-0 gap-1">
          <Button variant="ghost" onClick={onEdit}>
            Edit
          </Button>
          {/* Deleting the last address is allowed — Django decides, not this
              screen — but it is worth not making it the easiest thing to hit. */}
          <Button variant="ghost" onClick={onDelete}>
            Delete
          </Button>
        </div>
      </div>

      {isOnlyAddress && !isGeocoded(address) ? (
        <p className="mt-3 text-sm text-warning-text">
          Pin this address before you book — we cannot send anyone to an address
          without one.
        </p>
      ) : null}
    </li>
  );
}

export function AddressBook() {
  const addressesQuery = useAddresses();
  const createAddress = useCreateAddress();
  const updateAddress = useUpdateAddress();
  const archiveAddress = useArchiveAddress();
  const pinLocation = usePinLocation();

  /**
   * What just happened, announced politely.
   *
   * The app mounts no `ToastProvider`, and a dialog that simply vanishes tells
   * someone using a screen reader nothing at all. A live region on the page the
   * customer is already looking at says it once, where the change happened.
   */
  const [status, setStatus] = useState<string | null>(null);

  const [editing, setEditing] = useState<Editing>({ mode: "closed" });
  const [draft, setDraft] = useState<AddressDraft>(EMPTY_DRAFT);
  /**
   * Coordinates for the address being written.
   *
   * Held apart from the draft because they are not editable and not typed: on
   * create they are the only proof the address is real, and on edit they are the
   * pin being preserved. Kept in component state for the life of the dialog and
   * written nowhere else.
   */
  const [pin, setPin] = useState<Pin | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Address | null>(null);

  const addresses = addressesQuery.data ?? [];
  const saveError = editing.mode === "create" ? createAddress.error : updateAddress.error;
  const isSaving = createAddress.isPending || updateAddress.isPending;

  function closeEditor() {
    setEditing({ mode: "closed" });
    setDraft(EMPTY_DRAFT);
    setPin(null);
    pinLocation.reset();
    createAddress.reset();
    updateAddress.reset();
  }

  async function startCreate() {
    setEditing({ mode: "create" });
    setDraft({ ...EMPTY_DRAFT, is_default: addresses.length === 0 });
    setPin(null);
    pinLocation.reset();

    // Offer the pin immediately. Creating an address requires coordinates, so
    // asking for the fix first means the fields arrive filled in rather than
    // being typed and then thrown away by a re-pin.
    const resolved = await pinLocation.pin();
    if (!resolved) return;
    setPin({ latitude: resolved.latitude, longitude: resolved.longitude });
    setDraft((current) => ({
      ...current,
      line1: resolved.line1,
      locality: resolved.locality,
      city: resolved.city,
      state: resolved.state,
      postal_code: resolved.postal_code,
    }));
  }

  function startEdit(address: Address) {
    setEditing({ mode: "edit", address });
    setDraft(draftFromAddress(address));
    setPin(
      isGeocoded(address)
        ? { latitude: address.latitude, longitude: address.longitude }
        : null,
    );
    pinLocation.reset();
    updateAddress.reset();
  }

  async function repin() {
    const resolved = await pinLocation.pin();
    if (!resolved) return;
    setPin({ latitude: resolved.latitude, longitude: resolved.longitude });
    setDraft((current) => ({
      ...current,
      line1: resolved.line1,
      locality: resolved.locality,
      city: resolved.city,
      state: resolved.state,
      postal_code: resolved.postal_code,
    }));
  }

  async function save() {
    const patch = patchFromDraft(draft);

    try {
      if (editing.mode === "create") {
        if (!pin) return;
        await createAddress.mutateAsync({
          label: patch.label!,
          line1: patch.line1!,
          line2: patch.line2,
          landmark: patch.landmark,
          locality: patch.locality!,
          city: patch.city!,
          state: patch.state!,
          postal_code: patch.postal_code!,
          country_code: "IN",
          latitude: pin.latitude,
          longitude: pin.longitude,
          source: "REVERSE_GEOCODED",
          is_default: draft.is_default,
        });
        setStatus("Address saved.");
      } else if (editing.mode === "edit") {
        await updateAddress.mutateAsync({
          addressId: editing.address.id,
          // A re-pin during an edit replaces the coordinates too; without one
          // the pin is left alone rather than resent.
          patch:
            pin && !isGeocoded(editing.address)
              ? {
                  ...patch,
                  latitude: pin.latitude,
                  longitude: pin.longitude,
                  source: "REVERSE_GEOCODED",
                }
              : patch,
        });
        setStatus("Address updated.");
      }
      closeEditor();
    } catch {
      // Kept open with the draft intact so the customer can correct it. The
      // message is rendered by the form from the mutation's own error; nothing
      // is logged, because the rejected request carries the address.
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const label = pendingDelete.label || "Saved address";
    try {
      await archiveAddress.mutateAsync(pendingDelete.id);
      // Reached only after Django's list has been re-read without this row.
      setPendingDelete(null);
      // The label, never the address text: a live region is announced aloud,
      // and the street should not be read out across the room.
      setStatus(`${label} deleted.`);
    } catch {
      // The dialog stays open and shows why. Closing it here would suggest the
      // address is gone while it is still on the server.
    }
  }

  if (addressesQuery.isPending) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 2 }, (_, index) => (
          <Skeleton key={index} className="h-28 w-full" />
        ))}
      </div>
    );
  }

  if (addressesQuery.isError) {
    return (
      <ErrorState
        title="We could not load your addresses"
        message={describeError(addressesQuery.error, "read").message}
        actionLabel="Try again"
        onAction={() => void addressesQuery.refetch()}
        reference={describeError(addressesQuery.error, "read").reference}
      />
    );
  }

  return (
    <div>
      <p aria-live="polite" className="sr-only">
        {status ?? ""}
      </p>

      {addresses.length === 0 ? (
        <EmptyState
          title="No saved addresses"
          description="Save an address and we can send someone to the right door, and check that we cover your area before you book."
          action={
            <Button
              onClick={() => void startCreate()}
              loading={pinLocation.isPinning}
              loadingLabel="Finding your location"
            >
              Add an address
            </Button>
          }
        />
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {addresses.map((address) => (
              <AddressRow
                key={address.id}
                address={address}
                isOnlyAddress={addresses.length === 1}
                onEdit={() => startEdit(address)}
                onDelete={() => setPendingDelete(address)}
              />
            ))}
          </ul>

          <div className="mt-4">
            <Button
              variant="outline"
              onClick={() => void startCreate()}
              loading={pinLocation.isPinning && editing.mode === "closed"}
              loadingLabel="Finding your location"
            >
              Add another address
            </Button>
          </div>
        </>
      )}

      <Dialog
        open={editing.mode !== "closed"}
        onOpenChange={(open) => {
          if (!open && !isSaving) closeEditor();
        }}
        title={editing.mode === "edit" ? "Edit address" : "Add an address"}
        description={
          editing.mode === "edit"
            ? "Correct the details. The pin stays where it is unless you pin again."
            : "We use your location to fill this in, then you can correct anything we got wrong."
        }
      >
        {pinLocation.failureMessage ? (
          <p
            role="alert"
            className="mb-4 rounded-control border border-warning-line bg-warning-surface px-3 py-2.5 text-sm text-warning-text"
          >
            {pinLocation.failureMessage}
          </p>
        ) : null}

        {editing.mode === "create" && !pin ? (
          <p className="mb-4 text-sm text-text-secondary">
            An address needs a map pin before it can be saved. Pin your location
            to continue.
          </p>
        ) : null}

        <AddressForm
          draft={draft}
          onChange={setDraft}
          onSubmit={() => void save()}
          error={saveError}
          isSaving={isSaving}
          submitLabel={editing.mode === "edit" ? "Save changes" : "Save address"}
          onCancel={closeEditor}
          hasPin={pin !== null}
          onRepin={() => void repin()}
          isRepinning={pinLocation.isPinning}
          showDefaultToggle={addresses.length > 0}
        />
      </Dialog>

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open && !archiveAddress.isPending) {
            setPendingDelete(null);
            archiveAddress.reset();
          }
        }}
        title="Delete this address?"
        description="It will no longer be offered when you book. Bookings that already use it keep it."
        dismissable={!archiveAddress.isPending}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setPendingDelete(null);
                archiveAddress.reset();
              }}
              disabled={archiveAddress.isPending}
            >
              Keep it
            </Button>
            <Button
              variant="danger"
              onClick={() => void confirmDelete()}
              loading={archiveAddress.isPending}
              loadingLabel="Deleting address"
            >
              Delete address
            </Button>
          </>
        }
      >
        {pendingDelete ? (
          <div className="rounded-control border border-line bg-surface-sunken px-3 py-2.5">
            <p className="text-sm font-semibold text-text">
              {pendingDelete.label || "Saved address"}
            </p>
            <p className="mt-0.5 text-sm text-text-secondary">
              {formatAddressLine(pendingDelete)}
            </p>
          </div>
        ) : null}

        {archiveAddress.isError ? (
          <p role="alert" className="mt-3 text-sm font-medium text-danger-text">
            {describeError(archiveAddress.error, "mutation").message}
          </p>
        ) : null}
      </Dialog>
    </div>
  );
}
