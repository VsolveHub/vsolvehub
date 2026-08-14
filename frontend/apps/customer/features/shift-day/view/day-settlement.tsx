"use client";

import { isStageTransitionNotAllowed, type ShortfallChoice } from "@vsolve/query";
import { Badge, Button, ErrorState, buttonStyles } from "@vsolve/ui";

import { AccessRefusal } from "@/features/access/view/access-refusal";
import type { ShiftDayView } from "../adapters";
import { useConfirmDaySettled } from "../queries";

/**
 * The evening "Day settled?" tap — `M2-FE-514`. The Customer's half of a dual tap.
 *
 * ## Vsolve is not a payment rail here, and the screen says so before anything else
 *
 * A3 wages are **direct, daily and peer-to-peer**. No endpoint in this contract
 * can move a wage, there is no checkout on a settlement, no payment attempt, no
 * refund and no payout. The tap records that both sides agree the day was
 * settled; the UPI link is a convenience that opens the Customer's own app.
 * Every sentence below is written so that a Customer who reads only the headings
 * still knows Vsolve is not holding this money — because a Customer who believes
 * we are will not chase the professional, and will not ask the questions that
 * actually protect them.
 *
 * ## The amount is read. It is never computed, and never guessed
 *
 * `amount_paise` is the server's, and the three numbers beside it —
 * `per_worker_paise`, `workers_present`, `extras_paise` — are read out
 * separately rather than multiplied into it. Settlement is **per worker-day
 * present, never per job**: a 3-of-4 day settles at three workers' published
 * rate, and that is a fact this screen displays rather than one it derives.
 *
 * Where there is no settlement row there is **no amount**, and the panel says
 * that instead of showing a zero. A day nobody agreed a count on is not a day
 * worth nothing.
 *
 * ## One-sided is a real state and is drawn as one
 *
 * A tap from one party leaves the record standing as *claimed*, which is what
 * Operations reads as **unproven** — one person says they settled and the other
 * has not answered, which is a different sentence from either "they were paid"
 * or "they were not". The panel never renders a one-sided claim as done.
 */

export interface DaySettlementPanelProps {
  day: ShiftDayView;
  onDone: () => void;
}

const SHORTFALL_CHOICE_LABEL: Record<ShortfallChoice, string> = {
  CONTINUE_SHORT: "You chose to carry on short",
  ADD_DAY: "You asked for an extra day",
  CANCEL_SHORTFALL: "You cancelled the missing workers",
};

