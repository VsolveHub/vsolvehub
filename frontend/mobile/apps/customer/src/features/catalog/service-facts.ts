import type { ServiceDetail } from "./client-queries";

type Policy = ServiceDetail["policies"][number];
type Variant = ServiceDetail["variants"][number];

export function policyTexts(policies: readonly Policy[] | undefined, kind: Policy["kind"]): string[] {
  return (policies ?? [])
    .filter((policy) => policy.kind === kind)
    .map((policy) => policy.text.trim())
    .filter((text) => text !== "");
}

/** Warranty/guarantee claims removed across the platform. */
export function warrantyText(_policies: readonly Policy[] | undefined): string | null {
  return null;
}

/**
 * Typical time on site for one variant, from its task lines.
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
 */
export function addsToServiceCopy(text: string, ...serviceCopy: string[]): boolean {
  const normalise = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
  const candidate = normalise(text);
  return candidate !== "" && !serviceCopy.some((copy) => normalise(copy) === candidate);
}

