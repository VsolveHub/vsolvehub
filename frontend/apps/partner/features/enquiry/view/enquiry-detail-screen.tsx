"use client";

import { describeError } from "@vsolve/query";
import { ConfirmAction, ErrorState, Spinner, buttonStyles, formatMoney } from "@vsolve/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { Pictogram } from "@/components/pictogram";
import { CrewMixTable } from "@/features/crew-offer/view/crew-mix-table";
import { FixedTimeOffer } from "@/features/visit/view/fixed-time-offer";
import { SiteAddress } from "@/features/visit/view/site-address";
import { useVisitDay, type VisitDayControls } from "@/features/visit/view/use-visit-day";
import { VisitActionBar } from "@/features/visit/view/visit-action-bar";
import { VisitNowCard } from "@/features/visit/view/visit-now-card";
import { ProposalStatus } from "@/features/proposal/view/proposal-status";
import { PROJECT_WORKSPACE } from "@/features/workspace/registry";

import { describeStatus, permissionsFor } from "../model/enquiry-state";
import { readEnquiryRecord, type EnquiryRecord } from "../model/wire";
import {
  isEnquiryForbidden,
  isKycRequired,
  useAcceptEnquiry,
  useDeclineEnquiry,
  usePartnerEnquiry,
  type EnquiryDetail,
} from "../queries";
import { ClarificationThread } from "./clarification-thread";
import { CustomerCard } from "./customer-card";
import { DeclineDialog } from "./decline-dialog";
import { RequirementSummary } from "./requirement-summary";

/**
 * Accept or decline an enquiry — the tap-first gate before a quote.
 *
 * Ported from the design canvas artboard "4 · Someone wants a price"
 * (`Enquiry.dc.html`). Reached from `NeedsPriceCard` in the merged WORK stack
 * (`work-item.ts`'s `ENQUIRY_HREF`), which points every enquiry a vendor still
 * owes a move on — `INVITED` ("waiting on your answer") or `ACCEPTED` ("needs
 * a price") — at this exact route.
 *
 * ## What this screen is not
 *
 * It is not a replacement for `EnquiryDetail`/`RespondActions`/`enquiry-screens.tsx`.
 * Those compose the full prose-and-card enquiry (requirement summary,
 * clarification thread, ad-hoc site-visit request, the A3 quote composer) behind
 * `WorkspaceRoute`, and none of them are mounted by any route today — no
 * `page.tsx` anywhere in this app ever imported `EnquiryDetailScreen` from
 * `enquiry-screens.tsx` or `EnquiryDetail` from `enquiry-detail.tsx`. This
 * screen is the live decision route: it presents the snapshot scope, the
 * locality-level travel context and the correct action for the archetype.
 *
 * ## The six-tile category grid the canvas drew is not here
 *
 * The canvas draws a six-tile "what kind of work" picker (electrician,
 * plumber, painter, …) as a generic illustration. It binds to nothing real:
 * `EnquiryDetail` carries one fixed `service_name`, never a multi-select, and
 * `wire.ts` already documents that `category_slug` — the one field that could
 * even suggest a trade — is "deliberately not projected any more. Nothing may
 * read it: it is a routing key, and the only thing this app ever did with it
 * was format it into a title." Guessing a `PictogramName` from free-text
 * `service_name` would be exactly the kind of fabricated categorisation that
 * decision already forecloses, so the grid is dropped rather than repurposed.
 * `service_name` itself is real data and is therefore the visible heading.
 *
 * ## The header badge is `new`, not `crew`
 *
 * The badge next to the back button needs some glyph, and `crew` (a
 * person-group icon this app already uses for headcount) would misname an
 * enquiry that may have nothing to do with a crew. `new` is what
 * `NeedsPriceCard` already draws for this exact WORK-stack state — the same
 * enquiry, one screen earlier — so the badge here says the same thing the card
 * that linked here just said.
 *
 * The locality is intentionally approximate. The exact project destination is
 * disclosed only in the visit workspace after payment confirms the booking.
 */

