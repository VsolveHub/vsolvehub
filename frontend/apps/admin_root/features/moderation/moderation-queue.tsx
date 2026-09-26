"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, EmptyState, Field, Textarea } from "@vsolve/ui";
import { useState } from "react";

import type { ModerationAction } from "./queries";

export type ModerationRow = {
  id: string;
  title: string;
  public_state: string;
  partyName: string;
  moderation_status?: string;
};

export function ModerationQueue({
  heading,
  queryKey,
  load,
  moderate,
}: {
  heading: string;
  queryKey: string;
  load: () => Promise<ModerationRow[]>;
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
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
      <h1 className="text-xl font-bold text-navy-900">{heading}</h1>
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
      <ul className="flex flex-col gap-3">
        {rows.map((row) => (
          <li key={row.id}>
            <Card>
              <p className="font-semibold text-navy-900">
                {row.title} · {row.public_state}
              </p>
              <p className="text-sm text-text-secondary">{row.partyName}</p>
              {row.moderation_status === "PENDING" ? (
                <div className="mt-3 flex gap-2">
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
            </Card>
          </li>
        ))}
      </ul>
    </main>
  );
}
