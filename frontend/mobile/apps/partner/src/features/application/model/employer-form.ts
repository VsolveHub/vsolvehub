// Ported from frontend/apps/partner/features/application/model/employer-form.ts
import type { Schemas } from "@vsolve/api-client";

import { checkGstin, type GstinProblem } from "./gstin";
import { hiringAsOf } from "./employer";
import type { EmployerDetailsPatch } from "../queries";

/**
 * What the employer screens ask, check and send.
 *
 * Whether the employer is *complete* is the server's (`employer.missing_fields`). This only keeps a
 * screen from sending what the server would refuse, and says what is wrong before saving. The
 * server checks every one of these again.
 */

type Application = Schemas["PartnerApplication"];
type Employer = NonNullable<Application["employer"]>;

export const ID_TYPES = ["AADHAAR_MASKED", "PAN", "DRIVING_LICENCE", "VOTER_ID", "PASSPORT"] as const;
export const ROLES = ["OWNER", "HR", "MANAGER", "OTHER"] as const;
export const STRUCTURES = [
  "PROPRIETORSHIP",
  "PARTNERSHIP_LLP",
  "COMPANY",
  "TRUST_SOCIETY_NGO",
  "GOVERNMENT",
] as const;
export const CATEGORIES = [
  "SHOP",
  "RESTAURANT",
  "CLINIC",
  "OFFICE",
  "SCHOOL",
  "FACTORY",
  "CONSTRUCTION",
  "FACILITY",
  "LOGISTICS",
  "HOTEL",
  "SALON",
  "OTHER",
] as const;
export const SIZES = [
  { value: "SIZE_1_10", label: "1-10" },
  { value: "SIZE_11_50", label: "11-50" },
  { value: "SIZE_51_200", label: "51-200" },
  { value: "SIZE_200_PLUS", label: "200+" },
] as const;
export const GST_PROOF = "GST_CERTIFICATE";
/** With GST the proof is the GST certificate; without it, one of these. */
export const NON_GST_PROOFS = [
  "INCORPORATION_CERTIFICATE",
  "COMPANY_PAN",
  "SHOP_ESTABLISHMENT",
  "TRADE_LICENCE",
  "FSSAI",
  "CLINIC_REGISTRATION",
  "UDYAM",
] as const;

export const LOGO_MAX_BYTES = 2 * 1024 * 1024;
export const LOGO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export const PIN_CODE = /^[1-9][0-9]{5}$/;
const EMAIL = /^\S+@\S+\.\S+$/;
const MIN_NAME_LENGTH = 2;

export const isPinCode = (value: string) => PIN_CODE.test(value.trim());
export const isEmail = (value: string) => EMAIL.test(value.trim());
const blank = (value: string) => value.trim().length === 0;

/** What is wrong on a screen. `missing` is a required field left empty; `invalid` has a bad value. */
export interface Problems<Field extends string> {
  missing: ReadonlySet<Field>;
  invalid: ReadonlySet<Field>;
}

export function canContinue<Field extends string>(problems: Problems<Field>): boolean {
  return problems.missing.size === 0 && problems.invalid.size === 0;
}

function problemsOf<Field extends string>(
  checks: readonly { field: Field; value: string; required: boolean; valid?: (value: string) => boolean }[],
): Problems<Field> {
  const missing = new Set<Field>();
  const invalid = new Set<Field>();
  for (const { field, value, required, valid } of checks) {
    if (blank(value)) {
      if (required) missing.add(field);
    } else if (valid && !valid(value)) {
      invalid.add(field);
    }
  }
  return { missing, invalid };
}

const validName = (value: string) => value.trim().length >= MIN_NAME_LENGTH;

/* ----------------------------- the individual ----------------------------- */

export interface IndividualDraft {
  displayName: string;
  email: string;
  pinCode: string;
  area: string;
  city: string;
  idType: string;
}

export type IndividualField = keyof IndividualDraft;

