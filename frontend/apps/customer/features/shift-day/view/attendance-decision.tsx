"use client";

import {
  MAXIMUM_DISPUTED_WORKERS,
  SHORTFALL_CHOICES,
  canSubmitAttendanceDispute,
  isStageTransitionNotAllowed,
  type DisputedWorker,
  type ShortfallChoice,
} from "@vsolve/query";
import { Badge, Button, ConfirmAction, ErrorState, Field, Input, Textarea } from "@vsolve/ui";
import { useState } from "react";

import { AccessRefusal } from "@/features/access/view/access-refusal";
import type { ShiftDayView } from "../adapters";
import { useRespondToAttendance } from "../queries";

/**
 * Confirm or dispute today's count — `M2-FE-510`.
 *
 * ## Confirming is one tap, and the tap count is the requirement
 *
 * The supervisor has already recorded `n of m`. The Customer's whole job is to
 * agree or not. On a full day that is a single button and nothing else: no
 * form, no per-worker list, no confirmation dialog. `SIM-02` asks for one
 * action and this is it.
 *
 * ## Per-worker detail exists in exactly one place, and it is not the happy path
 *
 * C4 has **no per-worker check-in and no per-worker check-out**, deliberately:
 * the workers mostly do not carry smartphones, the supervisor does, and a
 * per-worker attendance product would be a device dependency this market cannot
 * meet wearing the clothes of rigour. So a Customer form that routinely asked
 * "who was here?" would be inventing a record the server does not hold.
 *
 * On a **dispute** the same question is legitimate, because what is being
 * captured is not an attendance record at all — it is the Customer's account of
 * who they say was missing, evidence in a case that a human decides. Nothing
 * derives a count from it, on the server or here.
 *
 * ## A shortfall is still one tap, three times
 *
 * When workers are missing the server requires a choice, so the confirm becomes
 * three buttons rather than a button plus a form. Each is one tap. The sentence
 * above them is the one that matters: **the day settles at the present workers'
 * rate whichever is chosen** — the choice decides what happens to the missing
 * worker-days, not to the money for the ones who came.
 *
 * `ADD_DAY` records a **request** and the screen says so. The extra day is the
 * professional's to offer through the amendment engine; appending a shift-day to
 * somebody's week without their agreement would be the platform committing a
 * vendor's labour, and promising it here would be this screen doing the same.
 */

export interface AttendanceDecisionProps {
  day: ShiftDayView;
  onDone: () => void;
}

const SHORTFALL_CHOICE_COPY: Record<
  ShortfallChoice,
  { label: string; consequence: string }
> = {
  CONTINUE_SHORT: {
    label: "Carry on short",
    consequence:
      "Today settles for the people who came, and tomorrow is unchanged. Nothing is owed for the ones who did not.",
  },
  ADD_DAY: {
    label: "Ask for an extra day",
    consequence:
      "We record that you have asked for the missing time to be made up. It is the professional's to offer, at the published rate, and they have to agree to it — so this is a request and not a booking.",
  },
  CANCEL_SHORTFALL: {
    label: "Cancel the missing workers",
    consequence:
      "The missing worker-days are cancelled and nothing further is owed for them by either side. Today still settles for the people who came.",
  },
};

export function AttendanceDecision({ day, onDone }: AttendanceDecisionProps) {
  const respond = useRespondToAttendance();
  const [showDispute, setShowDispute] = useState(false);

  if (!day.canRespond) return null;

  const present = day.presentCount;
  const expected = day.expectedCount;

  return (
    <section aria-labelledby="attendance-decision-heading" className="mt-6">
      <h2 id="attendance-decision-heading" className="text-lg font-semibold text-text">
        Is this right?
      </h2>

      {/* The count, from the supervisor, as the two published numbers. Nothing
          here subtracts one from the other — `shortfallCount` is its own field. */}
      <div className="mt-3 rounded-card border border-line bg-surface p-4">
        <p className="text-base text-text">
          The supervisor recorded{" "}
          <strong className="font-semibold">
            {present ?? 0} of {expected ?? 0} present
          </strong>{" "}
          {day.scheduledOn === null ? "on this day" : `on ${day.scheduledOn}`}.
        </p>
        {day.mustChooseShortfall ? (
          <p className="mt-2 max-w-prose text-sm leading-6 text-text-secondary">
            {day.shortfallCount === 1
              ? "One of the workers you booked did not come."
              : `${day.shortfallCount} of the workers you booked did not come.`}{" "}
            Today settles at the day rate for the people who{" "}
            <strong className="font-semibold">did</strong> come, whichever of these you
            choose — the choice is about the missing days, not about their money.
          </p>
        ) : (
          <p className="mt-2 max-w-prose text-sm leading-6 text-text-secondary">
            Everybody you booked was here. Confirming records that and settles the
            day at the published rate.
          </p>
        )}
      </div>

      {day.mustChooseShortfall ? (
        <ShortfallChoices day={day} respond={respond} onDone={onDone} />
      ) : (
        <div className="mt-3">
          <Button
            loading={respond.isPending}
            loadingLabel="Confirming"
            onClick={() =>
              respond.mutate(
                {
                  engagementId: day.engagementId,
                  stageId: day.stageId,
                  response: "CONFIRM",
                  shortfallChoice: "",
                  workerDetails: [],
                  note: "",
                },
                { onSuccess: onDone },
              )
            }
          >
            Yes — that is right
          </Button>
        </div>
      )}

      {/* The dispute lives behind a disclosure, not beside the confirm. It is the
          exception, and putting a worker-by-worker form on screen for every
          ordinary evening is what turns a one-tap product into a form. */}
      <div className="mt-4 rounded-card border border-danger-line bg-surface p-4">
        <h3 className="font-semibold text-text">That is not what happened</h3>
        <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
          Disputing the count stops this day being approved automatically, leaves
          the amount unconfirmed and asks us to look into it. It is the only place
          you can tell us about individual workers — we do not ask you to check
          people in and out, and we are not going to start now.
        </p>
        {showDispute ? (
          <DisputeForm day={day} respond={respond} onDone={onDone} />
        ) : (
          <div className="mt-3">
            <Button variant="outline" onClick={() => setShowDispute(true)}>
              Dispute this count
            </Button>
          </div>
        )}
      </div>

      <ResponseRefusal error={respond.error} onRefresh={onDone} />
    </section>
  );
}