export function EnquiryDetailScreen({ invitationId }: { invitationId: string }) {
  const enquiry = usePartnerEnquiry(invitationId);

  if (enquiry.isPending) {
    return (
      <Screen>
        <p className="flex flex-1 items-center justify-center gap-2 py-16 text-text-secondary">
          <Spinner size="sm" />
          Loading this enquiry…
        </p>
      </Screen>
    );
  }

  if (enquiry.isError || enquiry.data === undefined) {
    const forbidden = isEnquiryForbidden(enquiry.error);
    const presentation = enquiry.error ? describeError(enquiry.error, "read") : null;
    return (
      <Screen>
        <div className="px-4 py-6">
          <ErrorState
            title={forbidden ? "This enquiry is not yours to read" : (presentation?.title ?? "We could not load this enquiry")}
            message={
              forbidden
                ? "Vsolve has no enquiry with this reference on your account. If you followed a link from somewhere else, it may belong to another vendor."
                : (presentation?.message ?? "Check your connection and try again.")
            }
            severity={presentation?.severity}
            actionLabel={forbidden ? undefined : "Try again"}
            onAction={forbidden ? undefined : () => void enquiry.refetch()}
            reference={presentation?.reference}
          />
        </div>
      </Screen>
    );
  }

  return <EnquiryDecision key={invitationId} detail={enquiry.data} />;
}

/* --------------------------------------------------------------------------
   The decision
   -------------------------------------------------------------------------- */

/**
 * One enquiry, in a fixed reading order.
 *
 * ## The order never changes; only the first card does
 *
 * **Now → Where → Who → What they asked for.** A vendor who has read this
 * screen once knows the address is second and the customer is third, on every
 * enquiry and in every state. The old layout put the brief first, the address
 * third and the arrival button at the bottom of the third card — so the answer
 * to "where am I going and what do I press" moved depending on what the visit
 * was doing.
 *
 * Only `VisitNowCard` changes with the state, which is the point: it is the one
 * block whose job is to say what is happening *right now*, and it is first
 * because that is the question the screen is opened to answer.
 *
 * ## The action is pinned, not scrolled to
 *
 * `VisitActionBar` is the last child and is `sticky bottom-0`. Whatever a
 * vendor has scrolled to, the one thing this visit is waiting on is under their
 * thumb. Everything else that is merely *possible* lives behind that bar's
 * "Something's wrong" sheet.
 *
 * ## Where and Who appear only once they are real
 *
 * Both are gated on there being a plan visit at all. Before that the exact
 * address does not exist on this client and the customer has no disclosed name
 * — `SiteAddress`'s locked state and the held-visit card already say so, and a
 * second empty card saying it again is furniture.
 */
