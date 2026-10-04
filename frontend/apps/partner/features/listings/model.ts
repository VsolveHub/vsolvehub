import { ApiRequestError } from "@vsolve/api-client";
import { z } from "zod";

export function rupeesToPaise(input: string): number | null {
  const trimmed = input.trim().replace(/,/g, "").replace(/^₹\s*/u, "");
  if (!trimmed) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const rupees = Number(trimmed);
  if (!Number.isFinite(rupees) || rupees < 0) return null;
  return Math.round(rupees * 100);
}

export type PayMode = "range" | "exact";

export function payModeForSavedPay(
  minPaise: number | undefined,
  maxPaise: number | undefined,
): PayMode {
  const min = minPaise ?? 0;
  const max = maxPaise ?? 0;
  if (min > 0 && min === max) return "exact";
  return "range";
}

/** Rupee text for a stored paise amount, suitable for the pay inputs. */
export function paiseToRupeeInput(paise: number | undefined): string {
  if (!paise) return "";
  const rupees = paise / 100;
  return Number.isInteger(rupees) ? String(rupees) : rupees.toFixed(2);
}

/**
 * Exact pay is stored as equal minimum and maximum. A range keeps both bounds.
 */
export function payPaise(form: {
  pay_mode: string;
  salary_min_rupees: string;
  salary_max_rupees: string;
}): { min: number; max: number } | null {
  const minP = rupeesToPaise(form.salary_min_rupees);
  if (minP == null) return null;
  if (form.pay_mode === "exact") return { min: minP, max: minP };
  const maxP = rupeesToPaise(form.salary_max_rupees);
  if (maxP == null) return null;
  return { min: minP, max: maxP };
}

function refinePay(
  data: {
    pay_mode: string;
    salary_min_rupees: string;
    salary_max_rupees: string;
    salary_period: string;
  },
  ctx: z.RefinementCtx,
) {
  const exact = data.pay_mode === "exact";
  const minP = rupeesToPaise(data.salary_min_rupees);
  if (minP == null || minP < 1) {
    ctx.addIssue({
      path: ["salary_min_rupees"],
      code: "custom",
      message: exact
        ? "Enter the pay in rupees, for example 25000 or 8,00,000."
        : "Enter a minimum pay in rupees, for example 25000 or 8,00,000.",
    });
  }
  if (!exact) {
    const maxP = rupeesToPaise(data.salary_max_rupees);
    if (maxP == null || (minP != null && maxP < minP)) {
      ctx.addIssue({
        path: ["salary_max_rupees"],
        code: "custom",
        message: "Enter a maximum pay in rupees that is at least the minimum.",
      });
    }
  }
  if (!["MONTHLY", "YEARLY", "HOURLY"].includes(data.salary_period)) {
    ctx.addIssue({ path: ["salary_period"], code: "custom", message: "Select a pay period." });
  }
}

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
    .min(5, "Job title must be at least 5 characters.")
    .max(180, "Job title must be 180 characters or fewer."),
  description: z
    .string()
    .trim()
    .min(20, "Describe the role in at least 20 characters.")
    .max(5000, "Description must be 5000 characters or fewer."),
  contact_phone: phoneRule,
  contact_email: emailRule,
  pay_mode: z.enum(["range", "exact"]),
  salary_min_rupees: z.string().trim(),
  salary_max_rupees: z.string().trim(),
  salary_period: z.string().trim(),
  shift: z.string().trim().max(300, "Keep shift to 300 characters or fewer.").optional(),
  experience_years: z.string().trim().max(300, "Keep experience to 300 characters or fewer.").optional(),
  role_type: z.string().trim().optional(),
};

export const createListingSchema = z.object({
  ...listingShape,
  location_text: z
    .string()
    .trim()
    .min(3, "Enter a work location, or write 'Remote'.")
    .max(180, "Location must be 180 characters or fewer."),
}).superRefine(refinePay);

export const editListingSchema = z.object({
  ...listingShape,
  location_text: z.string().trim().max(180, "Location must be 180 characters or fewer."),
}).superRefine(refinePay);

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
  DRAFT: { label: "Draft", bg: "bg-surface-sunken", text: "text-text-secondary", border: "border-line" },
  PENDING_REVIEW: {
    label: "In Review",
    bg: "bg-warning-surface",
    text: "text-warning-text",
    border: "border-warning-line",
  },
  REJECTED: {
    label: "Rejected",
    bg: "bg-danger-surface",
    text: "text-danger-text",
    border: "border-danger-line",
  },
  PUBLISHED: {
    label: "Live & Active",
    bg: "bg-success-surface",
    text: "text-success-text",
    border: "border-success-line",
  },
  CLOSED: { label: "Closed", bg: "bg-surface-sunken", text: "text-text-muted", border: "border-line" },
  REMOVED: { label: "Removed", bg: "bg-danger-surface", text: "text-danger-text", border: "border-danger-line" },
  EXPIRED: { label: "Expired", bg: "bg-surface-sunken", text: "text-text-muted", border: "border-line" },
  ARCHIVED: { label: "Archived", bg: "bg-surface-sunken", text: "text-text-muted", border: "border-line" },
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
  pay_mode: PayMode;
  salary_min_rupees: string;
  salary_max_rupees: string;
  salary_period: string;
  shift: string;
  experience_years: string;
}

export interface EditListingFormState {
  title: string;
  description: string;
  location_text: string;
  contact_phone: string;
  contact_email: string;
  role_type: string;
  pay_mode: PayMode;
  salary_min_rupees: string;
  salary_max_rupees: string;
  salary_period: string;
  shift: string;
  experience_years: string;
}
