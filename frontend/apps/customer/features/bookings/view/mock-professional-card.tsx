"use client";

import type { Schemas } from "@vsolve/api-client";
import { Badge } from "@vsolve/ui";

/**
 * The professional, as far as the Customer may see them before payment.
 *
 * Never exposes the name before payment — that is what the unlock notice promises.
 * Everything else comes from Django's `AssignedProfessional`: the headline and the
 * years of experience. There is no rating and no job count because the platform
 * publishes neither (see `ProfessionalCard`); this card used to print "★ 4.9" and
 * "5+ yrs experience · 500+ jobs" for everyone, which a Customer would read as fact
 * about the person coming to their home.
 *
 * With no professional yet (a held slot still being matched) it says so rather
 * than describing someone who does not exist.
 */
export function MockProfessionalCard({
  professional,
}: {
  professional?: Schemas["AssignedProfessional"] | null;
}) {
  const facts = professional
    ? [
        professional.headline.trim(),
        professional.experience_years > 0
          ? `${professional.experience_years} ${professional.experience_years === 1 ? "yr" : "yrs"} experience`
          : "",
      ].filter((fact) => fact !== "")
    : [];

  return (
    <div className="rounded-xl border border-line bg-gradient-to-r from-surface to-[#FFFDF9] p-4 shadow-2xs">
      <div className="flex items-center justify-between gap-2 border-b border-line/60 pb-3">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-success animate-pulse" />
          <span className="text-xs font-bold uppercase tracking-wider text-text">
            {professional ? "Professional Held & Assigned" : "Finding your professional"}
          </span>
        </div>
        <Badge tone="success">Verified Pro</Badge>
      </div>

      <div className="mt-3 flex items-start gap-3.5">
        {/* Placeholder Avatar */}
        <div className="relative size-12 shrink-0 rounded-full bg-navy-900 flex items-center justify-center text-white text-lg font-bold shadow-xs border-2 border-white">
          <span>👨‍🔧</span>
          <span className="absolute -bottom-1 -right-1 size-5 rounded-full bg-success flex items-center justify-center text-[10px] text-white font-bold ring-2 ring-white">
            ✓
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <p className="font-bold text-text text-sm">Verified Professional</p>

          {facts.length > 0 ? (
            <p className="text-xs text-text-secondary mt-0.5">{facts.join(" · ")}</p>
          ) : null}

          <div className="mt-2 flex items-center gap-1.5 rounded-md bg-surface-sunken px-2 py-1 text-[11px] text-text-secondary border border-line/50">
            <span className="text-xs">🔒</span>
            <span className="truncate">
              Full name, photo & direct contact unlock after payment
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
