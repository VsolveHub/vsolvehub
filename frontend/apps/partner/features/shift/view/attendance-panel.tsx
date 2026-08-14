"use client";

import { Badge, Button, Card, ErrorState, Field, Input } from "@vsolve/ui";
import {
  attendanceCeiling,
  attendanceIsDisputed,
  bookedHeadcount,
  checkoutIsMissing,
  describeError,
  isStageTransitionNotAllowed,
} from "@vsolve/query";
import { ClipboardCheck, Minus, Plus } from "lucide-react";
import { useState } from "react";

import { timeAgo } from "@/lib/format";

import { useRecordShiftAttendance, type ShiftCommandScope, type ShiftDay } from "../queries";

/**
 * "n of m present today", in one action — `M2-FE-505`.
 *
 * ## There is no per-worker roll call and there must not be one
 *
 * `SIM-02` refuses per-worker check-in and check-out with offline sync outright,
 * and the reason is not squeamishness about scope: the workers mostly do not
 * carry smartphones, the supervisor does, and a per-worker attendance product
 * would be a device dependency this market cannot meet wearing the clothes of
 * rigour. Per-worker detail is captured in exactly one place — a **Customer's**
 * dispute — and it is captured by the Customer, not here.
 *
 * So this panel has one number in it. Anybody adding a name-by-name checklist
 * later is undoing a decision, not filling a gap.
 *
 * ## The count is the evidence
 *
 * Recording it hands the day to the Customer through the ordinary spine and
 * starts the same review clock every other stage runs on. There is no second
 * review mechanism for A3, which is why this screen has no separate "submit"
 * step after the count.
 *
 * ## A missing check-out is not a dispute
 *
 * `shift_ended_at` is optional and its absence is the point: the day settles at
 * the agreed shift length and is **flagged for review**, not disputed. A
 * supervisor whose crew left at six and who closed the day at nine has done
 * nothing wrong, and the amount never depended on the end time — only overtime
 * does, and that needs the Customer's approval either way. The copy says exactly
 * that, because a supervisor who reads the flag as an accusation will start
 * inventing end times.
 *
 * ## The ceiling is the booked crew, not the crew who came
 *
 * `confirm_attendance` refuses "a count above the booked crew — an extra worker
 * is a scope amendment at the published rate, not a bigger number in an
 * attendance box". Where the server has not yet published the booked headcount
 * (`attendance` is null until a command touches the day) the control is an
 * unbounded number entry rather than a stepper against a ceiling this client
 * would have had to invent.
 */

export interface AttendancePanelProps {
  readonly day: ShiftDay;
  readonly scope: ShiftCommandScope;
  /** False when the grant no longer carries `attendance.confirm`. */
  readonly canConfirm: boolean;
}

