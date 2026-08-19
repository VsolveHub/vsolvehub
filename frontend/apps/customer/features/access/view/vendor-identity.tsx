"use client";

import { Badge, cn } from "@vsolve/ui";

import type { VisitVendorView } from "../adapters";

/**
 * Who is coming, with a face on it.
 *
 * ## Why this exists at all
 *
 * Until contract 1.39.0 the visit read published no vendor, so the screen whose
 * whole job is to say who is about to knock on somebody's door could only ever
 * say "we will tell you before they arrive". The identity is now on the visit,
 * gated on the plan being paid and the slot confirmed, and this is the one
 * component that renders it — shared by the list and the visit page so the two
 * cannot drift into describing the same person differently.
 *
 * ## Why the fallback is initials and not an icon
 *
 * `photoUrl` is null for four different server reasons: no photograph, one
 * awaiting review, one refused, and storage being unreachable. The server
 * deliberately collapses them, and this renders all four the same way, because
 * a Customer does not need to be told a vendor's moderation status.
 *
 * The initials are derived from the vendor's real name, which is what makes them
 * an honest fallback rather than the placeholder data this codebase forbids
 * elsewhere. A generic silhouette would say less than the name already does.
 *
 * ## Why the photograph is a plain `img`
 *
 * The URL is a short-lived signed link to a private bucket, minted per read.
 * `next/image` would want the host in `remotePatterns` and would try to cache
 * and re-fetch a URL that is expired by then — an optimiser working against a
 * deliberately expiring link. Dimensions are set on the element so the row does
 * not reflow when it loads.
 */

export interface VendorIdentityProps {
  vendor: VisitVendorView;
  /** `sm` for a row in a list, `lg` for the top of the visit page. */
  size?: "sm" | "lg";
  className?: string;
}

const AVATAR_SIZE = {
  sm: { box: "h-11 w-11 rounded-control text-sm", pixels: 44 },
  lg: { box: "h-14 w-14 rounded-card text-lg", pixels: 56 },
} as const;

export function VendorIdentity({ vendor, size = "sm", className }: VendorIdentityProps) {
  const avatar = AVATAR_SIZE[size];

  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      {vendor.photoUrl !== null ? (
        /* A signed link with an expiry, so `next/image` is the wrong tool here —
           see "Why the photograph is a plain img" above. */
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={vendor.photoUrl}
          // The name, not "profile photo of…". A screen reader announcing the
          // name is the useful reading; announcing that a photograph exists is
          // not, and the name is already beside it as text.
          alt=""
          width={avatar.pixels}
          height={avatar.pixels}
          loading="lazy"
          decoding="async"
          className={cn("shrink-0 border border-line object-cover", avatar.box)}
        />
      ) : (
        <span
          aria-hidden
          className={cn(
            "grid shrink-0 place-items-center border border-line",
            "bg-surface-sunken font-semibold text-text-secondary",
            avatar.box,
          )}
        >
          {vendor.initials}
        </span>
      )}

      <div className="min-w-0">
        <p
          className={cn(
            "flex items-center gap-1.5 truncate font-semibold text-text",
            size === "lg" ? "text-base" : "text-sm",
          )}
        >
          <span className="truncate">{vendor.displayName}</span>
          {/* The badge sits beside the name rather than under it: it qualifies
              the name, and a verification mark a reader has to look for is one
              they will not find. */}
          {vendor.isVerified ? <Badge tone="success">Verified</Badge> : null}
        </p>
        <p className="truncate text-sm text-text-secondary">{vendorMeta(vendor)}</p>
      </div>
    </div>
  );
}

/**
 * The line under the name, built only from what the server actually sent.
 *
 * Every part is omitted when its value is absent rather than defaulted. A vendor
 * with no recorded business type and no recorded years gets no second line at
 * all — which is the truthful outcome, and better than "Individual · 0 years",
 * a sentence that reads as a fact about them and is really a fact about our
 * database.
 */
function vendorMeta(vendor: VisitVendorView): string {
  const parts: string[] = [];
  const type = BUSINESS_TYPE_LABEL[vendor.businessType];
  if (type !== undefined) parts.push(type);
  if (vendor.experienceYears > 0) {
    parts.push(vendor.experienceYears === 1 ? "1 year" : `${vendor.experienceYears} years`);
  }
  return parts.join(" · ");
}

/**
 * How a vendor trades, in the Customer's words.
 *
 * A lookup rather than a `switch`, and an unknown key yields nothing rather than
 * being echoed raw: the server may publish a business type this build has never
 * heard of, and `PRIVATE_LIMITED` rendered verbatim into a sentence is worse
 * than a line that is simply shorter.
 */
const BUSINESS_TYPE_LABEL: Record<string, string> = {
  INDIVIDUAL: "Independent professional",
  SOLE_PROPRIETOR: "Sole proprietor",
  PARTNERSHIP: "Partnership firm",
  PRIVATE_LIMITED: "Registered company",
  LLP: "Registered firm",
};
