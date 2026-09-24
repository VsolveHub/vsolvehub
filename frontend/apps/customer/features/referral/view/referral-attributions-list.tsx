"use client";

import { Badge } from "@vsolve/ui";
import { CheckCircle2, Clock, Gift, Users } from "lucide-react";
import type { ReferralAttribution } from "../queries";

interface ReferralAttributionsListProps {
  attributions: ReferralAttribution[];
}

function getReferralStatusMeta(status?: ReferralAttribution["status"]) {
  switch (status) {
    case "REWARDED":
      return {
        label: "Reward Paid",
        tone: "success" as const,
        description: "Wallet credits added to your balance",
      };
    case "QUALIFIED":
      return {
        label: "Qualified",
        tone: "info" as const,
        description: "Booking completed, payout processing",
      };
    case "PENDING":
    default:
      return {
        label: "Pending Booking",
        tone: "warning" as const,
        description: "Waiting for their first completed service",
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
          const meta = getReferralStatusMeta(attr.status);
          const formattedDate = new Date(attr.attributed_at || "").toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
          });

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
