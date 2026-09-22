import { ApiRequestError } from "@vsolve/api-client";
import { z } from "zod";

/**
 * Mirrors `PartnerListingSerializer` on the server, which stays the authority.
 * Catching these in the form keeps a demo on the happy path: no round-trip 400s.
 */
export const phoneRule = z
  .string()
  .trim()
  .refine(
    (value) => /^\d{10}$/.test(value.replace(/\D/g, "")),
    "Enter a 10-digit mobile number.",
  );

export const emailRule = z
  .string()
  .trim()
  .max(254, "Email must be 254 characters or fewer.")
  .refine(
    (value) => value === "" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value),
    "Enter a valid email address.",
  );

export const listingShape = {
  title: z
    .string()
    .trim()
    .min(5, "Title must be at least 5 characters.")
    .max(180, "Title must be 180 characters or fewer."),
  description: z
    .string()
    .trim()
    .min(20, "Describe the role in at least 20 characters.")
    .max(5000, "Description must be 5000 characters or fewer."),
  contact_phone: phoneRule,
  contact_email: emailRule,
  pay_range: z.string().trim().max(300, "Keep the pay range to 300 characters or fewer."),
  experience_years: z.string().trim().max(300, "Keep experience to 300 characters or fewer."),
};

export const createListingSchema = z.object({
  ...listingShape,
  location_text: z
    .string()
    .trim()
    .min(3, "Enter a work location, or write 'Remote'.")
    .max(180, "Location must be 180 characters or fewer."),
});

export const editListingSchema = z.object({
  ...listingShape,
  location_text: z.string().trim().max(180, "Location must be 180 characters or fewer."),
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

export function serverErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * One place for what the user is told after an action succeeds.
 */
export const SUCCESS_MESSAGES = {
  create: "Opening saved as a draft.",
  update: "Opening updated.",
  submit: "Sent for review. You will see it under In Review until it is approved.",
  publish: "Opening is live and visible to applicants.",
  republish: "Opening is live again.",
  close: "Opening closed. It no longer accepts applications.",
  subscribe: "Subscription active.",
} as const;

export const STATUS_BADGES: Record<
  string,
  { label: string; bg: string; text: string; border: string }
> = {
  DRAFT: { label: "Draft", bg: "bg-slate-100", text: "text-slate-700", border: "border-slate-200" },
  PENDING_REVIEW: {
    label: "In Review",
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200",
  },
  REJECTED: {
    label: "Rejected",
    bg: "bg-rose-50",
    text: "text-rose-700",
    border: "border-rose-200",
  },
  PUBLISHED: {
    label: "Live & Active",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-200",
  },
  CLOSED: { label: "Closed", bg: "bg-slate-100", text: "text-slate-600", border: "border-slate-200" },
  REMOVED: { label: "Removed", bg: "bg-rose-100", text: "text-rose-800", border: "border-rose-200" },
  EXPIRED: { label: "Expired", bg: "bg-gray-100", text: "text-gray-600", border: "border-gray-200" },
  ARCHIVED: { label: "Archived", bg: "bg-gray-100", text: "text-gray-600", border: "border-gray-200" },
};

export const LISTING_TABS = [
  { key: "ALL", label: "All Listings" },
  { key: "ACTIVE", label: "Live Active" },
  { key: "REVIEW", label: "Under Review" },
  { key: "DRAFT", label: "Drafts" },
  { key: "CLOSED", label: "Closed / Expired" },
] as const;

export type TabKey = (typeof LISTING_TABS)[number]["key"];

export interface CreateListingFormState {
  service_id: string;
  variant: string;
  title: string;
  description: string;
  location_text: string;
  contact_phone: string;
  contact_email: string;
  role_type: string;
  pay_range: string;
  work_mode: string;
  experience_years: string;
}

export interface EditListingFormState {
  title: string;
  description: string;
  location_text: string;
  contact_phone: string;
  contact_email: string;
  role_type: string;
  pay_range: string;
  work_mode: string;
  experience_years: string;
}
