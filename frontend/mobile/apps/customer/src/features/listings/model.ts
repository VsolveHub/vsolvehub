import { z } from "zod";

export const applySchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Enter your full name (at least 2 characters).")
    .max(120, "Name must be 120 characters or fewer."),
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
  skills: string;
  findable: boolean;
}

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

export const STRUCTURED_FIELD_LABELS: Record<string, string> = {
  pay_range: "Pay Range",
  salary_range: "Compensation",
  compensation: "Compensation",
  work_mode: "Workplace Mode",
  shift: "Shift Timing",
  role_type: "Employment Type",
  employment_type: "Employment Type",
  experience_years: "Experience Required",
  experience: "Experience Required",
};

export function formatFieldLabel(key: string): string {
  return (
    STRUCTURED_FIELD_LABELS[key] ||
    key
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ")
  );
}

export function issuesToFieldErrors(input: z.ZodError | z.ZodIssue[]): Record<string, string> {
  const issues = Array.isArray(input) ? input : input.issues;
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !errors[key]) {
      errors[key] = issue.message;
    }
  }
  return errors;
}


