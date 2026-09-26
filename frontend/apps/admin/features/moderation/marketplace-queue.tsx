"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, EmptyState, Field, Textarea, formatMoney } from "@vsolve/ui";
import { MapPin } from "lucide-react";
import { useState } from "react";

import type { ModerationAction } from "./queries";

export type MarketplaceQueueRow = {
  id: string;
  title: string;
  public_state: string;
  partyName: string;
  moderation_status?: string;
  photoUrl?: string;
  location?: string;
  moneyLines?: string[];
  facts?: string[];
};

export function MarketplaceQueue({
  heading,
  queryKey,
  load,
  moderate,
}: {
  heading: string;
  queryKey: string;
  load: () => Promise<MarketplaceQueueRow[]>;
  moderate: (id: string, action: ModerationAction, reason: string) => Promise<void>;
}) {
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const trimmed = reason.trim();
  const queue = useQuery({ queryKey: [queryKey], queryFn: load });
  const rows = queue.data ?? [];
  const pending = rows.filter((row) => row.moderation_status === "PENDING");

  const command = useMutation({
    mutationFn: ({ id, action }: { id: string; action: ModerationAction }) =>
      moderate(id, action, trimmed),
    onSuccess: () => void qc.invalidateQueries({ queryKey: [queryKey] }),
  });

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-6">
      <div>
        <h1 className="text-xl font-bold text-navy-900">{heading}</h1>
        <p className="text-sm text-text-secondary">
          Rates and deposits come from the server in paise. Photos are uploaded files, not pasted URLs.
        </p>
      </div>
      <Field label="Reason" required>
        <Textarea value={reason} onChange={(event) => setReason(event.target.value)} />
      </Field>
      {queue.isLoading ? <p className="text-sm text-text-secondary">Loading…</p> : null}
      {queue.error ? (
        <p className="text-sm text-danger-text">{(queue.error as Error).message}</p>
      ) : null}
      <p className="text-sm text-text-secondary">{pending.length} pending</p>
      {rows.length === 0 && !queue.isLoading ? (
        <EmptyState title="Nothing in this queue" description="Submitted items appear here for review." />
      ) : null}
      <ul className="grid gap-3 sm:grid-cols-2">
        {rows.map((row) => (
          <li key={row.id}>
            <Card padding="none" className="overflow-hidden">
              <div className="relative aspect-[4/3] bg-surface-sunken">
                {row.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={row.photoUrl} alt="" className="size-full object-cover" />
                ) : (
                  <div className="flex size-full items-center justify-center text-sm text-text-muted">
                    No photo
                  </div>
                )}
                <span className="absolute right-2 top-2 rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-semibold text-navy-900">
                  {row.public_state}
                </span>
              </div>
              <div className="flex flex-col gap-2 p-3">
                <p className="font-semibold text-navy-900">{row.title}</p>
                <p className="text-sm text-text-secondary">{row.partyName}</p>
                {row.location ? (
                  <p className="inline-flex items-center gap-1 text-sm text-text-secondary">
                    <MapPin className="size-3.5 shrink-0" />
                    {row.location}
                  </p>
                ) : null}
                {row.moneyLines?.length ? (
                  <ul className="text-sm font-semibold text-navy-900">
                    {row.moneyLines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                ) : null}
                {row.facts?.length ? (
                  <p className="text-xs text-text-secondary">{row.facts.join(" · ")}</p>
                ) : null}
                {row.moderation_status === "PENDING" ? (
                  <div className="mt-1 flex gap-2">
                    <Button
                      size="sm"
                      disabled={!trimmed || command.isPending}
                      onClick={() => command.mutate({ id: row.id, action: "APPROVE" })}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={!trimmed || command.isPending}
                      onClick={() => command.mutate({ id: row.id, action: "REJECT" })}
                    >
                      Reject
                    </Button>
                  </div>
                ) : null}
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </main>
  );
}

export function factEntries(fields: unknown): string[] {
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) return [];
  return Object.entries(fields as Record<string, unknown>)
    .filter(([, value]) => value != null && String(value).trim() !== "")
    .map(([key, value]) => `${key.replace(/_/g, " ")}: ${String(value)}`);
}

export function moneyLine(paise: number | undefined, suffix: string): string | null {
  if (typeof paise !== "number" || paise < 1) return null;
  return `${formatMoney(paise)} ${suffix}`;
}
