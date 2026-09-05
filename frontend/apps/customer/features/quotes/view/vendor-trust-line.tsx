import { cn } from "@vsolve/ui";

import type { VendorTrustView } from "../adapters";

/**
 * The number of finished jobs below which a star average is withheld.
 *
 * A single five-star review is not a 4.8 across a hundred. Rendered the same
 * way, "★ 5.0 (1)" is the most flattering number on the screen and the least
 * earned — a Customer reads it as an aggregate because that is what the shape
 * means everywhere else. Below the floor the record is stated in words
 * instead: how many people have reviewed them, and how long they have worked.
 * Nothing is hidden and nothing is inflated.
 */
const MIN_JOBS_FOR_RATING = 5;

/**
 * "★ 4.8 (120) · 9 yrs" — what a Customer weighs before price.
 *
 * Every part is optional and honest: a professional nobody has rated shows no
 * star, and one nobody has rated *enough* shows their review count in words
 * rather than an average built on it. Nothing here is a platform promise; it is
 * what the record holds, read out plainly.
 */
export function VendorTrustLine({
  trust,
  className,
  size = "sm",
}: {
  trust: VendorTrustView;
  className?: string;
  size?: "sm" | "md";
}) {
  const earnedRating = trust.ratingAverage !== null && trust.jobsCompleted >= MIN_JOBS_FOR_RATING;
  const parts: string[] = [];

  if (earnedRating && trust.ratingAverage !== null) {
    parts.push(`★ ${trust.ratingAverage.toFixed(1)}${trust.ratingCount > 0 ? ` (${trust.ratingCount})` : ""}`);
    parts.push(`${trust.jobsCompleted} ${trust.jobsCompleted === 1 ? "job" : "jobs"}`);
  } else if (trust.ratingCount > 0) {
    parts.push(
      `New on Vsolve — ${trust.ratingCount} ${trust.ratingCount === 1 ? "review" : "reviews"} so far`,
    );
  } else {
    parts.push("New on Vsolve");
  }

  if (trust.experienceYears > 0) {
    parts.push(`${trust.experienceYears} ${trust.experienceYears === 1 ? "yr" : "yrs"} in trade`);
  } else if (trust.activeSinceLabel !== null) {
    // Only when there is no tenure figure to contradict. "6 yrs · since 2026"
    // says two different things about the same professional.
    parts.push(trust.activeSinceLabel);
  }

  return (
    <p
      className={cn(
        "font-semibold text-text-secondary",
        size === "sm" ? "text-xs" : "text-sm",
        className,
      )}
    >
      {parts.join(" · ")}
    </p>
  );
}

/**
 * `WORKFORCE_AGENCY` is a column value, not a sentence.
 *
 * It was reaching the estimate header verbatim. Anything this has no words for
 * renders nothing rather than shouting a database constant at a Customer.
 */
const VENDOR_TYPE_LABEL: Record<string, string> = {
  WORKFORCE_AGENCY: "Workforce agency",
  INDIVIDUAL: "Independent professional",
  SOLE_PROPRIETOR: "Sole proprietor",
  PARTNERSHIP: "Partnership firm",
  PRIVATE_LIMITED: "Private limited company",
  CONTRACTOR: "Contractor",
};

export function vendorTypeLabel(raw: string | null): string | null {
  if (raw === null) return null;
  const key = raw.trim().toUpperCase();
  if (key === "") return null;
  return (
    VENDOR_TYPE_LABEL[key] ??
    // An unmapped value is still readable as prose: lower it, unscore it, and
    // give it a capital. Better than a constant, honest about being derived.
    key.charAt(0) + key.slice(1).toLowerCase().replace(/_/gu, " ")
  );
}

/** A circle with the professional's initial, where a photograph is not published. */
export function VendorMark({ name, className }: { name: string | null; className?: string }) {
  const initial = (name ?? "?").trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-11 shrink-0 place-items-center rounded-full bg-navy-900 text-base font-bold text-signal-300",
        className,
      )}
    >
      {initial}
    </span>
  );
}
