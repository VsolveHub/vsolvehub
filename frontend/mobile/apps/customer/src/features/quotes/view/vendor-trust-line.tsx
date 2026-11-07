// Ported from frontend/apps/customer/features/quotes/view/vendor-trust-line.tsx
import { cn, Text } from "@vsolve/mobile-ui";
import { View } from "react-native";

import type { VendorTrustView } from "../adapters";

const MIN_JOBS_FOR_RATING = 5;

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
    parts.push(trust.activeSinceLabel);
  }

  return (
    <Text
      className={cn(
        "font-semibold text-text-secondary",
        size === "sm" ? "text-xs" : "text-sm",
        className,
      )}
    >
      {parts.join(" · ")}
    </Text>
  );
}

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
    key.charAt(0) + key.slice(1).toLowerCase().replace(/_/gu, " ")
  );
}

export function VendorMark({ name, className }: { name: string | null; className?: string }) {
  const initial = (name ?? "?").trim().charAt(0).toUpperCase() || "?";
  return (
    <View
      accessibilityElementsHidden
      className={cn(
        "size-11 shrink-0 items-center justify-center rounded-full bg-navy-900",
        className,
      )}
    >
      <Text className="text-base font-bold text-signal-300">{initial}</Text>
    </View>
  );
}
