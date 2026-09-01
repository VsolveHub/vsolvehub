"use client";

import { describeError, hasWorkspaceAction, useServerCountdown, type Countdown } from "@vsolve/query";
import { ConfirmAction, ErrorState, Spinner, formatMoney } from "@vsolve/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { Pictogram, type PictogramName } from "@/components/pictogram";
import { usePartnerWorkspaceGrants } from "@/features/workspace/queries";
import { WORKFORCE_WORKSPACE } from "@/features/workspace/registry";

import {
  ACCEPT_CONSEQUENCE,
  HOW_DAY_HIRE_WORKS_HREF,
  PAID_DAILY,
  acceptQuestion,
  crewMathsLine,
  crewSizeLine,
  inclusionsLine,
  isOfferLive,
  overtimeLine,
  startDayLabel,
  type CrewOffer,
  type CrewOfferAnswer,
} from "../model/offer-state";
import {
  isRosterInsufficient,
  useAcceptCrewOffer,
  useDeclineCrewOffer,
  usePartnerCrewOffers,
} from "../queries";
import { CrewOfferDeclineDialog } from "./crew-offer-decline-dialog";
import { CrewOfferOutcome } from "./crew-offer-outcome";

/**
 * One A3 crew offer, at the size a lead can answer it standing in the street.
 *
 * The detail screen behind every `live` A3 card in the merged WORK stack.
 * `LiveOfferSheet` suppresses itself on `/work/offers/*` so the same offer is
 * never on screen twice with two accept buttons.
 *
 * ## What this screen is the only place for
 *
 * 1. **The decline reason.** ADR-0009 makes the decline rate an Operations
 *    *alarm*; the Pass button opens `CrewOfferDeclineDialog` rather than
 *    posting a code this screen chose.
 * 2. **The one-line confirm.** Accepting an A3 offer is accepting the published
 *    rate with no undo window, so `ConfirmAction` asks the question once, in
 *    one line, before an irreversible money commitment. The long explanation
 *    lives on `HOW_DAY_HIRE_WORKS_HREF`, linked once from here.
 * 3. **The outcome, after the answer.** A successful accept or decline removes
 *    the row from `GET /partner/crew-offers/`, so the answer is captured in
 *    `answer` and drawn by `CrewOfferOutcome`; the redirect is held while set.
 */

/** `2 · π · 66`, the radius the canvas draws the ring at. */
const RING_CIRCUMFERENCE = 414.7;

/**
 * The ring's denominator floor. No endpoint publishes the length of a dispatch
 * window, so the arc is drawn against the larger of two minutes and however
 * much was left on first paint. The digits inside are the measured truth.
 */
const OFFER_WINDOW_MS = 120_000;

export function OfferDetailScreen({ invitationId }: { invitationId: string }) {
  const router = useRouter();
  const offers = usePartnerCrewOffers();

  const [answer, setAnswer] = useState<CrewOfferAnswer | null>(null);

  const data = offers.data ?? null;
  const offer = data?.offers.find((entry) => entry.invitation_id === invitationId) ?? null;
  const live = data !== null && offer !== null && isOfferLive(offer, data.server_now);

  // The offer lapsed, another lead took it, or it was answered elsewhere. Never
  // while `answer` is set: this lead's own answer removes the row too.
  const gone = !offers.isPending && !offers.isError && !live && answer === null;

  useEffect(() => {
    if (gone) router.replace("/home");
  }, [gone, router]);

  if (answer !== null) return <AnsweredScreen answer={answer} />;

  if (offers.isPending) {
    return (
      <Screen>
        <p className="flex flex-1 items-center justify-center gap-2 py-16 text-text-secondary">
          <Spinner size="sm" />
          Loading this offer…
        </p>
      </Screen>
    );
  }

  if (offers.isError) {
    return (
      <Screen>
        <div className="px-4 py-6">
          <ErrorState
            title="We could not load this offer"
            message="Nothing has been answered. Check your connection and try again."
            actionLabel="Try again"
            onAction={() => void offers.refetch()}
          />
        </div>
      </Screen>
    );
  }

  if (offer === null || !live) return null;

  return <OfferDecision key={offer.invitation_id} offer={offer} onAnswered={setAnswer} />;
}

/* --------------------------------------------------------------------------
   The decision
   -------------------------------------------------------------------------- */

