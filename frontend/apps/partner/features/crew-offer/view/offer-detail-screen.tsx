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
  ACCEPT_COMMITMENT,
  WAGE_SETTLEMENT,
  dayNoun,
  describeOvertime,
  helperNoun,
  isOfferLive,
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
 * The detail screen behind every `live` A3 card in the merged WORK stack —
 * `work-item.ts`'s `CREW_OFFER_HREF` points here, and `LiveOfferSheet`
 * deliberately suppresses itself on `/work/offers/*` so the same offer is never
 * on screen twice with two accept buttons.
 *
 * Ported from the design canvas artboard "3 · Offer, clock running": the
 * countdown ring, the ₹ figure, four fact rows, an accept/pass pair. Per the
 * plan's Deviation 1 the canvas's "4 km" chip is `offer.area_label` — no
 * Partner-facing field publishes a distance.
 *
 * ## What this screen is now the only place for
 *
 * `CrewOfferScreen`/`CrewOfferList`/`CrewOfferCard` are no longer mounted by any
 * route — `/workforce/offers` redirects to `/work`. So this is the only surface
 * on which an A3 offer can be accepted or declined, and three things the older
 * card carried are kept here rather than dropped with the styling:
 *
 * 1. **The decline reason.** `useDeclineCrewOffer` requires a published
 *    `CrewOfferDeclineReasonCodeEnum` member, and ADR-0009 makes the decline
 *    rate an Operations *alarm* rather than a report — a rate that has slipped
 *    below the street rate is only visible through these codes. So the ✗ button
 *    opens `CrewOfferDeclineDialog` rather than posting a code this screen chose.
 * 2. **The commitment, before the tap.** Accepting an A3 offer is accepting the
 *    published rate with nothing to negotiate on site, and unlike an A1 offer it
 *    carries no undo window. `ConfirmAction` states `ACCEPT_COMMITMENT` — the
 *    same string the previous card used — so the sentence is said once, in one
 *    place, before an irreversible money commitment on an 80px button.
 *    `ACCEPT_COMMITMENT` itself ends "…at the rates below", and the dialog's
 *    `children` slot is what "below" points at: `WAGE_SETTLEMENT`, the
 *    published overtime rate and the inclusions list, the same three facts
 *    the previous card rendered inline. Without them the sentence pointed at
 *    nothing — this is now the only reachable A3 accept surface.
 * 3. **The outcome, after the answer.** See `CrewOfferAnswerHandlers` in
 *    `queries.ts`: a successful accept or decline removes the row from
 *    `GET /partner/crew-offers/` (it filters to `INVITED`), so a screen that
 *    redirected on "the offer is gone" would replace **"do not travel yet"** with
 *    the WORK list. The answer is captured synchronously in `answer` and drawn by
 *    `CrewOfferOutcome`, and the redirect below is held back while it is set.
 */

/** `2 · π · 66`, the radius the canvas draws the ring at. */
const RING_CIRCUMFERENCE = 414.7;

/**
 * The ring's denominator floor, in milliseconds.
 *
 * **No endpoint publishes the length of a dispatch window.** `CrewOffer` carries
 * `responds_by` and no `invited_at`, so the fraction the arc draws has no server
 * figure behind it — which is exactly why `work-home.tsx` refuses to draw an arc
 * on the stack card and shows digits alone.
 *
 * Here the arc is the artboard, so it is drawn against a denominator that is
 * stated rather than inferred: the larger of this constant and however much time
 * was left when the screen first painted. Two minutes is this module's own
 * documented figure for the window (`LiveOfferSheet`: "a crew offer expires in
 * about two minutes"; `OFFER_CLOSING_SOON_MS` is the same two minutes as the
 * "closing" threshold). Taking the maximum is what keeps it honest in both
 * directions: a lead arriving with 40 seconds left sees a ring already two-thirds
 * drained, and an offer with a longer deadline than the constant starts full
 * instead of overflowing the arc.
 *
 * The digits inside the ring are the measured truth and come from
 * `useServerCountdown`. The arc is the affordance around them.
 */
