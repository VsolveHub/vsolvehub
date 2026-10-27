import { ApiRequestError } from "@vsolve/api-client";
import type { useT } from "@vsolve/ui";
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
        ? "listings.validation.payExact"
        : "listings.validation.payMin",
    });
  }
  if (!exact) {
    const maxP = rupeesToPaise(data.salary_max_rupees);
    if (maxP == null || (minP != null && maxP < minP)) {
      ctx.addIssue({
        path: ["salary_max_rupees"],
        code: "custom",
        message: "listings.validation.payMax",
      });
    }
  }
  if (!["MONTHLY", "YEARLY", "HOURLY"].includes(data.salary_period)) {
    ctx.addIssue({ path: ["salary_period"], code: "custom", message: "listings.validation.payPeriod" });
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
    "listings.validation.phone",
  );

export const emailRule = z
  .string()
  .trim()
  .max(254, "listings.validation.emailMax")
  .refine(
    (value) => value === "" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value),
    "listings.validation.email",
  );

export const listingShape = {
  title: z
    .string()
    .trim()
    .min(5, "listings.validation.titleMin")
    .max(180, "listings.validation.titleMax"),
  description: z
    .string()
    .trim()
    .min(20, "listings.validation.descriptionMin")
    .max(5000, "listings.validation.descriptionMax"),
  contact_phone: phoneRule,
  contact_email: emailRule,
  pay_mode: z.enum(["range", "exact"]),
  salary_min_rupees: z.string().trim(),
  salary_max_rupees: z.string().trim(),
  salary_period: z.string().trim(),
  shift: z.string().trim().max(300, "listings.validation.shiftMax").optional(),
  experience_years: z.string().trim().max(300, "listings.validation.experienceMax").optional(),
  role_type: z.string().trim().optional(),
};

export const createListingSchema = z.object({
  ...listingShape,
  location_text: z
    .string()
    .trim()
    .min(3, "listings.validation.locationMin")
    .max(180, "listings.validation.locationMax"),
}).superRefine(refinePay);

export const editListingSchema = z.object({
  ...listingShape,
  location_text: z.string().trim().max(180, "listings.validation.locationMax"),
}).superRefine(refinePay);

/**
 * Field errors for the form. The schema messages above are catalogue keys
 * (`listings.validation.*`), resolved here; zod's own built-in messages pass
 * through unchanged.
 */
export function issuesToFieldErrors(
  error: z.ZodError,
  t: ReturnType<typeof useT>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "");
    if (key && !out[key]) {
      out[key] = issue.message.startsWith("listings.") ? t(issue.message) : issue.message;
    }
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
 * Values are catalogue keys — resolve with `t` at the call site.
 */
export const SUCCESS_MESSAGES = {
  create: "listings.success.create",
  update: "listings.success.update",
  submit: "listings.success.live",
  publish: "listings.success.live",
  republish: "listings.success.republish",
  close: "listings.success.close",
  subscribe: "listings.success.subscribe",
} as const;

/** `label` is a catalogue key — resolve with `t` at render time. */
export const STATUS_BADGES: Record<
  string,
  { label: string; bg: string; text: string; border: string }
> = {
  DRAFT: { label: "listings.status.draft", bg: "bg-surface-sunken", text: "text-text-secondary", border: "border-line" },
  // Legacy: listings sent for review before instant publishing. "Publish now" puts them live.
  PENDING_REVIEW: {
    label: "listings.status.draft",
    bg: "bg-warning-surface",
    text: "text-warning-text",
    border: "border-warning-line",
  },
  REJECTED: {
    label: "listings.status.rejected",
    bg: "bg-danger-surface",
    text: "text-danger-text",
    border: "border-danger-line",
  },
  PUBLISHED: {
    label: "listings.status.published",
    bg: "bg-success-surface",
    text: "text-success-text",
    border: "border-success-line",
  },
  CLOSED: { label: "listings.status.closed", bg: "bg-surface-sunken", text: "text-text-muted", border: "border-line" },
  REMOVED: { label: "listings.status.removed", bg: "bg-danger-surface", text: "text-danger-text", border: "border-danger-line" },
  EXPIRED: { label: "listings.status.expired", bg: "bg-surface-sunken", text: "text-text-muted", border: "border-line" },
  ARCHIVED: { label: "listings.status.archived", bg: "bg-surface-sunken", text: "text-text-muted", border: "border-line" },
};

/** `label` is a catalogue key — resolve with `t` at render time. */
export const LISTING_TABS = [
  { key: "ALL", label: "listings.page.tab.all" },
  { key: "ACTIVE", label: "listings.page.tab.active" },
  { key: "DRAFT", label: "listings.page.tab.draft" },
  { key: "CLOSED", label: "listings.page.tab.closed" },
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
