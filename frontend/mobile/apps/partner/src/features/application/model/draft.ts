// Ported from frontend/apps/partner/features/application/model/draft.ts
import type { Schemas } from "@vsolve/api-client";

/**
 * The application as one editable record, saved one step at a time.
 *
 * ## What changed in contract 1.4.0
 *
 * `PATCH /api/v1/partner/application/` used to be a full replace wearing a
 * patch's name: the generated type said every field was optional while Django's
 * serializer required five of them, and all three lists rejected an empty array.
 * The consequence was not subtle — an applicant could not save their *name*
 * until they had also chosen service areas that no endpoint published.
 *
 * It is now genuinely partial. Omitted fields are preserved, supplied selection
 * sets are validated together, and the complete updated application comes back.
 * So a step sends only what it edits, and `changedFields` is what decides that.
 *
 * That inverts the old rule. Sending the whole record on every save would now be
 * actively wrong: two people editing different steps would each overwrite the
 * other's section with the values their form happened to be holding.
 */

type Application = Schemas["PartnerApplication"];

export interface ConsentDraft {
  purpose: string;
  documentVersion: string;
}

export interface ApplicationDraft {
  displayName: string;
  biography: string;
  experienceYears: number;
  track?: "SERVICES" | "STAY_HOST" | "RENTAL_OWNER" | "EMPLOYER" | "RIDE_CAPTAIN";
  skillCodes: readonly string[];
  serviceVariantIds: readonly string[];
  serviceAreaIds: readonly string[];
  consents: readonly ConsentDraft[];
}

export const EMPTY_DRAFT: ApplicationDraft = {
  displayName: "",
  biography: "",
  experienceYears: 0,
  skillCodes: [],
  serviceVariantIds: [],
  serviceAreaIds: [],
  consents: [],
};

/**
 * Reads the server's record into an editable draft.
 *
 * A withdrawn consent is dropped rather than resent: re-submitting it would
 * silently re-grant something the Partner deliberately took back.
 */
export function draftFromApplication(application: Application | null): ApplicationDraft {
  if (application === null) return EMPTY_DRAFT;

  return {
    displayName: application.display_name,
    biography: application.biography,
    experienceYears: application.experience_years,
    track: (application.track as any) || undefined,
    skillCodes: [...application.skill_codes],
    serviceVariantIds: [...application.service_variant_ids],
    serviceAreaIds: [...application.service_area_ids],
    consents: application.consents
      .filter((consent) => consent.withdrawn_at === null)
      .map((consent) => ({
        purpose: consent.purpose,
        documentVersion: consent.document_version,
      })),
  };
}

/** Adds or removes a value, keeping the list free of the duplicates Django rejects. */
export function toggle(values: readonly string[], value: string): string[] {
  return values.includes(value)
    ? values.filter((candidate) => candidate !== value)
    : [...values, value];
}

export type ApplicationPatch = Omit<
  Schemas["PatchedPartnerApplicationUpdateRequest"],
  "expected_version"
>;

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const sorted = (values: readonly string[]) => [...values].sort().join("::");
  return sorted(left) === sorted(right);
}

/**
 * The fields this draft actually changed.
 *
 * Only these are sent. A field the applicant did not touch is omitted so the
 * server keeps whatever it holds — which is the entire point of a partial
 * update, and the difference between two people editing different steps
 * coexisting and one silently reverting the other.
 */
export function changedFields(
  draft: ApplicationDraft,
  application: Application | null,
): ApplicationPatch {
  const saved = draftFromApplication(application);
  const patch: ApplicationPatch = {};

  const displayName = draft.displayName.trim();
  if (displayName !== saved.displayName.trim()) patch.display_name = displayName;

  if (draft.track && draft.track !== saved.track) {
    patch.track = draft.track;
  }

  const biography = draft.biography.trim();
  if (biography !== saved.biography.trim()) patch.biography = biography;

  if (draft.experienceYears !== saved.experienceYears) {
    patch.experience_years = draft.experienceYears;
  }

  // Selection sets compare unordered: the server stores a set, so a reordered
  // list is not an edit and sending it would burn a version for nothing.
  if (!sameSet(draft.skillCodes, saved.skillCodes)) {
    patch.skill_codes = [...draft.skillCodes];
  }
  if (!sameSet(draft.serviceVariantIds, saved.serviceVariantIds)) {
    patch.service_variant_ids = [...draft.serviceVariantIds];
  }
  if (!sameSet(draft.serviceAreaIds, saved.serviceAreaIds)) {
    patch.service_area_ids = [...draft.serviceAreaIds];
  }

  // Consents are append-only receipts. Only ones not already on file are sent;
  // resending an existing acceptance would create a duplicate receipt for a
  // decision the Partner made once.
  const held = new Set(saved.consents.map((consent) => consentKey(consent)));
  const added = draft.consents.filter((consent) => !held.has(consentKey(consent)));
  if (added.length > 0) {
    patch.consents = added.map((consent) => ({
      purpose: consent.purpose,
      document_version: consent.documentVersion,
    }));
  }

  return patch;
}

function consentKey(consent: ConsentDraft): string {
  return `${consent.purpose}@${consent.documentVersion}`;
}

/** True when the draft differs from what the server currently holds. */
export function isDirty(draft: ApplicationDraft, application: Application | null): boolean {
  return Object.keys(changedFields(draft, application)).length > 0;
}

/**
 * Consent purposes Django requires before submission that are not yet accepted.
 *
 * Read from `GET /api/v1/partner/required-consents/` rather than hardcoded: the
 * required set and each document's current version live in Django settings and
 * change when legal text is republished, which must re-prompt every applicant.
 */
export function outstandingConsents(
  draft: ApplicationDraft,
  required: readonly Schemas["PartnerConsentDocument"][],
): Schemas["PartnerConsentDocument"][] {
  const accepted = new Set(draft.consents.map((consent) => consentKey(consent)));
  return required.filter(
    (document) =>
      document.is_required_for_submission &&
      !accepted.has(`${document.purpose}@${document.document_version}`),
  );
}
