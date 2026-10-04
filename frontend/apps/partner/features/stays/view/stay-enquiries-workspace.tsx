"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { friendlyErrorMessage } from "@vsolve/query";
import { Badge, Card, EmptyState, formatDate } from "@vsolve/ui";
import { ChevronRight, Phone } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import {
  cancelPartnerStayEnquiry,
  confirmPartnerStayEnquiry,
  fetchPartnerStayEnquiries,
  respondPartnerStayEnquiry,
  stayLengthLabel,
} from "@/features/stays/queries";
import { STAY_SECTIONS } from "@/features/stays/view/stay-sections";
import {
  StayEnquiryDetailSheet,
  stayEnquiryStatusLabel,
  stayEnquiryTone,
} from "@/features/stays/view/stay-record-sheets";
import { SectionNav } from "@/features/workspace/view/section-nav";

const ENQUIRY_FILTERS = ["OPEN", "CONFIRMED", "CLOSED", "ALL"] as const;
type EnquiryFilter = (typeof ENQUIRY_FILTERS)[number];

const FILTER_LABELS: Record<EnquiryFilter, string> = {
  OPEN: "To call",
  CONFIRMED: "Booked",
  CLOSED: "Closed",
  ALL: "All",
};

const OPEN = new Set(["SUBMITTED", "RESPONDED"]);

function matches(filter: EnquiryFilter, status: string | undefined): boolean {
  if (filter === "ALL") return true;
  if (filter === "OPEN") return OPEN.has(status ?? "");
  if (filter === "CONFIRMED") return status === "CONFIRMED";
  return !OPEN.has(status ?? "") && status !== "CONFIRMED";
}

/**
 * The host's stay inbox. Every stay starts as an enquiry: the host sees who is asking,
 * calls them, and marks the enquiry Booked or Not available. The guest is told either way.
 *
 * The filter rides in `?status=`, so a filtered view is a link a host can keep. The sheet
 * looks its record up in the unfiltered list, so changing the filter cannot blank it.
 */
export function PartnerStayEnquiriesWorkspace() {
  const qc = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const queryStatus = searchParams?.get("status") ?? "";
  const filter = ENQUIRY_FILTERS.includes(queryStatus as EnquiryFilter)
    ? (queryStatus as EnquiryFilter)
    : "OPEN";

  function setFilter(next: EnquiryFilter) {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (next === "OPEN") params.delete("status");
    else params.set("status", next);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const enquiries = useQuery({
    queryKey: ["partner-stays", "enquiries"],
    queryFn: fetchPartnerStayEnquiries,
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["partner-stays"] });

  const act = useMutation({
    mutationFn: ({
      id,
      action,
      note,
    }: {
      id: string;
      action: "booked" | "not_available" | "cancel";
      note?: string;
    }) => {
      if (action === "booked") return confirmPartnerStayEnquiry(id);
      if (action === "not_available") return respondPartnerStayEnquiry(id, note ?? "", true);
      return cancelPartnerStayEnquiry(id);
    },
    onSuccess: invalidate,
  });

  const rows = useMemo(
    () => (enquiries.data ?? []).filter((enquiry) => matches(filter, enquiry.status)),
    [enquiries.data, filter],
  );
  const openCount = (enquiries.data ?? []).filter((e) => OPEN.has(e.status ?? "")).length;

  const selected = selectedId
    ? (enquiries.data ?? []).find((enquiry) => enquiry.id === selectedId) ?? null
    : null;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-action">Stays</p>
        <h1 className="mt-1 text-2xl font-extrabold text-navy-900">Guest enquiries</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Call the guest, agree the room and dates, then mark the enquiry Booked or Not
          available. The guest is told either way.
        </p>
      </div>

      <SectionNav label="Stay sections" items={STAY_SECTIONS} />

      <Card>
        <div className="flex flex-wrap gap-2">
          {ENQUIRY_FILTERS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setFilter(option)}
              className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                filter === option
                  ? "bg-action text-white"
                  : "border border-line bg-surface text-text-secondary hover:text-navy-900"
              }`}
            >
              {FILTER_LABELS[option]}
              {option === "OPEN" && openCount > 0 ? ` (${openCount})` : ""}
            </button>
          ))}
        </div>

        {enquiries.isLoading ? <p className="mt-3 text-sm text-text-secondary">Loading…</p> : null}
        {enquiries.error ? (
          <p className="mt-3 text-sm text-danger-text">{friendlyErrorMessage(enquiries.error)}</p>
        ) : null}
        {!enquiries.isLoading && !enquiries.error && rows.length === 0 ? (
          <EmptyState
            compact
            className="mt-3"
            title={filter === "OPEN" ? "Nobody to call right now" : "Nothing here"}
            description="New enquiries appear here, with the guest's number."
          />
        ) : null}

        <ul className="mt-3 flex flex-col gap-3">
          {rows.map((enquiry) => (
            <li key={enquiry.id}>
              <div className="flex flex-col gap-2 rounded-card border border-line p-3 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={() => setSelectedId(enquiry.id)}
                  className="flex-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-navy-900">
                      {enquiry.customer_name || "Guest"}
                    </span>
                    <Badge tone={stayEnquiryTone(enquiry.status)}>
                      {stayEnquiryStatusLabel(enquiry.status)}
                    </Badge>
                  </span>
                  <span className="block text-sm text-text-secondary">
                    {enquiry.property_title} · {enquiry.unit_name ?? "Room"}
                  </span>
                  <span className="block text-sm text-text-secondary">
                    From {formatDate(`${enquiry.check_in}T12:00:00`)}
                    {enquiry.stay_length
                      ? ` · ${stayLengthLabel(enquiry.stay_length, enquiry.price_period)}`
                      : ""}
                    {` · ${(enquiry as { adult_count?: number }).adult_count !== undefined ? `${(enquiry as { adult_count?: number }).adult_count} adult${(enquiry as { adult_count?: number }).adult_count === 1 ? "" : "s"}${(enquiry as { child_count?: number }).child_count ? `, ${(enquiry as { child_count?: number }).child_count} child${(enquiry as { child_count?: number }).child_count === 1 ? "" : "ren"}` : ""}` : `${enquiry.guest_count ?? 1} guest${(enquiry.guest_count ?? 1) === 1 ? "" : "s"}`}`}
                  </span>
                  <span className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-text-link">
                    Details
                    <ChevronRight className="size-3.5" aria-hidden />
                  </span>
                </button>
                {enquiry.customer_phone && OPEN.has(enquiry.status ?? "") ? (
                  <a
                    href={`tel:${enquiry.customer_phone}`}
                    className="inline-flex items-center justify-center gap-2 rounded-control bg-action px-4 py-2 text-sm font-bold text-action-text shadow-sm hover:bg-action-hover"
                  >
                    <Phone className="size-4" aria-hidden />
                    Call
                  </a>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <StayEnquiryDetailSheet
        enquiry={selected}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedId(null);
            act.reset();
          }
        }}
        onBooked={(id) => act.mutate({ id, action: "booked" })}
        onNotAvailable={(id, note) => act.mutate({ id, action: "not_available", note })}
        onCancelBooking={(id) => act.mutate({ id, action: "cancel" })}
        isPending={act.isPending}
        actionError={act.error ? friendlyErrorMessage(act.error) : null}
      />
    </div>
  );
}
