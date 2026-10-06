import { ApiRequestError } from "@vsolve/api-client";
import { z } from "zod";

/**
 * Mirrors `SubmitApplicationSerializer` on the server, which stays the authority.
 * Validating here means the demo shows a precise message under the field instead
 * of a round-trip 400.
 */
export const applySchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Enter your full name (at least 2 characters).")
    .max(120, "Name must be 120 characters or fewer.")
    .refine((value) => /[a-zA-Z]/.test(value), "Enter your full name."),
  phone: z
    .string()
    .trim()
    .min(1, "Enter your contact phone number.")
    .refine(
      (value) => /^\d{10}$/.test(value.replace(/\D/g, "")),
      "Enter a 10-digit mobile number.",
    ),
  email: z
    .string()
    .trim()
    .max(254, "Email must be 254 characters or fewer.")
    .refine(
      (value) => value === "" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value),
      "Enter a valid email address.",
    ),
  experience: z.string().trim().max(120, "Keep this to 120 characters or fewer."),
  resume_url: z
    .string()
    .trim()
    .max(500, "Keep the link to 500 characters or fewer.")
    .refine(
      (value) => value === "" || /^https?:\/\/\S+$/i.test(value),
      "Enter a link starting with http:// or https://",
    ),
  cover_note: z.string().trim().max(2000, "Keep your note to 2000 characters or fewer."),
});

export function issuesToFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "");
    if (key && !out[key]) out[key] = issue.message;
  }
  return out;
}

export function serverFieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiRequestError)) return {};
  const out: Record<string, string> = {};
  for (const [field, messages] of Object.entries(error.fieldErrors)) {
    const first = messages[0];
    if (first) out[field] = first;
  }
  return out;
}

/** Applicant-facing labels. The API's own vocabulary is not shown to customers. */
export const APPLICATION_STATUS_LABELS: Record<string, string> = {
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under review",
  SHORTLISTED: "Shortlisted",
  CONTACTED: "Contacted",
  REJECTED: "Not selected",
  WITHDRAWN: "Withdrawn",
  EXPIRED: "Closed",
};

export interface ApplyFormState {
  name: string;
  phone: string;
  email: string;
  experience: string;
  cover_note: string;
  resume_url: string;
  /** Comma-separated in the form; sent as a list. Saved to the applicant's job profile. */
  skills: string;
  /** "Let other employers with matching jobs find my profile". Ticked by default. */
  findable: boolean;
}

/** "Python, React ,  sql" -> ["Python", "React", "sql"], de-duplicated, at most 20. */
export function parseSkills(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(",")) {
    const skill = raw.trim().replace(/\s+/g, " ").slice(0, 60);
    if (skill && !seen.has(skill.toLowerCase())) {
      seen.add(skill.toLowerCase());
      out.push(skill);
    }
  }
  return out.slice(0, 20);
}

/**
 * Resolves a human-readable label for a structured field, prioritizing
 * the server-published schema title, falling back to canonical defaults or title-casing.
 */
export const STRUCTURED_FIELD_LABELS: Record<string, string> = {
  pay_range: "Pay Range",
  salary_range: "Pay Range / Compensation",
  compensation: "Compensation",
  work_mode: "Workplace Mode / Shift",
  shift: "Workplace Mode / Shift",
  role_type: "Role Type / Employment",
  employment_type: "Role Type / Employment",
  experience_years: "Experience Required",
  experience: "Experience / Qualification",
};

export function formatFieldLabel(key: string, schema?: Record<string, unknown>): string {
  const schemaTitle = (
    schema?.properties as Record<string, { title?: string }> | undefined
  )?.[key]?.title;
  if (schemaTitle) return schemaTitle;

  return (
    STRUCTURED_FIELD_LABELS[key] ||
    key
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ")
  );
}

export const STATUS_EVENT_LABELS: Record<string, string> = {
  CONTACT_REVEALED: "Your contact details were shared with the employer",
  APPLIED: "Application submitted",
  STATUS_CHANGED: "Status updated",
};

export function formatStatusEventKind(kind?: string): string {
  if (!kind) return "Event";
  return STATUS_EVENT_LABELS[kind] || kind.replaceAll("_", " ");
}