/* --------------------------------------------------------------------------
   The shortfall — three taps, three sentences
   -------------------------------------------------------------------------- */

function ShortfallChoices({
  day,
  respond,
  onDone,
}: {
  day: ShiftDayView;
  respond: ReturnType<typeof useRespondToAttendance>;
  onDone: () => void;
}) {
  const [confirming, setConfirming] = useState<ShortfallChoice | null>(null);

  return (
    <div className="mt-3 flex flex-col gap-2">
      {SHORTFALL_CHOICES.map((choice) => {
        const copy = SHORTFALL_CHOICE_COPY[choice];
        return (
          <div key={choice} className="rounded-card border border-line bg-surface p-4">
            <h3 className="font-semibold text-text">{copy.label}</h3>
            <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
              {copy.consequence}
            </p>
            <div className="mt-3">
              <Button
                variant="outline"
                disabled={respond.isPending}
                onClick={() => setConfirming(choice)}
              >
                {copy.label}
              </Button>
            </div>
          </div>
        );
      })}

      <ConfirmAction
        open={confirming !== null}
        onOpenChange={(open) => setConfirming(open ? confirming : null)}
        title={confirming === null ? "" : `${SHORTFALL_CHOICE_COPY[confirming].label}?`}
        consequence={
          confirming === null
            ? ""
            : `${SHORTFALL_CHOICE_COPY[confirming].consequence} This also confirms the supervisor's count of ${day.presentCount ?? 0} of ${day.expectedCount ?? 0}, which cannot be undone from this screen.`
        }
        confirmLabel="Confirm the day"
        pending={respond.isPending}
        onConfirm={() => {
          if (confirming === null) return;
          respond.mutate(
            {
              engagementId: day.engagementId,
              stageId: day.stageId,
              response: "CONFIRM",
              shortfallChoice: confirming,
              workerDetails: [],
              note: "",
            },
            {
              onSuccess: () => {
                setConfirming(null);
                onDone();
              },
            },
          );
        }}
      />
    </div>
  );
}

/* --------------------------------------------------------------------------
   The dispute — the one place per-worker detail is collected
   -------------------------------------------------------------------------- */

interface DisputeLine extends DisputedWorker {
  /** Local only. The wire shape carries no id and none is invented for it. */
  rowKey: string;
}

function newLine(index: number): DisputeLine {
  return { rowKey: `line-${index}-${Date.now()}`, name: "", was_present: false, note: "" };
}

