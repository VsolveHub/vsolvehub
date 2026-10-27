"use client";

import {
  Button,
  Dialog,
  ErrorState,
  FactTile,
  Sheet,
  cn,
  formatMoney,
  useTranslator,
} from "@vsolve/ui";
import { useServerCountdown } from "@vsolve/query";
import { useState } from "react";

import { Pictogram } from "@/components/pictogram";
import type { EnquiryRecord } from "@/features/enquiry/model/wire";
import type { DeclineReasonCode } from "@/features/enquiry/model/decline-reasons";
import { useAcceptEnquiry, useDeclineEnquiry } from "@/features/enquiry/queries";

import { describeVisitDuration } from "../model/slot-grid";

/**
 * Answering a visit offer, now that there is nothing to schedule.
 *
 * ## What this replaced, and why
 *
 * `VisitResponse` stood here until contract 1.44.0. It fetched a grid of
 * candidate slots, let the partner choose one, and confirmed it. That whole
 * surface was removed from the published contract, because BE-2 moved the
 * choice to the customer. There is no endpoint left through which a partner can
 * propose or pick a time.
 *
 * So the offer arrives fixed: `fixed_visit_start`, its duration, what it pays,
 * and `responds_by` as the deadline. Two answers, and neither is a calendar.
 *
 * ## The visuals come from the gallery artboard
 *
 * `gallery/fixed-time-offer-screen.tsx` drew this at full size from sample
 * props: four fact tiles, the earning, a countdown ring. This is that design
 * on the live path — same tiles, same two-tier buttons — mounted inside the
 * enquiry screen, which already owns the header. The countdown is
 * `useServerCountdown` against `responds_by`, calibrated by the enquiry read's
 * own `server_now`, so a phone with a fast clock does not show a dead offer.
 *
 * ## Passing asks why, in three tiles
 *
 * The published decline vocabulary has six codes; the three a partner standing
 * in the street actually means are distance, availability and trade. They map
 * straight onto `TOO_FAR`, `NO_CAPACITY` and `OUT_OF_SCOPE` — no new code is
 * invented, and the other three stay reachable from the full decline dialog on
 * workforce enquiries.
 */

export interface FixedTimeOfferProps {
  enquiry: EnquiryRecord;
}

/** `label` is a catalogue key, resolved with `t` at render time. */
const PASS_REASONS: readonly { code: DeclineReasonCode; label: string; icon: "distance" | "date" | "papers" }[] = [
  { code: "TOO_FAR", label: "visit.fixedOffer.pass.tooFar", icon: "distance" },
  { code: "NO_CAPACITY", label: "visit.fixedOffer.pass.busy", icon: "date" },
  { code: "OUT_OF_SCOPE", label: "visit.fixedOffer.pass.outOfScope", icon: "papers" },
];

/** `2 · π · 66`, the radius the artboard draws the ring at. */
const RING_CIRCUMFERENCE = 414.7;

