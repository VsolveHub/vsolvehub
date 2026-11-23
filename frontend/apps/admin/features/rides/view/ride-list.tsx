"use client";

import { friendlyErrorMessage, usePagedList } from "@vsolve/query";
import { Badge, EmptyState, ErrorState, LoadMore, Spinner, formatMoney } from "@vsolve/ui";
import Link from "next/link";
import { useState } from "react";

import { filterChipStyles } from "@/features/money/service-tabs";

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
      <div className="flex flex-wrap gap-2" role="group" aria-label="Show kind">
        {KIND_FILTERS.map((k) => (
          <button
            key={k.key}
            type="button"
            aria-pressed={k.key === kindKey}
            className={filterChipStyles(k.key === kindKey)}
            onClick={() => setKindKey(k.key)}
          >
            {k.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Show rides">
        {RIDE_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            aria-pressed={f.key === filterKey}
            className={filterChipStyles(f.key === filterKey)}
            onClick={() => setFilterKey(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

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
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-xs uppercase text-text-secondary">
              <tr>
                <th className="px-4 py-3">Booked</th>
                <th className="px-4 py-3">State</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Vehicle</th>
                <th className="px-4 py-3">Rider</th>
                <th className="px-4 py-3">Captain</th>
                <th className="px-4 py-3 text-right">Fare</th>
                <th className="px-4 py-3">Payment</th>
              </tr>
            </thead>
            <tbody>
              {list.items.map((ride) => (
                <tr key={ride.id} className="border-b border-line last:border-0 hover:bg-surface-sunken">
                  <td className="px-4 py-3">
                    <Link href={`/operations/rides/${ride.id}`} className="font-semibold text-text-link hover:underline">
                      {WHEN.format(new Date(ride.created_at))}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={stateTone(ride.state)}>{stateLabel(ride.state, ride.kind)}</Badge>
                  </td>
                  <td className="px-4 py-3">{kindLabel(ride.kind)}</td>
                  <td className="px-4 py-3">{ride.vehicle_type}</td>
                  <td className="px-4 py-3">{ride.rider_name}</td>
                  <td className="px-4 py-3">{ride.captain_name ?? "—"}</td>
                  <td className="px-4 py-3 text-right">{formatMoney(ride.final_fare_paise ?? ride.fare_paise)}</td>
                  <td className="px-4 py-3">
                    {ride.payment_status === "UNPAID" ? (
                      <Badge tone="warning">{paymentText(ride.payment_status)}</Badge>
                    ) : (
                      paymentText(ride.payment_status)
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <LoadMore hasMore={list.hasMore} loading={list.loadingMore} onLoadMore={list.loadMore} label="Load more rides" />
    </div>
  );
}
