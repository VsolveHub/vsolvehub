"use client";

import type { Schemas } from "@vsolve/api-client";
import { Badge, Button, Dialog, EmptyState, Field, Input, Spinner, cn } from "@vsolve/ui";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

import { AddressForm } from "./address-form";
import { ChoiceCard } from "./choice-card";

/**
 * Where the work happens, and whether Vsolve Hub covers it.
 *
 * The booking page now shows one compact address summary. The full list, adding
 * a pinned address and editing the selected one live in this dialog, so the
 * service flow is about picking the service and time rather than reading the
 * whole address book on every booking.
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
  /**
   * The chosen address, or null.
   *
   * A prop rather than a reducer read. The address is now confirmed once for a
   * whole Booking Group instead of once per configured service, so this
   * component is used from two places with different owners of that state.
   */
  selectedAddressId: string | null;
  /**
   * How the chosen address is presented on the page. The dialog is identical.
   *
   * `card` — a bordered block with its own heading and two buttons. The booking
   * workspace's stage, where the address *is* the step.
   *
   * `row` — one promoted line that opens the dialog. For a form where the
   * address is one field among several and every other control answers in
   * place: it is the only input that opens a dialog, so it is drawn to look
   * like a door rather than like a field.
   *
   * A prop rather than a second component. The address book is a published
   * surface with one implementation, and the moment there are two pickers there
   * are two places a Customer can create an address that behaves slightly
   * differently — which is the bug this file's own header was written to
   * prevent.
   *
   * `none` — no trigger at all, only the dialog. For a caller that already has
   * its own row and wants this to be the picker behind it; pair with
   * `openSignal`. The phone job form does this: its trigger is a `PickerRow`
   * sitting beside the date, so a second promoted card here would be the same
   * control twice.
   */
  presentation?: "card" | "row" | "none";
  /**
   * Opens the dialog from outside, when there is no trigger of our own.
   *
   * A counter rather than a boolean, and the difference matters: a boolean that
   * is already `true` cannot request a second open after the customer dismisses
   * the dialog, so the row would work once and then appear dead. Every increment
   * is a fresh request.
   */
  openSignal?: number;
  /**
   * Supply to offer **add a new address** as a second mode inside this dialog.
   *
   * Optional, and omitting it leaves the dialog exactly as it was: a saved list
   * plus "use my current location". That keeps the callers who have not adopted
   * the form — the checkout workspace — working unchanged, rather than making a
   * new capability a breaking change to a shared surface.
   */
  addNew?: {
    /** Resolves the device's position into fields. Must not save. */
    onLocate: () => Promise<Schemas["ReverseGeocodeResponse"] | null>;
    isLocating: boolean;
    locateError: string | null;
    /** Writes the address and returns it, or null if the write failed. */
    onCreate: (draft: Schemas["AddressRequest"]) => Promise<Address | null>;
    isCreating: boolean;
    createError: string | null;
    /** Coverage for the pincode being typed, which is not the selected one. */
    onPostalCodeChange: (postalCode: string) => void;
    draftServiceability: Schemas["ServiceabilityResponse"] | null;
    isCheckingDraftServiceability: boolean;
  };
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
  selectedAddressId,
  presentation = "card",
  openSignal,
  addNew,
}: AddressStageProps) {
  const selectedAddress =
    addresses.find((address) => address.id === selectedAddressId) ?? null;
  const [pickerOpen, setPickerOpen] = useState(false);
  /**
   * Which of the dialog's three faces is showing.
   *
   * One piece of state rather than two booleans, because "editing" and "adding"
   * are mutually exclusive and a pair of flags can represent a fourth state that
   * means nothing.
   */
  const [mode, setMode] = useState<"list" | "add" | "edit">("list");
  /**
   * The row the Customer has highlighted, which is **not** yet their answer.
   *
   * The dialog used to call `onSelect` the moment a radio changed and close
   * itself from an effect, which made Escape and a backdrop click into commits:
   * touch a row, change your mind, press Escape, and the address had already
   * changed underneath you. Staging it here is what makes the footer's "Use this
   * address" the only thing that commits, and every dismissal a genuine cancel.
   */
  const [pendingAddressId, setPendingAddressId] = useState<string | null>(null);
  const [editedDraft, setEditedDraft] = useState<{
    addressId: string | null;
    value: AddressPatch;
  }>({ addressId: null, value: {} });
  const editingAddress =
    addresses.find((address) => address.id === pendingAddressId) ?? selectedAddress;
  const draft =
    editedDraft.addressId === editingAddress?.id
      ? editedDraft.value
      : toEditableAddress(editingAddress);

  // Opened from outside, for a caller whose trigger is its own row. Keyed on
  // the counter's value so a re-render cannot reopen a dialog the customer has
  // just dismissed.
  const lastSignal = useRef(openSignal);
  useEffect(() => {
    if (openSignal === undefined || lastSignal.current === openSignal) return;
    lastSignal.current = openSignal;
    setPendingAddressId(selectedAddressId);
    setMode("list");
    setPickerOpen(true);
  }, [openSignal, selectedAddressId]);

  function openPicker(next: "list" | "edit" = "list") {
    // Opening always starts from the committed answer, so a dialog reopened
    // after a cancel does not remember the row that was abandoned.
    setPendingAddressId(selectedAddressId);
    setMode(next);
    setPickerOpen(true);
  }

  /** Every dismissal, and none of them commits. */
  function closePicker() {
    setPickerOpen(false);
    setMode("list");
    setPendingAddressId(null);
  }

  function commitSelection() {
    const chosen = addresses.find((address) => address.id === pendingAddressId) ?? null;
    if (chosen !== null && chosen.id !== selectedAddressId) onSelect(chosen);
    closePicker();
  }

  function updateDraft(field: keyof AddressPatch, value: string) {
    setEditedDraft((current) => ({
      addressId: editingAddress?.id ?? null,
      value: {
        ...(current.addressId === editingAddress?.id ? current.value : draft),
        [field]: value,
      },
    }));
  }

  function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingAddress) return;
    onUpdateAddress(editingAddress.id, draft);
  }

  /**
   * A newly saved address is chosen outright.
   *
   * The one place the staged-selection rule bends, and deliberately: somebody
   * who has just typed an address into a dialog headed "Where is the work?" has
   * answered the question. Making them then find it in a list and press "Use
   * this address" is asking them to confirm a decision they have already made
   * twice over.
   */
  async function handleCreate(request: Schemas["AddressRequest"]) {
    const created = await addNew?.onCreate(request);
    if (created === null || created === undefined) return; // Error renders in the form.
    onSelect(created);
    closePicker();
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
        <span>Loading your saved addresses...</span>
      </div>
    );
  }

  return (
    <div>
      {presentation === "none" ? null : presentation === "row" ? (
        <PromotedAddressRow address={selectedAddress} onOpen={() => openPicker()} />
      ) : selectedAddress === null ? (
        <NoSelectedAddress
          hasSavedAddresses={addresses.length > 0}
          onOpen={() => openPicker()}
        />
      ) : (
        <SelectedAddressCard
          address={selectedAddress}
          onChange={() => openPicker()}
          onEdit={() => openPicker("edit")}
        />
      )}

      <ServiceabilityStatus
        isCheckingServiceability={isCheckingServiceability}
        serviceability={serviceability}
      />

      <Dialog
        open={pickerOpen}
        // Escape, the backdrop and the close button all land here, and all three
        // are cancels. `closePicker` writes nothing.
        onOpenChange={(open) => {
          if (!open) closePicker();
        }}
        title={DIALOG_TITLES[mode]}
        description={DIALOG_DESCRIPTIONS[mode]}
        footer={
          mode === "add" ? (
            <>
              <Button variant="ghost" onClick={() => setMode("list")}>
                Back to saved addresses
              </Button>
              <Button
                type="submit"
                form={ADD_FORM_ID}
                loading={addNew?.isCreating ?? false}
                loadingLabel="Saving address"
              >
                Save and use
              </Button>
            </>
          ) : mode === "list" ? (
            <>
              <Button variant="ghost" onClick={closePicker}>
                Cancel
              </Button>
              <Button onClick={commitSelection} disabled={pendingAddressId === null}>
                Use this address
              </Button>
            </>
          ) : null
        }
      >
        {mode === "edit" && editingAddress ? (
          <SelectedAddressForm
            selectedAddress={editingAddress}
            draft={draft}
            updateDraft={updateDraft}
            submitEdit={submitEdit}
            updateError={updateError}
            isUpdatingAddress={isUpdatingAddress}
            onBack={() => setMode("list")}
          />
        ) : mode === "add" && addNew ? (
          <AddressForm
            formId={ADD_FORM_ID}
            onLocate={addNew.onLocate}
            isLocating={addNew.isLocating}
            locateError={addNew.locateError}
            onSubmit={(request) => void handleCreate(request)}
            saveError={addNew.createError}
            onPostalCodeChange={addNew.onPostalCodeChange}
            serviceability={addNew.draftServiceability}
            isCheckingServiceability={addNew.isCheckingDraftServiceability}
          />
        ) : addresses.length === 0 ? (
          <EmptyState
            compact
            title="No saved addresses"
            description={
              addNew
                ? "Add one so we can check coverage and send the professional to the right place."
                : "Use your current location to add a pinned address for this job."
            }
            action={
              addNew ? (
                <Button onClick={() => setMode("add")}>Add a new address</Button>
              ) : (
                locationAction
              )
            }
          />
        ) : (
          <AddressPickerDialogBody
            addresses={addresses}
            pendingAddressId={pendingAddressId}
            locationAction={addNew ? null : locationAction}
            onHighlight={setPendingAddressId}
            onEdit={(address) => {
              setPendingAddressId(address.id);
              setMode("edit");
            }}
            onAddNew={addNew ? () => setMode("add") : null}
          />
        )}
      </Dialog>
    </div>
  );
}

