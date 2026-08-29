import { cn } from "@vsolve/ui";

import type { VendorTrustView } from "../adapters";

/**
 * "★ 4.8 (120) · 9 yrs · since 2017" — what a Customer weighs before price.
 *
 * Every part is optional and honest: a professional nobody has rated shows no
 * star, a new profile shows no "since". Nothing here is a platform promise;
 * it is what the record holds, read out plainly.
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
  const parts: string[] = [];
  if (trust.ratingAverage !== null) {
    parts.push(`★ ${trust.ratingAverage.toFixed(1)}${trust.ratingCount > 0 ? ` (${trust.ratingCount})` : ""}`);
  }
  if (trust.jobsCompleted > 0) {
    parts.push(`${trust.jobsCompleted} ${trust.jobsCompleted === 1 ? "job" : "jobs"}`);
  }
  if (trust.experienceYears > 0) {
    parts.push(`${trust.experienceYears} ${trust.experienceYears === 1 ? "yr" : "yrs"}`);
  }
  if (trust.activeSinceLabel !== null) parts.push(trust.activeSinceLabel);
  if (parts.length === 0) {
    return (
      <p className={cn("text-text-muted", size === "sm" ? "text-xs" : "text-sm", className)}>
        New on Vsolve
      </p>
    );
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
