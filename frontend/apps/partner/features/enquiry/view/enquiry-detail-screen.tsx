"use client";

import { describeError } from "@vsolve/query";
import { ConfirmAction, ErrorState, Spinner } from "@vsolve/ui";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { Pictogram } from "@/components/pictogram";
import { VisitDayPanel } from "@/features/visit/view/visit-day-panel";
import { FixedTimeOffer } from "@/features/visit/view/fixed-time-offer";
import { ProposalStatus } from "@/features/proposal/view/proposal-status";
import { PROJECT_WORKSPACE } from "@/features/workspace/registry";

import { describeStatus, permissionsFor } from "../model/enquiry-state";
import { planVisitOf, readEnquiryRecord, type EnquiryRecord } from "../model/wire";
import {
  isEnquiryForbidden,
  isKycRequired,
  useAcceptEnquiry,
  useDeclineEnquiry,
  usePartnerEnquiry,
  type EnquiryDetail,
} from "../queries";
import { ClarificationThread } from "./clarification-thread";
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

function EnquiryDecision({ detail }: { readonly detail: EnquiryDetail }) {
  const router = useRouter();
  const enquiry = readEnquiryRecord(detail);
  const permissions = permissionsFor(enquiry.status);
  const isProject = enquiry.archetype === PROJECT_WORKSPACE;

  const [confirmingAccept, setConfirmingAccept] = useState(false);
  const [declining, setDeclining] = useState(false);

  const accept = useAcceptEnquiry(enquiry.id);
  const decline = useDeclineEnquiry(enquiry.id);

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

  return (
    <Screen>
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
          {enquiry.approximateArea.trim() === "" ? null : (
            <span className="flex items-center gap-1 text-xs font-semibold text-navy-100">
              <Pictogram name="distance" size="xs" className="shrink-0" />
              <span className="truncate">Near {enquiry.approximateArea}</span>
            </span>
          )}
        </span>

        {isProject && enquiry.status === "QUOTED" ? (
          <span className="shrink-0 rounded-full bg-success-surface px-3 py-2 text-xs font-extrabold text-success-text">
            Estimate sent
          </span>
        ) : (
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[linear-gradient(150deg,var(--color-navy-300)_0%,var(--color-navy-500)_100%)]">
            <Pictogram name="new" size="md" className="text-surface" />
          </span>
        )}
      </div>

      <div className="px-4 pt-4">
        <RequirementSummary enquiry={enquiry} />
      </div>

      <ClarificationThread enquiry={enquiry} />

      {isProject ? (
        <div className="px-4 pt-4">
          <ProposalStatus
            enquiryStatus={enquiry.status}
            invitationId={enquiry.id}
            requirementId={enquiry.requirementId}
            submitted={null}
            documentKind="estimate"
            onRevise={() => router.push(estimateHref)}
          />
        </div>
      ) : null}

      {acceptPresentation ? (
        <div className="px-4 pt-4">
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
        </div>
      ) : null}

      <div className="flex-1" />

      <div className="flex flex-col gap-2.5 px-4 pb-5">
        {isProject ? (
          <ProjectVisitAction enquiry={enquiry} />
        ) : permissions.canQuote ? (
          <QuoteAction />
        ) : permissions.canAccept ? (
          <button
            type="button"
            onClick={() => setConfirmingAccept(true)}
            disabled={inFlight}
            className="flex h-20 items-center justify-center gap-3 rounded-[20px] bg-success-text shadow-[0_3px_0_var(--color-success-active)] disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            <Pictogram name="yes" size="lg" className="text-surface" />
            <span className="text-xl font-bold text-surface">Accept</span>
          </button>
        ) : null}

        {!isProject && permissions.canDecline ? (
          <button
            type="button"
            onClick={() => setDeclining(true)}
            disabled={inFlight}
            className="flex h-16 items-center justify-center gap-2.5 rounded-[18px] border border-line bg-surface disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            <Pictogram name="no" size="md" className="text-text-muted" />
            <span className="text-base font-bold text-text-secondary">Decline</span>
          </button>
        ) : null}

        {!isProject && !permissions.canAccept && !permissions.canQuote ? (
          <ClosedNotice enquiry={enquiry} />
        ) : null}
      </div>

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
 * Project enquiries move through the visit lifecycle on this route. Choosing
 * a slot is the normal A5 acceptance command; ACCEPTED remains valid here so
 * enquiries accepted by the previous UI do not dead-end.
 */
function ProjectVisitAction({ enquiry }: { readonly enquiry: EnquiryRecord }) {
  const planVisit = planVisitOf(enquiry.siteVisits);

  if (planVisit !== null) {
    return (
      <VisitDayPanel
        enquiry={enquiry}
        estimateHref={`/work/enquiries/${enquiry.id}/estimate`}
        estimateSubmitted={enquiry.status === "QUOTED"}
        showEstimateAction={enquiry.status !== "QUOTED"}
      />
    );
  }

  if (enquiry.status === "INVITED" || enquiry.status === "ACCEPTED") {
    return <FixedTimeOffer enquiry={enquiry} />;
  }

  return <ClosedNotice enquiry={enquiry} />;
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
 * A closed enquiry — declined, expired or withdrawn. No control is offered:
 * `permissionsFor` says none applies, and `describeStatus`'s own sentence
 * (never drawn as visible prose here) is read out for anyone using a screen
 * reader.
 */
function ClosedNotice({ enquiry }: { readonly enquiry: EnquiryRecord }) {
  const status = describeStatus(enquiry.status);
  return (
    <div className="flex h-20 items-center justify-center gap-3 rounded-[20px] border border-line bg-surface-sunken">
      {/*
        The label renders; `meaning` stays hidden. The label is two or three
        words ("Declined", "No longer open") and belongs on screen — a grey
        barred circle alone left a vendor unable to tell whether they had turned
        this down or simply run out of time. `meaning` is a full sentence, which
        is the one thing this surface still keeps out of visible copy.
      */}
      <Pictogram name="stopped" size="md" className="text-text-muted" />
      <span className="text-base font-bold text-text-secondary">{status.label}</span>
      <span className="sr-only">{status.meaning}</span>
    </div>
  );
}