function EnquiryDecision({ detail }: { readonly detail: EnquiryDetail }) {
  const router = useRouter();
  const enquiry = readEnquiryRecord(detail);
  const permissions = permissionsFor(enquiry.status);
  const isProject = enquiry.archetype === PROJECT_WORKSPACE;

  const [confirmingAccept, setConfirmingAccept] = useState(false);
  const [declining, setDeclining] = useState(false);
  /* The clarification thread is opened from three places — the header trigger,
     the customer card and the trouble sheet — so the screen owns whether it is
     open rather than the thread owning it privately. */
  const [messaging, setMessaging] = useState(false);

  const accept = useAcceptEnquiry(enquiry.id);
  const decline = useDeclineEnquiry(enquiry.id);
  /* Unconditional: `useVisitDay` calls its own hooks before deciding there is no
     plan visit, and returns null in that case. */
  const visit = useVisitDay(enquiry);

  const inFlight = accept.isPending || decline.isPending;

  /*
    Only `accept.error` reaches this screen's own inline notice.
    `accept.error ?? decline.error` would let a stale accept refusal outrank
    a live decline refusal, and — because `DeclineDialog` is a native
    `showModal()` too — anything rendered here while it is open is inert and
    unannounced, so `decline.error` is fed to `DeclineDialog`'s own `error`
    prop instead (below), which is exactly what that prop exists for. The two
    mutations never fail into the same message.
  */
  const kycGate = isKycRequired(accept.error);
  const acceptPresentation = accept.error ? describeError(accept.error, "mutation") : null;

  const estimateHref = `/work/enquiries/${enquiry.id}/estimate`;
  const closed = !permissions.canAccept && !permissions.canQuote && !permissions.canDecline;

  /*
    The address card exists when there is an address. That is the whole rule.

    Both of the other cases render something untrue or something twice:

    - **After the visit completes** the server's disclosure window closes and
      `site_address` goes back to null, so `SiteAddress`'s locked branch would
      say "Exact address appears after customer payment confirms the visit. Do
      not travel while this visit is on hold" — a sentence about a visit that
      has not happened, under one that just did.
    - **While the slot is held** the locked branch is true, but `VisitNowCard`'s
      held state already carries "Exact address — after payment" and "Customer
      phone — after payment" as locked rows. A second card repeating the first
      is the duplication this layout exists to remove.
  */
  const showsDestination = enquiry.siteAddress !== null;

  return (
    <Screen>
      <EnquiryHero enquiry={enquiry} isProject={isProject} showsEarning={visit !== null} />

      <div className="flex flex-col gap-3 px-4 py-4">
        {/* NOW */}
        {isProject ? <ProjectNow enquiry={enquiry} visit={visit} closed={closed} /> : null}

        {/* WHO THEY NEED — above the address on purpose. It is the one term on this
            screen a vendor can be wrong about without noticing, and the only one they
            must check against their own roster before committing. */}
        <CrewMixTable lines={enquiry.crewMix} />

        {/* WHERE — see `showsDestination`. */}
        {isProject && showsDestination ? (
          <SiteAddress address={enquiry.siteAddress} approximateArea={enquiry.approximateArea} />
        ) : null}

        {/* WHO */}
        {isProject && visit !== null ? (
          <CustomerCard enquiry={enquiry} onMessage={() => setMessaging(true)} />
        ) : null}

        {isProject ? (
          <ProposalStatus
            enquiryStatus={enquiry.status}
            invitationId={enquiry.id}
            requirementId={enquiry.requirementId}
            submitted={null}
            documentKind="estimate"
            onRevise={() => router.push(estimateHref)}
          />
        ) : null}

        {acceptPresentation ? (
          <ErrorState
            inline
            title={kycGate ? "Vsolve needs to verify you first" : acceptPresentation.title}
            message={acceptPresentation.message}
            severity={acceptPresentation.severity}
            actionLabel={kycGate ? "Finish verification" : "Try again"}
            onAction={
              kycGate
                ? () => router.push("/apply")
                : // A real retry, not a message-clearing reset: `enquiryCommandKey`
                  // is stable per invitation + command, so re-firing the same
                  // mutation replays under the same `Idempotency-Key` rather than
                  // minting a second attempt — which is what makes "Try again"
                  // true rather than a relabelled dismissal. `confirmingAccept`
                  // is already `false` on this path (the dialog only settles
                  // closed before this notice can render), so no dialog state
                  // needs touching here.
                  () => accept.mutate()
            }
            reference={acceptPresentation.reference}
          />
        ) : null}

        {/* WHAT THEY ASKED FOR — folded away once the visit is the story. */}
        {isProject && closed ? null : (
          <RequirementSummary enquiry={enquiry} collapsible={visit !== null} />
        )}

        {!isProject && permissions.canQuote ? <QuoteAction /> : null}
        {!isProject && closed ? <ClosedNotice enquiry={enquiry} /> : null}
      </div>

      <div className="flex-1" />

      {isProject && visit !== null ? (
        <VisitActionBar
          controls={visit}
          enquiry={enquiry}
          estimateHref={estimateHref}
          arrivalHref={`/work/enquiries/${enquiry.id}/arrival`}
          estimateSubmitted={enquiry.status === "QUOTED"}
          showEstimateAction={enquiry.status !== "QUOTED"}
          onMessageCustomer={() => setMessaging(true)}
        />
      ) : null}

      {!isProject && (permissions.canAccept || permissions.canDecline) ? (
        <div className="sticky bottom-0 z-20 flex flex-col gap-2.5 border-t border-line bg-surface/95 px-4 pb-5 pt-3 backdrop-blur">
          {permissions.canAccept ? (
            <button
              type="button"
              onClick={() => setConfirmingAccept(true)}
              disabled={inFlight}
              className="flex h-16 items-center justify-center gap-3 rounded-[20px] bg-success-text shadow-[0_3px_0_var(--color-success-active)] disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              <Pictogram name="yes" size="md" className="text-surface" />
              <span className="text-lg font-bold text-surface">Accept</span>
            </button>
          ) : null}

          {permissions.canDecline ? (
            <button
              type="button"
              onClick={() => setDeclining(true)}
              disabled={inFlight}
              className="flex h-14 items-center justify-center gap-2.5 rounded-[18px] border border-line bg-surface disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              <Pictogram name="no" size="md" className="text-text-muted" />
              <span className="text-base font-bold text-text-secondary">Decline</span>
            </button>
          ) : null}
        </div>
      ) : null}

      <ClarificationThread enquiry={enquiry} open={messaging} onOpenChange={setMessaging} />

      <ConfirmAction
        open={confirmingAccept}
        onOpenChange={setConfirmingAccept}
        title="Accept this enquiry"
        consequence="Accepting takes one of the customer's quote slots and holds your availability for these dates. You are not committing to a price yet — your quote comes next."
        confirmLabel="Accept"
        pending={accept.isPending}
        onConfirm={() => {
          // Closed on either outcome here, at the call site, rather than by a
          // `useEffect` watching `accept.error` — `Dialog` is a native
          // `showModal()`, so a `useEffect`-driven close is one render behind
          // the mutation settling and trips `react-hooks/set-state-in-effect`
          // besides. Same fix as the A3 offer screen
          // (`offer-detail-screen.tsx`'s `onConfirm`): success is also
          // reachable through `onSuccess` alone, since nothing else needs to
          // happen on this path, so `onSettled` covers both without
          // duplicating the callback.
          accept.mutate(undefined, { onSettled: () => setConfirmingAccept(false) });
        }}
      />

      <DeclineDialog
        open={declining}
        onOpenChange={setDeclining}
        pending={decline.isPending}
        error={decline.error ? describeError(decline.error, "mutation").message : null}
        onDecline={(reasonCode) => {
          decline.mutate({ reasonCode }, { onSuccess: () => setDeclining(false) });
        }}
      />
    </Screen>
  );
}

