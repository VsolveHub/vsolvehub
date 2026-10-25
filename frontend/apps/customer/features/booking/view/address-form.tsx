"use client";

import type { Schemas } from "@vsolve/api-client";
import { ChoiceChips, Field, Input, Spinner } from "@vsolve/ui";
import { useEffect, useRef, useState, type FormEvent } from "react";

/**
 * Completing a new address, after the pin is on the map.
 *
 * The pin is placed on the map picker (`LocationPicker`). This form is the
 * second step: the fields the Customer checks and completes. Reverse geocoding
 * is good at the street and bad at everything a courier actually needs — it
 * cannot know the flat number, the gate, or which of two towers is yours — so
 * "Flat, plot or building" is always left for them.
 *
 * ## Why a pin still matters
 *
 * `AddressRequest` requires `latitude` and `longitude`. The dialog only opens
 * this form from a confirmed pin, so the check below is a guard rather than a
 * step: Save says so rather than sending a request the server would refuse.
 *
 * ## Serviceability is shown and never blocks
 *
 * Coverage is advisory — Operations can serve an area the lookup does not know
 * about — so an unserviceable pincode is a warning, not a door this form closes.
 */

type AddressRequest = Schemas["AddressRequest"];
type LocatedAddress = Schemas["ReverseGeocodeResponse"];

/**
 * The label vocabulary, and the reason it is a fixed list.
 *
 * `Address.label` is free text on the wire and stays that way — this constrains
 * the *offer*, not the field, so an address labelled something else by an older
 * build still renders. Four options because the fifth is always somebody's
 * one-off, and "Other" plus a text box covers it without a fifth chip nobody
 * presses.
 */
const LABEL_PRESETS = [
  { value: "Home", label: "Home" },
  { value: "Office", label: "Office" },
  { value: "Site", label: "Site" },
] as const;

const OTHER_LABEL = "__other__";

export interface AddressFormProps {
  /**
   * Ties this form to a submit button rendered outside it.
   *
   * The dialog's actions belong in its footer, which sits below a scrolling
   * body — and a "Save and use" that scrolls off the bottom of a seven-field
   * form is a button nobody finds. `<button form="...">` is the platform's own
   * answer to that, and it keeps the form a real form.
   */
  formId: string;
  /**
   * Seed from the confirmed map pin. A pin cannot resolve a flat number, so
   * `line1` is left empty even when the geocoder guessed one.
   */
  initial?: Draft;
  /** Confirmation that the fields arrived from the pin, not from typing. */
  showPinnedBanner?: boolean;
  /** Writes the address. Resolving is the caller's; this only reports the draft. */
  onSubmit: (draft: AddressRequest) => void;
  saveError: string | null;
  /** Called as the pincode changes, so the caller can check coverage. */
  onPostalCodeChange: (postalCode: string) => void;
  serviceability: Schemas["ServiceabilityResponse"] | null;
  isCheckingServiceability: boolean;
}

export interface Draft {
  label: string;
  labelChoice: string;
  line1: string;
  line2: string;
  landmark: string;
  locality: string;
  city: string;
  state: string;
  postalCode: string;
  latitude: string;
  longitude: string;
}

export const EMPTY_DRAFT: Draft = {
  label: "",
  labelChoice: "Home",
  line1: "",
  line2: "",
  landmark: "",
  locality: "",
  city: "",
  state: "",
  postalCode: "",
  latitude: "",
  longitude: "",
};

const REQUIRED_MESSAGE: Record<"line1" | "locality" | "city" | "state" | "postalCode", string> = {
  line1: "Add the flat, plot or building.",
  locality: "Add the street or area.",
  city: "Add the city.",
  state: "Add the state.",
  postalCode: "Add the 6-digit pincode.",
};

/**
 * Turns a reverse-geocode result into form fields.
 *
 * Flat/building is always left empty — GPS cannot determine unit-level detail.
 * Street/area takes the neighbourhood, or the geocoder's line1 when that is all
 * we got. City suffixes like "mandal" are stripped because they are administrative
 * noise, not how someone describes where they live.
 */
export function draftFromLocated(resolved: LocatedAddress): Draft {
  const postalCode = (resolved.postal_code ?? "").trim();
  const locality = (resolved.locality ?? "").trim();
  let city = (resolved.city ?? "").trim();
  let line1 = (resolved.line1 ?? "").trim();

  if (postalCode && line1.startsWith(postalCode)) {
    line1 = line1.slice(postalCode.length).replace(/^[\s,/-]+/, "").trim();
  } else if (/^\d{6}\b/.test(line1)) {
    line1 = line1.replace(/^\d{6}[\s,/-]*/, "").trim();
  }

  if (
    /^\d+$/.test(line1) ||
    line1.toLowerCase() === locality.toLowerCase() ||
    line1.toLowerCase() === city.toLowerCase()
  ) {
    line1 = "";
  }

  city = city
    .replace(/\s+(mandal|district|rural|urban)\b/gi, "")
    .replace(/,\s*.*$/, "")
    .trim();

  return {
    ...EMPTY_DRAFT,
    line1: "",
    locality: locality || line1,
    city: city || (resolved.city ?? ""),
    state: resolved.state ?? "",
    postalCode,
    latitude: resolved.latitude ?? "",
    longitude: resolved.longitude ?? "",
  };
}

