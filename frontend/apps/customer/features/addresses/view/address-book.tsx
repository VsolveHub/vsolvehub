"use client";

import { describeError } from "@vsolve/query";
import { Badge, Button, Dialog, EmptyState, ErrorState, Skeleton } from "@vsolve/ui";
import { Home, MapPin, MoreVertical, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import {
  formatAddressLine,
  isGeocoded,
  useAddresses,
  useArchiveAddress,
  useCreateAddress,
  useUpdateAddress,
  type Address,
  type ResolvedLocation,
} from "../queries";
import {
  AddressForm,
  EMPTY_DRAFT,
  draftFromAddress,
  patchFromDraft,
  type AddressDraft,
} from "./address-form";
import { LocationPicker } from "./location-picker";

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

function AddressBookHeader({
  onAdd,
  adding,
}: {
  onAdd: () => void;
  adding: boolean;
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 min-[380px]:flex-row min-[380px]:items-start min-[380px]:justify-between md:hidden">
      <div className="min-w-0">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#FFF4EC] text-[#EA580C]">
            <MapPin className="size-4" strokeWidth={2.2} aria-hidden />
          </span>
          <h2 className="text-lg font-extrabold text-navy-900">Saved addresses</h2>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-text-secondary">
          Where we send someone when you book. Pick one at checkout instead of typing it again.
        </p>
      </div>
      <button
        type="button"
        onClick={onAdd}
        disabled={adding}
        className="inline-flex h-11 shrink-0 items-center justify-center gap-1 self-start rounded-full border border-[#EA580C] bg-white px-3.5 text-sm font-bold text-[#EA580C] shadow-xs transition-colors hover:bg-[#FFF8F3] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-70"
      >
        <Plus className="size-4" strokeWidth={2.4} aria-hidden />
        Add address
      </button>
    </div>
  );
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
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  return (
    <li className="overflow-hidden rounded-2xl border border-[#ece7e0] bg-white shadow-xs">
      <div className="flex items-start gap-3 p-4">
        <span className="mt-0.5 grid size-11 shrink-0 place-items-center rounded-full bg-[#FFF4EC] text-[#EA580C]">
          <Home className="size-5" strokeWidth={2} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-extrabold text-navy-900">
                  {address.label || "Saved address"}
                </h3>
                {address.is_default ? (
                  <Badge tone="info" className="rounded-md px-2 py-0.5">
                    Default
                  </Badge>
                ) : null}
                {isGeocoded(address) ? null : <Badge tone="warning">Not pinned</Badge>}
              </div>
              <p className="mt-1 break-words text-sm leading-relaxed text-text-secondary">
                {formatAddressLine(address)}
              </p>
              {address.landmark ? (
                <p className="mt-0.5 break-words text-sm text-text-muted">Near {address.landmark}</p>
              ) : null}
            </div>
            <div ref={menuRef} className="relative shrink-0">
              <button
                type="button"
                aria-label={`More actions for ${address.label || "saved address"}`}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-controls={menuId}
                onClick={() => setMenuOpen((open) => !open)}
                className="grid size-11 place-items-center rounded-full text-text-secondary transition-colors hover:bg-[#FAF9F7] hover:text-navy-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
              >
                <MoreVertical className="size-5" strokeWidth={2} aria-hidden />
              </button>
              {menuOpen ? (
                <div
                  id={menuId}
                  role="menu"
                  className="absolute right-0 z-10 mt-1 min-w-[9.5rem] overflow-hidden rounded-xl border border-line bg-white py-1 shadow-md"
                >
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold text-navy-900 hover:bg-[#FAF9F7]"
                    onClick={() => {
                      setMenuOpen(false);
                      onEdit();
                    }}
                  >
                    <Pencil className="size-3.5" strokeWidth={2} aria-hidden />
                    Edit
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold text-red-600 hover:bg-red-50"
                    onClick={() => {
                      setMenuOpen(false);
                      onDelete();
                    }}
                  >
                    <Trash2 className="size-3.5" strokeWidth={2} aria-hidden />
                    Delete
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 border-t border-[#ece7e0]">
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex min-h-11 items-center justify-center gap-1.5 border-r border-[#ece7e0] text-sm font-bold text-navy-800 transition-colors hover:bg-[#FAF9F7] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus-ring"
        >
          <Pencil className="size-3.5" strokeWidth={2.2} aria-hidden />
          Edit
        </button>
        {/* Deleting the last address is allowed — Django decides, not this
            screen — but it is worth not making it the easiest thing to hit. */}
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex min-h-11 items-center justify-center gap-1.5 text-sm font-bold text-red-600 transition-colors hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus-ring"
        >
          <Trash2 className="size-3.5" strokeWidth={2.2} aria-hidden />
          Delete
        </button>
      </div>

      {isOnlyAddress && !isGeocoded(address) ? (
        <p className="border-t border-[#ece7e0] px-4 py-3 text-sm text-warning-text">
          Pin this address before you book — we cannot send anyone to an address
          without one.
        </p>
      ) : null}
    </li>
  );
}

function AddressPromoArt() {
  return (
    <svg viewBox="0 0 88 72" className="h-16 w-20 shrink-0" aria-hidden>
      <rect x="18" y="28" width="48" height="32" rx="4" fill="#FFE8D4" />
      <path d="M14 32 42 12l28 20" fill="#FDBA8C" />
      <rect x="36" y="42" width="12" height="18" rx="1.5" fill="#EA580C" />
      <circle cx="64" cy="18" r="12" fill="#EA580C" />
      <path
        d="M64 11.5c-3.2 0-5.8 2.5-5.8 5.6 0 4.2 5.8 10.4 5.8 10.4s5.8-6.2 5.8-10.4c0-3.1-2.6-5.6-5.8-5.6Z"
        fill="white"
      />
      <circle cx="64" cy="17.1" r="2.1" fill="#EA580C" />
    </svg>
  );
}

export function AddressBook() {
  const addressesQuery = useAddresses();
  const createAddress = useCreateAddress();
  const updateAddress = useUpdateAddress();
  const archiveAddress = useArchiveAddress();

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
  /**
   * Whether the pin was moved during this edit. Only then are coordinates sent:
   * an untouched pin is left alone rather than resent.
   */
  const [repinned, setRepinned] = useState(false);
  const [formattedAddress, setFormattedAddress] = useState("");
  /** The dialog's two faces: the map, then the fields the pin filled. */
  const [step, setStep] = useState<"pin" | "form">("form");
  const [pendingDelete, setPendingDelete] = useState<Address | null>(null);

  const addresses = addressesQuery.data ?? [];
  const saveError = editing.mode === "create" ? createAddress.error : updateAddress.error;
  const isSaving = createAddress.isPending || updateAddress.isPending;

  function closeEditor() {
    setEditing({ mode: "closed" });
    setDraft(EMPTY_DRAFT);
    setPin(null);
    setFormattedAddress("");
    setRepinned(false);
    setStep("form");
    createAddress.reset();
    updateAddress.reset();
  }

  /**
   * The map first. Creating an address requires coordinates, so placing the
   * pin first means the fields arrive filled in rather than being typed and
   * then thrown away by a re-pin. The map asks the device as it opens.
   */
  function startCreate() {
    setEditing({ mode: "create" });
    setDraft({ ...EMPTY_DRAFT, is_default: addresses.length === 0 });
    setPin(null);
    setFormattedAddress("");
    setRepinned(false);
    setStep("pin");
  }

  function startEdit(address: Address) {
    setEditing({ mode: "edit", address });
    setDraft(draftFromAddress(address));
    setPin(
      isGeocoded(address)
        ? { latitude: address.latitude, longitude: address.longitude }
        : null,
    );
    setFormattedAddress(formatAddressLine(address));
    setRepinned(false);
    setStep("form");
    updateAddress.reset();
  }

  /**
   * The confirmed pin fills the area fields.
   *
   * On create it fills the first line too, from whatever the geocoder had. On a
   * re-pin it does not: the flat number was typed by the Customer and a moved
   * pin is no reason to overwrite it.
   */
  function onPinConfirmed(resolved: ResolvedLocation) {
    setPin({ latitude: resolved.latitude, longitude: resolved.longitude });
    if (editing.mode === "edit") setRepinned(true);
    setFormattedAddress(resolved.formatted_address || "");
    setDraft((current) => ({
      ...current,
      ...(editing.mode === "create" ? { line1: resolved.line1 } : {}),
      locality: resolved.locality || current.locality,
      city: resolved.city || current.city,
      state: resolved.state || current.state,
      postal_code: resolved.postal_code || current.postal_code,
    }));
    setStep("form");
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
            pin && (repinned || !isGeocoded(editing.address))
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
        <div className="rounded-[1.25rem] border border-[#ece7e0] bg-white p-4 shadow-xs md:rounded-none md:border-0 md:bg-transparent md:p-0 md:shadow-none">
          <AddressBookHeader
            onAdd={startCreate}
            adding={false}
          />
          <EmptyState
            title="No saved addresses"
            description="Save an address and we can send someone to the right door, and check that we cover your area before you book."
            action={
              <Button onClick={startCreate}>Add an address</Button>
            }
          />
        </div>
      ) : (
        <div className="rounded-[1.25rem] border border-[#ece7e0] bg-white p-4 shadow-xs md:rounded-none md:border-0 md:bg-transparent md:p-0 md:shadow-none">
          <AddressBookHeader
            onAdd={startCreate}
            adding={false}
          />
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

          <div className="mt-4 flex items-start gap-3 rounded-2xl border border-[#dbeafe] bg-[#eff6ff] px-3.5 py-3 md:hidden">
            <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-white text-[#2563eb]">
              <ShieldCheck className="size-4" strokeWidth={2.1} aria-hidden />
            </span>
            <p className="min-w-0 text-sm leading-relaxed text-[#1e40af]">
              Your default address will be used for faster checkout.
            </p>
          </div>

          <button
            type="button"
            onClick={startCreate}
            aria-label="Add another address"
            className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-[#fde8d4] bg-[#FFF6EE] px-4 py-3.5 text-left transition-colors hover:bg-[#FFEFDF] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-70 md:hidden"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white text-[#EA580C] shadow-xs">
              <MapPin className="size-5" strokeWidth={2.1} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-extrabold text-navy-900">Add more addresses</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-text-secondary">
                Save multiple addresses and choose the one that works best for you.
              </span>
            </span>
            <AddressPromoArt />
          </button>

          <div className="mt-4 hidden md:block">
            <Button variant="outline" onClick={startCreate}>
              Add another address
            </Button>
          </div>
        </div>
      )}

      <Dialog
        open={editing.mode !== "closed"}
        onOpenChange={(open) => {
          if (!open && !isSaving) closeEditor();
        }}
        title={
          step === "pin"
            ? "Set the location"
            : editing.mode === "edit"
              ? "Edit address"
              : "Add an address"
        }
        description={
          step === "pin"
            ? "Search, use your location, or drag the map so the pin sits on the door."
            : editing.mode === "edit"
              ? "Correct the details. The pin stays where it is unless you pin again."
              : "We filled this in from the pin. Correct anything we got wrong."
        }
      >
        {step === "pin" ? (
          <>
            <LocationPicker
              initial={pin}
              autoLocate={editing.mode === "create" && pin === null}
              onConfirm={onPinConfirmed}
            />
            <div className="mt-2">
              <Button
                type="button"
                variant="ghost"
                block
                onClick={
                  editing.mode === "create" && pin === null ? closeEditor : () => setStep("form")
                }
              >
                {editing.mode === "create" && pin === null
                  ? "Cancel"
                  : pin === null
                    ? "Back to the details"
                    : "Keep the current pin"}
              </Button>
            </div>
          </>
        ) : null}

        {step === "form" && editing.mode === "create" && !pin ? (
          <p className="mb-4 text-sm text-text-secondary">
            An address needs a map pin before it can be saved. Pin your location
            to continue.
          </p>
        ) : null}

        {step === "form" ? (
          <AddressForm
            draft={draft}
            onChange={setDraft}
            onSubmit={() => void save()}
            error={saveError}
            isSaving={isSaving}
            submitLabel={editing.mode === "edit" ? "Save changes" : "Save address"}
            onCancel={closeEditor}
            hasPin={pin !== null}
            onRepin={() => setStep("pin")}
            showDefaultToggle={addresses.length > 0}
            formattedAddress={formattedAddress}
          />
        ) : null}
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