/**
 * The header: the trade, and what this visit pays.
 *
 * ## The money is here because it was nowhere
 *
 * `fixed_visit_earning_paise` used to render in exactly one state — the held
 * slot, before the customer had even paid. The moment the visit was confirmed
 * the figure vanished from the screen, so a vendor deciding whether to cross
 * the city could not see what crossing it was worth. It is a snapshot field
 * that does not move, so it belongs where it never scrolls away — and it is the
 * only place it is said once a visit exists, which is why `HeldVisit` no longer
 * repeats it.
 *
 * ## The locality is not repeated under the address
 *
 * "Near Khajaguda" is the *approximate* area, published for the vendor who has
 * not been given the street yet. Once `site_address` is disclosed, printing the
 * approximation above the exact address says the same thing twice and the
 * vaguer copy wins the larger type. It shows only while the address is still
 * withheld.
 */
function EnquiryHero({
  enquiry,
  isProject,
  showsEarning,
}: {
  readonly enquiry: EnquiryRecord;
  readonly isProject: boolean;
  /**
   * False before a visit exists. `FixedTimeOffer` leads with the same figure at
   * three times this size while the offer is still being decided, and one
   * screen showing one amount twice reads as two amounts.
   */
  readonly showsEarning: boolean;
}) {
  const showsLocality = enquiry.siteAddress === null && enquiry.approximateArea.trim() !== "";

  return (
    <div className="flex items-center justify-between gap-3 bg-[linear-gradient(160deg,var(--color-navy-700)_0%,var(--color-navy-900)_100%)] p-4">
      {/*
        The service name is the header.

        This is the single highest-value line in the readable-UI pass. The
        header used to be a back button and a decorative badge, with
        `serviceName` read into the `sr-only` `<h1>` above and nowhere else —
        so a vendor decided whether to accept a job, and to travel to it,
        without the trade ever appearing on screen. The `<h1>` stays as the
        landmark; this is the visible title.
      */}
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-[0.6875rem] font-bold uppercase tracking-[0.06em] text-navy-200">
          {isProject ? "Project enquiry" : "Workforce enquiry"}
        </span>
        <h1 className="truncate text-[1.1875rem] font-bold leading-snug text-surface">
          {enquiry.serviceName === "" ? "Enquiry" : enquiry.serviceName}
        </h1>
        {showsLocality ? (
          <span className="flex items-center gap-1 text-xs font-semibold text-navy-100">
            <Pictogram name="distance" size="xs" className="shrink-0" />
            <span className="truncate">Near {enquiry.approximateArea}</span>
          </span>
        ) : null}
      </span>

      {isProject && enquiry.status === "QUOTED" ? (
        <span className="shrink-0 rounded-full bg-success-surface px-3 py-2 text-xs font-extrabold text-success-text">
          Estimate sent
        </span>
      ) : showsEarning && enquiry.fixedVisitEarningPaise !== null ? (
        <span className="flex shrink-0 flex-col items-end rounded-2xl bg-navy-800/70 px-3 py-2 text-right">
          <span className="text-base font-extrabold leading-none text-surface">
            {formatMoney(enquiry.fixedVisitEarningPaise)}
          </span>
          <span className="mt-1 text-[0.625rem] font-bold uppercase tracking-wide text-navy-200">
            for this visit
          </span>
        </span>
      ) : (
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[linear-gradient(150deg,var(--color-navy-300)_0%,var(--color-navy-500)_100%)]">
          <Pictogram name="new" size="md" className="text-surface" />
        </span>
      )}
    </div>
  );
}

