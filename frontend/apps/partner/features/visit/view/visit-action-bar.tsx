"use client";

import { Button, ConfirmAction, Sheet, buttonStyles, useT } from "@vsolve/ui";
import { MessageCircle } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";

import { Pictogram } from "@/components/pictogram";
import type { EnquiryRecord } from "@/features/enquiry/model/wire";
import { PARTNER_SUPPORT_PHONE } from "@/features/support/contact";

import { visitCalendarFile, visitCalendarFilename } from "../model/calendar";
import type { VisitDayControls } from "./use-visit-day";

/**
 * The one action this visit is waiting on, pinned where a thumb already is.
 *
 * ## Why it is sticky
 *
 * Everything on this screen above it is reference material — where, when, who,
 * what they asked for. The vendor reading it is standing somewhere, usually
 * outdoors, often holding something else. Making them scroll past three cards
 * to reach "I've arrived" is the single worst thing the old layout did, and no
 * amount of tidying the cards fixes it.
 *
 * `sticky bottom-0` rather than `fixed`: it participates in layout, so it
 * cannot cover the last card, and it disappears with the page rather than
 * hovering over the error and empty states.
 *
 * ## One primary action, never two
 *
 * Each visit state has exactly one thing a vendor should do next, and it is the
 * only filled button here. Everything else that is *possible* — reporting that
 * nobody was there, calling support — is behind "Something's wrong", because
 * those are exits, not next steps, and a no-show report given equal weight to
 * arriving is a report that gets tapped by accident.
 *
 * ## What is deliberately absent before the visit day
 *
 * On a visit that is not today, there is no arrival control at all: it is
 * gated by `controls.canStartArrival`, which is the server's permission *and*
 * the site-timezone clock. The bar shows "Add to my calendar" instead — the
 * only honest thing to offer someone whose job is tomorrow.
 *
 * ## The arrival sequence
 *
 * `I've arrived` → `Start OTP` → `ArrivalScreen` → (verified) → `Finish the
 * visit`. The middle step is a link, not a submit: the code is entered on a
 * route of its own, so this bar's job ends at getting the vendor there.
 */

export interface VisitActionBarProps {
  readonly controls: VisitDayControls;
  readonly enquiry: EnquiryRecord;
  readonly estimateHref: string;
  /** The arrival-code route for this enquiry. */
  readonly arrivalHref: string;
  /** The parent renders the estimate record and its own revise action. */
  readonly showEstimateAction?: boolean;
  readonly estimateSubmitted?: boolean;
  /**
   * Opens the customer clarification thread, which the screen owns.
   *
   * Optional because the `/visit` sibling route mounts no thread — and a
   * "Message the customer" row that does nothing when tapped is worse than one
   * that is not offered.
   */
  readonly onMessageCustomer?: () => void;
}