export function DaySettlementPanel({ day, onDone }: DaySettlementPanelProps) {
  const confirm = useConfirmDaySettled();
  const settlement = day.settlement;

  /**
   * The live UPI link, preferring the command response over the read.
   *
   * Not a cache trick and not a fallback to something invented: both values are
   * the **server's own string**. The read currently answers `null` for this
   * field on every request — `DaySettlementSerializer` declares it over a model
   * attribute that does not exist, so only the settlement command's view
   * populates it (logged in `frontend-execution-plan.md` §7) — and
   * `mutation.data` is where that populated value lands. When the read starts
   * carrying it, this line keeps working and the fallback stops being reached.
   */
  const paymentLink = settlement?.paymentLink ?? confirm.data?.upi_payment_link ?? null;

  return (
    <section aria-labelledby="settlement-heading" className="mt-6">
      <h2 id="settlement-heading" className="text-lg font-semibold text-text">
        Paying for today
      </h2>

      {settlement === null ? (
        <NoAmountYet day={day} />
      ) : (
        <>
          <dl className="mt-3 rounded-card border border-line bg-surface">
            {/* Per worker-day present, never per job. Three published numbers,
                read out — the total is the server's own field and not their
                product. */}
            <Row
              label={`${settlement.workersPresent} ${settlement.workersPresent === 1 ? "worker" : "workers"} at ${settlement.perWorkerLabel} each`}
              value={
                settlement.workersPresent === settlement.workersExpected
                  ? "Everybody you booked"
                  : `${settlement.workersPresent} of ${settlement.workersExpected} came`
              }
            />
            {settlement.hasExtras ? (
              <Row label="Extras you both agreed" value={settlement.extrasLabel} />
            ) : null}
            <Row label="Today comes to" value={settlement.amountLabel} strong />
          </dl>

          <p className="mt-2 max-w-prose text-sm leading-6 text-text-secondary">
            You pay this to the professional directly, today.{" "}
            <strong className="font-semibold">Vsolve is not holding this money</strong>{" "}
            and never has — the day rate goes from you to them, the way it did
            before this app existed. What we do here is state the figure you both
            agreed and remember that you both said it was paid.
          </p>

          {settlement.shortfallChoice !== null ? (
            <p className="mt-2 text-sm leading-6 text-text-secondary">
              {SHORTFALL_CHOICE_LABEL[settlement.shortfallChoice]}. Today is
              settled for the people who came.
            </p>
          ) : null}
          {settlement.makeGoodRequestedAt !== null ? (
            <p className="mt-1 text-sm leading-6 text-text-secondary">
              Your request for an extra day was recorded on{" "}
              {settlement.makeGoodRequestedAt}. The professional has to offer it —
              it is not booked until they do.
            </p>
          ) : null}

          <PaymentLink link={paymentLink} amountLabel={settlement.amountLabel} />

          <SettlementStatus day={day} />
        </>
      )}

      {day.canConfirmSettled && settlement !== null ? (
        <div className="mt-4 rounded-card border border-line bg-surface p-4">
          <h3 className="font-semibold text-text">Did you settle up today?</h3>
          <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
            Tap this once you have actually paid them. It moves no money — it
            records that you say today was settled. The professional taps the same
            thing on their side, and only both taps make it agreed.
          </p>
          <div className="mt-3">
            <Button
              loading={confirm.isPending}
              loadingLabel="Recording"
              onClick={() =>
                confirm.mutate(
                  { engagementId: day.engagementId, stageId: day.stageId },
                  { onSuccess: onDone },
                )
              }
            >
              Yes — we settled today
            </Button>
          </div>
        </div>
      ) : null}

      <SettlementRefusal error={confirm.error} onRefresh={onDone} />
    </section>
  );
}

/* --------------------------------------------------------------------------
   The states
   -------------------------------------------------------------------------- */

/**
 * No settlement row exists, which is not the same as an amount of zero.
 *
 * The row is created by the first command that touches the day, so this is
 * either "nobody has recorded the day yet" or "you disputed the count, and a
 * count nobody agrees on is not an amount either". Both get the honest sentence
 * rather than a ₹0 that would read as a day worth nothing.
 */
function NoAmountYet({ day }: { day: ShiftDayView }) {
  if (day.attendance === "you_disputed") {
    return (
      <p className="mt-3 max-w-prose text-sm leading-6 text-text-secondary">
        You have disputed today&apos;s count, so there is no agreed amount for it
        yet. We are not going to put a figure on a day the two of you do not
        agree about. Whatever you settle in the meantime is between you and the
        professional, as it always is.
      </p>
    );
  }

  return (
    <p className="mt-3 max-w-prose text-sm leading-6 text-text-secondary">
      Today&apos;s figure appears once the day is recorded and you have confirmed
      who was here. It settles at{" "}
      <strong className="font-semibold">{day.perWorkerLabel}</strong> for each
      person who came — the published day rate, not a figure we work out. You pay
      the professional directly; Vsolve does not hold this money.
    </p>
  );
}

/**
 * The deep link, or the honest absence of one.
 *
 * **Never assembled here.** The payee, the amount and the reference are the
 * server's, because a `upi://pay` string this client built is one it can build
 * wrong, and the failure mode is money reaching the wrong VPA.
 *
 * The absent case deliberately does not say "this professional has no UPI
 * address": null has two causes this build cannot tell apart (see §7), and
 * asserting the wrong one puts a false fact about somebody's business on screen.
 */
