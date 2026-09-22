"use client";

import { Building, Calendar, CheckCircle2, Clock, MessageSquare, ShieldCheck } from "lucide-react";
import { Badge } from "@vsolve/ui";

import {
  formatPaise,
  getEnquiryStatusBadge,
  type StayEnquiry,
} from "../model";

interface StayEnquiryCardProps {
  enquiry: StayEnquiry;
}

export function StayEnquiryCard({ enquiry }: StayEnquiryCardProps) {
  const statusInfo = getEnquiryStatusBadge(enquiry.status);

  return (
    <article className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-xs transition hover:shadow-raised">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <Badge tone={statusInfo.tone} className="font-bold text-xs">
            {statusInfo.label}
          </Badge>

          <h3 className="pt-1 text-lg font-bold text-text">
            {enquiry.property_title || "Stay Property"}
          </h3>

          <p className="text-xs text-text-secondary">
            Room: <strong className="text-text">{enquiry.unit_name || "Standard room"}</strong> · {enquiry.guest_count ?? 1} Guest{enquiry.guest_count === 1 ? "" : "s"}
          </p>
        </div>

        {/* Quoted Amount block */}
        <div className="rounded-control bg-surface-sunken p-3 text-right sm:min-w-40 border border-line/60">
          <div className="text-xs text-text-secondary">Quoted Estimate</div>
          <div className="text-lg font-extrabold text-action">
            {formatPaise(enquiry.total_quote_paise ?? 0)}
          </div>
          <div className="mt-0.5 text-[11px] text-text-secondary">
            {enquiry.nights ?? 1} night{(enquiry.nights ?? 1) === 1 ? "" : "s"}
          </div>
        </div>
      </div>

      {/* Dates and Details bar */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-line/70 pt-4 text-xs text-text-secondary">
        <div className="flex items-center gap-2">
          <Calendar className="size-4 text-action shrink-0" />
          <span>
            Stay Window: <strong className="text-text font-bold">{enquiry.check_in}</strong> to{" "}
            <strong className="text-text font-bold">{enquiry.check_out}</strong>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Clock className="size-4 text-action shrink-0" />
          <span>
            Submitted: <strong className="text-text font-medium">{enquiry.created_at ? new Date(enquiry.created_at).toLocaleDateString("en-IN") : "Recent"}</strong>
          </span>
        </div>
      </div>

      {/* Customer's message */}
      {enquiry.message && (
        <div className="mt-3 rounded-control bg-surface-sunken p-3 text-xs text-text-secondary">
          <span className="font-semibold text-text">Your Note: </span>
          {enquiry.message}
        </div>
      )}

      {/* Host Response */}
      {enquiry.host_response ? (
        <div className="mt-3 rounded-control bg-emerald-50/80 border border-emerald-200/80 p-3.5 text-xs text-emerald-950 space-y-1">
          <div className="flex items-center gap-1.5 font-bold text-emerald-800">
            <MessageSquare className="size-3.5 text-emerald-700" />
            Host Message ({enquiry.responded_at ? new Date(enquiry.responded_at).toLocaleDateString("en-IN") : "Recently"}):
          </div>
          <p className="leading-relaxed whitespace-pre-line">{enquiry.host_response}</p>
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-2 text-xs text-text-secondary">
          <Clock className="size-3.5 text-text-secondary" />
          <span>Awaiting host reply. You will be notified when the host responds.</span>
        </div>
      )}
    </article>
  );
}
