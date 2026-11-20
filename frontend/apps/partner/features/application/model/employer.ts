import type { HiringAs } from "./steps";

/**
 * Which screen collects what the server says an employer still has to give.
 *
 * The server's `employer.missing_fields` is the only rule for what is missing; this only says where
 * each missing field is asked, so a checklist item can link to the right screen. It never decides
 * that something is missing.
 */

export type EmployerStepHref =
  | "/apply/hiring-as"
  | "/apply/employer/about"
  | "/apply/employer/business"
  | "/apply/employer/contact";

/** Asked on "You and your role" for a business; every other field is on the business screen. */
const CONTACT_FIELDS: ReadonlySet<string> = new Set(["display_name", "poster_role", "id_document_type"]);

export function employerStepFor(field: string, hiringAs: HiringAs | ""): EmployerStepHref {
  if (field === "hiring_as") return "/apply/hiring-as";
  if (hiringAs === "BUSINESS") {
    return CONTACT_FIELDS.has(field) ? "/apply/employer/contact" : "/apply/employer/business";
  }
  return "/apply/employer/about";
}

/** The fields still missing that this screen is responsible for. */
export function missingOnStep(
  step: EmployerStepHref,
  missingFields: readonly string[],
  hiringAs: HiringAs | "",
): string[] {
  return missingFields.filter((field) => employerStepFor(field, hiringAs) === step);
}

/** An empty value from the server means they have not chosen yet. */
export function hiringAsOf(employer: { hiring_as?: string | null } | null | undefined): HiringAs | "" {
  return employer?.hiring_as === "INDIVIDUAL" || employer?.hiring_as === "BUSINESS"
    ? employer.hiring_as
    : "";
}