export function FixedTimeOffer({ enquiry }: FixedTimeOfferProps) {
  const { t, locale } = useTranslator();
  // The browser's own zone: the partner is standing in it.
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const accept = useAcceptEnquiry(enquiry.id);
  const decline = useDeclineEnquiry(enquiry.id);
  const [passing, setPassing] = useState(false);
  const [showingAreaDetail, setShowingAreaDetail] = useState(false);
  const busy = accept.isPending || decline.isPending;
  const countdown = useServerCountdown(enquiry.respondsBy, 1000);

  // An enquiry with no fixed visit is not an offer this screen can answer. It
  // renders the fact rather than an empty shell: the alternative is a partner
  // pressing accept on a time nobody has set.
  if (enquiry.fixedVisitStart === null) {
    return (
      <ErrorState
        inline
        severity="info"
        title={t("visit.fixedOffer.noTime.title")}
        message={t("visit.fixedOffer.noTime.message")}
      />
    );
  }

  const starts = new Date(enquiry.fixedVisitStart);
  const dateLabel = Number.isNaN(starts.getTime())
    ? enquiry.fixedVisitStart
    : new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", timeZone }).format(starts);
  const timeLabel = Number.isNaN(starts.getTime())
    ? ""
    : new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hour12: false, timeZone }).format(starts);
  const startsLabel =
    enquiry.fixedVisitDurationMinutes === null
      ? timeLabel
      : `${timeLabel} · ${describeVisitDuration(enquiry.fixedVisitDurationMinutes, t)}`;
  const windowMs =
    enquiry.respondsBy === null
      ? 0
      : Math.max(0, new Date(enquiry.respondsBy).getTime() - new Date(enquiry.createdAt).getTime());
  const fraction =
    countdown === null || windowMs <= 0 ? 0 : Math.min(1, Math.max(0, countdown.remainingMs / windowMs));

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-2 rounded-card bg-[linear-gradient(135deg,var(--color-signal-400)_0%,var(--color-action)_55%,var(--color-action-active)_100%)] px-4 py-5 shadow-raised">
        {countdown !== null ? (
          <div className="relative h-[132px] w-[132px]">
            <svg width="132" height="132" viewBox="0 0 150 150" aria-hidden>
              <circle cx="75" cy="75" r="66" className="fill-text/12" />
              <circle cx="75" cy="75" r="66" fill="none" className="stroke-text/18" strokeWidth="11" />
              <circle
                cx="75"
                cy="75"
                r="66"
                fill="none"
                className="stroke-text"
                strokeWidth="11"
                strokeLinecap="round"
                strokeDasharray={RING_CIRCUMFERENCE}
                strokeDashoffset={RING_CIRCUMFERENCE * (1 - fraction)}
                transform="rotate(-90 75 75)"
              />
            </svg>
            <div
              role="timer"
              aria-live="polite"
              aria-label={countdown.announce}
              className="absolute inset-0 flex flex-col items-center justify-center"
            >
              <Pictogram name="time" size="xs" className="text-text mb-0.5" />
              <span
                aria-hidden
                className={cn(
                  "font-black leading-tight tabular-nums text-text tracking-tight",
                  countdown.display.length > 5 ? "text-xl" : "text-2xl",
                )}
              >
                {countdown.display}
              </span>
            </div>
          </div>
        ) : null}

        {enquiry.fixedVisitEarningPaise === null ? null : (
          <>
            <span className="text-[0.6875rem] font-bold uppercase tracking-[0.06em] text-action-text opacity-80">
              {t("visit.fixedOffer.youReceive")}
            </span>
            <span className="-mt-1 text-[2.75rem] font-extrabold leading-none tracking-[-0.025em] tabular-nums text-action-text">
              {formatMoney(enquiry.fixedVisitEarningPaise)}
            </span>
          </>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <FactTile icon={<Pictogram name="papers" size="md" />} label={t("visit.fixedOffer.service")} value={enquiry.serviceName} />
        <FactTile
          icon={<Pictogram name="distance" size="md" />}
          label={t("visit.fixedOffer.area")}
          value={
            enquiry.approximateArea.trim() === ""
              ? t("visit.fixedOffer.notGiven")
              : enquiry.approximateArea
          }
          onClick={() => setShowingAreaDetail(true)}
        />
        <FactTile icon={<Pictogram name="date" size="md" />} label={t("visit.fixedOffer.date")} value={dateLabel} />
        <FactTile icon={<Pictogram name="time" size="md" />} label={t("visit.fixedOffer.starts")} value={startsLabel} />
      </div>

      <p className="text-sm leading-6 text-text-secondary">
        {t("visit.fixedOffer.customerPicked")}
      </p>

      {accept.isError ? (
        <ErrorState
          inline
          severity="warning"
          title={t("visit.fixedOffer.taken.title")}
          message={t("visit.fixedOffer.taken.message")}
        />
      ) : null}

      <div className="flex flex-col gap-2.5">
        <button
          type="button"
          onClick={() => accept.mutate()}
          disabled={busy || countdown?.isExpired === true}
          className="flex h-20 items-center justify-center gap-3 rounded-[20px] bg-success-text shadow-[0_3px_0_var(--color-success-active)] disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          <Pictogram name="yes" size="lg" className="text-surface" />
          <span className="text-xl font-bold text-surface">
            {accept.isPending ? t("visit.fixedOffer.accepting") : t("visit.fixedOffer.take")}
          </span>
        </button>
        <Button
          block
          variant="outline"
          size="lg"
          className="h-16"
          icon={<Pictogram name="no" size="md" className="text-text-muted" />}
          onClick={() => setPassing(true)}
          disabled={busy}
          loading={decline.isPending}
          loadingLabel={t("visit.fixedOffer.passing")}
        >
          {t("visit.fixedOffer.pass")}
        </Button>
      </div>

      <Dialog
        open={showingAreaDetail}
        onOpenChange={setShowingAreaDetail}
        title={t("visit.fixedOffer.location.title")}
        description={t("visit.fixedOffer.location.description")}
        footer={
          <Button variant="secondary" onClick={() => setShowingAreaDetail(false)}>
            {t("common.done")}
          </Button>
        }
      >
        <div className="flex flex-col gap-4 py-2">
          <div className="flex items-start gap-3 rounded-card border border-line bg-surface-sunken p-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-selected-surface text-text-link">
              <Pictogram name="distance" size="md" />
            </span>
            <div className="min-w-0 flex-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
                {t("visit.fixedOffer.location.areaLabel")}
              </span>
              <p className="mt-1 text-base font-bold text-navy-900 leading-snug break-words">
                {enquiry.approximateArea.trim() === ""
                  ? t("visit.fixedOffer.notGiven")
                  : enquiry.approximateArea}
              </p>
            </div>
          </div>
          <p className="text-xs leading-relaxed text-text-secondary">
            {t("visit.fixedOffer.location.note")}
          </p>
        </div>
      </Dialog>

      <Sheet
        open={passing}
        onOpenChange={setPassing}
        title={t("visit.fixedOffer.whyPass")}
        footer={
          <Button variant="ghost" onClick={() => setPassing(false)}>
            {t("visit.fixedOffer.keepOpen")}
          </Button>
        }
      >
        <div className="grid grid-cols-3 gap-2">
          {PASS_REASONS.map((reason) => (
            <button
              key={reason.code}
              type="button"
              disabled={busy}
              onClick={() =>
                decline.mutate({ reasonCode: reason.code }, { onSettled: () => setPassing(false) })
              }
              className={cn(
                "flex min-h-24 flex-col items-center justify-center gap-2 rounded-card border border-line bg-surface p-2 text-center",
                "hover:bg-surface-hover disabled:opacity-60",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
              )}
            >
              <Pictogram name={reason.icon} size="lg" className="text-action-secondary" />
              <span className="text-xs font-semibold leading-tight text-text">{t(reason.label)}</span>
            </button>
          ))}
        </div>
      </Sheet>
    </section>
  );
}