export function individualDraft(employer: Employer | null | undefined, displayName: string): IndividualDraft {
  return {
    displayName,
    email: employer?.email ?? "",
    pinCode: employer?.pin_code ?? "",
    area: employer?.area ?? "",
    city: employer?.city ?? "",
    idType: employer?.id_document_type ?? "",
  };
}

export function individualProblems(draft: IndividualDraft): Problems<IndividualField> {
  return problemsOf<IndividualField>([
    { field: "displayName", value: draft.displayName, required: true, valid: validName },
    { field: "email", value: draft.email, required: false, valid: isEmail },
    { field: "pinCode", value: draft.pinCode, required: true, valid: isPinCode },
    { field: "area", value: draft.area, required: true },
    { field: "city", value: draft.city, required: true },
    { field: "idType", value: draft.idType, required: true },
  ]);
}

export function individualPatch(draft: IndividualDraft): EmployerDetailsPatch {
  return {
    display_name: draft.displayName.trim(),
    email: draft.email.trim(),
    pin_code: draft.pinCode.trim(),
    area: draft.area.trim(),
    city: draft.city.trim(),
    id_document_type: draft.idType as EmployerDetailsPatch["id_document_type"],
  };
}

/* ------------------------- the person hiring for a business ------------------------- */

export interface ContactDraft {
  displayName: string;
  role: string;
  email: string;
  idType: string;
}

export type ContactField = keyof ContactDraft;

export function contactDraft(employer: Employer | null | undefined, displayName: string): ContactDraft {
  return {
    displayName,
    role: employer?.poster_role ?? "",
    email: employer?.email ?? "",
    idType: employer?.id_document_type ?? "",
  };
}

export function contactProblems(draft: ContactDraft): Problems<ContactField> {
  return problemsOf<ContactField>([
    { field: "displayName", value: draft.displayName, required: true, valid: validName },
    { field: "role", value: draft.role, required: true },
    { field: "email", value: draft.email, required: false, valid: isEmail },
    { field: "idType", value: draft.idType, required: true },
  ]);
}

export function contactPatch(draft: ContactDraft): EmployerDetailsPatch {
  return {
    display_name: draft.displayName.trim(),
    poster_role: draft.role as EmployerDetailsPatch["poster_role"],
    email: draft.email.trim(),
    id_document_type: draft.idType as EmployerDetailsPatch["id_document_type"],
  };
}

/* ----------------------------------- the business ----------------------------------- */

/** "yes" and "no" are answers; "" means they have not answered, which is not "no". */
export type GstAnswer = "yes" | "no" | "";

export interface BusinessDraft {
  tradeName: string;
  legalName: string;
  structure: string;
  category: string;
  size: string;
  gst: GstAnswer;
  gstin: string;
  proof: string;
  address: string;
  area: string;
  city: string;
  state: string;
  pinCode: string;
  latitude: string;
  longitude: string;
  websiteUrl: string;
}

export type BusinessField = keyof BusinessDraft;

type EmployerBusiness = NonNullable<Employer["business"]>;

/** A new business shows neither answer: only a saved "yes", or a "no" with a proof, counts. */
function savedGstAnswer(business: EmployerBusiness | null | undefined): GstAnswer {
  if (!business) return "";
  if (business.gst_registered) return "yes";
  return business.business_proof_type ? "no" : "";
}

export function businessDraft(business: EmployerBusiness | null | undefined): BusinessDraft {
  const gst = savedGstAnswer(business);
  return {
    tradeName: business?.trade_name ?? "",
    legalName: business?.legal_name ?? "",
    structure: business?.legal_structure ?? "",
    category: business?.business_category ?? "",
    size: business?.company_size ?? "",
    gst,
    gstin: business?.gstin ?? "",
    proof: gst === "yes" ? GST_PROOF : (business?.business_proof_type ?? ""),
    address: business?.address ?? "",
    area: business?.area ?? "",
    city: business?.city ?? "",
    state: business?.state ?? "",
    pinCode: business?.pin_code ?? "",
    latitude: business?.latitude ?? "",
    longitude: business?.longitude ?? "",
    websiteUrl: business?.website_url ?? "",
  };
}

