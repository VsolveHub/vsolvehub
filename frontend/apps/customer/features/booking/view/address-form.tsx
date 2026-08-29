"use client";

import type { Schemas } from "@vsolve/api-client";
import { Button, ChoiceChips, Field, Input, Spinner, cn } from "@vsolve/ui";
import { useEffect, useState, type FormEvent } from "react";

/**
 * Typing a new address, inside the picker rather than instead of it.
 *
 * ## Why this exists at all
 *
 * Until now the only way to add an address was **Use my current location**,
 * which reverse-geocoded the device's coordinates and saved the result
 * immediately, unseen. Reverse geocoding is good at the street and bad at
 * everything a courier actually needs: it cannot know the flat number, the gate,
 * or which of two towers is yours, and it has no opinion about what to call the
 * place. That is why so many saved addresses read "Saved address" and carry the
 * wrong first line — nobody was ever offered the chance to correct them.
 *
 * So locating and saving are now two steps. The pin still comes from the device,
 * and the fields it resolves are a **starting point the Customer edits** before
 * anything is written.
 *
 * ## Why the pin has to come from the device
 *
 * `AddressRequest` requires `latitude` and `longitude`, and there is no forward
 * geocoder — `POST /geocoding/reverse/` goes coordinates-to-address and there is
 * nothing going the other way. A typed address therefore cannot be saved on its
 * own, and the honest consequence is that **Use my location** is a required step
 * rather than a convenience. The form says so plainly instead of letting
 * somebody fill in six fields and then refusing them.
 *
 * (The design has a map with a draggable pin here. That needs a map library and
 * a tile provider, and both are decisions rather than code — see the note in the
 * dialog's own header.)
 *
 * ## Serviceability is shown and never blocks
 *
 * The same rule the rest of the picker follows. Coverage is advisory —
 * Operations can serve an area the lookup does not know about — so an
 * unserviceable pincode is a warning the Customer reads, not a door this form
 * closes. The commands re-check for real.
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
  /** Resolves the device's position into fields. Never saves. */
  onLocate: () => Promise<LocatedAddress | null>;
  isLocating: boolean;
  locateError: string | null;
  /** Writes the address. Resolving is the caller's; this only reports the draft. */
  onSubmit: (draft: AddressRequest) => void;
  saveError: string | null;
  /** Called as the pincode changes, so the caller can check coverage. */
  onPostalCodeChange: (postalCode: string) => void;
  serviceability: Schemas["ServiceabilityResponse"] | null;
  isCheckingServiceability: boolean;
}

