"use client";

import { describeError, isFieldError } from "@vsolve/query";
import { Badge, Button, Disclosure, Field, Input } from "@vsolve/ui";
import { useState, type FormEvent } from "react";

import type { Address, AddressPatch } from "../queries";

/**
 * The address fields, and nothing else.
 *
 * Presentational on purpose: it owns the draft and the field-level errors, and
 * the caller owns what saving means. That is what lets the account book and, in
 * time, checkout use the same form without one of them inheriting the other's
 * mutation, cache writes or navigation.
 *
 * ## Why coordinates are a status, not a pair of inputs
 *
 * `AddressRequest` requires `latitude` and `longitude`, and no customer knows
 * theirs. They come from one place: the browser's geolocation, reverse-geocoded
 * by Django. So this form never edits them — it reports whether the address has
 * a pin, and re-pinning is a separate action that replaces the whole draft.
 *
 * Editing the text keeps the existing pin, which is the right default: people
 * correct a flat number or a landmark far more often than they move house, and
 * discarding the pin on a typo fix would make the address undispatchable.
 */

export interface AddressDraft {
  label: string;
  line1: string;
  line2: string;
  landmark: string;
  locality: string;
  city: string;
  state: string;
  postal_code: string;
  is_default: boolean;
}

export const EMPTY_DRAFT: AddressDraft = {
  label: "",
  line1: "",
  line2: "",
  landmark: "",
  locality: "",
  city: "",
  state: "",
  postal_code: "",
  is_default: false,
};

export function draftFromAddress(address: Address): AddressDraft {
  return {
    label: address.label ?? "",
    line1: address.line1 ?? "",
    line2: address.line2 ?? "",
    landmark: address.landmark ?? "",
    locality: address.locality ?? "",
    city: address.city ?? "",
    state: address.state ?? "",
    postal_code: address.postal_code ?? "",
    is_default: address.is_default ?? false,
  };
}

/** The subset of a draft that `PATCH` accepts. */
export function patchFromDraft(draft: AddressDraft): AddressPatch {
  return {
    label: draft.label.trim(),
    line1: draft.line1.trim(),
    line2: draft.line2.trim(),
    landmark: draft.landmark.trim(),
    locality: draft.locality.trim(),
    city: draft.city.trim(),
    state: draft.state.trim(),
    postal_code: draft.postal_code.trim(),
    is_default: draft.is_default,
  };
}

/**
 * Required fields, checked before the request rather than after.
 *
 * Django validates these too and is the authority; this exists so someone who
 * leaves the city blank is told at the field instead of watching a request fail.
 * The messages say what to do, per the `Field` contract.
 */
const REQUIRED: readonly (keyof AddressDraft)[] = [
  "label",
  "line1",
  "locality",
  "city",
  "state",
  "postal_code",
];

const REQUIRED_MESSAGE: Partial<Record<keyof AddressDraft, string>> = {
  label: "Name this address so you can pick it out later, like Home or Office.",
  line1: "Add the flat, house or building.",
  locality: "Add the area or neighbourhood.",
  city: "Add the city.",
  state: "Add the state.",
  postal_code: "Add the 6-digit PIN code.",
};

export function missingFields(draft: AddressDraft): Partial<Record<string, string>> {
  const errors: Partial<Record<string, string>> = {};
  for (const key of REQUIRED) {
    if (String(draft[key]).trim() === "") {
      errors[key] = REQUIRED_MESSAGE[key] ?? "This is needed.";
    }
  }
  return errors;
}

/**
 * Field errors from Django, keyed the way the form is.
 *
 * The server is the only thing that knows a PIN code is outside the service
 * area or that a label is already taken, and its message is customer-safe by
 * contract — so it is shown at the field rather than replaced with a guess.
 */
function serverFieldErrors(error: unknown): Partial<Record<string, string>> {
  if (!isFieldError(error)) return {};
  const mapped: Partial<Record<string, string>> = {};
  for (const [field, messages] of Object.entries(error.fieldErrors)) {
    mapped[field] = Array.isArray(messages) ? messages.join(" ") : String(messages);
  }
  return mapped;
}

export interface AddressFormProps {
  draft: AddressDraft;
  onChange: (draft: AddressDraft) => void;
  onSubmit: () => void;
  /** Rejection from the save, shown at the field it belongs to where possible. */
  error?: unknown;
  isSaving?: boolean;
  submitLabel: string;
  onCancel?: () => void;
  /** True once Django has stored coordinates for this address. */
  hasPin: boolean;
  /** Offered when the pin is wrong or missing. Omit to hide re-pinning. */
  onRepin?: () => void;
  isRepinning?: boolean;
  /** Hidden while this is the only address — the sole address is the default. */
  showDefaultToggle?: boolean;
  formId?: string;
  /** Geocoder summary text shown when pinned. */
  formattedAddress?: string;
}

