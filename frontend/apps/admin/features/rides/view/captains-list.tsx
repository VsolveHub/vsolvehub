"use client";

import { friendlyErrorMessage, usePagedList } from "@vsolve/query";
import { Badge, EmptyState, ErrorState, LoadMore, Spinner } from "@vsolve/ui";

import { fetchCaptainsPage } from "../queries";

const WHEN = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

/** Captains with vehicle, approval, pass, duty, rating and cancels. Approval stays in Applications. */
export function CaptainsList() {
  const list = usePagedList(["ops", "rides", "captains"], (cursor) => fetchCaptainsPage(cursor));

  if (list.isLoading) return <Spinner />;
  if (list.error) {
    return (
      <ErrorState
        title="We couldn't load captains"
        message={friendlyErrorMessage(list.error)}
        actionLabel="Try again"
        onAction={() => void list.refetch()}
      />
    );
  }
  if (list.items.length === 0) {
    return <EmptyState title="No captains yet" description="Partners who apply to give rides show up here." />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-xs uppercase text-text-secondary">
            <tr>
              <th className="px-4 py-3">Captain</th>
              <th className="px-4 py-3">Vehicle</th>
              <th className="px-4 py-3">Application</th>
              <th className="px-4 py-3">Pass ends</th>
              <th className="px-4 py-3">Duty</th>
              <th className="px-4 py-3 text-right">Rides</th>
              <th className="px-4 py-3 text-right">Rating</th>
              <th className="px-4 py-3 text-right">Cancels</th>
            </tr>
          </thead>
          <tbody>
            {list.items.map((captain) => (
              <tr key={captain.partner_id} className="border-b border-line last:border-0">
                <td className="px-4 py-3">
                  <div className="font-semibold text-text">{captain.name}</div>
                  <div className="text-text-secondary">{captain.phone_number}</div>
                </td>
                <td className="px-4 py-3">
                  {captain.vehicle ? (
                    <>
                      <div className="font-semibold">{captain.vehicle.registration_number}</div>
                      <div className="text-text-secondary">
                        {captain.vehicle.vehicle_type} · {captain.vehicle.make_model}, {captain.vehicle.colour}
                      </div>
                    </>
                  ) : (
                    <span className="text-text-secondary">Not added</span>
                  )}
                </td>
                <td className="px-4 py-3 capitalize">{captain.approval.replace(/_/g, " ").toLowerCase()}</td>
                <td className="px-4 py-3">
                  {captain.pass_ends_at ? WHEN.format(new Date(captain.pass_ends_at)) : "No pass"}
                </td>
                <td className="px-4 py-3">
                  {captain.on_duty ? <Badge tone="success">On duty</Badge> : <Badge tone="neutral">Off duty</Badge>}
                </td>
                <td className="px-4 py-3 text-right">{captain.rides_completed}</td>
                <td className="px-4 py-3 text-right">
                  {captain.rating != null ? `★ ${captain.rating.toFixed(1)}` : "—"}
                </td>
                <td className="px-4 py-3 text-right">{captain.cancels}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <LoadMore
        hasMore={list.hasMore}
        loading={list.loadingMore}
        onLoadMore={list.loadMore}
        label="Load more captains"
      />
    </div>
  );
}