export function VisitActionBar({
  controls,
  enquiry,
  estimateHref,
  arrivalHref,
  showEstimateAction = true,
  estimateSubmitted = false,
  onMessageCustomer,
}: VisitActionBarProps) {
  const t = useT();
  const [confirmingComplete, setConfirmingComplete] = useState(false);
  const [reportingNoShow, setReportingNoShow] = useState(false);
  const [showingTrouble, setShowingTrouble] = useState(false);

  const { visit, permissions, timing, pending, askingForCode } = controls;

  const primary = (() => {
    if (controls.canStartArrival) {
      /*
        Two taps, and they say different things.

        "I've arrived" is the vendor telling the app they are at the door — a
        claim about themselves, which nothing is charged against and no clock
        starts on. "Start OTP" is the step into proving it, and it leaves this
        screen for one that does nothing else. Collapsing them into a single
        button would take a vendor who tapped "arrived" from the road straight
        into a code box they cannot fill.
      */
      return askingForCode ? (
        <Link href={arrivalHref} className={`${buttonStyles()} w-full`}>
          {t("visit.actionBar.startOtp")}
        </Link>
      ) : (
        <Button onClick={() => controls.setAskingForCode(true)} disabled={pending}>
          {t("visit.actionBar.iveArrived")}
        </Button>
      );
    }

    if (permissions.canComplete) {
      return (
        <Button disabled={pending} onClick={() => setConfirmingComplete(true)}>
          {t("visit.actionBar.finishVisit")}
        </Button>
      );
    }

    if (permissions.canEstimate && showEstimateAction) {
      // A real anchor, not a button that routes: the composer is a destination
      // a vendor may well want to open in a second tab while they are standing
      // in the customer's hallway.
      return (
        <Link href={estimateHref} className={`${buttonStyles()} w-full`}>
          {estimateSubmitted
            ? t("visit.actionBar.reviseEstimate")
            : t("visit.actionBar.writeEstimate")}
        </Link>
      );
    }

    if (visit.status === "SCHEDULED") return <AddToCalendar controls={controls} enquiry={enquiry} />;

    return null;
  })();

  // "Something's wrong" only makes sense while the visit is still live. On a
  // held slot there is nothing to go wrong yet, and on a closed one the exits
  // have already been taken.
  const troubleAvailable =
    permissions.canReportCustomerNoShow || visit.status === "SCHEDULED";

  if (primary === null && !troubleAvailable) return null;

  return (
    <>
      <div className="sticky bottom-0 z-20 flex flex-col gap-2 border-t border-line bg-surface/95 px-4 pb-5 pt-3 backdrop-blur">
        {primary}

        {troubleAvailable ? (
          <button
            type="button"
            onClick={() => setShowingTrouble(true)}
            className="mx-auto inline-flex min-h-11 items-center gap-1.5 rounded-control px-3 text-sm font-semibold text-text-secondary underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            {t("visit.actionBar.somethingWrongWithVisit")}
            <span aria-hidden>›</span>
          </button>
        ) : null}
      </div>

      <Sheet
        open={showingTrouble}
        onOpenChange={setShowingTrouble}
        title={t("visit.actionBar.trouble.title")}
        description={timing ? timing.fullLabel : undefined}
      >
        <div className="flex flex-col gap-3 px-4 py-4">
          {permissions.canReportCustomerNoShow ? (
            <TroubleChoice
              icon={<Pictogram name="no" size="sm" />}
              label={t("visit.actionBar.trouble.nobodyThere")}
              detail={t("visit.actionBar.trouble.nobodyThereDetail")}
              onClick={() => {
                setShowingTrouble(false);
                setReportingNoShow(true);
              }}
            />
          ) : null}

          {onMessageCustomer === undefined ? null : (
            <TroubleChoice
              icon={<MessageCircle size={18} aria-hidden />}
              label={t("visit.actionBar.trouble.messageCustomer")}
              detail={t("visit.actionBar.trouble.messageCustomerDetail")}
              onClick={() => {
                setShowingTrouble(false);
                onMessageCustomer();
              }}
            />
          )}

          <a
            href={`tel:${PARTNER_SUPPORT_PHONE}`}
            className="flex items-start gap-3 rounded-card border border-line bg-surface p-3.5 text-left hover:bg-surface-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            <span aria-hidden className="mt-0.5 shrink-0 text-text-secondary">
              <Pictogram name="call" size="sm" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold text-text">
                {t("visit.actionBar.trouble.callSupport")}
              </span>
              <span className="block text-xs leading-5 text-text-secondary">
                {t("visit.actionBar.trouble.callSupportDetail")}
              </span>
            </span>
          </a>
        </div>
      </Sheet>

      <ConfirmAction
        open={confirmingComplete}
        onOpenChange={setConfirmingComplete}
        title={t("visit.actionBar.complete.title")}
        consequence={t("visit.actionBar.complete.consequence")}
        confirmLabel={t("visit.actionBar.finishVisit")}
        pending={controls.complete.isPending}
        onConfirm={() =>
          controls.complete.mutate(
            { siteVisitId: visit.id },
            { onSuccess: () => setConfirmingComplete(false) },
          )
        }
      />

      <ConfirmAction
        open={reportingNoShow}
        onOpenChange={setReportingNoShow}
        title={t("visit.actionBar.noShow.title")}
        consequence={t("visit.actionBar.noShow.consequence")}
        confirmLabel={t("visit.actionBar.noShow.confirm")}
        destructive
        pending={controls.noShow.isPending}
        onConfirm={() =>
          controls.noShow.mutate(
            { siteVisitId: visit.id },
            { onSuccess: () => setReportingNoShow(false) },
          )
        }
      />
    </>
  );
}

function TroubleChoice({
  icon,
  label,
  detail,
  onClick,
}: {
  readonly icon: ReactNode;
  readonly label: string;
  readonly detail: string;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-start gap-3 rounded-card border border-line bg-surface p-3.5 text-left hover:bg-surface-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
    >
      <span aria-hidden className="mt-0.5 shrink-0 text-text-secondary">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-bold text-text">{label}</span>
        <span className="block text-xs leading-5 text-text-secondary">{detail}</span>
      </span>
    </button>
  );
}

/**
 * The pre-visit-day action.
 *
 * A blob rather than a `data:` URI: iOS Safari refuses to save a `data:` file
 * from a link, and the blob is revoked on the next tick so a vendor who taps it
 * twice does not accumulate object URLs for the length of the session.
 */
function AddToCalendar({
  controls,
  enquiry,
}: {
  readonly controls: VisitDayControls;
  readonly enquiry: EnquiryRecord;
}) {
  const t = useT();
  const address = enquiry.siteAddress;
  const destination =
    address === null
      ? enquiry.approximateArea
      : [
          address.line1,
          address.line2,
          address.landmark,
          address.locality,
          address.city,
          address.postal_code,
        ]
          .filter((part) => part.trim() !== "")
          .join(", ");

  const file = visitCalendarFile(
    controls.visit,
    {
      serviceName: enquiry.serviceName,
      destination,
    },
    t,
  );
  if (file === null) return null;

  return (
    <Button
      variant="outline"
      onClick={() => {
        const url = URL.createObjectURL(new Blob([file], { type: "text/calendar" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = visitCalendarFilename(controls.visit);
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 0);
      }}
    >
      <Pictogram name="date" size="sm" />
      {t("visit.actionBar.addToCalendar")}
    </Button>
  );
}
