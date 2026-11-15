"use client";

import { friendlyErrorMessage, usePagedList } from "@vsolve/query";
import { Badge, EmptyState, ErrorState, LoadMore, Spinner, formatMoney } from "@vsolve/ui";
import Link from "next/link";
import { useState } from "react";

import { filterChipStyles } from "@/features/money/service-tabs";

import { RIDE_FILTERS, stateLabel, stateTone, type RideFilterKey } from "../model";
import { fetchRidesPage, ridesKey } from "../queries";
import { useLiveRefresh } from "./use-live-refresh";

const WHEN = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

export function RideList() {
  const [filterKey, setFilterKey] = useState<RideFilterKey>("live");
  const filter = RIDE_FILTERS.find((f) => f.key === filterKey) ?? RIDE_FILTERS[0];
  const list = usePagedList([...ridesKey, filter.states], (cursor) => fetchRidesPage(filter.states, cursor));
  useLiveRefresh(list.refetch, filterKey === "live");

  return (
    <div className="flex flex-col gap-4">
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
          title={filterKey === "live" ? "No rides going right now" : "No rides here yet"}
          description={filterKey === "live" ? "This list checks again every 10 seconds." : undefined}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-xs uppercase text-text-secondary">
              <tr>
                <th className="px-4 py-3">Booked</th>
                <th className="px-4 py-3">State</th>
                <th className="px-4 py-3">Vehicle</th>
                <th className="px-4 py-3">Rider</th>
                <th className="px-4 py-3">Captain</th>
                <th className="px-4 py-3 text-right">Fare</th>
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
                    <Badge tone={stateTone(ride.state)}>{stateLabel(ride.state)}</Badge>
                  </td>
                  <td className="px-4 py-3">{ride.vehicle_type}</td>
                  <td className="px-4 py-3">{ride.rider_name}</td>
                  <td className="px-4 py-3">{ride.captain_name ?? "—"}</td>
                  <td className="px-4 py-3 text-right">{formatMoney(ride.final_fare_paise ?? ride.fare_paise)}</td>
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