function OfferDecision({
  offer,
  onAnswered,
}: {
  readonly offer: CrewOffer;
  readonly onAnswered: (answer: CrewOfferAnswer) => void;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [declining, setDeclining] = useState(false);
  const grants = usePartnerWorkspaceGrants();
  const canManageCrew = hasWorkspaceAction(grants.grants ?? [], WORKFORCE_WORKSPACE, "crew.manage");

  const countdown = useServerCountdown(offer.responds_by, 1000);

  const accept = useAcceptCrewOffer(offer.invitation_id, {
    onAccepted: (booking) => {
      setConfirming(false);
      onAnswered({ kind: "accepted", offer, booking });
    },
  });

  const decline = useDeclineCrewOffer(offer.invitation_id, {
    onDeclined: (declined, input) => {
      setDeclining(false);
      onAnswered({ kind: "declined", offer: declined, reasonCode: input.reasonCode });
    },
  });

  // Seeded once, on first paint — a denominator that moved with the numerator
  // would draw a ring that never drains.
  const [windowMs] = useState(() => Math.max(OFFER_WINDOW_MS, countdown?.remainingMs ?? 0));

  const start = startDayLabel(offer.requested_start);
  const area = offer.area_label.trim();
  const overtime = overtimeLine(offer.overtime_hourly_paise, offer.standard_day_hours);
  const inclusions = inclusionsLine(offer.inclusions, 3);
  const busy = accept.isPending || decline.isPending;

  return (
    <Screen>
      <h1 className="sr-only">Crew offer — {crewSizeLine(offer.headcount, offer.days)}</h1>

      <div className="flex flex-col items-center gap-3 rounded-b-[26px] bg-[linear-gradient(135deg,var(--color-signal-400)_0%,var(--color-action)_55%,var(--color-action-active)_100%)] px-5 pt-6 pb-6 shadow-raised">
        {countdown ? <CountdownRing countdown={countdown} windowMs={windowMs} /> : null}

        <span className="text-[3.25rem] font-extrabold leading-none tracking-[-0.025em] text-text">
          {formatMoney(offer.lead_total_receipt_paise)}
        </span>
        <span className="text-[0.8125rem] font-bold uppercase tracking-[0.06em] text-action-text">
          to you
        </span>
        <span className="text-center text-[0.9375rem] font-semibold leading-snug text-text">
          {crewMathsLine({
            leadDayReceiptPaise: offer.lead_day_receipt_paise,
            headcount: offer.headcount,
            days: offer.days,
          })}{" "}
          · {PAID_DAILY}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2.5 px-4 pt-4">
        <FactRow icon="crew" label="Crew" value={crewSizeLine(offer.headcount, offer.days)} />
        <FactRow icon="distance" label="Where" value={area === "" ? "Not stated" : area} />
        <FactRow icon="date" label="From" value={start ?? "Not stated"} />
        {inclusions === null && overtime === null ? null : (
          <div className="flex flex-col gap-1 rounded-card border border-line bg-surface px-3.5 py-3 text-sm leading-5 text-text">
            {inclusions === null ? null : <p className="font-semibold">{inclusions}</p>}
            {overtime === null ? null : <p className="text-text-secondary">{overtime}</p>}
          </div>
        )}
        <BriefList brief={offer.brief} />

        <Link
          href={HOW_DAY_HIRE_WORKS_HREF}
          className="flex w-fit items-center gap-1.5 py-1 text-sm font-semibold text-action-secondary underline-offset-2 hover:underline"
        >
          <span aria-hidden className="grid h-5 w-5 place-items-center rounded-full border border-current text-xs">
            i
          </span>
          How day-hire works
        </Link>
      </div>

      {accept.error ? (
        <div className="px-4 pt-4">
          <AcceptRefusal
            error={accept.error}
            onGoToCrew={canManageCrew ? () => router.push("/me/crew") : null}
          />
        </div>
      ) : null}

      <div className="flex flex-col gap-3 px-4 pt-4 pb-5">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={busy}
          className="flex h-20 items-center justify-center gap-3 rounded-[20px] bg-success-text shadow-[0_3px_0_var(--color-success-active)] disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          <Pictogram name="yes" size="lg" className="text-surface" />
          <span className="text-xl font-bold text-surface">Take it</span>
        </button>

        <button
          type="button"
          onClick={() => setDeclining(true)}
          disabled={busy}
          className="flex h-16 items-center justify-center gap-2.5 rounded-2xl border border-line bg-surface disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          <Pictogram name="no" size="md" className="text-text-muted" />
          <span className="text-base font-bold text-text-secondary">Pass</span>
        </button>
      </div>

      <ConfirmAction
        open={confirming}
        onOpenChange={setConfirming}
        title={acceptQuestion(offer)}
        consequence={ACCEPT_CONSEQUENCE}
        confirmLabel="Yes, send them"
        cancelLabel="Back"
        pending={accept.isPending}
        onConfirm={() => {
          // Success closes it through `onAccepted`. Failure closes it here so
          // `AcceptRefusal` is reachable and the still-live confirm button is
          // not one tap from a second POST (no `Idempotency-Key` on accept).
          accept.mutate(undefined, { onError: () => setConfirming(false) });
        }}
      />

      <CrewOfferDeclineDialog
        open={declining}
        onOpenChange={setDeclining}
        pending={decline.isPending}
        error={decline.error ? describeError(decline.error, "mutation").message : null}
        onDecline={(input) => {
          decline.mutate(input);
        }}
      />
    </Screen>
  );
}

/* --------------------------------------------------------------------------
   Pieces
   -------------------------------------------------------------------------- */

/**
 * `min-h-[calc(100dvh-9rem)]`: `PartnerShell` owns a sticky top bar and a fixed
 * bottom tab bar, and 9rem is that allowance.
 */
function Screen({ children }: { children: ReactNode }) {
  return <main className="flex min-h-[calc(100dvh-9rem)] flex-col bg-canvas">{children}</main>;
}

/**
 * The clock, as an arc that empties and digits that are measured. The digits
 * are `aria-hidden` and the coarse `announce` string is what is read out.
 */
function CountdownRing({
  countdown,
  windowMs,
}: {
  readonly countdown: Countdown;
  readonly windowMs: number;
}) {
  const fraction = Math.min(1, Math.max(0, countdown.remainingMs / windowMs));
  const ringOffset = RING_CIRCUMFERENCE * (1 - fraction);

  return (
    <div className="relative h-[150px] w-[150px]">
      <svg width="150" height="150" viewBox="0 0 150 150" aria-hidden>
        <circle cx="75" cy="75" r="66" className="fill-text/12" />
        <circle
          cx="75"
          cy="75"
          r="66"
          fill="none"
          className="stroke-text/18"
          strokeWidth="11"
        />
        <circle
          cx="75"
          cy="75"
          r="66"
          fill="none"
          className="stroke-text"
          strokeWidth="11"
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={ringOffset}
          transform="rotate(-90 75 75)"
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
        <Pictogram name="time" size="md" className="text-text" />
        <span
          aria-hidden
          className={cn(
            "font-black leading-tight tabular-nums text-text tracking-tight",
            countdown.display.length > 5 ? "text-2xl" : "text-3xl",
          )}
        >
          {countdown.display}
        </span>
        <span className="sr-only">{countdown.announce}</span>
      </div>
    </div>
  );
}

/** A picture, a label and a value. */
function FactRow({
  icon,
  label,
  value,
}: {
  readonly icon: PictogramName;
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className="flex items-center gap-3.5 rounded-card border border-line bg-surface px-3.5 py-3">
      <span className="grid h-12.5 w-12.5 shrink-0 place-items-center rounded-2xl bg-selected-surface">
        <Pictogram name={icon} size="md" className="text-action-secondary" />
      </span>
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="text-[0.6875rem] font-bold uppercase tracking-[0.06em] text-text-muted">
          {label}
        </span>
        <span className="min-w-0 truncate text-xl font-extrabold tabular-nums text-text">
          {value}
        </span>
      </span>
    </div>
  );
}

/**
 * What the customer actually asked for. `brief` is the customer's own answers,
 * already worded by the server from the catalogue, so this renders rows and
 * knows nothing about any one service.
 */
function BriefList({ brief }: { readonly brief: CrewOffer["brief"] }) {
  if (brief.length === 0) return null;
  return (
    <section className="rounded-card border border-line bg-surface px-3.5 py-3">
      <h2 className="text-[0.6875rem] font-bold uppercase tracking-[0.06em] text-text-muted">
        What they asked for
      </h2>
      <dl className="mt-2 flex flex-col divide-y divide-line">
        {brief.map((line) => (
          <div key={line.code} className="flex items-baseline justify-between gap-3 py-2">
            <dt className="min-w-0 text-[0.8125rem] leading-5 text-text-secondary">
              {line.question}
            </dt>
            <dd className="shrink-0 text-right text-[0.9375rem] font-bold leading-5 text-text">
              {line.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** What the lead just did, on the screen they did it from. */
function AnsweredScreen({ answer }: { readonly answer: CrewOfferAnswer }) {
  return (
    <Screen>
      <div className="flex flex-1 flex-col gap-4 px-4 py-5">
        <CrewOfferOutcome answer={answer} />

        <Link
          href="/work"
          className="flex h-16 items-center justify-center gap-2 rounded-2xl border border-line bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          <Pictogram name="back" size="md" className="text-action-secondary" />
          <span className="text-base font-bold text-action-secondary">Work</span>
        </Link>
      </div>
    </Screen>
  );
}

/**
 * A refused accept. `m2_roster_insufficient` is the only refusal this lead can
 * act on and gets a door to the roster; everything else goes through
 * `describeError`. Recovery is always a re-read, never a resend.
 */
function AcceptRefusal({
  error,
  onGoToCrew,
}: {
  readonly error: unknown;
  readonly onGoToCrew: (() => void) | null;
}) {
  const presentation = describeError(error, "mutation");

  if (isRosterInsufficient(error)) {
    return (
      <ErrorState
        inline
        title="Your verified crew is smaller than this job"
        message="Verify more of your own people to take jobs this size."
        severity="warning"
        actionLabel={onGoToCrew ? "Go to your crew" : undefined}
        onAction={onGoToCrew ?? undefined}
      />
    );
  }

  return (
    <ErrorState
      inline
      title={presentation.title}
      message={presentation.message}
      severity={presentation.severity}
      reference={presentation.reference}
    />
  );
}
