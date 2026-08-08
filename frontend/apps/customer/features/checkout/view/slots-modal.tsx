"use client";

import { Button, Dialog, ErrorState, SkeletonRegion } from "@vsolve/ui";
import { useState } from "react";

import { useCandidateStarts, type SchedulingGroup } from "../queries";
import { formatServiceDuration } from "./duration";
import { PreferredStartPicker } from "@/features/booking/view/preferred-start-picker";

/**
 * One start time per visit.
 *
 * The rows are Django's `scheduling-groups` answer, rendered verbatim. Which
 * services share a professional is a compatibility rule the server owns; a
 * browser that grouped them itself would be a second implementation of that
 * rule, and the first time the two disagreed the customer would pick times for a
 * visit the planner refuses to build.
 *
 * ## Why the selection is a Map keyed by `group.key`
 *
 * Never by array index. The grouping is refetched on focus and reconnect, and an
 * index survives a refetch that reorders or replaces the rows — silently moving
 * the time chosen for the electrician onto the salon appointment. The key is
 * derived from the visit's membership, so a stale one simply stops matching and
 * the row reads as unscheduled, which is the honest outcome.
 *
 * ## Why Confirm is disabled rather than defaulting
 *
 * Django refuses a plan set that does not carry a start for every published
 * group, and it is right to: defaulting picks a time on the customer's behalf
 * for work they never scheduled. The button mirrors that refusal instead of
 * letting them walk into it.
 *
 * ## Why each visit fetches its own grid
 *
 * `POST /booking/windows/` computes duration, skill set, and capacity from one
 * scheduling group (spec 2026-08-07-work-based-slot-booking-design.md §9) — a
 * cart with more than one visit refuses an ungrouped request rather than
 * guessing which one to answer for. So this component, not its parent, holds
 * the `useCandidateStarts` call: it is the one that knows which group is
 * currently being edited, and fetches fresh the moment editing switches to a
 * different one.
 */

export interface SlotsModalProps {
  open: boolean;
  groups: readonly SchedulingGroup[];
  /** Chosen starts so far, so reopening shows what is already picked. */
  value: ReadonlyMap<string, string>;
  /** Identifies the cart and address whose windows are being requested. */
  cartVersion: number;
  addressId: string;
  onConfirm: (starts: ReadonlyMap<string, string>) => void;
  onDismiss: () => void;
}

export function SlotsModal(props: SlotsModalProps) {
  /**
   * The draft lives in a child that only exists while the modal is open.
   *
   * Reopening must start from what the customer already has, not from whatever
   * this component was holding when it last closed. Synchronising that with an
   * effect renders one frame of the stale draft first; unmounting the state with
   * the modal means the stale frame cannot exist, and there is no effect to keep
   * in step with the props.
   */
  if (!props.open) return null;
  return <SlotsModalBody {...props} />;
}

function SlotsModalBody({
  groups,
  value,
  cartVersion,
  addressId,
  onConfirm,
  onDismiss,
}: SlotsModalProps) {
  const [chosen, setChosen] = useState<ReadonlyMap<string, string>>(value);
  const [editingKey, setEditingKey] = useState<string | null>(() => {
    if (groups.length === 1) {
      return groups[0].key;
    }
    return null;
  });

  const editing = groups.find((group) => group.key === editingKey) ?? null;
  const isComplete = groups.length > 0 && groups.every((group) => chosen.has(group.key));

  /**
   * Fetched only while a specific visit is being edited, and re-fetched from
   * scratch the moment `editing` switches to a different group — the query key
   * carries the group key (Task 8), so TanStack Query never serves one visit's
   * cached grid for another.
   */
  const startsQuery = useCandidateStarts(
    editing ? { cartVersion, addressId, groupKey: editing.key } : null,
  );
  const windows = startsQuery.data;
  const isLoadingWindows = startsQuery.isPending;
  const windowsError = startsQuery.isError;

  function choose(groupKey: string, startsAt: string) {
    const next = new Map(chosen).set(groupKey, startsAt);
    setChosen(next);
    if (groups.length === 1) {
      onConfirm(next);
    } else {
      setEditingKey(null);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onDismiss();
      }}
      title={editing ? `When should we do ${editing.label}?` : "Select slots"}
      description={
        editing
          ? undefined
          : groups.length > 1
            ? "These need different professionals, so each one gets its own time."
            : undefined
      }
      footer={
        editing ? (
          <Button
            variant="ghost"
            onClick={() => {
              if (groups.length === 1) {
                onDismiss();
              } else {
                setEditingKey(null);
              }
            }}
          >
            Back
          </Button>
        ) : (
          <Button disabled={!isComplete} onClick={() => onConfirm(chosen)}>
            Confirm
          </Button>
        )
      }
    >
      {editing ? (
        windowsError ? (
          <ErrorState
            title="We could not load start times"
            message="Nothing has been booked. This is a problem on our side — try again in a moment."
            actionLabel="Try again"
            onAction={() => void startsQuery.refetch()}
          />
        ) : (
          <SkeletonRegion loading={isLoadingWindows} label="Loading available start times">
            {windows ? (
              <PreferredStartPicker
                windows={windows}
                selectedStart={chosen.get(editing.key) ?? null}
                onSelect={(startsAt) => choose(editing.key, startsAt)}
                footnote="This is when you would like us to start. We will show you exactly how it can be arranged, and what it costs, before anything is confirmed."
              />
            ) : null}
          </SkeletonRegion>
        )
      ) : (
        <ul className="flex flex-col gap-3">
          {groups.map((group) => {
            const startsAt = chosen.get(group.key) ?? null;
            return (
              <li
                key={group.key}
                className="flex items-center justify-between gap-4 rounded-card border border-line p-4"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-text">{group.label}</p>
                  <p className="mt-0.5 text-sm text-text-secondary">
                    Service will take approx. {formatServiceDuration(group.estimated_duration_minutes)}
                  </p>
                  {startsAt === null ? null : (
                    <p className="mt-1 text-sm font-medium text-text">{formatChosen(startsAt)}</p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant={startsAt === null ? "primary" : "outline"}
                  onClick={() => setEditingKey(group.key)}
                >
                  {startsAt === null ? `Select ${group.label}` : `Change ${group.label}`}
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {!editing && !isComplete ? (
        <p className="mt-4 text-sm text-text-secondary" aria-live="polite">
          Pick a time for every visit to continue.
        </p>
      ) : null}
    </Dialog>
  );
}

/**
 * The chosen instant in the reader's own locale.
 *
 * Presentation only — the value sent to Django is the untouched ISO string the
 * server published, never anything reconstructed from this label.
 */
function formatChosen(startsAt: string): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(startsAt));
}