export function AttendancePanel({ day, scope, canConfirm }: AttendancePanelProps) {
  const record = useRecordShiftAttendance(scope);
  const attendance = day.attendance;
  const ceiling = attendanceCeiling(day);
  const headcount = bookedHeadcount(day);

  const [present, setPresent] = useState<string>(
    attendance?.present_count != null ? String(attendance.present_count) : "",
  );
  const [endedAt, setEndedAt] = useState("");

  const arrived = attendance?.arrival_confirmed_at != null;
  const answered =
    attendance?.status === "CUSTOMER_CONFIRMED" || attendance?.status === "DISPUTED";

  const parsed = present.trim() === "" ? null : Number.parseInt(present, 10);
  const valid =
    parsed !== null &&
    Number.isInteger(parsed) &&
    parsed >= 0 &&
    (ceiling === null || parsed <= ceiling);

  return (
    <Card className="flex flex-col gap-3 p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold text-text">
          <ClipboardCheck size={18} aria-hidden />
          Today&rsquo;s crew count
        </h2>
        {attendance === null ? null : <AttendanceBadge day={day} />}
      </header>

      <RecordedLine day={day} />

      {!arrived ? (
        <p className="text-sm leading-6 text-text-secondary">
          Record the arrival above first. The count closes the day; it cannot be recorded before the
          day has started.
        </p>
      ) : answered ? (
        <p className="text-sm leading-6 text-text-secondary">
          {attendanceIsDisputed(day)
            ? "The customer disputed this count. Vsolve is looking at it, and the day stays unsettled until it is resolved. Do not record it again — add anything that supports your account as evidence on the booking instead."
            : "The customer has agreed this count. It cannot be changed now."}
        </p>
      ) : !canConfirm ? (
        <p className="text-sm leading-6 text-text-secondary">
          Your account is not approved to record attendance at the moment. Contact support before
          the customer&rsquo;s review window closes on this day.
        </p>
      ) : (
        <>
          <Field
            label="How many of your crew were here today?"
            description={
              headcount === null
                ? "One number for the whole day. Vsolve does not ask you to check people in and out one by one."
                : `Out of the ${headcount} ${headcount === 1 ? "worker" : "workers"} this day was booked for. One number for the whole day — Vsolve does not ask you to check people in and out one by one.`
            }
            error={
              present.trim() !== "" && !valid
                ? ceiling === null
                  ? "Enter a whole number of workers."
                  : `Enter a number between 0 and ${ceiling}. More workers than were booked is a change request at the published rate.`
                : undefined
            }
          >
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                aria-label="One fewer"
                disabled={parsed === null || parsed <= 0}
                onClick={() => setPresent(String(Math.max((parsed ?? 0) - 1, 0)))}
                icon={<Minus size={16} aria-hidden />}
              >
                <span className="sr-only">One fewer</span>
              </Button>
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                {...(ceiling === null ? {} : { max: ceiling })}
                value={present}
                onChange={(event) => setPresent(event.target.value)}
                className="w-24 text-center"
              />
              <Button
                type="button"
                variant="secondary"
                aria-label="One more"
                disabled={ceiling !== null && parsed !== null && parsed >= ceiling}
                onClick={() => setPresent(String((parsed ?? 0) + 1))}
                icon={<Plus size={16} aria-hidden />}
              >
                <span className="sr-only">One more</span>
              </Button>
            </div>
          </Field>

          <Field
            label="When did the shift end? (optional)"
            description="Leave it blank if you did not note it. Vsolve then settles the day at the agreed shift length and marks it for review — that is not a dispute and nothing is held back because of it."
          >
            <Input
              type="datetime-local"
              value={endedAt}
              onChange={(event) => setEndedAt(event.target.value)}
            />
          </Field>

          <Button
            type="button"
            onClick={() =>
              record.mutate({
                presentCount: parsed ?? 0,
                shiftEndedAt:
                  endedAt.trim() === "" ? null : new Date(endedAt).toISOString(),
              })
            }
            loading={record.isPending}
            loadingLabel="Recording"
            disabled={!valid || record.isPending}
          >
            {ceiling === null
              ? `Record ${parsed ?? 0} present`
              : `Record ${parsed ?? 0} of ${ceiling} present`}
          </Button>

          <p className="text-xs leading-5 text-text-muted">
            This is what goes to the customer for the day. They confirm it or dispute it from their
            side, and the day is settled at the rate for the people who were here — not per job.
          </p>
        </>
      )}

      {record.isError ? <AttendanceFailure error={record.error} /> : null}
    </Card>
  );
}

function AttendanceBadge({ day }: { readonly day: ShiftDay }) {
  switch (day.attendance?.status) {
    case "SUPERVISOR_CONFIRMED":
      return <Badge tone="info">With the customer</Badge>;
    case "CUSTOMER_CONFIRMED":
      return <Badge tone="success">Agreed</Badge>;
    case "DISPUTED":
      return <Badge tone="warning">Disputed</Badge>;
    default:
      return <Badge tone="neutral">Nothing recorded</Badge>;
  }
}

/**
 * What is already on the record, including the flag.
 *
 * The flag is rendered as the neutral fact it is. `flagged_for_review` with
 * `checkout_missing` means Vsolve has noted there was no end time so that
 * somebody can answer a question about it later — it is not a mark against the
 * supervisor and it holds nothing back.
 */
function RecordedLine({ day }: { readonly day: ShiftDay }) {
  const attendance = day.attendance;
  if (attendance === null || attendance.present_count === null) return null;

  return (
    <div className="flex flex-col gap-1 rounded-control border border-line bg-surface-sunken px-3 py-2">
      <p className="text-sm font-semibold text-text">
        {attendance.present_count} of {attendance.expected_count} present
        {attendance.confirmed_at === null ? "" : ` · recorded ${timeAgo(attendance.confirmed_at)}`}
      </p>
      {checkoutIsMissing(attendance) ? (
        <p className="text-xs leading-5 text-text-muted">
          No end time was recorded, so this day settles at the agreed shift length and is marked for
          review. That is a note on the record, not a dispute, and nothing is held back because of
          it.
        </p>
      ) : attendance.shift_ended_at === null ? null : (
        <p className="text-xs leading-5 text-text-muted">
          Shift ended {timeAgo(attendance.shift_ended_at)}.
        </p>
      )}
      {attendance.status === "DISPUTED" && attendance.dispute_note.trim() !== "" ? (
        <p className="whitespace-pre-wrap text-xs leading-5 text-warning-text">
          What the customer said: {attendance.dispute_note}
        </p>
      ) : null}
    </div>
  );
}

function AttendanceFailure({ error }: { readonly error: unknown }) {
  const presentation = describeError(error, "mutation");

  if (isStageTransitionNotAllowed(error)) {
    return (
      <ErrorState
        title="This day moved"
        message="Vsolve refused the count: either the arrival is not recorded, the customer has already answered, or the number was above the booked crew. Reload to see where the day got to."
        severity="warning"
        reference={presentation.reference}
      />
    );
  }

  return (
    <ErrorState
      title={presentation.title}
      message={presentation.message}
      severity={presentation.severity}
      reference={presentation.reference}
    />
  );
}