function DisputeForm({
  day,
  respond,
  onDone,
}: {
  day: ShiftDayView;
  respond: ReturnType<typeof useRespondToAttendance>;
  onDone: () => void;
}) {
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<readonly DisputeLine[]>([]);
  const [confirming, setConfirming] = useState(false);

  const workers: readonly DisputedWorker[] = lines.map((line) => ({
    name: line.name.trim(),
    was_present: line.was_present,
    note: line.note.trim(),
  }));
  const canSubmit = canSubmitAttendanceDispute(workers, note);

  return (
    <div className="mt-3">
      <Field
        label="What actually happened"
        description="This is what we and the professional read first."
        required
      >
        <Textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Only two people came at nine; the third arrived after lunch."
        />
      </Field>

      <div className="mt-4">
        <h4 className="text-sm font-semibold text-text">
          Name anybody you say was not here
        </h4>
        <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
          Optional, and only useful if you know who. This is your account of the
          day — we do not turn it into a count, and it does not replace the
          supervisor&apos;s number. Somebody decides between the two.
        </p>

        {lines.map((line, index) => (
          <div key={line.rowKey} className="mt-3 rounded-card border border-line p-3">
            <Field label="Name">
              <Input
                value={line.name}
                onChange={(event) =>
                  setLines((current) =>
                    current.map((entry, position) =>
                      position === index ? { ...entry, name: event.target.value } : entry,
                    ),
                  )
                }
                placeholder="The name on the crew list"
              />
            </Field>
            <Field label="What you say happened" className="mt-2">
              <Input
                value={line.note}
                onChange={(event) =>
                  setLines((current) =>
                    current.map((entry, position) =>
                      position === index ? { ...entry, note: event.target.value } : entry,
                    ),
                  )
                }
                placeholder="Never turned up"
              />
            </Field>
            <div className="mt-2">
              <Button
                variant="ghost"
                onClick={() =>
                  setLines((current) => current.filter((_entry, position) => position !== index))
                }
              >
                Remove this line
              </Button>
            </div>
          </div>
        ))}

        {lines.length < MAXIMUM_DISPUTED_WORKERS ? (
          <div className="mt-3">
            <Button
              variant="ghost"
              onClick={() => setLines((current) => [...current, newLine(current.length)])}
            >
              Add somebody
            </Button>
          </div>
        ) : null}
      </div>

      <div className="mt-4">
        <Button
          variant="danger"
          disabled={!canSubmit || respond.isPending}
          onClick={() => setConfirming(true)}
        >
          Dispute this count
        </Button>
      </div>
      {!canSubmit ? (
        <p className="mt-2 text-sm text-text-secondary">
          Tell us what happened first — a dispute with nothing in it tells us only
          what the status already says.
        </p>
      ) : null}

      <ConfirmAction
        open={confirming}
        onOpenChange={setConfirming}
        title="Dispute the day's attendance?"
        destructive
        consequence={
          <>
            This day will <strong className="font-semibold">not</strong> be approved
            automatically and the amount stays unconfirmed while we look into it.
            Vsolve is not holding your wage money, so nothing is held back — what
            stops is the record agreeing, not a payment. The rest of the booking
            carries on.
          </>
        }
        confirmLabel="Yes, dispute it"
        pending={respond.isPending}
        onConfirm={() =>
          respond.mutate(
            {
              engagementId: day.engagementId,
              stageId: day.stageId,
              response: "DISPUTE",
              shortfallChoice: "",
              workerDetails: workers.filter((worker) => worker.name !== ""),
              note: note.trim(),
            },
            {
              onSuccess: () => {
                setConfirming(false);
                onDone();
              },
            },
          )
        }
      />
    </div>
  );
}

/* --------------------------------------------------------------------------
   Refusals
   -------------------------------------------------------------------------- */

/**
 * The one refusal a well-formed response can meet, and it is always a re-read.
 *
 * `409 m2_stage_transition_not_allowed` covers three facts — the supervisor has
 * not recorded the day, the Customer already answered, or a shortfall arrived
 * without a choice — and none of them is fixed by sending the same command
 * again. All three are fixed by looking at what is actually there.
 */
function ResponseRefusal({ error, onRefresh }: { error: unknown; onRefresh: () => void }) {
  if (error === null || error === undefined) return null;

  if (isStageTransitionNotAllowed(error)) {
    return (
      <div className="mt-4">
        <ErrorState
          title="This day has moved on"
          message="Either the supervisor's record changed, or this day has already been answered. We have re-read it — what you see now is what is actually there."
          severity="warning"
          actionLabel="Refresh"
          onAction={onRefresh}
          inline
        />
      </div>
    );
  }

  return (
    <div className="mt-4">
      <AccessRefusal error={error} attempting="answer this day" />
    </div>
  );
}

/** The answered states, so the panel never leaves an evening looking undecided. */
export function AttendanceOutcome({ day }: { day: ShiftDayView }) {
  if (day.attendance === "you_confirmed") {
    return (
      <div className="mt-3 rounded-card border border-success-line bg-success-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="font-semibold text-text">You confirmed this day</h3>
          <Badge tone="success">Agreed</Badge>
        </div>
        <p className="mt-1 max-w-prose text-sm leading-6 text-text">
          {day.presentCount ?? 0} of {day.expectedCount ?? 0} present, at the
          published day rate.
        </p>
      </div>
    );
  }

  if (day.attendance === "you_disputed") {
    return (
      <div className="mt-3 rounded-card border border-danger-line bg-danger-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="font-semibold text-text">You disputed this day</h3>
          <Badge tone="danger">With us</Badge>
        </div>
        <p className="mt-1 max-w-prose text-sm leading-6 text-text">
          We are looking into it. This day is not approved automatically and the
          amount is not agreed. The rest of the booking carries on.
        </p>
        {day.disputeNote !== null ? (
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-text-secondary">
            You told us: {day.disputeNote}
          </p>
        ) : null}
      </div>
    );
  }

  return null;
}