function PaymentLink({ link, amountLabel }: { link: string | null; amountLabel: string }) {
  if (link === null) {
    return (
      <p className="mt-3 max-w-prose text-sm leading-6 text-text-secondary">
        We do not have a UPI link to open for this one. Pay them the{" "}
        {amountLabel} the way you agreed — cash, UPI, bank transfer. The figure is
        what matters here; the link is only a shortcut.
      </p>
    );
  }

  return (
    <div className="mt-3">
      {/* A deep link into the Customer's own UPI app at the exact published
          amount. No target and no rel: it hands off to an installed app on a
          phone rather than opening a web page. */}
      <a href={link} className={buttonStyles({ variant: "outline" })}>
        Open your UPI app for {amountLabel}
      </a>
      <p className="mt-2 max-w-prose text-sm leading-6 text-text-secondary">
        This opens your own UPI app with their details and {amountLabel} already
        filled in. The payment goes straight to them —{" "}
        <strong className="font-semibold">it does not pass through Vsolve</strong>,
        and we do not find out whether it worked. That is what the tap below is
        for.
      </p>
    </div>
  );
}

function SettlementStatus({ day }: { day: ShiftDayView }) {
  const settlement = day.settlement;
  if (settlement === null) return null;

  switch (settlement.phase) {
    case "both_agreed":
      return (
        <div className="mt-3 rounded-card border border-success-line bg-success-surface p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="font-semibold text-text">You both said today was settled</h3>
            <Badge tone="success">Settled</Badge>
          </div>
          <p className="mt-1 max-w-prose text-sm leading-6 text-text">
            {settlement.settledAt === null
              ? "Both of you have confirmed it."
              : `Agreed on ${settlement.settledAt}.`}{" "}
            The amount is fixed at {settlement.amountLabel} and will not change.
          </p>
        </div>
      );

    case "you_said_settled":
      return (
        <div className="mt-3 rounded-card border border-warning-line bg-warning-surface p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="font-semibold text-text">
              You said today was settled — they have not answered
            </h3>
            <Badge tone="warning">Waiting on them</Badge>
          </div>
          <p className="mt-1 max-w-prose text-sm leading-6 text-text">
            We record that you say it was paid and that the professional has not
            confirmed it yet. That is not the same as saying it was not paid — and
            it is not something we can decide for you. If it stays this way, we
            will look at it.
          </p>
        </div>
      );

    case "they_said_settled":
      return (
        <div className="mt-3 rounded-card border border-warning-line bg-warning-surface p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="font-semibold text-text">
              The professional says today was settled
            </h3>
            <Badge tone="warning">Needs your answer</Badge>
          </div>
          <p className="mt-1 max-w-prose text-sm leading-6 text-text">
            {settlement.supervisorConfirmedAt === null
              ? "They have confirmed it on their side."
              : `They confirmed it on ${settlement.supervisorConfirmedAt}.`}{" "}
            If you paid them, confirm it below. If you did not, do not — leaving it
            alone is the honest answer and we will look at it.
          </p>
        </div>
      );

    case "nobody_yet":
      return null;

    default:
      return (
        <p className="mt-3 max-w-prose text-sm leading-6 text-text-secondary">
          This app cannot describe where today&apos;s settlement has got to, so it
          is not going to guess. Contact support before you act on it.
        </p>
      );
  }
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line p-4 last:border-0">
      <dt className="text-sm text-text-secondary">{label}</dt>
      <dd className={strong ? "text-lg font-semibold text-text" : "text-text"}>{value}</dd>
    </div>
  );
}

/**
 * `409 m2_stage_transition_not_allowed` — the day has not been recorded, so
 * there is no amount to settle. A re-read, never a resend.
 */
function SettlementRefusal({ error, onRefresh }: { error: unknown; onRefresh: () => void }) {
  if (error === null || error === undefined) return null;

  if (isStageTransitionNotAllowed(error)) {
    return (
      <div className="mt-4">
        <ErrorState
          title="There is nothing to settle yet"
          message="Nobody has recorded who was here today, so there is no agreed amount to confirm. We have re-read it."
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
      <AccessRefusal error={error} attempting="record that today was settled" />
    </div>
  );
}
