"use client";

import { Badge, Button, Card, ConfirmAction, EmptyState, Sheet, cn } from "@vsolve/ui";
import { useState } from "react";

import { AsyncSection, type AsyncState } from "@/components/async-section";
import { Pictogram, type PictogramName } from "@/components/pictogram";

import type { CrewRow, RosterView } from "../adapters/roster";
import { CrewGenderField, crewGenderLabel, type CrewGender } from "./crew-gender";

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
 *
 * ## Restyled: avatar-grid (Task 12, tap-first redesign)
 *
 * Presentation only. `activeMembers`/`archivedMembers` still come from
 * `adapters/roster.ts` unchanged, `CrewRosterProps` is unchanged, and every
 * command (`onAdd`, `onArchive`, retry) is wired exactly as before — only
 * `CrewCard`'s internals and the two list containers changed shape.
 *
 * Each person gets a gradient-filled circular avatar carrying their initials
 * (`initialsFor` — the same slice-first-two-words pattern the customer app's
 * `ProfileMark` already uses for the same fallback-avatar purpose) with a
 * small status dot: green check once `documentsVerified`, orange clock while
 * it is not yet, grey cross once archived (`avatarStatusFor`). There is no
 * fourth membership status to draw a dot for — `CREW_STATUSES` is exactly
 * `ACTIVE`/`ARCHIVED` (`features/capability/adapters/wire.ts`) — so "pending"
 * reads as "documents not checked yet" rather than an invented state, and the
 * existing "Documents checked"/"Documents not checked" badge stays exactly as
 * it was rather than being replaced by the dot, so nothing already on screen
 * is lost.
 *
 * No `Crew.dc.html` canvas exists anywhere in this repository to transcribe
 * pixel values from (confirmed absent from the whole tree, not merely
 * unread), so — like Task 10's Money screen hit the same gap and resolved it
 * — this is pattern-matched from the brief's own text description plus this
 * app's already-approved tokens: the avatar gradient is `me-home.tsx`'s exact
 * `linear-gradient(150deg, navy-300, navy-500)` treatment, and the warning
 * banner's icon follows `earnings-panel.tsx`'s established icon-plus-text
 * pattern for a `warning-surface` card.
 */

export interface CrewRosterProps {
  readonly state: AsyncState<RosterView>;
  readonly onAdd: () => void;
  readonly onArchive: (membershipId: string) => void;
  readonly archivingId?: string | null;
  /** Set when archiving was refused — a future assignment, most often. */
  readonly archiveError?: { readonly membershipId: string; readonly message: string } | null;
  /**
   * Record what a worker is. Offered per person because that is the only unit it exists in —
   * there is no bulk edit, and a screen that let one be applied to several at once would be
   * inviting exactly the guess this field must never contain.
   */
  readonly onSetGender: (membershipId: string, gender: CrewGender) => void;
  readonly settingGenderId?: string | null;
  /** `m2_crew_gender_conflict`, most often: another agency recorded this person differently. */
  readonly genderError?: { readonly membershipId: string; readonly message: string } | null;
  readonly onRetry?: () => void;
  readonly className?: string;
}

