"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { friendlyErrorMessage } from "@vsolve/query";
import { Badge, Card, EmptyState, formatDate, formatMoney } from "@vsolve/ui";
import { ChevronRight } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import {
  cancelPartnerStayEnquiry,
  fetchPartnerStayEnquiries,
  respondPartnerStayEnquiry,
} from "@/features/stays/queries";
import { STAY_SECTIONS } from "@/features/stays/view/stay-sections";
import { StayEnquiryDetailSheet } from "@/features/stays/view/stay-record-sheets";
import { SectionNav } from "@/features/workspace/view/section-nav";

const ENQUIRY_STATUS_FILTERS = [
  "ALL",
  "SUBMITTED",
  "RESPONDED",
  "CONFIRMED",
  "DECLINED",
  "CANCELLED",
  "WITHDRAWN",
  "EXPIRED",
] as const;

type EnquiryStatusFilter = (typeof ENQUIRY_STATUS_FILTERS)[number];

const ENQUIRY_STATUS_LABELS: Record<EnquiryStatusFilter, string> = {
  ALL: "All",
  SUBMITTED: "Submitted",
  RESPONDED: "Responded",
  CONFIRMED: "Confirmed",
  DECLINED: "Declined",
  CANCELLED: "Cancelled",
  WITHDRAWN: "Withdrawn",
  EXPIRED: "Expired",
};

function enquiryStatusFilterLabel(status: EnquiryStatusFilter): string {
  return ENQUIRY_STATUS_LABELS[status];
}

/**
 * Guest enquiries — the unpaid half of a stay host's inbox.
 *
 * Lifted out of `stays-workspace.tsx`, where it was a card below the property
 * form. Nothing about it was about properties: a host with a week of enquiries
 * scrolled past their own listing to find out who was asking.
 *
 * The status filter still rides in `?status=`, so a filtered view stays a link a
 * host can send to themselves. Only `filteredEnquiries` is filtered; the detail
 * sheet looks its record up in the unfiltered list, so changing the filter while
 * a sheet is open cannot blank it mid-sentence.
 */
export function PartnerStayEnquiriesWorkspace() {
  const qc = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const queryStatus = searchParams?.get("status") ?? "";
  const enquiryStatusFilter = ENQUIRY_STATUS_FILTERS.includes(queryStatus as EnquiryStatusFilter)
    ? (queryStatus as EnquiryStatusFilter)
    : "ALL";

  function setEnquiryStatusFilter(status: EnquiryStatusFilter) {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (status === "ALL") {
      params.delete("status");
    } else {
      params.set("status", status);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const enquiries = useQuery({
    queryKey: ["partner-stays", "enquiries"],
    queryFn: fetchPartnerStayEnquiries,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["partner-stays"] });
  };

  const respond = useMutation({
    mutationFn: ({
      id,
      response,
      decline,
    }: {
      id: string;
      response: string;
      decline?: boolean;
    }) => respondPartnerStayEnquiry(id, response, decline ?? false),
    onSuccess: invalidate,
  });

  const cancelEnquiry = useMutation({
    mutationFn: (id: string) => cancelPartnerStayEnquiry(id),
    onSuccess: invalidate,
  });

  const filteredEnquiries = useMemo(() => {
    const rows = enquiries.data ?? [];
    if (enquiryStatusFilter === "ALL") return rows;
    return rows.filter((enquiry) => enquiry.status === enquiryStatusFilter);
  }, [enquiries.data, enquiryStatusFilter]);

  const selected = selectedId
    ? (enquiries.data ?? []).find((enquiry) => enquiry.id === selectedId) ?? null
    : null;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-action">Stays</p>
        <h1 className="mt-1 text-2xl font-extrabold text-navy-900">Guest enquiries</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Guests asking about your properties. Reply to confirm the dates and the rate before
          they can book.
        </p>
      </div>

      <SectionNav label="Stay sections" items={STAY_SECTIONS} />

      <Card>
        <div className="flex flex-wrap gap-2">
          {ENQUIRY_STATUS_FILTERS.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setEnquiryStatusFilter(status)}
              className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                enquiryStatusFilter === status
                  ? "bg-action text-white"
                  : "border border-line bg-surface text-text-secondary hover:text-navy-900"
              }`}
            >
              {enquiryStatusFilterLabel(status)}
            </button>
          ))}
        </div>

        {enquiries.isLoading ? <p className="mt-3 text-sm text-text-secondary">Loading…</p> : null}
        {enquiries.error ? (
          <p className="mt-3 text-sm text-danger-text">{friendlyErrorMessage(enquiries.error)}</p>
        ) : null}
        {!enquiries.isLoading && !enquiries.error && filteredEnquiries.length === 0 ? (
          <EmptyState
            compact
            className="mt-3"
            title={
              enquiryStatusFilter === "ALL"
                ? "No enquiries yet"
                : `No ${enquiryStatusFilterLabel(enquiryStatusFilter).toLowerCase()} enquiries`
            }
            description={
              enquiryStatusFilter === "ALL"
                ? "Guest questions show up here."
                : "Try another status filter to see more."
            }
          />
        ) : null}

        <ul className="mt-3 flex flex-col gap-3">
          {filteredEnquiries.map((enquiry) => {
            const isCancelled =
              enquiry.status === "CANCELLED" ||
              enquiry.status === "DECLINED" ||
              enquiry.status === "EXPIRED" ||
              enquiry.status === "WITHDRAWN";
            return (
              <li key={enquiry.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(enquiry.id)}
                  className="w-full rounded-card border border-line p-3 text-left transition hover:border-line-strong hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-navy-900">{enquiry.property_title}</span>
                    {isCancelled ? (
                      <Badge tone="danger">
                        {enquiry.status === "DECLINED" ? "Declined" : "Cancelled"}
                      </Badge>
                    ) : (
                      <Badge
                        tone={
                          enquiry.status === "RESPONDED" || enquiry.status === "CONFIRMED"
                            ? "success"
                            : "neutral"
                        }
                      >
                        {enquiry.status}
                      </Badge>
                    )}
                  </span>
                  <span className="block text-sm text-text-secondary">
                    {formatDate(`${enquiry.check_in}T12:00:00`)} –{" "}
                    {formatDate(`${enquiry.check_out}T12:00:00`)}
                    {typeof enquiry.total_quote_paise === "number"
                      ? ` · ${formatMoney(enquiry.total_quote_paise)}`
                      : ""}
                  </span>
                  {enquiry.message ? (
                    <span className="mt-2 block line-clamp-2 text-sm">{enquiry.message}</span>
                  ) : null}
                  <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-text-link">
                    View enquiry
                    <ChevronRight className="size-3.5" aria-hidden />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Card>

      <StayEnquiryDetailSheet
        enquiry={selected}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
        onRespond={(id, response) => respond.mutate({ id, response })}
        onDecline={(id, response) => respond.mutate({ id, response, decline: true })}
        onCancel={(id) => cancelEnquiry.mutate(id)}
        isPending={respond.isPending || cancelEnquiry.isPending}
      />
    </div>
  );
}
