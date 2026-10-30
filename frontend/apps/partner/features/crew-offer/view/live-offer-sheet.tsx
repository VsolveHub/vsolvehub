"use client";

import { describeError, useServerCountdown } from "@vsolve/query";
import { Badge, Button, ConfirmAction, Sheet, formatMoney, useT } from "@vsolve/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import {
  acceptConsequence,
  acceptQuestion,
  crewMathsLine,
  crewSizeLine,
  inclusionsLine,
  isOfferLive,
  paidDailyLabel,
  startDayLabel,
  type CrewOfferAnswer,
} from "../model/offer-state";
import {
  useAcceptCrewOffer,
  useDeclineCrewOffer,
  usePartnerCrewOffers,
  type CrewOffer,
} from "../queries";
import { CrewOfferDeclineDialog } from "./crew-offer-decline-dialog";
import { CrewOfferOutcome } from "./crew-offer-outcome";

/**
 * A live crew offer, wherever the lead happens to be.
 *
 * ## Why this is not a page
 *
 * A crew offer expires in about two minutes. The offers page renders them
 * perfectly and is useless to a lead who is on their earnings screen when one
 * lands. A missed offer is lost income *and* a wave that widens for no reason.
 *
 * ## It adds no transport
 *
 * Same `usePartnerCrewOffers` query the WORK stack runs, on the same
 * fifteen-second bounded poll; TanStack dedupes by query key.
 *
 * ## Suppressed where the offer is already on screen
 *
 * `/work` renders every live offer as a card and `/work/offers/[invitationId]`
 * is the offer's own screen. The match is `/work/offers/` **with** the trailing
 * slash so the bare A1 inbox at `/work/offers` is not matched.
 *
 * ## The answer outlives the row
 *
 * A successful accept or decline removes the offer from the next read, which
 * would unmount this sheet on top of "don't travel yet". So the answer is
 * captured here and drawn by `CrewOfferOutcome` until the lead dismisses it.
 */
export function LiveOfferSheet() {
  const pathname = usePathname();
  const showsOffersAlready =
    pathname === "/work" || (pathname?.startsWith("/work/offers/") ?? false);

  const offersQuery = usePartnerCrewOffers(!showsOffersAlready);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [answer, setAnswer] = useState<CrewOfferAnswer | null>(null);

  if (answer !== null) {
    return <OutcomeSheet answer={answer} onDone={() => setAnswer(null)} />;
  }

  const data = offersQuery.data ?? null;
  const live =
    data === null ? [] : data.offers.filter((offer) => isOfferLive(offer, data.server_now));
  // Soonest deadline first: the server already orders by `responds_by`, and the
  // one about to lapse is the one worth interrupting for.
  const offer = live[0] ?? null;

  if (showsOffersAlready || offer === null || dismissed === offer.invitation_id) return null;

  return (
    <OfferSheet
      key={offer.invitation_id}
      offer={offer}
      onDismiss={() => setDismissed(offer.invitation_id)}
      onAnswered={setAnswer}
    />
  );
}

/**
 * Split out, and keyed by invitation, so the countdown belongs to one offer.
 */
