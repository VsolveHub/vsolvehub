"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, EmptyState, Field, Textarea, formatMoney } from "@vsolve/ui";
import { MapPin } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

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

type QueueFilter = "PENDING" | "ALL";

const ACTION_COPY: Record<
  ModerationAction,
  { title: string; description: string; confirm: string; danger: boolean }
> = {
  APPROVE: {
    title: "Approve this listing",
    description: "It becomes visible to customers after you confirm.",
    confirm: "Approve",
    danger: false,
  },
  REJECT: {
    title: "Reject this listing",
    description: "It stays off the marketplace. The partner can amend and resubmit.",
    confirm: "Reject",
    danger: true,
  },
  REMOVE: {
    title: "Take this listing down",
    description: "Customers stop seeing it. You can reinstate it later.",
    confirm: "Remove",
    danger: true,
  },
  REINSTATE: {
    title: "Reinstate this listing",
    description: "It goes live again after you confirm.",
    confirm: "Reinstate",
    danger: false,
  },
};

function statusLabel(row: MarketplaceQueueRow): string {
  const raw = row.moderation_status || row.public_state;
  switch (raw) {
    case "PENDING":
    case "PENDING_REVIEW":
      return "Pending review";
    case "APPROVED":
    case "ACTIVE":
    case "PUBLISHED":
      return "Live";
    case "REJECTED":
      return "Rejected";
    case "REMOVED":
      return "Removed";
    case "DRAFT":
      return "Draft";
    default:
      return raw.replace(/_/g, " ");
  }
}

function actionsFor(row: MarketplaceQueueRow): ModerationAction[] {
  const status = row.moderation_status || row.public_state;
  if (status === "PENDING" || status === "PENDING_REVIEW") return ["APPROVE", "REJECT"];
  if (status === "APPROVED" || status === "ACTIVE" || status === "PUBLISHED") return ["REMOVE"];
  if (status === "REJECTED" || status === "REMOVED") return ["REINSTATE"];
  return [];
}

function isPending(row: MarketplaceQueueRow): boolean {
  return row.moderation_status === "PENDING" || row.public_state === "PENDING_REVIEW";
}