interface Draft {
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

const EMPTY: Draft = {
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

export function AddressForm({
  formId,
  onLocate,
  isLocating,
  locateError,
  onSubmit,
  saveError,
  onPostalCodeChange,
  serviceability,
  isCheckingServiceability,
}: AddressFormProps) {
  const [draft, setDraft] = useState<Draft>(EMPTY);

  const isPinned = draft.latitude !== "" && draft.longitude !== "";
  const resolvedLabel = draft.labelChoice === OTHER_LABEL ? draft.label : draft.labelChoice;

  // The caller checks coverage against whatever is typed. Debounced there would
  // be premature: a pincode is six characters and the check is cheap, so this
  // reports every change and the caller's query key does the deduplication.
  useEffect(() => {
    onPostalCodeChange(draft.postalCode);
  }, [draft.postalCode, onPostalCodeChange]);

  function set<K extends keyof Draft>(field: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

function sanitizeGeocodedAddress(resolved: LocatedAddress) {
  let line1 = (resolved.line1 ?? "").trim();
  const postalCode = (resolved.postal_code ?? "").trim();
  const locality = (resolved.locality ?? "").trim();
  let city = (resolved.city ?? "").trim();

  // If line1 starts with the 6-digit postal code or contains leading postal code numbers, strip them
  if (postalCode && line1.startsWith(postalCode)) {
    line1 = line1.slice(postalCode.length).replace(/^[\s,/-]+/, "").trim();
  } else if (/^\d{6}\b/.test(line1)) {
    line1 = line1.replace(/^\d{6}[\s,/-]*/, "").trim();
  }

  // If line1 is now purely numeric or empty, or identical to locality/city, keep it empty for user to type flat/house number
  if (
    /^\d+$/.test(line1) ||
    line1.toLowerCase() === locality.toLowerCase() ||
    line1.toLowerCase() === city.toLowerCase()
  ) {
    line1 = "";
  }

  // Clean city: strip "mandal", "district", "rural", "urban" suffixes
  city = city
    .replace(/\s+(mandal|district|rural|urban)\b/gi, "")
    .replace(/,\s*.*$/, "")
    .trim();

  return {
    line1,
    locality,
    city: city || (resolved.city ?? ""),
    state: resolved.state ?? "",
    postalCode,
    latitude: resolved.latitude ?? "",
    longitude: resolved.longitude ?? "",
  };
}

  async function locate() {
    const rawResolved = await onLocate();
    if (rawResolved === null) return;
    const resolved = sanitizeGeocodedAddress(rawResolved);
    // Merged rather than replaced: anything already typed is the Customer's own
    // correction and outranks the geocoder, which is the whole point of the two
    // steps. Only the coordinates are taken unconditionally — they are the one
    // thing the device knows better.
    setDraft((current) => ({
      ...current,
      line1: current.line1 === "" ? resolved.line1 : current.line1,
      locality: current.locality === "" ? resolved.locality : current.locality,
      city: current.city === "" ? resolved.city : current.city,
      state: current.state === "" ? resolved.state : current.state,
      postalCode: current.postalCode === "" ? resolved.postalCode : current.postalCode,
      latitude: resolved.latitude,
      longitude: resolved.longitude,
    }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Every text field is `required`, so the browser has already refused an
    // incomplete form and said which field is missing — better than anything
    // this component could render, and it moves focus there too. The one rule
    // the platform cannot check is the pin, because it is not a field.
    if (!isPinned) return;
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
      // The server records how the coordinates were obtained, and they came from
      // the device through the reverse geocoder — which is what
      // `REVERSE_GEOCODED` means. Claiming anything else would misdescribe the
      // provenance of a pin a courier is going to drive to.
      source: "REVERSE_GEOCODED",
    });
  }

  return (
    <form id={formId} onSubmit={submit} className="flex flex-col gap-4">
      <PinStatus isPinned={isPinned} isLocating={isLocating} onLocate={() => void locate()} />

      {locateError !== null ? (
        <p role="alert" className="text-sm font-medium text-danger-text">
          {locateError}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Flat, plot or building" required className="sm:col-span-2">
          <Input
            required
            value={draft.line1}
            onChange={(event) => set("line1", event.target.value)}
            autoComplete="address-line1"
          />
        </Field>
        <Field label="Street, area" required>
          <Input
            required
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
        <Field label="City" required>
          <Input
            required
            value={draft.city}
            onChange={(event) => set("city", event.target.value)}
            autoComplete="address-level2"
          />
        </Field>
        <Field label="State" required>
          <Input
            required
            value={draft.state}
            onChange={(event) => set("state", event.target.value)}
            autoComplete="address-level1"
          />
        </Field>
        <Field label="Pincode" required>
          <Input
            required
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
            <Field label="What should we call it?" required>
              <Input
                required
                value={draft.label}
                onChange={(event) => set("label", event.target.value)}
                maxLength={60}
              />
            </Field>
          </div>
        ) : null}
      </fieldset>

      {/* Inside the dialog, beside the control that failed. The cart's own
          comment explains the trap this avoids: an error rendered on the page
          behind an open dialog is an error nobody can see. */}
      {saveError !== null ? (
        <p role="alert" className="text-sm font-medium text-danger-text">
          {saveError}
        </p>
      ) : null}
    </form>
  );
}

/**
 * The pin, and why it is not optional.
 *
 * Stated up front rather than as a validation message on submit. A Customer who
 * fills in six fields and is then told the form needs something it never asked
 * for has been wasted, and this is the one requirement they cannot satisfy by
 * typing.
 */
function PinStatus({
  isPinned,
  isLocating,
  onLocate,
}: {
  isPinned: boolean;
  isLocating: boolean;
  onLocate: () => void;
}) {
  return (
    <div
      className={cn(
        "rounded-card border p-4",
        isPinned ? "border-success-line bg-success-surface" : "border-action-line bg-action-surface",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-text">
            {isPinned ? "Location pinned" : "Pin the location first"}
          </p>
          <p className="mt-0.5 text-sm leading-5 text-text-secondary">
            {isPinned
              ? "We have the coordinates. Correct the address below — we usually get the street right and the flat number wrong."
              : "We need coordinates to send somebody to the right gate, and only your device can give us those."}
          </p>
        </div>
        <Button
          type="button"
          variant={isPinned ? "outline" : "primary"}
          onClick={onLocate}
          loading={isLocating}
          loadingLabel="Finding your location"
        >
          {isPinned ? "Re-pin" : "Use my location"}
        </Button>
      </div>
    </div>
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