/**
 * The dialog's own copy, keyed by mode.
 *
 * "Where is the work?" rather than "Choose address": the title asks the question
 * the Customer opened it to answer, which is also what a screen reader announces
 * when focus lands inside.
 */
const DIALOG_TITLES: Record<"list" | "add" | "edit", string> = {
  list: "Where is the work?",
  add: "Add a new address",
  edit: "Edit this address",
};

const DIALOG_DESCRIPTIONS: Record<"list" | "add" | "edit", string> = {
  list: "Pick a saved address or add a new one.",
  add: "Saved to your account, so you only type it once.",
  edit: "Text changes keep the existing pin. Re-pin if the location itself is wrong.",
};

/** Ties the footer's submit button to the form in the scrolling body. */
const ADD_FORM_ID = "address-add-form";

/**
 * The address as one promoted line, for a form where it is the only dialog.
 *
 * Accent-bordered on purpose. Everything else on the crew form answers in place
 * — a chip, a stepper, a date — and this one opens something. Marking it is the
 * difference between a control people find and a control people hunt for.
 *
 * ## It is one button, not a row with a button in it
 *
 * The whole line is the target, so the hit area is the width of the column
 * rather than the width of the words "Change address". That trailing pill is
 * `aria-hidden` decoration inside the same button — a nested `<button>` is
 * invalid markup, and two focus stops that do the same thing is worse
 * navigation, not better.
 *
 * The accessible name says what the control does *and* what it currently holds,
 * because "Change address" alone leaves a screen-reader user to go looking for
 * the value somewhere else on the page.
 */