/**
 * The first card, for a project enquiry.
 *
 * Three mutually exclusive things, in the order they happen: a visit that
 * exists, an offer of one that does not, or an enquiry that is over. Choosing a
 * slot is the normal A5 acceptance command; ACCEPTED remains valid here so
 * enquiries accepted by the previous UI do not dead-end.
 */
function ProjectNow({
  enquiry,
  visit,
  closed,
}: {
  readonly enquiry: EnquiryRecord;
  readonly visit: VisitDayControls | null;
  readonly closed: boolean;
}) {
  if (visit !== null) {
    return (
      <VisitNowCard
        controls={visit}
        enquiry={enquiry}
        estimateSubmitted={enquiry.status === "QUOTED"}
      />
    );
  }
  if (enquiry.status === "INVITED" || enquiry.status === "ACCEPTED") {
    return <FixedTimeOffer enquiry={enquiry} />;
  }
  return closed ? <ClosedNotice enquiry={enquiry} /> : null;
}

function QuoteAction() {
  return (
    <ErrorState
      inline
      severity="info"
      title="No quote form for this yet"
      message="Vsolve cannot show a quote form for this kind of work in this version of the app. Support can take your quote over the phone."
    />
  );
}

/* --------------------------------------------------------------------------
   Pieces
   -------------------------------------------------------------------------- */

/**
 * `min-h-[calc(100dvh-9rem)]` rather than `min-h-screen`: `PartnerShell` owns a
 * sticky top bar and a fixed bottom tab bar, so a full-viewport `main` inside it
 * scrolls by exactly the height of that chrome with nothing on the screen. 9rem
 * is that allowance, and it is the same figure `offer-detail-screen.tsx`,
 * `work-home.tsx`, `me-home.tsx` and `language-picker.tsx` carry.
 */
function Screen({ children }: { children: ReactNode }) {
  return <main className="flex min-h-[calc(100dvh-9rem)] flex-col bg-canvas">{children}</main>;
}

/**
 * A closed enquiry — declined, expired or withdrawn.
 *
 * No control is offered on the enquiry itself: `permissionsFor` says none
 * applies. What is offered is the way out. This used to be a grey 80-pixel row
 * with a barred circle and two words, sitting under a full screen of cards
 * about a job that no longer exists — so a vendor's only exit was the browser's
 * back button.
 *
 * `describeStatus`'s `meaning` is now visible rather than screen-reader-only.
 * It is the one sentence that distinguishes "you turned this down" from "this
 * ran out of time", which is exactly what a vendor looking at a closed enquiry
 * has come to find out.
 *
 * `declineReasonCode` goes with it. On a withdrawal that sentence is the
 * difference between "another professional was quicker" and "the customer
 * changed their request" — and until it was passed here, every withdrawal
 * claimed the second even though the first is what actually happens.
 */
function ClosedNotice({ enquiry }: { readonly enquiry: EnquiryRecord }) {
  const status = describeStatus(enquiry.status, enquiry.declineReasonCode);
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-line bg-surface px-6 py-10 text-center">
      <span
        aria-hidden
        className="grid size-14 place-items-center rounded-full bg-surface-sunken text-text-muted"
      >
        <Pictogram name="stopped" size="lg" />
      </span>
      <p className="text-lg font-extrabold tracking-[-0.02em] text-text">{status.label}</p>
      <p className="max-w-xs text-sm leading-6 text-text-secondary">{status.meaning}</p>
      <Link href="/work/all" className={buttonStyles({ variant: "outline", className: "mt-2" })}>
        Back to Work
      </Link>
    </div>
  );
}
