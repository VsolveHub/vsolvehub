"use client";

import { friendlyErrorMessage, usePagedList } from "@vsolve/query";
import { Badge, EmptyState, ErrorState, LoadMore, Spinner, formatMoney } from "@vsolve/ui";
import Link from "next/link";
import { useState } from "react";

import {
  KIND_FILTERS,
  RIDE_FILTERS,
  kindLabel,
  paymentText,
  stateLabel,
  stateTone,
  type KindFilterKey,
  type RideFilterKey,
} from "../model";
import { fetchRidesPage, ridesKey } from "../queries";
import { FilterGroup, Stacked, Table, Td, Th, Toolbar, vehicleLabel } from "./layout";
import { useLiveRefresh } from "./use-live-refresh";

const WHEN = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

export function RideList() {
  const [filterKey, setFilterKey] = useState<RideFilterKey>("live");
  const [kindKey, setKindKey] = useState<KindFilterKey>("all");
  const filter = RIDE_FILTERS.find((f) => f.key === filterKey) ?? RIDE_FILTERS[0]!;
  const kind = KIND_FILTERS.find((k) => k.key === kindKey) ?? KIND_FILTERS[0];
  const list = usePagedList([...ridesKey, filter.key, kind.key], (cursor) => fetchRidesPage(filter, kind.kind, cursor));
  useLiveRefresh(list.refetch, filterKey === "live");

  return (
    <div className="flex flex-col gap-4">
      <Toolbar>
        <FilterGroup label="Status" options={RIDE_FILTERS} value={filterKey} onChange={setFilterKey} />
        <FilterGroup label="Type" options={KIND_FILTERS} value={kindKey} onChange={setKindKey} />
      </Toolbar>

      {list.isLoading ? (
        <Spinner />
      ) : list.error ? (
        <ErrorState
          title="We couldn't load rides"
          message={friendlyErrorMessage(list.error)}
          actionLabel="Try again"
          onAction={() => void list.refetch()}
        />
      ) : list.items.length === 0 ? (
        <EmptyState
          title={
            filterKey === "live"
              ? "No rides going right now"
              : filterKey === "unpaid"
                ? "Nothing unpaid"
                : "No rides here yet"
          }
          description={
            filterKey === "live"
              ? "This list checks again every 10 seconds."
              : filterKey === "unpaid"
                ? "Parcels returned to a sender who did not pay show up here."
                : undefined
          }
        />
      ) : (
        <Table
          head={
            <>
              <Th>Booked</Th>
              <Th>Status</Th>
              <Th>Type</Th>
              <Th>Rider</Th>
              <Th>Captain</Th>
              <Th numeric>Fare</Th>
              <Th>Payment</Th>
            </>
          }
        >
          {list.items.map((ride) => (
            // The whole row opens the ride: the date link stretches over it.
            <tr key={ride.id} className="relative hover:bg-surface-sunken">
              <Td>
                <Link
                  href={`/operations/rides/${ride.id}`}
                  className="whitespace-nowrap font-semibold text-text-link after:absolute after:inset-0 hover:underline"
                >
                  {WHEN.format(new Date(ride.created_at))}
                </Link>
              </Td>
              <Td>
                <Badge tone={stateTone(ride.state)}>{stateLabel(ride.state, ride.kind)}</Badge>
              </Td>
              <Td>
                <Stacked main={kindLabel(ride.kind)} sub={vehicleLabel(ride.vehicle_type)} />
              </Td>
              <Td>{ride.rider_name}</Td>
              <Td>{ride.captain_name ?? <span className="text-text-secondary">Not assigned</span>}</Td>
              <Td numeric>{formatMoney(ride.final_fare_paise ?? ride.fare_paise)}</Td>
              <Td>
                {ride.payment_status === "UNPAID" ? (
                  <Badge tone="warning">{paymentText(ride.payment_status)}</Badge>
                ) : (
                  paymentText(ride.payment_status)
                )}
              </Td>
            </tr>
          ))}
        </Table>
      )}
      <LoadMore hasMore={list.hasMore} loading={list.loadingMore} onLoadMore={list.loadMore} label="Load more rides" />
    </div>
  );
}
