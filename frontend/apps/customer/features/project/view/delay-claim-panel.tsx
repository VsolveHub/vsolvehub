"use client";

import { useServerCountdown } from "@vsolve/query";
import { Badge, Button, ConfirmAction, ErrorState, Field, Textarea } from "@vsolve/ui";
import { useState } from "react";

import { AccessRefusal } from "@/features/access/view/access-refusal";
import { isDelayClaimNotActionable } from "@vsolve/query";
import type { DelayClaimView } from "../adapters";
import { useDecideDelayClaim } from "../queries";

/**
 * The professional says something held the work up, and asks for the days back —
 * `M2-BE-544`, the Customer's half.
 *
 * ## Why this screen exists at all
 *
 * The command and the record were both published to the Customer and no wave
 * owned the surface. That is not a cosmetic gap, because of how the claim ends
 * when nobody answers: `sweep_delay_claims` **expires** it and the agreed dates
 * stand. Silence is a refusal on purpose — otherwise a professional could move
 * somebody's schedule by filing on a Friday afternoon — but a refusal-by-silence
 * is only a protection if the Customer was actually asked. Without a screen it is
 * a deadline running against somebody who was never shown it, and the honest
 * claims expire beside the opportunistic ones.
 *
 * ## No money, in either direction, and none may be added
 *
 * There is no amount on the request and none on the record. A delay that costs
 * money is **extra work**, extra work is a scope amendment the Customer accepts
 * and pays for, and a single record that could carry both would let "the site was
 * locked" arrive as a bill nobody agreed to. So this panel names no figure, and
 * says out loud that answering either way costs nothing — because the first
 * question anybody reads a request for days with is "what is this going to cost
 * me".
 *
 * ## Accepting moves more than the milestone it is about
 *
 * `_shift_schedule_from` moves this milestone **and every one after it**, because
 * a project is a sequence: a week lost on the first fix is a week lost on
 * everything that follows. The consequence is stated before the tap, not after.
 * A milestone that never had a date is left without one rather than given one,
 * and the agreed dates stay readable either way, so the difference between what
 * was agreed and what is now due is the extension somebody accepted.
 *
 * ## Turning it down is a real answer, and it is not an accusation
 *
 * Rejecting records the decision and changes nothing at all — it does not cancel
 * the milestone, penalise anybody or move any money. The panel says so, because a
 * Customer who thinks "no" is a complaint will pick "yes" to avoid making one.
 *
 * ## The evidence is the same rail, worded the same way
 *
 * A claim points at rows on the stage's own evidence rail. The bytes cannot be
 * opened from here — no download route exists for that rail (§7) — so the panel
 * reports what the record knows, in the wording `stage-evidence.tsx` and the
 * handover panel already use. Two screens describing one scan status differently
 * is the failure that wording exists to avoid.
 */

export interface DelayClaimPanelProps {
  engagementId: string;
  claims: readonly DelayClaimView[];
  /** "project" — the noun this agreement uses. */
  engagementNoun: string;
  /** "stage" / "stages". */
  stageNoun: string;
  stagesNoun: string;
  onDone: () => void;
}

