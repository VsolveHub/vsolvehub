"use client";

import { friendlyErrorMessage, usePagedList } from "@vsolve/query";
import { Badge, EmptyState, ErrorState, LoadMore, Spinner } from "@vsolve/ui";

import { fetchCaptainsPage } from "../queries";
import { Stacked, Table, Td, Th, approvalTone, codeText, vehicleLabel } from "./layout";

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
      <Table
        head={
          <>
            <Th>Captain</Th>
            <Th>Vehicle</Th>
            <Th>Application</Th>
            <Th>Duty</Th>
            <Th>Pass ends</Th>
            <Th numeric>Rides completed</Th>
            <Th numeric>Rating</Th>
            <Th numeric>Cancellations</Th>
          </>
        }
      >
        {list.items.map((captain) => (
          <tr key={captain.partner_id} className="hover:bg-surface-sunken">
            <Td>
              <Stacked main={captain.name} sub={captain.phone_number} />
            </Td>
            <Td>
              {captain.vehicle ? (
                <Stacked
                  main={`${vehicleLabel(captain.vehicle.vehicle_type)} · ${captain.vehicle.registration_number}`}
                  sub={`${captain.vehicle.make_model}, ${captain.vehicle.colour}`}
                />
              ) : (
                <span className="text-text-secondary">No vehicle added</span>
              )}
            </Td>
            <Td>
              <Badge tone={approvalTone(captain.approval)}>{codeText(captain.approval)}</Badge>
            </Td>
            <Td>
              {captain.on_duty ? <Badge tone="success">On duty</Badge> : <Badge tone="neutral">Off duty</Badge>}
            </Td>
            <Td className="whitespace-nowrap">
              {captain.pass_ends_at ? (
                WHEN.format(new Date(captain.pass_ends_at))
              ) : (
                <span className="text-text-secondary">No pass</span>
              )}
            </Td>
            <Td numeric>{captain.rides_completed}</Td>
            <Td numeric>{captain.rating != null ? `★ ${captain.rating.toFixed(1)}` : "No ratings yet"}</Td>
            <Td numeric>{captain.cancels}</Td>
          </tr>
        ))}
      </Table>
      <LoadMore hasMore={list.hasMore} loading={list.loadingMore} onLoadMore={list.loadMore} label="Load more captains" />
    </div>
  );
}
