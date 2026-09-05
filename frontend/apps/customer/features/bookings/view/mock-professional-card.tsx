"use client";

import { Badge } from "@vsolve/ui";

/**
 * Mock / Placeholder Professional Card shown BEFORE payment is made.
 *
 * Never exposes actual partner credentials before payment. Displays generic
 * verified professional badges, masked/blurred details, a 4.9★ rating, and a
 * clear unlock notice.
 */
export function MockProfessionalCard({
  serviceName,
}: {
  serviceName?: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-gradient-to-r from-surface to-[#FFFDF9] p-4 shadow-2xs">
      <div className="flex items-center justify-between gap-2 border-b border-line/60 pb-3">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-success animate-pulse" />
          <span className="text-xs font-bold uppercase tracking-wider text-text">
            Professional Held & Assigned
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
          <div className="flex items-center gap-2">
            <p className="font-bold text-text text-sm">
              Verified Professional
            </p>
            <span className="inline-flex items-center text-xs font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
              ★ 4.9
            </span>
          </div>

          <p className="text-xs text-text-secondary mt-0.5">
            {serviceName ? `${serviceName} Specialist · ` : ""}5+ yrs experience · 500+ jobs
          </p>

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
