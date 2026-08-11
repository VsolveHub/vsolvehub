"use client";

import { Badge, Button, Card, ConfirmAction, EmptyState, cn } from "@vsolve/ui";
import { HardHat } from "lucide-react";
import { useState } from "react";

import { AsyncSection, type AsyncState } from "@/components/async-section";

import type { CrewRow, RosterView } from "../adapters/roster";

/**
 * The crew roster: who you can send, and who can report attendance.
 *
 * Closes the roster half of `M2-FE-107` / `FLOW-07`.
 *
 * ## Reached at first assignment, never from registration
 *
 * Nothing in `/apply` links here. A workforce agency signs up, browses demand,
 * accepts an enquiry and quotes without naming a single worker; the roster is
 * asked for when a shift needs filling, which is also the first moment the
 * Partner knows who is going. Asking at registration means guessing, and a
 * guessed roster is one nobody maintains.
 *
 * ## The supervisor line is not decoration
 *
 * A3 attendance is one supervisor action — "n of m present today" — so a roster
 * with no supervisor has nobody who can file it. Saying that here, before a
 * shift starts, is the difference between a two-minute fix and a phone call at
 * seven in the morning from a site.
 *
 * ## Archived stays visible
 *
 * Seasonal labour is the normal case. Someone let go in March comes back in
 * September, and `add_crew_member` reinstates rather than duplicating — but only
 * if the Partner can find them. A hidden archive is one that gets re-entered by
 * hand, which breaks the double-booking check that global identity exists for.
 */

export interface CrewRosterProps {
  readonly state: AsyncState<RosterView>;
  readonly onAdd: () => void;
  readonly onArchive: (membershipId: string) => void;
  readonly archivingId?: string | null;
  /** Set when archiving was refused — a future assignment, most often. */
  readonly archiveError?: { readonly membershipId: string; readonly message: string } | null;
  readonly onRetry?: () => void;
  readonly className?: string;
}

export function CrewRoster({
  state,
  onAdd,
  onArchive,
  archivingId = null,
  archiveError = null,
  onRetry,
  className,
}: CrewRosterProps) {
  return (
    <AsyncSection
      state={state}
      label="Loading your crew"
      onRetry={onRetry}
      className={className}
      isEmpty={(view) => view.isEmpty}
      empty={
        <EmptyState
          icon={<HardHat size={24} aria-hidden />}
          title="No one on your roster yet"
          description="Add the people you send to work. We check nobody is double-booked on a day, including through another agency."
          action={<Button onClick={onAdd}>Add someone</Button>}
        />
      }
    >
      {(view) => (
        <div className={cn("flex flex-col gap-4", className)}>
          {view.canReportAttendance ? null : (
            <Card
              aria-live="polite"
              className="border-warning-line bg-warning-surface p-4 text-sm leading-6 text-text-secondary"
            >
              <strong className="font-semibold text-warning-text">
                Nobody can report attendance.
              </strong>{" "}
              Mark at least one person as a supervisor — they are who confirms how many of your
              crew turned up each day.
            </Card>
          )}

          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-text">
              Your crew{" "}
              <span className="font-normal text-text-muted">({view.active.length})</span>
            </h2>
            <Button size="sm" onClick={onAdd}>
              Add someone
            </Button>
          </div>

          <ul className="flex list-none flex-col gap-2 p-0">
            {view.active.map((row) => (
              <li key={row.membershipId}>
                <CrewCard
                  row={row}
                  pending={archivingId === row.membershipId}
                  error={
                    archiveError?.membershipId === row.membershipId ? archiveError.message : null
                  }
                  onArchive={() => onArchive(row.membershipId)}
                />
              </li>
            ))}
          </ul>

          {view.archived.length > 0 ? (
            <details className="rounded-card border border-line bg-surface p-4">
              <summary className="cursor-pointer text-sm font-semibold text-text">
                People you have archived ({view.archived.length})
              </summary>
              <p className="mt-2 text-sm leading-6 text-text-secondary">
                Adding an archived person again puts them back on your roster — you do not need to
                re-enter their details.
              </p>
              <ul className="mt-3 flex list-none flex-col gap-2 p-0">
                {view.archived.map((row) => (
                  <li key={row.membershipId} className="text-sm text-text-secondary">
                    {row.name} <span className="text-text-muted">· {row.phoneMasked}</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      )}
    </AsyncSection>
  );
}

function CrewCard({
  row,
  pending,
  error,
  onArchive,
}: {
  row: CrewRow;
  pending: boolean;
  error: string | null;
  onArchive: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text">{row.name}</p>
          {/* Masked at the server. A roster read on a shared site phone is a
              contact export waiting to happen, and the Partner who needs the
              full number already has it. */}
          <p className="text-sm text-text-muted">{row.phoneMasked}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {row.isSupervisor ? <Badge tone="info">Supervisor</Badge> : null}
          <Badge tone={row.documentsVerified ? "success" : "neutral"}>
            {row.documentsVerified ? "Documents checked" : "Documents not checked"}
          </Badge>
        </div>
      </div>

      {row.skillCodes.length > 0 ? (
        <p className="mt-2 text-sm text-text-secondary">{row.skillCodes.join(" · ")}</p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-sm text-danger-text">
          {error}
        </p>
      ) : null}

      <Button
        variant="ghost"
        size="sm"
        className="mt-3"
        loading={pending}
        loadingLabel="Archiving"
        onClick={() => setConfirming(true)}
      >
        Archive
      </Button>

      <ConfirmAction
        open={confirming}
        onOpenChange={setConfirming}
        title={`Archive ${row.name}?`}
        consequence="They stop appearing when you assign crew. Nothing they have already worked is affected, and you can put them back at any time."
        confirmLabel="Archive"
        pending={pending}
        onConfirm={() => {
          setConfirming(false);
          onArchive();
        }}
      />
    </Card>
  );
}
