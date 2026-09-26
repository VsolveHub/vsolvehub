"use client";

import { Badge, Button, Card, ErrorState, Field, Input, Select, Textarea } from "@vsolve/ui";
import { useState } from "react";

import { isUuid, maskId } from "@/features/shared/identifiers";
import {
  COMMANDS,
  NOTE_MAX_LENGTH,
  REASONS,
  dispatchFailure,
  isNoteAcceptable,
  type DispatchCommand,
  type DispatchReason,
} from "../model/commands";
import { useDispatchCommand, type DispatchOutcome } from "../queries";

/**
 * The three human overrides on autonomous dispatch.
 *
 * ## Nothing here is offered without a version to guard it
 *
 * The whole panel is disabled until a dispatch explanation has loaded, because
 * `expected_unit_version` comes from that read and nowhere else. Offering the
 * commands first and asking for the version afterwards is how a guard becomes a
 * form field somebody fills in from memory.
 *
 * ## Confirm before, because none of these have an undo
 *
 * The operator picks a command, reads what it does to somebody's day in plain
 * words, then presses a second, differently worded button. Revoke takes an offer
 * away from a Partner who may already be driving; release can unwind a whole
 * Booking Group. Neither has a reversing command in this console or any other.
 *
 * ## Offers and reservations are pasted, and the screen says why
 *
 * The contract publishes no Operations read that lists a unit's offers or
 * reservations — the explanation carries attempts, not offer ids. So those two
 * commands take the id from the case the operator is working, and this screen
 * says so rather than implying a lookup exists.
 */

const ORDER: DispatchCommand[] = ["revoke", "release", "recover"];

function OutcomeCard({
  command,
  outcome,
}: {
  command: DispatchCommand;
  outcome: DispatchOutcome;
}) {
  const status = "status" in outcome ? String(outcome.status) : "";
  // Only the recover projection carries the live offer, and it is the one useful
  // thing to have next: a revoke needs an offer id this console cannot look up.
  const liveOfferId =
    "live_offer_id" in outcome && typeof outcome.live_offer_id === "string"
      ? outcome.live_offer_id
      : null;

  return (
    <Card className="mt-5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-bold text-text">Done — this is where it stands now</h3>
        {status ? <Badge tone="info">{status.toLowerCase().replace(/_/g, " ")}</Badge> : null}
      </div>

      <p className="mt-1 text-sm text-text-secondary">
        Reference <span data-numeric>{maskId(outcome.id)}</span>
      </p>

      {"version" in outcome ? (
        <p className="mt-1 text-sm text-text-secondary">
          The visit is now at version <span data-numeric>{outcome.version}</span>, in{" "}
          {String(outcome.group_status).toLowerCase().replace(/_/g, " ")}.
        </p>
      ) : null}

      {liveOfferId ? (
        <p className="mt-3 text-sm text-text-secondary">
          Live offer <span data-numeric>{liveOfferId}</span> — copy this if the next
          step is to revoke it.
        </p>
      ) : null}

      <p className="mt-3 text-sm leading-6 text-text-secondary">
        {command === "recover"
          ? "Recovery ran. It does not force an outcome, so re-read the visit above to see whether anything moved."
          : "Dispatch will offer this visit again on its own. Re-read the visit above to see where it got to."}
      </p>
    </Card>
  );
}

