"use client";

import { friendlyErrorMessage, queueRecoveryAction, usePagedList } from "@vsolve/query";
import { Badge, Card, EmptyState, Field, Input, LoadMore, formatMoney } from "@vsolve/ui";
import { ChevronRight, Phone } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { useStuckQueues } from "@/features/m2-requests/queries";

import { useListingCounts } from "@/features/money/money-tab";
import { filterChipStyles } from "@/features/money/service-tabs";
import { useDebounced } from "@/features/shared/use-debounced";

import {
  ARCHETYPE_LABEL,
  REQUEST_GROUPS,
  REQUEST_STATUS_LABEL,
  fetchWorkforceRequestsPage,
  type RequestGroupKey,
  type StuckQueueCode,
  type WorkforceArchetype,
  type WorkforceRequestRow,
} from "../queries";

const DAY = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

function day(value: string | null | undefined): string {
  return value ? DAY.format(new Date(value)) : "—";
}

function statusTone(status: string): "success" | "warning" | "danger" | "info" | "neutral" {
  if (status === "CLOSED_COMPLETE") return "success";
  if (status === "ENGAGED" || status === "SELECTED") return "info";
  if (status.startsWith("CLOSED_")) return "neutral";
  return "warning";
}

function RequestCard({ row }: { row: WorkforceRequestRow }) {
  const archetype = row.archetype as WorkforceArchetype;
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-navy-900">{row.service_name}</p>
          <p className="text-sm text-text-secondary">
            {row.area || "No area"} · Asked {day(row.submitted_at ?? row.created_at)}
            {row.requested_start ? ` · Wanted from ${day(row.requested_start)}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="neutral">{ARCHETYPE_LABEL[archetype] ?? row.archetype}</Badge>
          <Badge tone={statusTone(row.status)}>{REQUEST_STATUS_LABEL[row.status] ?? row.status}</Badge>
        </div>
      </div>
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
        <div className="min-w-0">
          <dt className="text-xs font-semibold uppercase text-text-muted">Customer</dt>
          <dd className="truncate text-navy-900">{row.customer_name || "—"}</dd>
          {row.customer_phone ? (
            <dd>
              <a className="inline-flex items-center gap-1 text-text-link" href={`tel:${row.customer_phone}`}>
                <Phone aria-hidden className="size-3" /> {row.customer_phone}
              </a>
            </dd>
          ) : null}
        </div>
        <div className="min-w-0">
          <dt className="text-xs font-semibold uppercase text-text-muted">Vendor</dt>
          <dd className="truncate text-navy-900">{row.vendor_display_name ?? "Not chosen yet"}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase text-text-muted">Agreed value</dt>
          <dd className="text-navy-900" data-numeric>
            {typeof row.engagement_total_paise === "number" ? formatMoney(row.engagement_total_paise) : "—"}
          </dd>
        </div>
      </dl>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3">
        <p className="truncate text-xs text-text-muted">Request {row.id}</p>
        <Link
          href={`/operations/requests/${row.id}`}
          className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-text-link hover:underline"
        >
          Open request <ChevronRight aria-hidden className="size-4" />
        </Link>
      </div>
    </Card>
  );
}

/** What clears each stuck queue, in an operator's words. An unknown action shows its code. */
const RECOVERY_LABEL: Record<string, string> = {
  rematch: "rematch it",
  close_expired: "close it as expired",
  release_offer_hold: "release the offer hold",
  reconcile_payment: "reconcile the payment",
  lapse_to_operations: "hand the cancellation to Operations",
};

/**
 * Every crew and project request, newest first, searchable and filtered on the server. Opening
 * one goes to its timeline, where rematch, deadline, reclassification and refund review live.
 *
 * The stuck queues are a filter here, not a tab of their own: the old tab showed only how deep
 * each queue was, and opening one meant pasting a request id.
 */
export function WorkforceRequests() {
  const params = useSearchParams();
  const [group, setGroup] = useState<RequestGroupKey>("open");
  const [stuck, setStuck] = useState<StuckQueueCode | null>(
    () => (params.get("stuck") as StuckQueueCode | null) || null,
  );
  const [archetype, setArchetype] = useState<WorkforceArchetype | "">("");
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim());
  const counts = useListingCounts("workforce");
  const queues = useStuckQueues();
  const stuckQueues = (queues.data?.queues ?? []).filter((queue) => queue.depth > 0);
  const selectedQueue = (queues.data?.queues ?? []).find((queue) => queue.code === stuck) ?? null;
  const recovery = selectedQueue ? queueRecoveryAction(selectedQueue) : null;

  // A stuck queue already means "open and past a deadline", so it replaces the stage filter.
  const groupFilters = stuck ? {} : (REQUEST_GROUPS.find((entry) => entry.key === group)?.filters ?? {});
  const filters = {
    ...groupFilters,
    stuck: stuck ?? undefined,
    archetype: archetype || undefined,
    q: q || undefined,
  };
  const requests = usePagedList(["ops-workforce-requests", filters], (cursor) =>
    fetchWorkforceRequestsPage(cursor, filters),
  );
  const rows = requests.items;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="group" aria-label="Requests by stage" className="flex flex-wrap gap-2">
          {REQUEST_GROUPS.map((entry) => {
            const count = counts?.[entry.key];
            return (
              <button
                key={entry.key}
                type="button"
                aria-pressed={!stuck && group === entry.key}
                className={filterChipStyles(!stuck && group === entry.key)}
                onClick={() => {
                  setStuck(null);
                  setGroup(entry.key);
                }}
              >
                {entry.label}
                {typeof count === "number" ? <span className="ml-1.5 tabular-nums opacity-70">{count}</span> : null}
              </button>
            );
          })}
        </div>
        <div role="group" aria-label="Kind of request" className="flex flex-wrap gap-2">
          {(["", "A3_TIME_BLOCK", "A5_CUSTOM_PROJECT"] as const).map((value) => (
            <button
              key={value || "both"}
              type="button"
              aria-pressed={archetype === value}
              className={filterChipStyles(archetype === value)}
              onClick={() => setArchetype(value)}
            >
              {value ? ARCHETYPE_LABEL[value] : "Crew and projects"}
            </button>
          ))}
        </div>
      </div>

      {stuckQueues.length > 0 || stuck ? (
        <div className="flex flex-col gap-2 rounded-card border border-warning-line bg-warning-surface p-3">
          <div role="group" aria-label="Stuck requests" className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-warning-text">Stuck:</span>
            {stuckQueues.map((queue) => (
              <button
                key={queue.code}
                type="button"
                aria-pressed={stuck === queue.code}
                className={filterChipStyles(stuck === queue.code)}
                onClick={() => setStuck(stuck === queue.code ? null : (queue.code as StuckQueueCode))}
              >
                {queue.queue_label}
                <span className="ml-1.5 tabular-nums opacity-70">{queue.depth}</span>
              </button>
            ))}
            {stuck ? (
              <button
                type="button"
                className="text-sm font-semibold text-text-link hover:underline"
                onClick={() => setStuck(null)}
              >
                Show all requests
              </button>
            ) : null}
          </div>
          {selectedQueue ? (
            <p className="text-sm text-text-secondary">
              {recovery
                ? `Open a request to ${RECOVERY_LABEL[recovery] ?? recovery}.`
                : "No automatic fix for these. Open each request and decide what happens next."}
            </p>
          ) : null}
        </div>
      ) : null}

      <Field label="Search">
        <Input
          value={search}
          placeholder="Customer name or phone, vendor, or request id"
          onChange={(event) => setSearch(event.target.value)}
        />
      </Field>

      {requests.isLoading ? <p className="text-sm text-text-secondary">Loading requests…</p> : null}
      {requests.error ? (
        <p role="alert" className="text-sm text-danger-text">
          {friendlyErrorMessage(requests.error)}
        </p>
      ) : null}
      {!requests.isLoading && !requests.error && rows.length === 0 ? (
        <EmptyState title="No requests" description="Crew and project requests matching these filters appear here." />
      ) : null}

      <ul className="flex flex-col gap-3">
        {rows.map((row) => (
          <li key={row.id}>
            <RequestCard row={row} />
          </li>
        ))}
      </ul>
      <LoadMore hasMore={requests.hasMore} loading={requests.loadingMore} onLoadMore={requests.loadMore} />
    </section>
  );
}