export function MarketplaceQueue({
  heading,
  queryKey,
  load,
  moderate,
  leading,
  embedded = false,
}: {
  /** Inside a section tab: the tab already names the area, so drop the page frame and title. */
  embedded?: boolean;
  heading: string;
  queryKey: string;
  load: () => Promise<MarketplaceQueueRow[]>;
  moderate: (id: string, action: ModerationAction, reason: string) => Promise<void>;
  leading?: ReactNode;
}) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<QueueFilter>("PENDING");
  const [reason, setReason] = useState("");
  const [decision, setDecision] = useState<{
    row: MarketplaceQueueRow;
    action: ModerationAction;
  } | null>(null);
  const queue = useQuery({ queryKey: [queryKey], queryFn: load });
  const rows = useMemo(() => queue.data ?? [], [queue.data]);
  const pendingCount = rows.filter(isPending).length;
  const visible = useMemo(
    () => (filter === "PENDING" ? rows.filter(isPending) : rows),
    [filter, rows],
  );

  const command = useMutation({
    mutationFn: ({
      id,
      action,
      note,
    }: {
      id: string;
      action: ModerationAction;
      note: string;
    }) => moderate(id, action, note),
    onSuccess: () => {
      setDecision(null);
      setReason("");
      void qc.invalidateQueries({ queryKey: [queryKey] });
    },
  });

  const openAction = (row: MarketplaceQueueRow, action: ModerationAction) => {
    setReason("");
    command.reset();
    setDecision({ row, action });
  };

  const trimmed = reason.trim();
  const copy = decision ? ACTION_COPY[decision.action] : null;

  return (
    <main
      className={
        embedded ? "flex flex-col gap-4" : "mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-6"
      }
    >
      {leading}
      <div>
        {embedded ? null : <h1 className="text-xl font-bold text-navy-900">{heading}</h1>}
        <p className="text-sm text-text-secondary">
          Review what partners submitted. Approve, reject, take down, or reinstate — each
          decision needs a reason.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-text-secondary">
          {pendingCount} waiting for a decision
        </p>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={filter === "PENDING" ? "primary" : "outline"}
            onClick={() => setFilter("PENDING")}
          >
            Pending
          </Button>
          <Button
            size="sm"
            variant={filter === "ALL" ? "primary" : "outline"}
            onClick={() => setFilter("ALL")}
          >
            All
          </Button>
        </div>
      </div>

      {queue.isLoading ? <p className="text-sm text-text-secondary">Loading…</p> : null}
      {queue.error ? (
        <p className="text-sm text-danger-text">{(queue.error as Error).message}</p>
      ) : null}
      {visible.length === 0 && !queue.isLoading ? (
        <EmptyState
          title={filter === "PENDING" ? "Nothing waiting" : "Nothing in this queue"}
          description={
            filter === "PENDING"
              ? "Submitted listings that need a decision appear here."
              : "Submitted items appear here for review."
          }
        />
      ) : null}

      <ul className="grid items-stretch gap-3 sm:grid-cols-2">
        {visible.map((row) => {
          const actions = actionsFor(row);
          return (
            <li key={row.id} className="h-full">
              <Card padding="none" className="flex h-full flex-col overflow-hidden">
                <div className="relative aspect-[4/3] shrink-0 bg-surface-sunken">
                  {row.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={row.photoUrl} alt="" className="size-full object-cover" />
                  ) : (
                    <div className="flex size-full items-center justify-center text-sm text-text-muted">
                      No photo
                    </div>
                  )}
                  <span className="absolute right-2 top-2 rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-semibold text-navy-900">
                    {statusLabel(row)}
                  </span>
                </div>
                <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
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
                  {actions.length > 0 ? (
                    <div className="mt-auto flex flex-wrap gap-2 pt-1">
                      {actions.map((action) => (
                        <Button
                          key={action}
                          size="sm"
                          variant={ACTION_COPY[action].danger ? "danger" : "primary"}
                          onClick={() => openAction(row, action)}
                        >
                          {ACTION_COPY[action].confirm}
                        </Button>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-auto pt-1 text-xs text-text-muted">
                      The partner has not submitted this yet. No Operations action until they do.
                    </p>
                  )}
                </div>
              </Card>
            </li>
          );
        })}
      </ul>

      {decision && copy ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/50 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="moderation-decision-title"
            className="flex w-full max-w-lg flex-col overflow-hidden rounded-card border border-line bg-surface shadow-overlay"
          >
            <div className="px-5 pb-3 pt-5">
              <h2 id="moderation-decision-title" className="text-base font-bold text-text">
                {copy.title}
              </h2>
              <p className="mt-1 text-sm text-text-secondary">
                {decision.row.title} · {copy.description}
              </p>
            </div>
            <div className="px-5 py-2">
              <Field
                label="Reason"
                required
                showOptional={false}
                description="Saved on the listing and the audit trail. Customers do not see this."
              >
                <Textarea
                  rows={4}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </Field>
              {command.isError ? (
                <p className="mt-2 text-sm text-danger-text">
                  {command.error instanceof Error
                    ? command.error.message
                    : "The decision could not be saved."}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-4">
              <Button
                variant="outline"
                onClick={() => {
                  setDecision(null);
                  setReason("");
                  command.reset();
                }}
              >
                Cancel
              </Button>
              <Button
                variant={copy.danger ? "danger" : "primary"}
                disabled={!trimmed || command.isPending}
                loading={command.isPending}
                onClick={() => {
                  if (!trimmed) return;
                  command.mutate({
                    id: decision.row.id,
                    action: decision.action,
                    note: trimmed,
                  });
                }}
              >
                {copy.confirm}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
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
