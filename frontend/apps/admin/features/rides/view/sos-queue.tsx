"use client";

import { friendlyErrorMessage, usePagedList } from "@vsolve/query";
import { Badge, Button, Dialog, EmptyState, ErrorState, Field, LoadMore, Spinner, Textarea } from "@vsolve/ui";
import Link from "next/link";
import { useState } from "react";

import { mapLink, stateLabel } from "../model";
import { fetchSosPage, sosKey, useResolveSos, type OpsSos } from "../queries";
import { useLiveRefresh } from "./use-live-refresh";

const WHEN = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

function ResolveDialog({ sos, onClose }: { sos: OpsSos; onClose: () => void }) {
  const resolve = useResolveSos();
  const [note, setNote] = useState("");

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !resolve.isPending) onClose();
      }}
      title="Resolve this SOS"
      description={`Raised by ${sos.raised_by_name} (${sos.raised_by_kind}). Say what you did; it is kept with the alert.`}
      footer={
        <>
          <Button variant="outline" disabled={resolve.isPending} onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!note.trim()}
            loading={resolve.isPending}
            loadingLabel="Saving"
            onClick={() => resolve.mutate({ sosId: sos.id, note: note.trim() }, { onSuccess: onClose })}
          >
            Resolve
          </Button>
        </>
      }
    >
      <Field label="What you did" required error={resolve.error ? friendlyErrorMessage(resolve.error) : undefined}>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} rows={3} />
      </Field>
    </Dialog>
  );
}

/** Open SOS alerts, oldest first, checked every 10 s. */
export function SosQueue() {
  const list = usePagedList([...sosKey, "OPEN"], (cursor) => fetchSosPage("OPEN", cursor));
  useLiveRefresh(list.refetch, true);
  const [resolving, setResolving] = useState<OpsSos | null>(null);

  if (list.isLoading) return <Spinner />;
  if (list.error) {
    return (
      <ErrorState
        title="We couldn't load the SOS queue"
        message={friendlyErrorMessage(list.error)}
        actionLabel="Try again"
        onAction={() => void list.refetch()}
      />
    );
  }
  if (list.items.length === 0) {
    return <EmptyState title="No open SOS alerts" description="This list checks again every 10 seconds." />;
  }

  return (
    <div className="flex flex-col gap-3">
      {list.items.map((sos) => {
        const map = mapLink(sos.latitude, sos.longitude);
        return (
          <div
            key={sos.id}
            className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-danger-line bg-surface p-4"
          >
            <div className="flex flex-col gap-1 text-sm">
              <div className="flex items-center gap-2">
                <Badge tone="danger">SOS</Badge>
                <span className="font-semibold text-text">
                  {sos.raised_by_name} · {sos.raised_by_kind}
                </span>
              </div>
              <a href={`tel:${sos.raised_by_phone}`} className="font-semibold text-text-link hover:underline">
                {sos.raised_by_phone}
              </a>
              <span className="text-text-secondary">
                {WHEN.format(new Date(sos.created_at))} · ride: {stateLabel(sos.ride_state)}
              </span>
              <div className="flex gap-4">
                <Link href={`/operations/rides/${sos.ride_id}`} className="text-text-link hover:underline">
                  Open the ride
                </Link>
                {map ? (
                  <a href={map} target="_blank" rel="noreferrer" className="text-text-link hover:underline">
                    Where it was raised
                  </a>
                ) : (
                  <span className="text-text-secondary">No location sent</span>
                )}
              </div>
            </div>
            <Button size="sm" onClick={() => setResolving(sos)}>
              Resolve
            </Button>
          </div>
        );
      })}
      <LoadMore hasMore={list.hasMore} loading={list.loadingMore} onLoadMore={list.loadMore} label="Load more alerts" />
      {resolving ? <ResolveDialog sos={resolving} onClose={() => setResolving(null)} /> : null}
    </div>
  );
}