function PromotedAddressRow({
  address,
  onOpen,
}: {
  address: Address | null;
  onOpen: () => void;
}) {
  const line = address === null ? "Choose where the work is" : formatAddress(address);
  const label = address === null ? "Where" : address.label || "Saved address";

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={
        address === null
          ? "Choose the address for this job"
          : `Change address. Currently ${label}, ${line}`
      }
      className={cn(
        "flex w-full items-center gap-3.5 rounded-control border-[1.5px] border-action p-3.5 text-left",
        "bg-action-surface transition-colors duration-fast",
        "hover:bg-signal-100",
      )}
    >
      <span
        aria-hidden
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-control border border-signal-200 bg-surface text-warning-text"
      >
        <svg
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.7}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-[17px] w-[17px]"
        >
          <path d="M10 17.5s5.5-4.9 5.5-9a5.5 5.5 0 0 0-11 0c0 4.1 5.5 9 5.5 9Z" />
          <circle cx="10" cy="8.5" r="1.9" />
        </svg>
      </span>

      <span aria-hidden className="min-w-0 flex-1">
        <span className="block text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-warning-text">
          {label}
        </span>
        {/* `truncate` needs a min-width-0 flex parent, which the span above it
            provides. A long Hyderabad address is the normal case, not the edge. */}
        <span className="mt-0.5 block truncate text-[0.9063rem] font-semibold text-text">
          {line}
        </span>
      </span>

      <span
        aria-hidden
        className="inline-flex h-9 shrink-0 items-center rounded-control border border-signal-200 bg-surface px-3.5 text-[0.8125rem] font-bold text-warning-text"
      >
        {address === null ? "Choose" : "Change address"}
      </span>
    </button>
  );
}

function NoSelectedAddress({
  hasSavedAddresses,
  onOpen,
}: {
  hasSavedAddresses: boolean;
  onOpen: () => void;
}) {
  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <p className="text-sm font-semibold text-text">No address selected</p>
      <p className="mt-1 text-sm leading-6 text-text-secondary">
        {hasSavedAddresses
          ? "Open your saved addresses or add a new pinned address for this service."
          : "Add an address so we can check coverage and send the professional to the right place."}
      </p>
      <div className="mt-3">
        <Button type="button" onClick={onOpen}>
          Add address
        </Button>
      </div>
    </div>
  );
}

function SelectedAddressCard({
  address,
  onChange,
  onEdit,
}: {
  address: Address;
  onChange: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="rounded-card border border-action-line bg-action-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Selected address
          </p>
          <p className="mt-1 text-base font-semibold text-text">
            {address.label || "Saved address"}
          </p>
          <p className="mt-1 text-sm leading-6 text-text-secondary">
            {formatAddress(address)}
          </p>
        </div>
        {isGeocoded(address) ? (
          <Badge tone="success">Pinned</Badge>
        ) : (
          <Badge tone="warning">Pin missing</Badge>
        )}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={onChange}>
          Change address
        </Button>
        <Button type="button" variant="ghost" onClick={onEdit}>
          Edit selected
        </Button>
      </div>
    </div>
  );
}