const OFFER_WINDOW_MS = 120_000;

export function OfferDetailScreen({ invitationId }: { invitationId: string }) {
  const router = useRouter();
  const offers = usePartnerCrewOffers();

  /**
   * Held here rather than inside `OfferDecision`, because the row that produced
   * it is about to disappear and take that component with it.
   */
  const [answer, setAnswer] = useState<CrewOfferAnswer | null>(null);

  const data = offers.data ?? null;
  const offer = data?.offers.find((entry) => entry.invitation_id === invitationId) ?? null;
  const live = data !== null && offer !== null && isOfferLive(offer, data.server_now);

  /*
    The offer lapsed, another lead took it, or it was answered on another tab —
    all three make it vanish from a list the server filters to `INVITED`. A dead
    detail screen is worse than the stack, so leave.

    Never while `answer` is set: this lead's own accept or decline removes the
    row too, and redirecting on that path is precisely the defect
    `CrewOfferAnswerHandlers` exists to prevent.
  */
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

  // `gone` — the effect above is on its way to `/work`. Render nothing rather
  // than a half-screen that flashes.
  if (offer === null || !live) return null;

  /*
    Keyed by invitation so the countdown, and the ring window it is measured
    against, belong to one offer. The same reason `LiveOfferSheet` splits
    `OfferSheet` out: a hook reading `responds_by` off a row the poll replaced
    would count the previous deadline down for a commit, which is visible on a
    two-minute clock.
  */
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

  // One second, because this deadline is minutes away rather than hours. The
  // second argument is `tickMs` — `useServerCountdown` reads `server_now`
  // through `serverClock`, which is calibrated from every response, so no
  // instant is passed in here.
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

  /*
    Seeded once, on this offer's first paint, and never recomputed — a
    denominator that moved with the numerator would draw a ring that never
    drains. See `OFFER_WINDOW_MS`.
  */
  const [windowMs] = useState(() => Math.max(OFFER_WINDOW_MS, countdown?.remainingMs ?? 0));

  const start = startLabel(offer.requested_start);
  const area = offer.area_label.trim();
  const overtime = describeOvertime(offer);
  const busy = accept.isPending || decline.isPending;

  return (
    <Screen>
      {/* The screen is a ring, a number and four pictures; the landmark still
          needs a name. */}
      <h1 className="sr-only">
        Crew offer — {offer.headcount} {helperNoun(offer.headcount)} for {offer.days}{" "}
        {dayNoun(offer.days)}
      </h1>

      <div className="flex flex-col items-center gap-3.5 rounded-b-[26px] bg-[linear-gradient(135deg,var(--color-signal-400)_0%,var(--color-action)_55%,var(--color-action-active)_100%)] px-5 pt-6 pb-6.5 shadow-raised">
        {countdown ? <CountdownRing countdown={countdown} windowMs={windowMs} /> : null}

        {/*
          The figure keeps its size; the words above and below it are what say
          whose money it is and when it arrives. The long sentence was `sr-only`
          before — the screen showed a number on an orange field and nothing
          else, which is the one fact on this screen a lead cannot afford to
          guess at.
        */}
        <span className="text-[0.6875rem] font-bold uppercase tracking-[0.06em] text-action-text opacity-80">
          You receive
        </span>
        <span className="text-[3.25rem] font-extrabold leading-none tracking-[-0.025em] text-text">
          {formatMoney(offer.lead_total_receipt_paise)}
        </span>
        <span className="max-w-[26ch] text-center text-[0.8125rem] font-semibold leading-snug text-action-text">
          For the whole job. The customer pays you directly, at the end of each day.
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2.5 px-4 pt-4.5">
        <FactRow icon="distance" label="Where" value={area === "" ? "Not stated" : area} />
        <FactRow icon="time" label="Starts" value={start ?? "Not stated"} />
        <FactRow icon="days" label="Days" value={String(offer.days)} />
        <FactRow icon="crew" label="People" value={String(offer.headcount)} />
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
        {/*
          Both controls state their verb.

          They used to be a green square holding a tick and a grey square
          holding a cross, with the words in `sr-only` — a lead committing to
          staff a job for three days, or turning that money down, on a glyph
          alone. The tier is still carried by shape (filled and 80px versus
          outlined and 64px) so the pair cannot be confused at a glance; the
          words are what make them unmistakable.
        */}
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={busy}
          className="flex h-20 items-center justify-center gap-3 rounded-[20px] bg-success-text shadow-[0_3px_0_var(--color-success-active)] disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          <Pictogram name="yes" size="lg" className="text-surface" />
          <span className="text-xl font-bold text-surface">Take this job</span>
        </button>

        <button
          type="button"
          onClick={() => setDeclining(true)}
          disabled={busy}
          className="flex h-16 items-center justify-center gap-2.5 rounded-2xl border border-line bg-surface disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          <Pictogram name="no" size="md" className="text-text-muted" />
          <span className="text-base font-bold text-text-secondary">Pass on this one</span>
        </button>
      </div>

      <ConfirmAction
        open={confirming}
        onOpenChange={setConfirming}
        title={`Take ${offer.headcount} ${helperNoun(offer.headcount)} for ${offer.days} ${dayNoun(offer.days)} at ${formatMoney(offer.lead_day_receipt_paise)} a day?`}
        consequence={`${ACCEPT_COMMITMENT} If you are the first to answer, the job is held for you while the customer pays the booking fee that confirms it — do not travel until Vsolve confirms.`}
        confirmLabel="Yes, take it at this rate"
        pending={accept.isPending}
        onConfirm={() => {
          // Success closes it through `onAccepted` above. Failure closes it
          // here, via the per-call `onError` rather than the hook's own
          // `CrewOfferAnswerHandlers` (which carries no `onError` slot):
          // `Dialog` is a native `showModal()`, so leaving `confirming` true
          // after a refusal would draw `AcceptRefusal` below the fold but
          // make it unreachable — the background goes inert under the top
          // layer — while the still-live confirm button invites a second POST
          // to a command with no `Idempotency-Key` (see `AcceptRefusal`
          // below). Safe to deliver here, unlike the success path: a refusal
          // never unmounts this component, only an accepted answer does.
          accept.mutate(undefined, { onError: () => setConfirming(false) });
        }}
      >
        {/* "…at the rates below", from `ACCEPT_COMMITMENT` above, points here:
            the wage settlement sentence and the published overtime rate, the
            same facts `CrewOfferCard` showed on the card itself before this
            screen replaced it as the only reachable A3 accept surface. */}
        <div className="flex flex-col gap-2 text-sm leading-6 text-text-secondary">
          <p>{WAGE_SETTLEMENT}</p>
          {overtime ? <p>{overtime}</p> : null}
          {offer.inclusions.length > 0 ? (
            <div>
              <h3 className="text-sm font-semibold text-text">What the day covers</h3>
              <ul className="mt-1 flex list-disc flex-col gap-1 pl-5">
                {/* Keyed by position: `inclusions` is ops-authored free text
                    and two identical lines are a duplicate React key, not an
                    impossibility. Nothing here reorders. */}
                {offer.inclusions.map((line, index) => (
                  <li key={`${index}-${line}`}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </ConfirmAction>

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
 * `min-h-[calc(100dvh-9rem)]` rather than `min-h-screen`: `PartnerShell` owns a
 * sticky top bar and a fixed bottom tab bar, so a full-viewport `main` inside it
 * scrolls by exactly the height of that chrome with nothing on the screen. 9rem
 * is that allowance, and it is the same figure `work-home.tsx`, `me-home.tsx`
 * and `language-picker.tsx` carry.
 */
function Screen({ children }: { children: ReactNode }) {
  return <main className="flex min-h-[calc(100dvh-9rem)] flex-col bg-canvas">{children}</main>;
}

/**
 * The clock, as an arc that empties and digits that are measured.
 *
 * `stroke-dashoffset` grows from 0 to the full circumference as the remaining
 * fraction falls, so the stroke retreats anticlockwise from a full ring. Clamped
 * at both ends: an unclamped fraction above 1 wraps the dash pattern and redraws
 * a full ring, which would read as a clock that had just been reset.
 *
 * The digits are `aria-hidden` and the coarse `announce` string is what is read
 * out. A per-second reading of a ticking clock under an `aria-live` region makes
 * a screen reader unusable.
 *
 * The track and its backing disc are `fill-text/12` and `stroke-text/18` —
 * the `text` token (`rgb(0 17 46)`, `tokens.css`) at low opacity — rather than
 * a raw `rgb(...)` literal: colour is a closed set of token utilities in this
 * app, never a literal hex or `rgb()` in application code. Verified against a
 * real Tailwind v4 compile to render identically to the literal it replaced.
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
          className="text-[2.375rem] font-extrabold leading-tight tabular-nums text-text"
        >
          {countdown.display}
        </span>
        <span className="sr-only">{countdown.announce}</span>
      </div>
    </div>
  );
}

/**
 * A picture and a number, which is the only way this app states a fact.
 *
 * `label` is never drawn. `Pictogram` is `aria-hidden`, so without it a screen
 * reader hears four bare values in a row — "Kondapur", "18 Aug, 9:00 am", "3",
 * "4" — with nothing saying which is which.
 *
 * Sized at or above `Pictogram`'s own `h-6 w-6` default for the reason
 * `work-home.tsx` records: `cn` is `clsx` rather than `tailwind-merge`, so a
 * caller's size class joins the default instead of replacing it and the cascade
 * settles the tie by stylesheet order.
 */
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
        <span className="min-w-0 truncate text-2xl font-extrabold tabular-nums text-text">
          {value}
        </span>
      </span>
    </div>
  );
}

/**
 * What the lead just did, on the screen they did it from.
 *
 * `CrewOfferOutcome` is reused verbatim rather than restyled — it is the one
 * component that says **"do not travel yet"** with the hold window beside it,
 * and rewording a held win to match a visual pass is not a styling change. It
 * still carries the older card treatment; that is disclosed rather than fixed
 * here, since `features/crew-offer/view/crew-offer-outcome.tsx` is outside this
 * task's file list.
 */
function AnsweredScreen({ answer }: { readonly answer: CrewOfferAnswer }) {
  return (
    <Screen>
      <div className="flex flex-1 flex-col gap-4 px-4 py-5">
        <CrewOfferOutcome answer={answer} />

        <Link
          href="/home"
          className="flex h-16 items-center justify-center gap-2 rounded-2xl border border-line bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          <Pictogram name="back" size="md" className="text-action-secondary" />
          <span className="text-base font-bold text-action-secondary">Back to your work</span>
        </Link>
      </div>
    </Screen>
  );
}

/**
 * A refused accept.
 *
 * Two branches, not the seven the older card drew. `m2_roster_insufficient` is
 * the only refusal this lead can act on — one lead is accountable for the whole
 * crew and ADR-0009 forbids assembling one from other agencies, so the fix is
 * always "verify more of your own people" — and it gets a door to the roster.
 * Everything else is presented through `describeError`, which already carries
 * this product's wording for a taken offer, an exhausted slot and a lapsed
 * window.
 *
 * Recovery is always a re-read, never a resend: `accept_crew_offer` declares no
 * `Idempotency-Key`, so a blind retry is a second attempt rather than a replay.
 * `accept.reset()` is not offered as "try again" for that reason — the mutation
 * already invalidated the inbox on error.
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
        message="Vsolve sends one lead who is accountable for the whole crew, so we never make the numbers up from another agency. Add the people you would actually send and get them verified — you will be offered this size of job again."
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

/** "18 Aug, 9:00 am" in the device's own zone. Null-safe: `requested_start` is nullable. */
function startLabel(iso: string | null): string | null {
  if (iso === null) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(at);
}
