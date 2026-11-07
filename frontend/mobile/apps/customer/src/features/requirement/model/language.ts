// Ported from frontend/apps/customer/features/requirement/model/language.ts
/**
 * The language a requirement — and above all its voice note — is recorded in.
 *
 * `M2-FE-205` and `GAP-007`. This is not a locale preference for the UI. It is
 * an **eligibility input**: `matching._eligible_candidates` compares
 * `CustomerRequirement.language` against the vendor's declared
 * `PartnerLanguage.language_tag` on the primary subtag, and excludes with
 * `LANGUAGE_MISMATCH`. A 30-second voice note in a language the assigned vendor
 * cannot understand is a silent matching failure — the request looks answered
 * and nobody can price it — which is exactly why the flow asks rather than
 * assumes.
 *
 * ## This vocabulary is client-owned, and that is a gap
 *
 * Nothing in contract 1.22.0 publishes the languages the platform supports.
 * `CustomerRequirement.language` is a `CharField(max_length=16)` with a default
 * and no choices, `PartnerLanguage.language_tag` is the same, and the two are
 * authored independently. So this list is written here, on the same footing as
 * Session B's client-owned decline reasons, and it is logged as a contract gap
 * rather than presented as the platform's answer.
 *
 * The consequence to keep in mind while it stays client-owned: offering a
 * language no Partner has declared produces a requirement that matches nobody,
 * and the Customer is never told why. The list is therefore deliberately short
 * and regional, not a dump of every tag `Intl` knows.
 *
 * ## Why tags and not names on the wire
 *
 * Matching compares the primary subtag, so `te-IN` and `te` are one language.
 * Sending the regional tag keeps the display name unambiguous ("Telugu" rather
 * than a guess) without changing what matching does with it.
 */

export interface RequirementLanguage {
  /** BCP-47-ish, as `CustomerRequirement.language` stores it. */
  tag: string;
  /** English name, for the control's label. */
  label: string;
  /** The name in the language itself — the whole point of offering the choice. */
  nativeLabel: string;
}

export const REQUIREMENT_LANGUAGES: readonly RequirementLanguage[] = [
  { tag: "en-IN", label: "English", nativeLabel: "English" },
  { tag: "hi-IN", label: "Hindi", nativeLabel: "हिन्दी" },
  { tag: "te-IN", label: "Telugu", nativeLabel: "తెలుగు" },
  { tag: "ta-IN", label: "Tamil", nativeLabel: "தமிழ்" },
  { tag: "kn-IN", label: "Kannada", nativeLabel: "ಕನ್ನಡ" },
  { tag: "ml-IN", label: "Malayalam", nativeLabel: "മലയാളം" },
  { tag: "mr-IN", label: "Marathi", nativeLabel: "मराठी" },
  { tag: "bn-IN", label: "Bengali", nativeLabel: "বাংলা" },
  { tag: "gu-IN", label: "Gujarati", nativeLabel: "ગુજરાતી" },
  { tag: "pa-IN", label: "Punjabi", nativeLabel: "ਪੰਜਾਬੀ" },
  { tag: "or-IN", label: "Odia", nativeLabel: "ଓଡ଼ିଆ" },
  { tag: "ur-IN", label: "Urdu", nativeLabel: "اردو" },
];

/**
 * The server's own default, and the only value in this module that is not a
 * choice somebody made. `CustomerRequirement.language` defaults to it, so
 * sending it explicitly changes nothing — it is named here so the flow does not
 * carry a bare string literal that looks like a decision.
 */
export const DEFAULT_LANGUAGE_TAG = "en-IN";

/** `te-IN` and `te` are one language, the way matching reads them. */
export function primarySubtag(tag: string): string {
  return tag.toLowerCase().split("-")[0] ?? "";
}

/**
 * The offered language closest to what the browser reports, or null.
 *
 * Null rather than English, because "we could not tell" and "they chose
 * English" are different facts and only the second should be recorded on a
 * requirement that goes out to vendors. The caller decides what to do with
 * silence — the recorder shows the picker with the server default preselected
 * and says the note's language is what routes it.
 */
export function matchKnownLanguage(candidates: readonly string[]): string | null {
  for (const candidate of candidates) {
    const subtag = primarySubtag(candidate);
    if (subtag === "") continue;
    const known = REQUIREMENT_LANGUAGES.find((language) => primarySubtag(language.tag) === subtag);
    if (known !== undefined) return known.tag;
  }
  return null;
}

/** The display name for a tag, or the tag itself when it is not one we offer. */
export function languageLabel(tag: string): string {
  const known = REQUIREMENT_LANGUAGES.find(
    (language) => primarySubtag(language.tag) === primarySubtag(tag),
  );
  return known === undefined ? tag : known.label;
}