const isWebAddress = (value: string) => /^https?:\/\/\S+$/i.test(value.trim());

/** Why a GSTIN was refused, for the message under it. Null when it is fine or not asked. */
export function gstinProblem(draft: BusinessDraft): GstinProblem | null {
  if (draft.gst !== "yes" || blank(draft.gstin)) return null;
  const result = checkGstin(draft.gstin);
  return result.ok ? null : result.problem;
}

export function businessProblems(draft: BusinessDraft): Problems<BusinessField> {
  const withGst = draft.gst === "yes";
  const base = problemsOf<BusinessField>([
    { field: "legalName", value: draft.legalName, required: true },
    { field: "structure", value: draft.structure, required: true },
    { field: "category", value: draft.category, required: true },
    { field: "size", value: draft.size, required: true },
    { field: "gstin", value: withGst ? draft.gstin : "-", required: withGst, valid: () => gstinProblem(draft) === null },
    { field: "proof", value: withGst ? GST_PROOF : draft.proof, required: true },
    { field: "address", value: draft.address, required: true },
    { field: "area", value: draft.area, required: true },
    { field: "city", value: draft.city, required: true },
    { field: "state", value: draft.state, required: true },
    { field: "pinCode", value: draft.pinCode, required: true, valid: isPinCode },
    { field: "latitude", value: draft.latitude && draft.longitude ? "pinned" : "", required: true },
    { field: "websiteUrl", value: draft.websiteUrl, required: false, valid: isWebAddress },
  ]);
  // Not answering the GST question is a missing answer, whatever else is filled in.
  const missing = new Set(base.missing);
  if (draft.gst === "") missing.add("gst");
  return { missing, invalid: base.invalid };
}

export function businessPatch(draft: BusinessDraft): EmployerDetailsPatch {
  const withGst = draft.gst === "yes";
  const pinned = draft.latitude !== "" && draft.longitude !== "";
  return {
    business: {
      trade_name: draft.tradeName.trim(),
      legal_name: draft.legalName.trim(),
      legal_structure: draft.structure as NonNullable<
        NonNullable<EmployerDetailsPatch["business"]>["legal_structure"]
      >,
      business_category: draft.category as NonNullable<
        NonNullable<EmployerDetailsPatch["business"]>["business_category"]
      >,
      company_size: draft.size as NonNullable<NonNullable<EmployerDetailsPatch["business"]>["company_size"]>,
      gst_registered: withGst,
      // The server takes a GSTIN only with GST ticked, and refuses a proof that does not fit.
      gstin: withGst ? draft.gstin.replace(/\s+/g, "").toUpperCase() : "",
      business_proof_type: (withGst ? GST_PROOF : draft.proof) as NonNullable<
        NonNullable<EmployerDetailsPatch["business"]>["business_proof_type"]
      >,
      address: draft.address.trim(),
      area: draft.area.trim(),
      city: draft.city.trim(),
      state: draft.state.trim(),
      pin_code: draft.pinCode.trim(),
      latitude: pinned ? draft.latitude : null,
      longitude: pinned ? draft.longitude : null,
      website_url: draft.websiteUrl.trim(),
    },
  };
}

/* ----------------------------------- switching ----------------------------------- */

/**
 * Whether switching type would throw away something the employer typed. The business row exists
 * from the moment they choose "business", so its existence alone is not details.
 */
export function hasEnteredDetails(application: Application): boolean {
  const employer = application.employer;
  if (!employer || !hiringAsOf(employer)) return false;
  const person = [employer.poster_role, employer.email, employer.area, employer.city, employer.pin_code];
  const business = employer.business;
  const company = business
    ? [business.trade_name, business.legal_name, business.address, business.gstin, business.logo_url]
    : [];
  return [...person, ...company].some((value) => Boolean(value));
}
