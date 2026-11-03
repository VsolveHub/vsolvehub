"use client";

import { friendlyErrorMessage, usePagedList } from "@vsolve/query";
import { Badge, LoadMore, formatDate } from "@vsolve/ui";
import { Phone } from "lucide-react";

import { fetchOpsListingApplicationsPage } from "../queries";

const STATUS_LABEL: Record<string, string> = {
  SUBMITTED: "New",
  UNDER_REVIEW: "Under review",
  SHORTLISTED: "Shortlisted",
  INTERVIEW: "Interview",
  CONNECTED: "Connected",
  CONTACTED: "Contacted",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
  EXPIRED: "Expired",
};

/** Who applied to this job, so Operations can answer the employer or an applicant. */
export function ListingApplicants({ listingId }: { listingId: string }) {
  const applications = usePagedList(["ops-listing-applications", listingId], (cursor) =>
    fetchOpsListingApplicationsPage(listingId, cursor),
  );
  const rows = applications.items;

  return (
    <div className="rounded-xl border border-line p-4">
      <div className="text-xs font-semibold uppercase text-text-muted">Who applied</div>
      {applications.isLoading ? (
        <p className="mt-2 text-xs text-text-secondary">Loading applicants…</p>
      ) : applications.error ? (
        <p role="alert" className="mt-2 text-xs text-danger-text">
          {friendlyErrorMessage(applications.error)}
        </p>
      ) : rows.length === 0 ? (
        <p className="mt-2 text-xs text-text-secondary">Nobody has applied yet.</p>
      ) : (
        <ul className="mt-2 divide-y divide-line">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
              <div className="min-w-0">
                <p className="font-semibold text-text">{row.applicant_name || "Applicant"}</p>
                <p className="text-text-secondary">
                  Applied {formatDate(row.created_at)}
                  {row.applicant_phone ? (
                    <>
                      {" · "}
                      <a className="inline-flex items-center gap-1 text-text-link" href={`tel:${row.applicant_phone}`}>
                        <Phone aria-hidden className="size-3" /> {row.applicant_phone}
                      </a>
                    </>
                  ) : null}
                </p>
              </div>
              <Badge tone={row.status === "REJECTED" || row.status === "WITHDRAWN" ? "neutral" : "info"}>
                {STATUS_LABEL[row.status] ?? row.status}
              </Badge>
            </li>
          ))}
        </ul>
      )}
      <LoadMore hasMore={applications.hasMore} loading={applications.loadingMore} onLoadMore={applications.loadMore} />
    </div>
  );
}
