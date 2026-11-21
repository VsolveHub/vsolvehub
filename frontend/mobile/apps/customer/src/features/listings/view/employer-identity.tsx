// Ported from frontend/apps/customer/features/listings/view/employer-identity.tsx
import type { Schemas } from "@vsolve/api-client";
import { Text } from "@vsolve/mobile-ui";
import { Image } from "expo-image";
import { ShieldCheck } from "lucide-react-native";
import { View } from "react-native";

/**
 * Who is hiring, as every job card says it.
 *
 * Everything shown comes from the server's `employer` object: a business by its name, logo,
 * industry and size; an individual by a short name ("Priya S.") and their area, never a full name
 * or a street address. "Verified" appears only when the server says Operations verified them, so
 * a card never claims what is not so.
 */

export type EmployerIdentity = Schemas["EmployerIdentity"];

interface ListingWithEmployer {
  employer?: EmployerIdentity | null;
  poster_name?: string | null;
}

/**
 * The employer to show for a listing. `poster_name` is the same public name the server also sends
 * on its own, used only when the identity itself is missing: it is never invented.
 */
export function listingEmployer(listing: ListingWithEmployer): EmployerIdentity {
  return (
    listing.employer ?? {
      name: listing.poster_name ?? "",
      kind: "" as EmployerIdentity["kind"],
      locality: "",
      is_verified: false,
      logo_url: "",
      industry_label: "",
      size_label: "",
    }
  );
}

/** The employer's name, with a neutral label rather than a made-up one when there is none. */
export function employerName(employer: EmployerIdentity): string {
  return employer.name.trim() || "Employer";
}

/** "Shop / retail · 11-50 staff · Kondapur, Hyderabad": whatever of it there is. */
export function employerDetailLine(employer: EmployerIdentity): string {
  return [employer.industry_label, employer.size_label, employer.locality]
    .filter((part) => part.trim().length > 0)
    .join(" · ");
}

/** The logo, or the first letter of the name when there is none. Fills the tile it is put in. */
export function EmployerMark({ employer }: { employer: EmployerIdentity }) {
  if (employer.logo_url) {
    return <Image source={{ uri: employer.logo_url }} contentFit="cover" style={{ width: "100%", height: "100%" }} />;
  }
  return <Text>{employerName(employer).charAt(0).toUpperCase()}</Text>;
}

const BADGE_LABEL: Record<string, string> = {
  BUSINESS: "Verified business",
  INDIVIDUAL: "Verified individual",
};

/** "Verified business" or "Verified individual", and nothing at all for an employer not verified. */
export function VerifiedBadge({
  employer,
  textClassName = "text-xs font-semibold text-success-text",
  color = "#047857",
}: {
  employer: EmployerIdentity;
  textClassName?: string;
  color?: string;
}) {
  if (!employer.is_verified) return null;
  return (
    <View className="flex-row items-center gap-1">
      <ShieldCheck size={14} color={color} />
      <Text className={textClassName}>{BADGE_LABEL[employer.kind] ?? "Verified employer"}</Text>
    </View>
  );
}