function OfferSheet({
  offer,
  onDismiss,
  onAnswered,
}: {
  readonly offer: CrewOffer;
  readonly onDismiss: () => void;
  readonly onAnswered: (answer: CrewOfferAnswer) => void;
}) {
  const t = useT();
  const [confirming, setConfirming] = useState(false);
  const [declining, setDeclining] = useState(false);
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

  const area = offer.area_label.trim();
  const start = startDayLabel(offer.requested_start);
  const whereWhen = [
    area || null,
    start === null ? null : t("work.crewOfferLiveSheet.fromDate", { date: start }),
  ]
    .filter((part): part is string => part !== null)
    .join(" · ");
  const brief = inclusionsLine(offer.brief.slice(0, 2).map((line) => line.value));
  const busy = accept.isPending || decline.isPending;
  const acceptError = accept.error ? describeError(accept.error, "mutation").message : null;

  return (
    <Sheet
      open
      onOpenChange={(next) => (next ? undefined : onDismiss())}
      title={t("work.crewOfferLiveSheet.newJob")}
    >
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xl font-bold leading-tight text-text">
            {crewSizeLine(t, offer.headcount, offer.days)}
          </p>
          {countdown !== null ? (
            // `announce` rather than the digits for assistive tech: a
            // per-second reading of a ticking clock is unusable.
            <Badge tone={countdown.remainingMs <= 30_000 ? "danger" : "warning"} dot>
              <span aria-hidden>⏱ {countdown.display}</span>
              <span className="sr-only">{countdown.announce}</span>
            </Badge>
          ) : null}
        </div>

        {whereWhen === "" ? null : (
          <p className="text-sm leading-5 text-text-secondary">{whereWhen}</p>
        )}

        <p className="text-2xl font-extrabold leading-tight tabular-nums text-text">
          {t("work.crewOfferLiveSheet.toYou", { amount: formatMoney(offer.lead_total_receipt_paise) })}
        </p>
        <p className="text-sm leading-5 text-text-secondary">
          {crewMathsLine(t, {
            leadDayReceiptPaise: offer.lead_day_receipt_paise,
            headcount: offer.headcount,
            days: offer.days,
          })}{" "}
          · {paidDailyLabel(t)}
        </p>

        {brief === null ? null : (
          <p className="text-sm font-semibold leading-5 text-text">{brief}</p>
        )}

        {acceptError === null ? null : (
          <p role="alert" className="text-sm leading-5 text-danger-text">
            {acceptError}
          </p>
        )}

        <div className="mt-1 flex gap-2">
          <Button
            className="flex-1"
            onClick={() => setConfirming(true)}
            disabled={busy}
            loading={accept.isPending}
            loadingLabel={t("work.crewOfferLiveSheet.takingIt")}
          >
            {t("work.crewOfferLiveSheet.takeIt")}
          </Button>
          <Button variant="ghost" onClick={() => setDeclining(true)} disabled={busy}>
            {t("work.crewOfferLiveSheet.pass")}
          </Button>
        </div>

        <Link
          href={`/work/offers/${offer.invitation_id}`}
          className="text-xs font-semibold text-action-secondary underline-offset-2 hover:underline"
        >
          {t("work.crewOfferLiveSheet.seeWholeBrief")}
        </Link>
      </div>

      <ConfirmAction
        open={confirming}
        onOpenChange={setConfirming}
        title={acceptQuestion(t, offer)}
        consequence={acceptConsequence(t)}
        confirmLabel={t("work.crewOfferLiveSheet.confirmSend")}
        cancelLabel={t("common.back")}
        pending={accept.isPending}
        onConfirm={() => {
          // Success closes it through `onAccepted`. Failure closes it here so
          // the refusal below the dialog is reachable and a second POST is not
          // one tap away (`accept_crew_offer` declares no `Idempotency-Key`).
          accept.mutate(undefined, { onError: () => setConfirming(false) });
        }}
      />

      <CrewOfferDeclineDialog
        open={declining}
        onOpenChange={setDeclining}
        pending={decline.isPending}
        error={decline.error ? describeError(decline.error, "mutation").message : null}
        onDecline={(input) => decline.mutate(input)}
      />
    </Sheet>
  );
}

/** The answer, kept up after the row is gone. */
function OutcomeSheet({
  answer,
  onDone,
}: {
  readonly answer: CrewOfferAnswer;
  readonly onDone: () => void;
}) {
  const t = useT();
  return (
    <Sheet
      open
      onOpenChange={(next) => (next ? undefined : onDone())}
      title={
        answer.kind === "accepted"
          ? t("work.crewOfferLiveSheet.outcomeTitle.accepted")
          : t("work.crewOfferLiveSheet.outcomeTitle.declined")
      }
      footer={<Button onClick={onDone}>{t("common.done")}</Button>}
    >
      <CrewOfferOutcome answer={answer} />
    </Sheet>
  );
}