export function DelayClaimPanel({
  engagementId,
  claims,
  engagementNoun,
  stageNoun,
  stagesNoun,
  onDone,
}: DelayClaimPanelProps) {
  if (claims.length === 0) return null;

  const decidable = claims.filter((claim) => claim.isDecidable);
  const settled = claims.filter((claim) => !claim.isDecidable);

  return (
    <section aria-labelledby="delay-claims-heading" className="mt-8">
      <h2 id="delay-claims-heading" className="text-lg font-semibold text-text">
        {decidable.length === 0
          ? "Requests for more time"
          : decidable.length === 1
            ? "The professional has asked for more time"
            : `The professional has asked for more time on ${String(decidable.length)} ${stagesNoun}`}
      </h2>

      {decidable.length > 0 ? (
        <p className="mt-1 max-w-prose text-sm leading-6 text-text">
          Answering costs nothing either way — this is about dates, not money. If
          the delay means extra work, that is a separate change to the{" "}
          {engagementNoun} you would be asked to agree and pay for.
        </p>
      ) : null}

      <ul className="mt-3 flex list-none flex-col gap-4 p-0">
        {decidable.map((claim) => (
          <li key={claim.claimId}>
            <LiveClaim
              engagementId={engagementId}
              claim={claim}
              engagementNoun={engagementNoun}
              stageNoun={stageNoun}
              stagesNoun={stagesNoun}
              onDone={onDone}
            />
          </li>
        ))}
        {settled.map((claim) => (
          <li key={claim.claimId}>
            <SettledClaim claim={claim} stageNoun={stageNoun} stagesNoun={stagesNoun} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/* --------------------------------------------------------------------------
   The one that needs an answer
   -------------------------------------------------------------------------- */

function LiveClaim({
  engagementId,
  claim,
  engagementNoun,
  stageNoun,
  stagesNoun,
  onDone,
}: {
  engagementId: string;
  claim: DelayClaimView;
  engagementNoun: string;
  stageNoun: string;
  stagesNoun: string;
  onDone: () => void;
}) {
  const decide = useDecideDelayClaim();
  const [confirming, setConfirming] = useState<"accept" | "reject" | null>(null);
  const [note, setNote] = useState("");
  const countdown = useServerCountdown(claim.expiresAtIso, 60_000);

  // A status this build cannot name offers no control. Fail closed, for
  // `isKnownTransferStatus`'s reason: the optimistic fallback is "a live request
  // you can accept", and accepting moves every remaining date on the project.
  if (!claim.isKnownStatus) {
    return (
      <div className="rounded-card border border-line bg-surface p-4">
        <h3 className="text-base font-semibold text-text">We cannot describe this request</h3>
        <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
          There is a request for more time on this {engagementNoun} and this app
          does not recognise the state it is in, so it is not going to guess.
          Nothing about your dates has changed. Please contact support.
        </p>
      </div>
    );
  }

  const days = claim.extensionDays;
  const daysLabel = `${String(days)} ${days === 1 ? "day" : "days"}`;

  return (
    <div className="rounded-card border border-warning-line bg-warning-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-base font-semibold text-text">
          {daysLabel} more
          {claim.milestoneLabel === null ? "" : ` on ${claim.milestoneLabel}`}
        </h3>
        {/* Never "agreed" or "extended". Nothing has moved. */}
        <Badge tone="warning">Asked for — not agreed</Badge>
      </div>

      {claim.description.trim() === "" ? (
        <p className="mt-2 max-w-prose text-sm italic leading-6 text-text-secondary">
          The professional gave no explanation with this request. It is reasonable
          to ask for one before you answer.
        </p>
      ) : (
        <p className="mt-2 max-w-prose whitespace-pre-wrap text-sm leading-6 text-text">
          {claim.description}
        </p>
      )}

      {claim.reasonCode === null ? null : (
        <p className="mt-1 text-xs text-text-secondary">Their reason: {claim.reasonCode}</p>
      )}

      <ClaimEvidence claim={claim} />

      <div className="mt-3 rounded-card border border-line bg-surface p-4">
        <h4 className="text-sm font-semibold text-text">What each answer does</h4>
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm leading-6 text-text-secondary">
          <li>
            <strong className="font-semibold">Give the time:</strong> this{" "}
            {stageNoun} and <strong className="font-semibold">every {stageNoun} after it</strong>{" "}
            move by {daysLabel}. A {stageNoun} that never had a date stays without
            one. The dates you originally agreed stay on record.
          </li>
          <li>
            <strong className="font-semibold">Turn it down:</strong> nothing
            changes. The dates you agreed stand. It does not cancel anything,
            penalise anybody, or move any money.
          </li>
          <li>
            <strong className="font-semibold">Either way, nothing is charged.</strong> If
            the delay means extra work, that comes to you separately as a change
            you agree and pay for.
          </li>
        </ul>
      </div>

      {countdown !== null && !countdown.isExpired && claim.expiresAt !== null ? (
        <p className="mt-3 text-sm text-text">
          Waiting on you until {claim.expiresAt}.{" "}
          <span className="text-text-secondary">
            If you do not answer, the request lapses and the dates you agreed
            stand — the professional can ask again.
          </span>
        </p>
      ) : (
        <p className="mt-3 text-sm text-text-secondary">
          The time to answer this has run out. The dates you agreed stand.
        </p>
      )}

      <DecisionRefusal
        error={decide.error}
        engagementNoun={engagementNoun}
        stagesNoun={stagesNoun}
        onRefresh={onDone}
      />

      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={() => setConfirming("accept")} disabled={decide.isPending}>
          Give them {daysLabel}
        </Button>
        <Button
          variant="outline"
          onClick={() => setConfirming("reject")}
          disabled={decide.isPending}
        >
          Keep the dates we agreed
        </Button>
      </div>

      <ConfirmAction
        open={confirming === "accept"}
        onOpenChange={(open) => setConfirming(open ? "accept" : null)}
        title={`Move the dates by ${daysLabel}?`}
        consequence={`${
          claim.milestoneLabel === null ? `This ${stageNoun}` : claim.milestoneLabel
        } and every ${stageNoun} after it move by ${daysLabel}. Nothing is charged and no money moves. The dates you originally agreed stay on record, so the difference is always visible. This cannot be undone.`}
        confirmLabel={`Yes, give them ${daysLabel}`}
        pending={decide.isPending}
        onConfirm={() =>
          decide.mutate(
            {
              engagementId,
              delayClaimId: claim.claimId,
              accept: true,
              note: note.trim(),
            },
            {
              onSuccess: () => {
                setConfirming(null);
                setNote("");
                onDone();
              },
            },
          )
        }
      >
        <Field
          label="Anything you want to add"
          description="Optional. The professional sees this with your answer."
        >
          <Textarea
            rows={3}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={2000}
          />
        </Field>
      </ConfirmAction>

      <ConfirmAction
        open={confirming === "reject"}
        onOpenChange={(open) => setConfirming(open ? "reject" : null)}
        title="Keep the dates you agreed?"
        consequence={`Nothing changes: the ${stagesNoun}, the dates and the prices all stay exactly as they are. This does not cancel anything and does not move any money — it records that you did not agree to the extra time. The professional can ask again if something else comes up.`}
        confirmLabel="Yes, keep the dates"
        pending={decide.isPending}
        onConfirm={() =>
          decide.mutate(
            {
              engagementId,
              delayClaimId: claim.claimId,
              accept: false,
              note: note.trim(),
            },
            {
              onSuccess: () => {
                setConfirming(null);
                setNote("");
                onDone();
              },
            },
          )
        }
      >
        <Field
          label="Why, if you would like to say"
          description="Optional, and it is not a complaint — it is what the professional sees with your answer."
        >
          <Textarea
            rows={3}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={2000}
          />
        </Field>
      </ConfirmAction>
    </div>
  );
}

/* --------------------------------------------------------------------------
   The ones that are over
   -------------------------------------------------------------------------- */

function SettledClaim({
  claim,
  stageNoun,
  stagesNoun,
}: {
  claim: DelayClaimView;
  stageNoun: string;
  stagesNoun: string;
}) {
  const asked = `${String(claim.extensionDays)} ${claim.extensionDays === 1 ? "day" : "days"}`;
  const applied = `${String(claim.appliedDays)} ${claim.appliedDays === 1 ? "day" : "days"}`;

  const outcome = claim.isApplied
    ? // `applied_days` rather than `extension_days`, deliberately: what the
      // schedule actually moved by is the number a dispute about lateness turns
      // on, and it is published rather than assumed equal to what was asked.
      `You gave ${applied}, and the ${stagesNoun} from ${claim.milestoneLabel ?? `this ${stageNoun}`} onwards moved by that much.`
    : claim.status === "REJECTED"
      ? "You kept the dates you had agreed. Nothing moved."
      : claim.status === "EXPIRED"
        ? "Nobody answered in time, so the dates you agreed stood. Nothing moved."
        : claim.status === "WITHDRAWN"
          ? "The professional withdrew this request. Nothing moved."
          : // Fail closed rather than guessing. A sixth state must not be
            // described as one of the five, because two of them mean the
            // schedule moved and three mean it did not.
            "This app does not recognise how this request ended. Contact support if the dates matter.";

  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-text">
          {asked} asked for
          {claim.milestoneLabel === null ? "" : ` on ${claim.milestoneLabel}`}
        </h3>
        <span className="text-xs text-text-secondary">
          {claim.decidedAt ?? claim.createdAt ?? ""}
        </span>
      </div>
      <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">{outcome}</p>
      {claim.decisionNote === null ? null : (
        <p className="mt-1 max-w-prose whitespace-pre-wrap text-sm leading-6 text-text-secondary">
          You said: {claim.decisionNote}
        </p>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Evidence, and the refusal
   -------------------------------------------------------------------------- */

function ClaimEvidence({ claim }: { claim: DelayClaimView }) {
  if (claim.evidence.length === 0 && claim.missingEvidenceCount === 0) return null;

  return (
    <div className="mt-3">
      <h4 className="text-sm font-semibold text-text">What they sent with it</h4>
      <ul className="mt-1 flex list-none flex-col gap-1 p-0">
        {claim.evidence.map((evidence) => (
          <li key={evidence.evidenceId} className="text-sm leading-6 text-text-secondary">
            {evidence.note ?? "A file"}
            {" — "}
            {evidence.scanStatus === "PENDING"
              ? "we are still checking this file is safe"
              : evidence.scanStatus === "INFECTED" || evidence.scanStatus === "FAILED"
                ? `we could not accept this file${evidence.failureReason === null ? "" : `: ${evidence.failureReason}`}`
                : evidence.isReadable
                  ? "checked and held by Vsolve; opening files from this screen is not available yet"
                  : "we cannot tell whether this file is safe to open, so we are not offering it"}
          </li>
        ))}
        {claim.missingEvidenceCount > 0 ? (
          <li className="text-sm leading-6 text-text-secondary">
            {claim.missingEvidenceCount === 1
              ? "One file was attached that we cannot find a record of on this project."
              : `${String(claim.missingEvidenceCount)} files were attached that we cannot find records of on this project.`}{" "}
            Do not take it on the strength of its name — ask the professional, or
            contact support.
          </li>
        ) : null}
      </ul>
    </div>
  );
}

/** Why the answer was refused. Every branch means "re-read", never "press again". */
function DecisionRefusal({
  error,
  engagementNoun,
  stagesNoun,
  onRefresh,
}: {
  error: unknown;
  engagementNoun: string;
  stagesNoun: string;
  onRefresh: () => void;
}) {
  if (error === null || error === undefined) return null;

  if (isDelayClaimNotActionable(error)) {
    return (
      <div className="mt-3">
        <ErrorState
          title="This request has already been settled"
          message={`It was answered somewhere else, or the time to answer it ran out while this page was open. Either way the ${stagesNoun} on this ${engagementNoun} are exactly as they were before you pressed anything — nothing moved. We have re-read it.`}
          severity="warning"
          actionLabel="Refresh"
          onAction={onRefresh}
          inline
        />
      </div>
    );
  }

  return (
    <div className="mt-3">
      <AccessRefusal error={error} attempting="answer this request for more time" />
    </div>
  );
}
