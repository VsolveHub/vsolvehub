import type { ServiceDetail } from "./queries";

/**
 * The facts a service page may state, read only from what the contract publishes.
 *
 * Catalogue surfaces used to fill gaps with invented figures — a hashed star
 * rating, a "Free up to 2 hrs before" cancellation line, a 60–90 minute duration.
 * Each of these helpers returns `null` or an empty list when the server has not
 * said something, so the caller renders nothing rather than a guess.
 */

type Policy = ServiceDetail["policies"][number];
type Variant = ServiceDetail["variants"][number];

export function policyTexts(policies: readonly Policy[] | undefined, kind: Policy["kind"]): string[] {
  return (policies ?? [])
    .filter((policy) => policy.kind === kind)
    .map((policy) => policy.text.trim())
    .filter((text) => text !== "");
}

/** The policy line that states a warranty, if the service publishes one. */
export function warrantyText(policies: readonly Policy[] | undefined): string | null {
  const match = (policies ?? []).find(
    (policy) => policy.kind !== "EXCLUDED" && /warrant/i.test(`${policy.title} ${policy.text}`),
  );
  return match ? match.text.trim() || null : null;
}

/**
 * Typical time on site for one variant, from its task lines.
 *
 * One task line is the job itself, so its duration is the answer. Several lines
 * are alternatives the customer picks between, so the shortest is a floor
 * ("from"), not an estimate. No lines means the server published no duration.
 */
export function variantDuration(variant: Variant): { minutes: number; isFloor: boolean } | null {
  const minutes = variant.task_lines
    .map((line) => line.marginal_duration_minutes)
    .filter((value) => Number.isFinite(value) && value > 0);
  if (minutes.length === 0) return null;
  return { minutes: Math.min(...minutes), isFloor: minutes.length > 1 };
}

/** 110 → "1 hr 50 min", 45 → "45 min", 120 → "2 hr". */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}

export function durationLabel(variant: Variant): string | null {
  const duration = variantDuration(variant);
  if (!duration) return null;
  const text = formatDuration(duration.minutes);
  return duration.isFloor ? `From ${text}` : `About ${text}`;
}

/**
 * Whether a variant's description adds anything to the service's own copy.
 *
 * Seeded variants often repeat the service sentence word for word; printing it
 * under every option turns a rate card into the same line three times.
 */
export function addsToServiceCopy(text: string, ...serviceCopy: string[]): boolean {
  const normalise = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
  const candidate = normalise(text);
  return candidate !== "" && !serviceCopy.some((copy) => normalise(copy) === candidate);
}
