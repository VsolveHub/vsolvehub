"use client";

import type { Schemas } from "@vsolve/api-client";

/**
 * Who is coming.
 *
 * ## What is deliberately not here
 *
 * **No rating.** The platform has no review model — nothing collects a score, so
 * there is none to show. A number here would be invented, and an invented rating
 * is the single most misleading thing this card could carry: it is exactly what a
 * customer would use to decide whether to let someone into their home.
 *
 * **No photo.** `PartnerProfile` has no image field and no upload flow. The
 * initial stands in honestly rather than a stock avatar implying we know what
 * this person looks like.
 *
 * **No contact button.** There is no customer→partner channel: the only masked
 * contact that exists is partner-initiated, during the customer-unavailable
 * workflow. A button that opened nothing would be worse than its absence, and a
 * button that revealed a real number would leak it permanently.
 *
 * Each of those is a product decision with a real cost, not an oversight — see
 * the notes handed back with this change.
 */
export function ProfessionalCard({
  professional,
}: {
  professional: Schemas["AssignedProfessional"];
}) {
  const initial = professional.display_name.trim().charAt(0).toUpperCase() || "?";

  return (
    <div className="flex items-center gap-4 rounded-card border border-line bg-surface p-4">
      <span
        aria-hidden
        className="flex size-12 shrink-0 items-center justify-center rounded-full bg-selected-surface text-lg font-bold text-text-link"
      >
        {initial}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-text">{professional.display_name}</p>
        {professional.headline ? (
          <p className="truncate text-sm text-text-secondary">{professional.headline}</p>
        ) : null}
        {professional.experience_years > 0 ? (
          <p className="text-sm text-text-secondary">
            {professional.experience_years}{" "}
            {professional.experience_years === 1 ? "year" : "years"} of experience
          </p>
        ) : null}
      </div>
    </div>
  );
}
