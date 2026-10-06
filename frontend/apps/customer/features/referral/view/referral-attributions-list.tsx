"use client";

import { Badge , formatDate} from "@vsolve/ui";
import { Gift, Users } from "lucide-react";
import type { ReferralAttribution } from "../queries";

interface ReferralAttributionsListProps {
  attributions: ReferralAttribution[];
}

function getReferralStatusMeta(attr: ReferralAttribution) {
  switch (attr.status) {
    case "REWARDED":
      return {
        label: "Reward added",
        tone: "success" as const,
        description: "Your reward has been added",
      };
    case "QUALIFIED":
      return {
        label: "Booking completed",
        tone: "info" as const,
        description: attr.reward_available_at
          ? `Reward on ${formatDate(attr.reward_available_at)}`
          : "Reward coming soon",
      };
    case "INELIGIBLE":
      return {
        label: "Not eligible",
        tone: "neutral" as const,
        description: "This referral did not qualify",
      };
    case "REVERSED":
      return {
        label: "Reversed",
        tone: "neutral" as const,
        description: "This reward was withdrawn",
      };
    case "PENDING":
    default:
      return {
        label: "Pending booking",
        tone: "warning" as const,
        description: "Waiting for their first completed booking",
      };
  }
}

export function ReferralAttributionsList({ attributions }: ReferralAttributionsListProps) {
  if (attributions.length === 0) {
    return (
      <div className="rounded-card border border-[#e7e2da] bg-white p-8 text-center shadow-sm">
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-slate-100 text-slate-500">
          <Users className="size-6" />
        </div>
        <h3 className="mt-3 text-sm font-bold text-navy-900">No invited friends yet</h3>
        <p className="mt-1 text-xs text-text-secondary max-w-sm mx-auto">
          Share your referral link on WhatsApp or social media. When friends sign up, they will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-card border border-[#e7e2da] bg-white shadow-sm overflow-hidden">
      <div className="border-b border-[#eee9e0] px-6 py-4">
        <h2 className="text-base font-bold text-navy-900">Referred Friends History</h2>
      </div>

      <div className="divide-y divide-[#eee9e0]">
        {attributions.map((attr) => {
          const meta = getReferralStatusMeta(attr);
          const formattedDate = formatDate(attr.attributed_at || "");

          return (
            <div
              key={attr.id}
              className="flex items-center justify-between px-6 py-4 hover:bg-[#FAF9F7]/60 transition-colors"
            >
              <div className="flex items-center gap-3.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-orange-50 text-[#EA580C]">
                  <Gift className="size-4.5" />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-navy-900">
                      {attr.referee_display || "Friend"}
                    </span>
                    <Badge tone={meta.tone} className="text-[10px] py-0">
                      {meta.label}
                    </Badge>
                  </div>
                  <span className="block text-xs text-text-muted mt-0.5">
                    Invited on {formattedDate} • {meta.description}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