function ServiceabilityStatus({
  isCheckingServiceability,
  serviceability,
}: {
  isCheckingServiceability: boolean;
  serviceability: Schemas["ServiceabilityResponse"] | null;
}) {
  return (
    <div className="mt-3" aria-live="polite">
      {isCheckingServiceability ? (
        <p className="flex items-center gap-2 text-sm text-text-secondary">
          <Spinner />
          Checking whether we cover this area...
        </p>
      ) : serviceability === null ? null : serviceability.is_serviceable ? (
        <p className="text-sm font-medium text-success-text">We cover this area.</p>
      ) : (
        <div className="rounded-card border border-warning-line bg-warning-surface p-4">
          <p className="font-semibold text-warning-text">We do not cover this address yet</p>
          <p className="mt-1 text-sm text-text-secondary">
            We are expanding across Hyderabad. Try another saved address, or check back soon.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * The saved list.
 *
 * Highlighting a row stages it; the dialog's footer commits it. Each row also
 * carries its own **Edit**, which is a `<button>` sitting *beside* the radio's
 * label rather than inside it — nesting an interactive control inside a
 * `<label>` makes the label's own click target ambiguous, and pressing Edit
 * would also select the row.
 */
function AddressPickerDialogBody({
  addresses,
  pendingAddressId,
  locationAction,
  onHighlight,
  onEdit,
  onAddNew,
}: {
  addresses: readonly Address[];
  pendingAddressId: string | null;
  locationAction: ReactNode;
  onHighlight: (addressId: string) => void;
  onEdit: (address: Address) => void;
  onAddNew: (() => void) | null;
}) {
  return (
    <div className="flex flex-col gap-3">
      <fieldset className="border-0 p-0">
        <legend className="sr-only">Saved addresses</legend>
        <div className="flex flex-col gap-3">
          {addresses.map((address) => (
            <div key={address.id} className="flex items-start gap-2">
              <ChoiceCard
                className="flex-1"
                name="address"
                value={address.id}
                checked={pendingAddressId === address.id}
                onSelect={() => onHighlight(address.id)}
                title={address.label || "Saved address"}
                description={formatAddress(address)}
                trailing={
                  <span className="flex flex-wrap items-center justify-end gap-1.5">
                    {address.is_default ? <Badge tone="neutral">Default</Badge> : null}
                    {/* Never colour alone: the filled radio is the primary cue
                        and this is the word for it. */}
                    {pendingAddressId === address.id ? (
                      <Badge tone="success">Selected</Badge>
                    ) : null}
                    {isGeocoded(address) ? null : (
                      <Badge tone="warning">Not pinned on map</Badge>
                    )}
                  </span>
                }
              >
                {address.landmark ? (
                  <span className="mt-1 block text-sm text-text-muted">
                    {address.landmark}
                  </span>
                ) : null}
              </ChoiceCard>

              <Button
                variant="ghost"
                onClick={() => onEdit(address)}
                aria-label={`Edit ${address.label || "saved address"}`}
              >
                Edit
              </Button>
            </div>
          ))}
        </div>
      </fieldset>

      {onAddNew !== null ? (
        <Button variant="outline" block onClick={onAddNew}>
          + Add a new address
        </Button>
      ) : (
        <div className="rounded-card border border-line bg-surface p-4">
          <h3 className="text-sm font-semibold text-text">Add another pinned address</h3>
          <div className="mt-3">{locationAction}</div>
        </div>
      )}

      <p className="text-sm leading-5 text-text-muted">
        Changing the address re-checks who can reach it.
      </p>
    </div>
  );
}

function SelectedAddressForm({
  selectedAddress,
  draft,
  updateDraft,
  submitEdit,
  updateError,
  isUpdatingAddress,
  onBack,
}: {
  selectedAddress: Address;
  draft: AddressPatch;
  updateDraft: (field: keyof AddressPatch, value: string) => void;
  submitEdit: (event: FormEvent<HTMLFormElement>) => void;
  updateError: string | null;
  isUpdatingAddress: boolean;
  onBack: () => void;
}) {
  return (
    <form onSubmit={submitEdit}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-text">{selectedAddress.label || "Saved address"}</h3>
          <p className="mt-1 text-sm text-text-secondary">{formatAddress(selectedAddress)}</p>
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

      <div className="mt-4 flex flex-wrap justify-between gap-2">
        <Button type="button" variant="ghost" onClick={onBack}>
          Back to saved addresses
        </Button>
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
  );
}