export function AddressForm({
  formId,
  initial = EMPTY_DRAFT,
  showPinnedBanner = false,
  onSubmit,
  saveError,
  onPostalCodeChange,
  serviceability,
  isCheckingServiceability,
}: AddressFormProps) {
  const [draft, setDraft] = useState<Draft>(initial);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof Draft, string>>>({});
  const [pinError, setPinError] = useState<string | null>(null);
  const line1Ref = useRef<HTMLInputElement>(null);

  const isPinned = draft.latitude !== "" && draft.longitude !== "";
  const resolvedLabel = draft.labelChoice === OTHER_LABEL ? draft.label : draft.labelChoice;

  useEffect(() => {
    onPostalCodeChange(draft.postalCode);
  }, [draft.postalCode, onPostalCodeChange]);

  useEffect(() => {
    if (!showPinnedBanner) return;
    line1Ref.current?.focus();
  }, [showPinnedBanner]);

  function set<K extends keyof Draft>(field: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => {
      if (current[field] === undefined) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    if (field === "latitude" || field === "longitude") setPinError(null);
  }

  function validate(): boolean {
    const next: Partial<Record<keyof Draft, string>> = {};
    (["line1", "locality", "city", "state", "postalCode"] as const).forEach((field) => {
      if (draft[field].trim() === "") next[field] = REQUIRED_MESSAGE[field];
    });
    if (draft.labelChoice === OTHER_LABEL && draft.label.trim() === "") {
      next.label = "Name this address so you can pick it out later.";
    }
    setFieldErrors(next);

    if (!isPinned) {
      setPinError(
        "We need the location on the map to send a professional. Go back, set the pin, then add your flat or building number.",
      );
    } else {
      setPinError(null);
    }

    return Object.keys(next).length === 0 && isPinned;
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validate()) return;
    onSubmit({
      label: resolvedLabel.trim(),
      line1: draft.line1.trim(),
      line2: draft.line2.trim(),
      landmark: draft.landmark.trim(),
      locality: draft.locality.trim(),
      city: draft.city.trim(),
      state: draft.state.trim(),
      postal_code: draft.postalCode.trim(),
      country_code: "IN",
      latitude: draft.latitude,
      longitude: draft.longitude,
      source: "REVERSE_GEOCODED",
    });
  }

  return (
    <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-4">
      {showPinnedBanner ? (
        <div className="rounded-card border border-success-line bg-success-surface p-4">
          <p className="text-sm font-bold text-text">Location pinned</p>
          <p className="mt-0.5 text-sm leading-5 text-text-secondary">
            Check the details below and add your flat or building number.
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Flat, plot or building"
          required
          className="sm:col-span-2"
          error={fieldErrors.line1}
        >
          <Input
            ref={line1Ref}
            value={draft.line1}
            onChange={(event) => set("line1", event.target.value)}
            autoComplete="address-line1"
          />
        </Field>
        <Field label="Street, area" required error={fieldErrors.locality}>
          <Input
            value={draft.locality}
            onChange={(event) => set("locality", event.target.value)}
            autoComplete="address-level3"
          />
        </Field>
        <Field label="Landmark">
          <Input
            value={draft.landmark}
            onChange={(event) => set("landmark", event.target.value)}
          />
        </Field>
        <Field label="City" required error={fieldErrors.city}>
          <Input
            value={draft.city}
            onChange={(event) => set("city", event.target.value)}
            autoComplete="address-level2"
          />
        </Field>
        <Field label="State" required error={fieldErrors.state}>
          <Input
            value={draft.state}
            onChange={(event) => set("state", event.target.value)}
            autoComplete="address-level1"
          />
        </Field>
        <Field label="Pincode" required error={fieldErrors.postalCode}>
          <Input
            inputMode="numeric"
            value={draft.postalCode}
            onChange={(event) => set("postalCode", event.target.value)}
            autoComplete="postal-code"
          />
        </Field>
      </div>

      <Coverage
        postalCode={draft.postalCode}
        serviceability={serviceability}
        isChecking={isCheckingServiceability}
      />

      <fieldset className="border-0 p-0">
        <legend className="mb-2 text-sm font-semibold text-text">Save it as</legend>
        <ChoiceChips
          label="Save it as"
          name="address-label"
          options={[...LABEL_PRESETS, { value: OTHER_LABEL, label: "Other" }]}
          value={draft.labelChoice}
          onChange={(value) => set("labelChoice", value)}
        />
        {draft.labelChoice === OTHER_LABEL ? (
          <div className="mt-3">
            <Field label="What should we call it?" required error={fieldErrors.label}>
              <Input
                value={draft.label}
                onChange={(event) => set("label", event.target.value)}
                maxLength={60}
              />
            </Field>
          </div>
        ) : null}
      </fieldset>

      {pinError !== null ? (
        <p role="alert" className="text-sm font-medium text-danger-text">
          {pinError}
        </p>
      ) : null}

      {saveError !== null ? (
        <p role="alert" className="text-sm font-medium text-danger-text">
          {saveError}
        </p>
      ) : null}
    </form>
  );
}

/** The coverage verdict for what is typed. Advisory, and says so. */
function Coverage({
  postalCode,
  serviceability,
  isChecking,
}: {
  postalCode: string;
  serviceability: Schemas["ServiceabilityResponse"] | null;
  isChecking: boolean;
}) {
  if (postalCode.trim() === "") return null;

  return (
    <div aria-live="polite">
      {isChecking ? (
        <p className="flex items-center gap-2 text-sm text-text-secondary">
          <Spinner />
          Checking whether we cover this pincode…
        </p>
      ) : serviceability === null ? null : serviceability.is_serviceable ? (
        <p className="text-sm font-semibold text-success-text">We serve here.</p>
      ) : (
        <p className="text-sm text-warning-text">
          <strong className="font-semibold">We do not cover this pincode yet.</strong> You
          can still save it — we are expanding, and our team can sometimes reach
          addresses the map has not caught up with.
        </p>
      )}
    </div>
  );
}