export function AddressForm({
  draft,
  onChange,
  onSubmit,
  error,
  isSaving = false,
  submitLabel,
  onCancel,
  hasPin,
  onRepin,
  isRepinning = false,
  showDefaultToggle = true,
  formId,
  formattedAddress,
}: AddressFormProps) {
  const [touched, setTouched] = useState(false);
  const localErrors = touched ? missingFields(draft) : {};
  const fieldErrors = { ...localErrors, ...serverFieldErrors(error) };

  function set<K extends keyof AddressDraft>(key: K, value: AddressDraft[K]) {
    onChange({ ...draft, [key]: value });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched(true);
    if (Object.keys(missingFields(draft)).length > 0) return;
    onSubmit();
  }

  return (
    <form id={formId} onSubmit={handleSubmit} noValidate>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-line bg-surface-sunken px-3 py-2.5">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            {hasPin ? (
              <Badge tone="success">Pinned on map</Badge>
            ) : (
              <Badge tone="warning">Not pinned</Badge>
            )}
            <span className="text-sm text-text-secondary">
              {hasPin
                ? "Editing the text below keeps this pin."
                : "Without a pin we cannot send anyone here."}
            </span>
          </div>
          {hasPin && formattedAddress ? (
            <p className="text-xs text-text">{formattedAddress}</p>
          ) : null}
        </div>
        {onRepin ? (
          <Button
            type="button"
            variant="outline"
            onClick={onRepin}
            loading={isRepinning}
            loadingLabel="Finding your location"
          >
            {hasPin ? "Pin again" : "Pin my location"}
          </Button>
        ) : null}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Name this address" required error={fieldErrors.label}>
          <Input
            value={draft.label}
            autoComplete="off"
            maxLength={60}
            placeholder="Home"
            onChange={(event) => set("label", event.target.value)}
          />
        </Field>
        <Field label="Flat, house or building" required error={fieldErrors.line1}>
          <Input
            value={draft.line1}
            maxLength={200}
            onChange={(event) => set("line1", event.target.value)}
          />
        </Field>
        <Field label="Street or apartment" error={fieldErrors.line2}>
          <Input
            value={draft.line2}
            maxLength={200}
            onChange={(event) => set("line2", event.target.value)}
          />
        </Field>
        <Field
          label="Landmark"
          description="Helps the technician find the door."
          error={fieldErrors.landmark}
        >
          <Input
            value={draft.landmark}
            maxLength={160}
            onChange={(event) => set("landmark", event.target.value)}
          />
        </Field>
        <Field label="Area" required error={fieldErrors.locality} className="sm:col-span-2">
          <Input
            value={draft.locality}
            maxLength={160}
            onChange={(event) => set("locality", event.target.value)}
          />
        </Field>
        {/* Geocoded fields: collapsed when the pin filled them, expanded for manual entry. */}
        {hasPin && draft.city && draft.state && draft.postal_code ? (
          <div className="sm:col-span-2">
            <Disclosure
              summary="Edit city, state or PIN code"
              hint={`${draft.city}, ${draft.state} ${draft.postal_code}`}
              defaultOpen={Boolean(fieldErrors.city || fieldErrors.state || fieldErrors.postal_code)}
            >
              <div className="grid gap-4 pt-1 sm:grid-cols-3">
                <Field label="City" required error={fieldErrors.city}>
                  <Input
                    value={draft.city}
                    maxLength={120}
                    onChange={(event) => set("city", event.target.value)}
                  />
                </Field>
                <Field label="State" required error={fieldErrors.state}>
                  <Input
                    value={draft.state}
                    maxLength={120}
                    onChange={(event) => set("state", event.target.value)}
                  />
                </Field>
                <Field label="PIN code" required error={fieldErrors.postal_code}>
                  <Input
                    value={draft.postal_code}
                    inputMode="numeric"
                    maxLength={12}
                    autoComplete="postal-code"
                    onChange={(event) => set("postal_code", event.target.value)}
                  />
                </Field>
              </div>
            </Disclosure>
          </div>
        ) : (
          <>
            <Field label="City" required error={fieldErrors.city}>
              <Input
                value={draft.city}
                maxLength={120}
                onChange={(event) => set("city", event.target.value)}
              />
            </Field>
            <Field label="State" required error={fieldErrors.state}>
              <Input
                value={draft.state}
                maxLength={120}
                onChange={(event) => set("state", event.target.value)}
              />
            </Field>
            <Field label="PIN code" required error={fieldErrors.postal_code}>
              <Input
                value={draft.postal_code}
                inputMode="numeric"
                maxLength={12}
                autoComplete="postal-code"
                onChange={(event) => set("postal_code", event.target.value)}
              />
            </Field>
          </>
        )}
      </div>

      {showDefaultToggle ? (
        <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-sm text-text">
          <input
            type="checkbox"
            checked={draft.is_default}
            onChange={(event) => set("is_default", event.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded-sm border border-line-strong accent-action"
          />
          <span>
            Use this address by default
            <span className="block text-text-secondary">
              It will be selected first the next time you book.
            </span>
          </span>
        </label>
      ) : null}

      {/* Anything the server rejected that is not a field problem. Field-level
          rejections are already shown above, so repeating them here would say
          the same thing twice in two places. */}
      {error && !isFieldError(error) ? (
        <p role="alert" className="mt-4 text-sm font-medium text-danger-text">
          {describeError(error, "mutation").message}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-2">
        <Button type="submit" loading={isSaving} loadingLabel="Saving address">
          {submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={isSaving}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