export function DispatchCommands({
  unitId,
  unitVersion,
}: {
  /** The unit whose explanation is on screen, or null before one is loaded. */
  unitId: string | null;
  /** The version that explanation published, or null before it has loaded. */
  unitVersion: number | null;
}) {
  const [command, setCommand] = useState<DispatchCommand | null>(null);
  const [targetId, setTargetId] = useState("");
  const [reason, setReason] = useState<DispatchReason | "">("");
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const run = useDispatchCommand(command ?? "recover");

  const ready = unitId !== null && unitVersion !== null;
  // Recover is addressed to the unit already on screen, so there is nothing to
  // paste and nothing to mistype.
  const target = command === "recover" ? (unitId ?? "") : targetId;
  const targetError = !isUuid(target)
    ? `Paste the ${COMMANDS[command ?? "recover"].targetLabel.toLowerCase()}.`
    : undefined;
  const reasonError = reason === "" ? "Choose why you are doing this." : undefined;
  const noteError = !isNoteAcceptable(note)
    ? `Keep the note under ${NOTE_MAX_LENGTH} characters.`
    : undefined;
  const blocked = Boolean(targetError || reasonError || noteError);

  const failure = dispatchFailure(run.error);

  function choose(next: DispatchCommand) {
    setCommand(next);
    setTargetId("");
    setReason("");
    setNote("");
    setConfirming(false);
    setSubmitted(false);
    run.reset();
  }

  /** Any edit invalidates a read-back that described the previous input. */
  function edited() {
    setConfirming(false);
    if (run.isError || run.isSuccess) run.reset();
  }

  if (!ready) {
    return (
      <Card className="p-5">
        <h3 className="text-base font-bold text-text">Recovery commands</h3>
        <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
          Load a visit first. Every command here is guarded on the version that
          visit publishes, so there is nothing safe to offer until it has been
          read.
        </p>
      </Card>
    );
  }

  return (
    <div>
      <Card className="p-5">
        <h3 className="text-base font-bold text-text">Recovery commands</h3>
        <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
          All three are recorded against your account with the reason you give,
          and are guarded on version{" "}
          <span data-numeric>{unitVersion}</span> — the version you are looking
          at. If the visit moves in the meantime the command is refused rather
          than applied to a state you did not read.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {ORDER.map((entry) => (
            <Button
              key={entry}
              variant={command === entry ? "primary" : "outline"}
              onClick={() => choose(entry)}
            >
              {COMMANDS[entry].label}
            </Button>
          ))}
        </div>

        {command ? (
          <div className="mt-5">
            <p className="max-w-prose text-sm leading-6 text-text-secondary">
              {COMMANDS[command].consequence}
            </p>

            {command === "recover" ? (
              <p className="mt-3 text-sm text-text-secondary">
                Addressed to the visit above — <span data-numeric>{maskId(unitId)}</span>.
              </p>
            ) : (
              <Field
                className="mt-4"
                label={COMMANDS[command].targetLabel}
                description="Taken from the case you are working. This console publishes no search for offers or reservations."
                required
                error={submitted ? targetError : undefined}
              >
                <Input
                  value={targetId}
                  spellCheck={false}
                  autoComplete="off"
                  onChange={(event) => {
                    setTargetId(event.target.value);
                    edited();
                  }}
                />
              </Field>
            )}

            <Field
              className="mt-4"
              label="Why"
              description="Kept against this visit for good, and read later to understand what Operations did."
              required
              error={submitted ? reasonError : undefined}
            >
              <Select
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value as DispatchReason);
                  edited();
                }}
              >
                <option value="">Choose a reason</option>
                {REASONS.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </Select>
            </Field>

            {reason !== "" ? (
              <p className="mt-1 text-sm text-text-muted">
                {REASONS.find((entry) => entry.value === reason)?.when}
              </p>
            ) : null}

            <Field
              className="mt-4"
              label="Note"
              description={`Optional. Anything the reason does not cover. Up to ${NOTE_MAX_LENGTH} characters.`}
              error={noteError}
            >
              <Textarea
                rows={3}
                value={note}
                maxLength={NOTE_MAX_LENGTH}
                onChange={(event) => {
                  setNote(event.target.value);
                  edited();
                }}
              />
            </Field>

            {!confirming ? (
              <Button
                className="mt-4"
                variant="outline"
                onClick={() => {
                  setSubmitted(true);
                  if (!blocked) setConfirming(true);
                }}
              >
                Review this command
              </Button>
            ) : null}
          </div>
        ) : null}
      </Card>

      {command && confirming ? (
        <Card className="mt-5 border-danger-line bg-danger-surface p-5">
          <h3 className="text-base font-bold text-danger-text">
            Confirm — there is no command that undoes this
          </h3>

          <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_minmax(0,1fr)]">
            <dt className="text-text-muted">Command</dt>
            <dd className="text-text">{COMMANDS[command].label}</dd>
            <dt className="text-text-muted">{COMMANDS[command].targetLabel}</dt>
            <dd className="text-text" data-numeric>
              {maskId(target)}
            </dd>
            <dt className="text-text-muted">Guarded on version</dt>
            <dd className="text-text" data-numeric>
              {unitVersion}
            </dd>
            <dt className="text-text-muted">Reason</dt>
            <dd className="text-text">
              {REASONS.find((entry) => entry.value === reason)?.label}
            </dd>
            {note.trim() ? (
              <>
                <dt className="text-text-muted">Note</dt>
                <dd className="text-text">{note.trim()}</dd>
              </>
            ) : null}
          </dl>

          <p className="mt-3 max-w-prose text-sm leading-6 text-text-secondary">
            {COMMANDS[command].consequence}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="danger"
              loading={run.isPending}
              loadingLabel="Sending the command"
              onClick={() =>
                run.mutate(
                  {
                    targetId: target,
                    unitId: unitId as string,
                    expectedUnitVersion: unitVersion as number,
                    reason: reason as DispatchReason,
                    note,
                  },
                  { onSuccess: () => setConfirming(false) },
                )
              }
            >
              {COMMANDS[command].label}
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Go back
            </Button>
          </div>
        </Card>
      ) : null}

      {failure ? (
        <ErrorState
          className="mt-5"
          severity={failure.severity === "warning" ? "warning" : "error"}
          title={failure.title}
          message={failure.message}
        />
      ) : null}

      {run.isSuccess && command ? <OutcomeCard command={command} outcome={run.data} /> : null}
    </div>
  );
}
