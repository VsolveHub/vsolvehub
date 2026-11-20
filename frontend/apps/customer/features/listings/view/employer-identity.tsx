import type { Schemas } from "@vsolve/api-client";
import { ShieldCheck } from "lucide-react";

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
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={employer.logo_url} alt="" className="size-full rounded-[inherit] object-cover" />
    );
  }
  return <span aria-hidden="true">{employerName(employer).charAt(0).toUpperCase()}</span>;
}

const BADGE_LABEL: Record<string, string> = {
  BUSINESS: "Verified business",
  INDIVIDUAL: "Verified individual",
};

/** "Verified business" or "Verified individual", and nothing at all for an employer not verified. */
export function VerifiedBadge({
  employer,
  className = "",
}: {
  employer: EmployerIdentity;
  className?: string;
}) {
  if (!employer.is_verified) return null;
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap ${className}`}>
      <ShieldCheck className="size-3.5 shrink-0" aria-hidden="true" />
      <span>{BADGE_LABEL[employer.kind] ?? "Verified employer"}</span>
    </span>
  );
}