export function CrewRoster({
  state,
  onAdd,
  onArchive,
  archivingId = null,
  archiveError = null,
  onSetGender,
  settingGenderId = null,
  genderError = null,
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
          icon={<Pictogram name="crew" size="md" />}
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
              className="flex items-start gap-3 border-warning-line bg-warning-surface p-4 text-sm leading-6 text-text-secondary"
            >
              <Pictogram name="later" size="sm" className="mt-0.5 shrink-0 text-warning-text" />
              <p>
                <strong className="font-semibold text-warning-text">
                  Nobody can report attendance.
                </strong>{" "}
                Mark at least one person as a supervisor — they are who confirms how many of your
                crew turned up each day.
              </p>
            </Card>
          )}

          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-text">
              Your crew{" "}
              <span className="font-normal text-text-muted">({view.active.length})</span>
            </h2>
            <Button onClick={onAdd}>
              Add someone
            </Button>
          </div>

          <GenderGapNotice count={view.genderUnrecordedCount} />

          <ul className="grid list-none grid-cols-1 min-[420px]:grid-cols-2 gap-3 p-0">
            {view.active.map((row) => (
              <li key={row.membershipId}>
                <CrewCard
                  row={row}
                  pending={archivingId === row.membershipId}
                  error={
                    archiveError?.membershipId === row.membershipId ? archiveError.message : null
                  }
                  onArchive={() => onArchive(row.membershipId)}
                  onSetGender={(gender) => onSetGender(row.membershipId, gender)}
                  settingGender={settingGenderId === row.membershipId}
                  genderError={
                    genderError?.membershipId === row.membershipId ? genderError.message : null
                  }
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
              <ul className="mt-3 flex list-none flex-col gap-2.5 p-0">
                {view.archived.map((row) => (
                  <li
                    key={row.membershipId}
                    className="flex items-center gap-2.5 text-sm text-text-secondary"
                  >
                    <CrewAvatar name={row.name} status={avatarStatusFor(row)} size="sm" />
                    <span>
                      {row.name} <span className="text-text-muted">· {row.phoneMasked}</span>
                    </span>
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

/* ---------------------------------------------------------------------------
   The avatar: initials on a gradient circle, a status dot at the corner
   --------------------------------------------------------------------------- */

type CrewAvatarStatus = "verified" | "pending" | "archived";

/**
 * Derives the dot purely from fields `describeRoster` already publishes on
 * `CrewRow` — no new data, no invented membership state. `isArchived` first:
 * an archived person's documents stop mattering to the dot the moment they
 * are off the roster, even if they were verified before.
 */
function avatarStatusFor(row: CrewRow): CrewAvatarStatus {
  if (row.isArchived) return "archived";
  return row.documentsVerified ? "verified" : "pending";
}

const STATUS_STYLE: Record<CrewAvatarStatus, { readonly dot: string; readonly icon: PictogramName }> = {
  verified: { dot: "bg-success-text", icon: "yes" },
  // "later" rather than "time"/"now": the icon this codebase already uses for
  // an on-hold/not-yet state (earnings-panel.tsx's "On hold" plate), not a
  // duration-elapsed one.
  pending: { dot: "bg-warning-text", icon: "later" },
  archived: { dot: "bg-text-muted", icon: "no" },
};

/** First letter of up to the first two words, same slicing `ProfileMark` (customer app) uses. */
function initialsFor(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function CrewAvatar({
  name,
  status,
  size = "md",
}: {
  name: string;
  status: CrewAvatarStatus;
  size?: "sm" | "md";
}) {
  const style = STATUS_STYLE[status];
  const initials = initialsFor(name);

  return (
    <span className="relative inline-flex shrink-0">
      <span
        aria-hidden
        className={cn(
          "grid place-items-center rounded-full font-bold text-surface",
          size === "md" ? "h-14 w-14 text-base" : "h-9 w-9 text-xs",
          // Archived gets the same gradient formula in muted warm neutrals
          // rather than the vivid navy used for an active person — reinforcing
          // "not currently on the roster" through tokens already in
          // tokens.css, not a new colour.
          status === "archived"
            ? "bg-[linear-gradient(150deg,var(--color-warm-300)_0%,var(--color-warm-500)_100%)]"
            : "bg-[linear-gradient(150deg,var(--color-navy-300)_0%,var(--color-navy-500)_100%)]",
        )}
      >
        {initials || <Pictogram name="crew" size={size === "md" ? "md" : "sm"} />}
      </span>
      <span
        aria-hidden
        className={cn(
          "absolute -bottom-0.5 -right-0.5 grid place-items-center rounded-full ring-2 ring-surface",
          size === "md" ? "h-5 w-5" : "h-4 w-4",
          style.dot,
        )}
      >
        {/* Both badge sizes resolve to `xs`. The small variant asked for 10px,
            which is off the five-step scale — and never rendered at 10px
            anyway, because the old className lost its fight with the
            component's hard-coded default and drew at 24px, overflowing a
            16px dot. 12px is the nearest scale step and the first size this
            badge has actually had. */}
        <Pictogram name={style.icon} size="xs" className="text-surface" />
      </span>
    </span>
  );
}

/* ---------------------------------------------------------------------------
   One person, active
   --------------------------------------------------------------------------- */

function CrewCard({
  row,
  pending,
  error,
  onArchive,
  onSetGender,
  settingGender = false,
  genderError = null,
}: {
  row: CrewRow;
  onSetGender: (gender: CrewGender) => void;
  settingGender?: boolean;
  genderError?: string | null;
  pending: boolean;
  error: string | null;
  onArchive: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [editingGender, setEditingGender] = useState(false);
  const [draftGender, setDraftGender] = useState<CrewGender>(row.gender);

  return (
    <Card className="flex flex-col items-center gap-2.5 p-4 text-center">
      <CrewAvatar name={row.name} status={avatarStatusFor(row)} />

      <div className="min-w-0">
        <p className="text-sm font-semibold text-text">{row.name}</p>
        {/* Masked at the server. A roster read on a shared site phone is a
            contact export waiting to happen, and the Partner who needs the
            full number already has it. */}
        <p className="text-xs text-text-muted">{row.phoneMasked}</p>
      </div>

      <div className="flex flex-wrap justify-center gap-1.5">
        {row.isSupervisor ? <Badge tone="info">Supervisor</Badge> : null}
        <Badge tone={row.documentsVerified ? "success" : "neutral"}>
          {row.documentsVerified ? "Documents checked" : "Documents not checked"}
        </Badge>
        {/* Only the gap is called out. A recorded gender is not news and a badge for it on
            every card would bury the one row that needs attention. */}
        {row.gender === "" ? null : (
          <Badge tone="neutral">{crewGenderLabel(row.gender)}</Badge>
        )}
      </div>

      {/* Offered only while it is missing. Once recorded it is shared with every agency this
          worker is on, so this screen cannot change it — the badge above states it instead. */}
      {row.gender === "" ? (
        <button
          type="button"
          onClick={() => {
            setDraftGender("");
            setEditingGender(true);
          }}
          className="min-h-11 rounded-control border border-dashed border-warning-line px-3 text-xs font-bold text-warning-text hover:bg-warning-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          Set man or woman
        </button>
      ) : null}

      {row.skillCodes.length > 0 ? (
        <p className="text-xs text-text-secondary">{row.skillCodes.join(" · ")}</p>
      ) : null}

      {error ? (
        <p role="alert" className="text-xs text-danger-text">
          {error}
        </p>
      ) : null}

      <Button
        variant="ghost"
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

      <Sheet
        open={editingGender}
        onOpenChange={setEditingGender}
        title={row.name}
        description="Recorded once, shared with every agency"
      >
        <div className="flex flex-col gap-4 px-4 py-4">
          <CrewGenderField value={draftGender} onChange={setDraftGender} disabled={settingGender} />

          {genderError === null ? null : (
            <p className="rounded-card border border-danger-line bg-danger-surface px-3 py-2.5 text-sm leading-5 text-danger-text">
              {genderError}
            </p>
          )}

          <Button
            loading={settingGender}
            loadingLabel="Saving"
            disabled={draftGender === ""}
            onClick={() => {
              onSetGender(draftGender);
              setEditingGender(false);
            }}
          >
            Save
          </Button>
        </div>
      </Sheet>
    </Card>
  );
}


/**
 * The one roster gap with a consequence a Partner cannot see coming.
 *
 * Customers booking event staff ask for a number of men and a number of women. A worker with
 * nothing recorded fills the headcount and no gendered slot, so a roster of blanks passes dispatch
 * — which is deliberately forgiving about unknowns — and is then refused at accept, or at
 * assignment on the day.
 *
 * Stated as a count with the consequence attached rather than as a red banner. Nothing is broken:
 * the Partner keeps every job that does not ask for a mix, and this is work they are quietly
 * missing out on rather than a fault to fix before they can continue.
 */
function GenderGapNotice({ count }: { readonly count: number }) {
  if (count === 0) return null;

  return (
    <p className="rounded-card border border-warning-line bg-warning-surface px-3.5 py-3 text-sm leading-6 text-warning-text">
      <span className="font-bold">
        {count === 1
          ? "One person has no man/woman recorded."
          : `${count} people have no man/woman recorded.`}
      </span>{" "}
      Customers booking event staff ask for a number of men and a number of women, and Vsolve can
      only count someone toward that once it is set. Open anyone below to add it.
    </p>
  );
}
