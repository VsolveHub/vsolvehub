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
  embedded = false,
}: {
  professional: Schemas["AssignedProfessional"];
  embedded?: boolean;
}) {
  const initial = professional.display_name.trim().charAt(0).toUpperCase() || "?";
  const cleanedHeadline = professional.headline
    ? professional.headline.replace(/\+\d+\s*more/i, "& multi-service specialist").trim()
    : null;

  return (
    <div
      className={
        embedded
          ? "flex items-start gap-3.5"
          : "flex items-start gap-3.5 rounded-xl border border-line bg-surface p-4 shadow-2xs"
      }
    >
      <span
        aria-hidden
        className="flex size-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-navy-800 to-navy-950 text-white font-bold text-lg shadow-sm"
      >
        {initial}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="break-words font-bold text-navy-900 text-sm sm:text-base">
            {professional.display_name}
          </p>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
            ✓ Verified Pro
          </span>
        </div>
        {cleanedHeadline ? (
          <p className="text-xs sm:text-sm text-text-secondary mt-0.5">{cleanedHeadline}</p>
        ) : null}
        {professional.experience_years > 0 ? (
          <p className="text-xs text-text-secondary mt-0.5 flex items-center gap-1">
            <span>💼</span>
            <span>
              {professional.experience_years}{" "}
              {professional.experience_years === 1 ? "year" : "years"} of experience
            </span>
          </p>
        ) : null}
        {/* True of everyone the platform assigns: a Partner is only offered work after the
            identity review and the per-skill approval. Nothing per-person is claimed here. */}
        <ul className="mt-2.5 flex flex-wrap gap-1.5" aria-label="Checks">
          {["ID verified", "Approved for this work"].map((check) => (
            <li
              key={check}
              className="inline-flex items-center gap-1 rounded-full bg-success-surface px-2.5 py-0.5 text-xs font-semibold text-success-text border border-success-line/60"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="size-3.5" aria-hidden>
                <path
                  fillRule="evenodd"
                  d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                  clipRule="evenodd"
                />
              </svg>
              {check}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
