"use client";

import { VendorTrustLine } from "@/features/quotes/view/vendor-trust-line";
import type { VendorTrustView } from "@/features/quotes/adapters";
import type { VisitPlanPhase } from "@vsolve/query";
import {
  Badge,
  Button,
  Disclosure,
  EmptyState,
  RailLayout,
  Skeleton,
  buttonStyles,
  cn,
} from "@vsolve/ui";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { ReactNode } from "react";

import searchAnimationData from "@/features/bookings/view/search-lottie.json";
import { calendarDay, formatVisitSlot, type VisitSlotRow, type VisitTrackerView } from "../adapters";
import { AccessRefusal } from "./access-refusal";
import { VendorIdentity } from "./vendor-identity";

const LottiePlayer = dynamic(
  () => {
    if (typeof window === "undefined") return Promise.resolve(() => null);
    try {
      const canvas = document.createElement("canvas");
      if (!canvas?.getContext?.("2d")) {
        return Promise.resolve(() => null);
      }
    } catch {
      return Promise.resolve(() => null);
    }
    return import("lottie-react").then(
      (mod) => ((mod as any).default ?? (mod as any).Lottie ?? mod) as React.ComponentType<any>,
    );
  },
  {
    ssr: false,
    loading: () => (
      <div className="flex size-36 animate-pulse items-center justify-center">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-14 text-orange-600"
          aria-hidden
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.35-4.35" />
        </svg>
      </div>
    ),
  },
);

/**
 * The A5 tracker — `M2-FE-421`, `M2-FE-422`, `M2-FE-424`.
 *
 * One row per **share**, because the shares are the slots the Customer chose and
 * paid for. A slot nobody has taken yet is a row that says so and shows the
 * refund it is owed; driving the list off the visits instead would make exactly
 * that row disappear.
 *
 * ## The money on each row is the server's arithmetic, not ours
 *
 * `M2-FE-424`. Every share publishes `amount_paise`, `vendor_payout_paise` and
 * `platform_share_paise` in integer paise. The row says which of the three the
 * sentence is about and never adds anything up: a client that can produce a
 * number disagreeing with a refund statement eventually will.
 *
 * ## Identity appears per vendor, and only where we actually have it
 *
 * Disclosure starts at slot confirmation, because someone entering a home must
 * be nameable. **The visit read publishes no vendor at all** — `SiteVisit`
 * carries no partner, and the backend's own `VendorCardSerializer` is on no
 * published path — so the only name this app can reach is the one on a
 * delivered estimate. A confirmed slot with no estimate yet says the name is not
 * available rather than showing a placeholder. Logged in
 * `frontend-execution-plan.md` §7.
 */

export interface VisitTrackerProps {
  phase: VisitPlanPhase;
  tracker: VisitTrackerView | null;

  isLoading: boolean;
  readError: unknown;
  onRetryRead: () => void;

  /** Opens the plan-fee breakdown on this page. */
  onStartCheckout: () => void;
  checkoutAvailable: boolean;
  /** The server's chargeable amount after any carried credit. */
  checkoutPriceLabel: string | null;
  isStartingCheckout: boolean;
  checkoutError: unknown;
  canSimulatePendingCapture: boolean;
  onSimulatePendingCapture: () => void;

  /** Where the delivered estimates are read. Shown once any visit has completed. */
  estimatesHref: string;

  /**
   * Where one visit's own page lives.
   *
   * The list stopped carrying the visit-day commands when the visit page landed.
   * Arrival, the no-show report and the arrival code all need the context that
   * page has — who is coming, what the money did, what happens next — and a row
   * that offered "they did not come" beside four other rows was a destructive
   * control on a scanning surface.
   */
  visitHref: (visitId: string) => string;

  supportAction?: ReactNode;

  /**
   * Which half of this surface to draw.
   *
   * This component owns two things: the list of slots, and the plan's money
   * rail beside it. On its own page that pairing is right and `both` renders
   * it. Inside the request detail it is wrong twice over — the page already
   * has a rail of its own, so `both` produced a rail nested inside a column
   * next to an empty one, and the plan price ended up in the narrower of the
   * two.
   *
   * So the page renders this twice: `main` in the reading column and `rail`
   * into its own rail. Two mounts share one query through the cache, so the
   * second costs a render and no network.
   */
  slot?: "both" | "main" | "rail";

  /**
   * The estimates that have arrived, as prices.
   *
   * A written estimate is a page: scope, staging, exclusions, warranty. None of
   * that belongs on the request, and none of it is what somebody opening the
   * request wants — they want to know whether anything has come back and what
   * it costs. So this is the number and the name, and the way through to the
   * document.
   *
   * Empty renders nothing. Passed in rather than read here because entitlement
   * to these figures is the server's answer, and the panel above already has
   * it — asking again from a list component would be a second place that could
   * get the gate wrong.
  */
  estimates?: readonly {
    proposalId: string;
    vendorName: string | null;
    priceLabel: string;
    /** The estimate's own page. Falls back to `estimatesHref` when absent. */
    href?: string;
    trust?: VendorTrustView;
    /** The first stage's amount, the number people decide on. */
    startLabel?: string | null;
    timelineLabel?: string | null;
  }[];

  /**
   * The plan-size chooser, when re-choosing is still allowed.
   *
   * A slot rather than a prop set, because the chooser owns its own read, its
   * own command and its own refusal — and it is already built. Absent once a
   * professional has committed to a slot: resizing a plan somebody is already
   * travelling for is not a choice, and `POST .../visit-plan/` says so with a
   * `409`.
   */
  planSwitcher?: ReactNode;
  /** The brief this plan is for, behind a disclosure. Supplied by the caller. */
  brief?: ReactNode;
}

export function VisitTracker({
  phase,
  tracker,
  isLoading,
  readError,
  onRetryRead,
  checkoutAvailable,
  checkoutPriceLabel,
  onStartCheckout,
  isStartingCheckout,
  checkoutError,
  canSimulatePendingCapture,
  onSimulatePendingCapture,
  estimatesHref,
  visitHref,
  supportAction,
  planSwitcher,
  brief,
  slot = "both",
  estimates = [],
}: VisitTrackerProps) {
  if (isLoading) {
    if (slot === "rail") return null;
    return (
      <div aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading your site visits</span>
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (readError !== null && readError !== undefined) {
    if (slot === "rail") return null;
    return (
      <AccessRefusal
        error={readError}
        attempting="see your site visits"
        supportAction={supportAction}
        onRetry={onRetryRead}
        inline={false}
      />
    );
  }

  const isSearchingForProfessionals =
    tracker !== null &&
    tracker.rows.length > 0 &&
    tracker.rows.every((row) => row.state === "awaiting") &&
    estimates.length === 0;

  if (isSearchingForProfessionals) {
    if (slot === "rail") return null;
    return <VendorSearchPanel tracker={tracker} />;
  }

  const rail = (
        <VisitPlanRail
          phase={phase}
          tracker={tracker}
          checkoutAvailable={checkoutAvailable}
          checkoutPriceLabel={checkoutPriceLabel}
          onStartCheckout={onStartCheckout}
          isStartingCheckout={isStartingCheckout}
          checkoutError={checkoutError}
          canSimulatePendingCapture={canSimulatePendingCapture}
          onSimulatePendingCapture={onSimulatePendingCapture}
          planSwitcher={planSwitcher}
          brief={brief}
        />
  );

  const main = (
    <section
      aria-labelledby="visits-heading"
      className="overflow-hidden rounded-[10px] border border-line bg-surface shadow-card"
    >
      <div className="border-b border-line bg-canvas px-4 py-4 sm:px-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[0.6875rem] font-extrabold uppercase text-text-muted">
              On-site estimate journey
            </p>
            <h2 id="visits-heading" className="mt-1 text-xl font-extrabold leading-tight text-text sm:text-2xl">
              See every visit at a glance
            </h2>
          </div>
          {tracker?.isCharged ? <Badge tone="success">Paid</Badge> : null}
        </div>
        {tracker !== null && tracker.rows.length > 0 ? (
          <VisitJourney tracker={tracker} visitHref={visitHref} />
        ) : null}
      </div>

      <div className="p-4 sm:p-5">
        {tracker === null || tracker.rows.length === 0 ? (
          <EmptyState
            compact
            title="No visits yet"
            description="We are inviting professionals who cover this work. Each one that accepts confirms a time here."
          />
        ) : (
          <ul className="flex list-none flex-col gap-3 p-0">
            {tracker.rows.map((row) => (
              <VisitRow
                key={row.id}
                row={row}
                planSize={tracker.planSize}
                visitHref={visitHref}
              />
            ))}
          </ul>
        )}

        {estimates.length > 0 ? (
          <section aria-labelledby="estimates-heading" className="mt-5 rounded-[10px] border border-line bg-canvas p-3">
          <h3
            id="estimates-heading"
            className="text-[0.6875rem] font-bold uppercase text-text-secondary"
          >
            {estimates.length === 1 ? "The estimate so far" : "The estimates so far"}
          </h3>
          <ul className="mt-2 flex list-none flex-col gap-1.5 p-0">
            {estimates.map((estimate, index) => (
              <li key={estimate.proposalId}>
                <Link
                  href={estimate.href ?? estimatesHref}
                  className={cn(
                    "flex items-center gap-3 rounded-control px-3 py-2.5",
                    "bg-surface ring-1 ring-inset ring-line",
                    "transition-colors duration-fast hover:bg-surface-hover",
                    "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-text">
                      {estimate.vendorName ?? `Estimate ${index + 1}`}
                    </span>
                    {estimate.trust !== undefined ? (
                      <VendorTrustLine trust={estimate.trust} />
                    ) : null}
                    {estimate.startLabel || estimate.timelineLabel ? (
                      <span className="block text-xs text-text-secondary">
                        {[
                          estimate.startLabel ? `Pay ${estimate.startLabel} to start` : null,
                          estimate.timelineLabel ?? null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    ) : null}
                  </span>
                  <span
                    data-numeric
                    className="shrink-0 text-sm font-extrabold text-text"
                  >
                    {estimate.priceLabel}
                  </span>
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-3.5 shrink-0 text-warm-400"
                  >
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                  <span className="sr-only">— read this estimate in full</span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex">
            <Link
              href={estimatesHref}
              className={buttonStyles({ variant: "outline", className: "w-full sm:w-auto" })}
            >
              {estimates.length === 1 ? "Read it in full" : "Compare them in full"}
            </Link>
          </div>
          </section>
      ) : tracker !== null && tracker.rows.some((row) => row.state === "completed") ? (
        // A visit has been and no estimate has landed yet. The way through
        // still exists, because the page it leads to explains the wait.
        <div className="mt-4">
          <Link href={estimatesHref} className={buttonStyles({ variant: "outline" })}>
            Read the estimates
          </Link>
        </div>
      ) : null}

      {/* Everything the page used to say up front, kept and folded.
          None of it is deleted — a Customer who wants to know why nobody is
          named yet, or what happens to an unfilled slot's money, still has the
          answer on this screen. It is simply no longer in the way of the three
          rows they came to look at. */}
      <Disclosure summary="How these visits work" className="mt-5">
        <PlanStatement phase={phase} tracker={tracker} />
        {tracker !== null && tracker.rows.some((row) => row.vendor === null) ? (
          <p className="mt-2 max-w-prose text-sm leading-6 text-text-secondary">
            We do not show you who has been invited. Once somebody confirms a time
            we tell you their name and show you their photograph, because they are
            coming into your home — their phone number stays with us until you have
            agreed the work.
          </p>
        ) : null}
      </Disclosure>

      {slot === "main" ? (
        <div className="mt-5 lg:hidden">
          <VisitPlanRail
            embedded
            phase={phase}
            tracker={tracker}
            checkoutAvailable={checkoutAvailable}
            checkoutPriceLabel={checkoutPriceLabel}
            onStartCheckout={onStartCheckout}
            isStartingCheckout={isStartingCheckout}
            checkoutError={checkoutError}
            canSimulatePendingCapture={canSimulatePendingCapture}
            onSimulatePendingCapture={onSimulatePendingCapture}
            planSwitcher={planSwitcher}
            brief={brief}
          />
        </div>
      ) : null}
      </div>
    </section>
  );

  // The page asked for one half. `RailLayout` is the standalone pairing
  // and is skipped entirely, because a layout that places a rail is the
  // wrong thing to nest inside a page that already has one.
  if (slot === "rail") return rail;
  if (slot === "main") return main;

  return (
    <RailLayout railLabel="Your visit plan" rail={rail}>
      {main}
    </RailLayout>
  );
}

function VendorSearchPanel({ tracker }: { tracker: VisitTrackerView }) {
  const slots = tracker.planSize === 1 ? "one visit" : `${tracker.planSize} visits`;

  return (
    <section
      aria-labelledby="vendor-search-heading"
      className="overflow-hidden rounded-[10px] border border-line bg-surface shadow-card"
    >
      <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-center">
        <div className="order-2 min-w-0 lg:order-1">
          <p className="text-[0.6875rem] font-extrabold uppercase text-text-muted">
            Matching in progress
          </p>
          <h2
            id="vendor-search-heading"
            className="mt-2 text-2xl font-extrabold leading-tight text-text sm:text-3xl"
          >
            Finding the best professionals for this job
          </h2>
          <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-text-secondary">
            We are checking verified professionals nearby. The first accepted
            visit will appear here with the professional and time.
          </p>

          <SearchJourney slots={slots} />
        </div>

        <div className="order-1 mx-auto flex aspect-square w-full max-w-[17rem] items-center justify-center lg:order-2">
          <div className="relative flex size-56 sm:size-60 items-center justify-center">
            <span className="absolute inset-0 rounded-full border border-orange-200/60 bg-orange-100/20 animate-ping [animation-duration:3.2s]" />
            <span className="absolute inset-6 rounded-full border border-orange-200 bg-orange-50/60 animate-pulse [animation-duration:2.2s]" />

            <div className="relative z-10 flex size-48 sm:size-52 items-center justify-center overflow-hidden rounded-full border-2 border-orange-200/90 bg-white shadow-xl">
              <div className="relative z-20 flex size-full items-center justify-center p-2">
                <LottiePlayer
                  src={searchAnimationData}
                  loop
                  autoplay
                  className="size-full max-h-[170px] max-w-[170px]"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function SearchJourney({ slots }: { slots: string }) {
  return (
    <ol className="mt-6 grid grid-cols-3" aria-label="Matching journey">
      <SearchJourneyStep label="Request ready" state="done" />
      <SearchJourneyStep label={`Finding ${slots}`} state="active" />
      <SearchJourneyStep label="Time confirmed" state="next" />
    </ol>
  );
}

function SearchJourneyStep({
  label,
  state,
}: {
  label: string;
  state: "done" | "active" | "next";
}) {
  return (
    <li className="relative flex min-w-0 flex-col items-center text-center before:absolute before:left-0 before:right-0 before:top-4 before:h-px before:bg-line first:before:left-1/2 last:before:right-1/2">
      <span aria-hidden className={cn("relative z-10 grid size-8 place-items-center rounded-full ring-4 ring-surface", state === "done" ? "bg-success-surface text-success-text" : null, state === "active" ? "bg-action text-action-text" : null, state === "next" ? "bg-surface-sunken text-text-muted" : null)}>
        {state === "done" ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="size-3.5"><path d="m5 12 5 5 9-10" /></svg> : <span className={cn("size-2 rounded-full bg-current", state === "active" ? "animate-pulse motion-reduce:animate-none" : null)} />}
      </span>
      <span className="mt-2 text-[0.6875rem] font-bold leading-4 text-text-secondary">{label}</span>
    </li>
  );
}

/**
 * The plan, the amount, and the one control — beside the visits rather than under them.
 *
 * The mobile design split "your visits" and "pay for visits" across two screens.
 * On a wide screen they belong together, and the reason is the unfilled slot: it
 * sits directly beside the amount, which is exactly the question somebody has
 * when they are asked to pay for two visits and can only see one time. Putting
 * the answer a screen away is how that question becomes a support message.
 *
 * **Nothing here is charged by being rendered.** The checkout opens only when
 * the server says a professional is holding a slot, and the rail says so in the
 * `chosen` phase rather than implying the money is already due.
 */
function VisitPlanRail({
  phase,
  tracker,
  checkoutAvailable,
  checkoutPriceLabel,
  onStartCheckout,
  isStartingCheckout,
  checkoutError,
  canSimulatePendingCapture,
  onSimulatePendingCapture,
  planSwitcher,
  brief,
  embedded = false,
}: {
  phase: VisitPlanPhase;
  tracker: VisitTrackerView | null;
  checkoutAvailable: boolean;
  checkoutPriceLabel: string | null;
  onStartCheckout: () => void;
  isStartingCheckout: boolean;
  checkoutError: unknown;
  canSimulatePendingCapture: boolean;
  onSimulatePendingCapture: () => void;
  planSwitcher?: ReactNode;
  brief?: ReactNode;
  embedded?: boolean;
}) {
  if (tracker === null) return null;

  const held = tracker.rows.find((row) => row.state === "held") ?? null;
  const paid = phase === "active" || phase === "settled";
  const status = paid
    ? { label: "Paid", tone: "success" as const }
    : phase === "pending"
      ? { label: "Confirming", tone: "info" as const }
      : checkoutAvailable
        ? { label: "Ready", tone: "warning" as const }
        : { label: "Not charged", tone: "neutral" as const };

  return (
    <section
      aria-label="Visit plan payment"
      className={cn(
        "flex flex-col gap-4",
        embedded
          ? "border-t border-line pt-5"
          : "rounded-[10px] border border-line bg-surface p-4 shadow-card",
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-navy-900 text-white">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="size-5">
              <path d="M7 3v3m10-3v3M5 9h14M6 5h12a1 1 0 0 1 1 1v13H5V6a1 1 0 0 1 1-1Z" />
            </svg>
          </span>
          <div>
            <p className="text-[0.6875rem] font-extrabold uppercase text-text-muted">
              {tracker.planSize === 1 ? "1 visit" : `${tracker.planSize} visits`}
            </p>
            <p data-numeric className="mt-0.5 text-2xl font-extrabold leading-none text-text">
              {tracker.priceLabel}
            </p>
          </div>
        </div>
        <Badge tone={status.tone}>{status.label}</Badge>
      </header>

      <PaymentJourney phase={phase} checkoutAvailable={checkoutAvailable} />

      {checkoutAvailable ? (
        <div className="flex flex-col gap-2">
          <Button
            block
            size="lg"
            onClick={onStartCheckout}
            loading={isStartingCheckout}
            loadingLabel="Starting your payment"
          >
            {phase === "failed" ? "Try again" : "Pay"}{" "}
            {checkoutPriceLabel ?? tracker.priceLabel} and lock the visits
          </Button>
          {held !== null ? (
            <p className="text-center text-[0.8125rem] leading-5 text-text-secondary">
              {formatVisitSlot(held.scheduledFor, held.timeZone) ?? "The confirmed slot"} is
              held until you do.
            </p>
          ) : null}
        </div>
      ) : phase === "chosen" ? (
        <p className="text-sm font-medium leading-5 text-text-secondary">
          Payment opens only after a professional accepts a time.
        </p>
      ) : phase === "pending" ? (
        <div role="status">
          <p className="text-sm font-medium leading-5 text-text-secondary">
            Your bank is responding. This page updates automatically.
          </p>
          {canSimulatePendingCapture ? (
            <Button
              className="mt-3"
              onClick={onSimulatePendingCapture}
              loading={isStartingCheckout}
              loadingLabel="Marking as paid"
            >
              Mark as paid
            </Button>
          ) : null}
        </div>
      ) : paid ? (
        <p className="text-sm font-medium leading-5 text-text-secondary">
          Your visits are locked. No further visit payment is needed.
        </p>
      ) : null}

      <AccessRefusal error={checkoutError} attempting="pay for these visits" />

      {tracker.openSlots > 0 ? (
        <p className="text-sm leading-5 text-text-secondary">
          A visit that never happens refunds its share on its own — you do not
          have to ask.
        </p>
      ) : null}

      <Disclosure summary="Payment and refund details" hint="Visit fee only">
        <p>
          Travel and the professional&rsquo;s time on site, plus a written estimate
          you keep whether or not you hire them. It is not part of the project
          price. Any visit that is not filled refunds its share automatically.
        </p>
      </Disclosure>

      {planSwitcher}
      {brief}
    </section>
  );
}

function PaymentJourney({
  phase,
  checkoutAvailable,
}: {
  phase: VisitPlanPhase;
  checkoutAvailable: boolean;
}) {
  const paid = phase === "active" || phase === "settled";
  const matched = checkoutAvailable || phase === "pending" || paid;

  return (
    <ol className="grid grid-cols-3" aria-label="Payment journey">
      <PaymentJourneyStep label="Pro accepts" state={matched ? "done" : "active"} />
      <PaymentJourneyStep label="Pay once" state={paid ? "done" : matched ? "active" : "next"} />
      <PaymentJourneyStep label="Visits lock" state={paid ? "done" : "next"} />
    </ol>
  );
}

function PaymentJourneyStep({
  label,
  state,
}: {
  label: string;
  state: "done" | "active" | "next";
}) {
  return (
    <li className="relative flex min-w-0 flex-col items-center text-center before:absolute before:left-0 before:right-0 before:top-3 before:h-px before:bg-line first:before:left-1/2 last:before:right-1/2">
      <span
        aria-hidden
        className={cn(
          "relative z-10 grid size-6 place-items-center rounded-full ring-4 ring-surface",
          state === "done" ? "bg-success-text text-white" : null,
          state === "active" ? "bg-action text-action-text" : null,
          state === "next" ? "bg-surface-sunken text-text-muted" : null,
        )}
      >
        {state === "done" ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="size-3">
            <path d="m5 12 4 4 10-10" />
          </svg>
        ) : (
          <span className={cn("size-1.5 rounded-full bg-current", state === "active" ? "animate-pulse motion-reduce:animate-none" : null)} />
        )}
      </span>
      <span className="mt-2 text-[0.625rem] font-bold leading-4 text-text-secondary">{label}</span>
    </li>
  );
}

/**
 * What the plan as a whole is doing, in one paragraph.
 *
 * The `chosen` state is the one worth reading twice: a plan exists and
 * **nothing has been charged**, which is true right up until a professional
 * confirms a time. Saying anything warmer there would be charging the Customer
 * in their imagination.
 */
function PlanStatement({
  phase,
  tracker,
}: {
  phase: VisitPlanPhase;
  tracker: VisitTrackerView | null;
}) {
  const size = tracker?.planSize ?? 0;
  const price = tracker?.priceLabel ?? null;

  switch (phase) {
    case "unpriced":
      return (
        <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
          We cannot offer site visits for this yet. Nothing has been charged.
        </p>
      );
    case "choosing":
      return (
        <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
          You have not chosen how many professionals should visit. Nothing has
          been charged.
        </p>
      );
    case "chosen":
      return (
        <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
          You asked for {size === 1 ? "one professional" : `${size} professionals`} to
          visit and estimate on site.{" "}
          <strong className="font-semibold text-text">Nothing has been charged.</strong> You
          pay {price ?? "for the plan"} once, when the first one confirms a time.
        </p>
      );
    case "pending":
      return (
        <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary" role="status">
          We are confirming your payment for these visits. Your bank or UPI app
          tells us the outcome and that can take a few minutes. Do not pay again —
          this page updates itself.
        </p>
      );
    case "active":
      return (
        <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
          You paid {price ?? "for the plan"} for {size === 1 ? "one visit" : `${size} visits`}.
          Any slot nobody fills refunds its share of that on its own — you do not
          have to ask.
        </p>
      );
    case "failed":
      return (
        <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
          The payment for these visits did not go through, so you have not been
          charged and the slot that was being held has gone back.
        </p>
      );
    case "void":
      return (
        <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
          This request closed before any professional confirmed a visit. Nothing
          was charged.
        </p>
      );
    case "settled":
      return (
        <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
          Every visit on this plan is settled — paid to the professional who came,
          or refunded to you.
        </p>
      );
    default:
      return (
        <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
          We cannot describe where these visits stand right now.
        </p>
      );
  }
}

const SLOT_BADGE: Record<VisitSlotRow["state"], { label: string; tone: "neutral" | "info" | "success" | "warning" | "danger" }> = {
  awaiting: { label: "Waiting for a professional", tone: "neutral" },
  // Held, not scheduled. The vendor has committed to a time and the Customer has
  // not bought it yet — showing this as confirmed would promise both of them
  // something nobody has paid for.
  held: { label: "Holding a time for you", tone: "warning" },
  scheduled: { label: "Confirmed", tone: "success" },
  in_progress: { label: "On site", tone: "info" },
  completed: { label: "Visited", tone: "success" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  vendor_no_show: { label: "They did not come", tone: "danger" },
  customer_no_show: { label: "Nobody was on site", tone: "warning" },
};

/**
 * The three counts that open the list.
 *
 * Derived here rather than published, because each one is a question about
 * *rows* — "is anything happening today" — and the server publishes a plan.
 * `openSlots` is the tracker's own; the other two are read off the row states.
 *
 * Renders nothing when there is nothing to count. A strip of zeroes above an
 * empty state is a summary of an absence.
 */
function VisitJourney({
  tracker,
  visitHref,
}: {
  tracker: VisitTrackerView;
  visitHref: (visitId: string) => string;
}) {
  return (
    <ol className="mt-5 grid list-none p-0" style={{ gridTemplateColumns: `repeat(${tracker.rows.length}, minmax(0, 1fr))` }}>
      {tracker.rows.map((row) => {
        const body = (
          <>
            <span
              aria-hidden
              className={cn(
                "relative z-10 grid size-11 place-items-center rounded-full border-2 ring-4 ring-canvas transition-transform duration-fast",
                row.state === "awaiting" ? "border-info-line bg-selected-surface text-action-active" : null,
                row.state === "held" ? "border-warning-line bg-warning-surface text-warning-text" : null,
                row.state === "scheduled" || row.state === "in_progress" ? "border-action-line bg-action-surface text-action-active" : null,
                row.state === "completed" ? "border-success-line bg-success-surface text-success-text" : null,
                row.state === "cancelled" || row.state === "vendor_no_show" || row.state === "customer_no_show" ? "border-line bg-surface-sunken text-text-muted" : null,
                row.visitId !== null ? "group-hover:-translate-y-0.5" : null,
              )}
            >
              <VisitStateGlyph state={row.state} />
            </span>
            <span className="mt-2 text-[0.6875rem] font-bold text-text-secondary">
              Visit {row.position}
            </span>
            <span className="mt-0.5 line-clamp-2 text-xs font-extrabold leading-4 text-text">
              {journeyLabel(row)}
            </span>
          </>
        );

        return (
          <li key={row.id} className="relative flex min-w-0 flex-col items-center px-1 text-center before:absolute before:left-0 before:right-0 before:top-[1.35rem] before:h-0.5 before:bg-line first:before:left-1/2 last:before:right-1/2">
            {row.visitId === null ? (
              <div className="group flex min-w-0 flex-col items-center">{body}</div>
            ) : (
              <Link href={visitHref(row.visitId)} className="group flex min-w-0 flex-col items-center rounded-control focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus-ring">
                {body}
                <span className="sr-only">Open visit {row.position}</span>
              </Link>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function journeyLabel(row: VisitSlotRow): string {
  switch (row.state) {
    case "awaiting":
      return "Matching";
    case "held":
      return "Held for you";
    case "scheduled":
      return "Booked";
    case "in_progress":
      return "On site";
    case "completed":
      return "Visit complete";
    case "vendor_no_show":
      return "Did not arrive";
    case "customer_no_show":
      return "Visit missed";
    case "cancelled":
      return "Cancelled";
    default:
      return "Update";
  }
}

function VisitStateGlyph({ state }: { state: VisitSlotRow["state"] }) {
  if (state === "completed") {
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="size-5"><path d="m5 12 4 4 10-10" /></svg>;
  }
  if (state === "awaiting") {
    return <span className="relative grid size-5 place-items-center"><span className="absolute size-5 animate-ping rounded-full bg-current opacity-20 motion-reduce:animate-none" /><span className="size-2.5 rounded-full bg-current" /></span>;
  }
  if (state === "cancelled" || state === "vendor_no_show" || state === "customer_no_show") {
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="size-5"><path d="m7 7 10 10M17 7 7 17" /></svg>;
  }
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="size-5"><path d="M7 3v3m10-3v3M5 9h14M6 5h12a1 1 0 0 1 1 1v13H5V6a1 1 0 0 1 1-1Z" /></svg>;
}

/**
 * Whether a visit falls on the reader's today, in the visit's own zone.
 *
 * The zone matters more than it looks: a 9pm visit in one area is already
 * tomorrow in another, and "Today" is the one label on this screen somebody
 * acts on immediately. Compared as formatted date strings in that zone rather
 * than by arithmetic on instants, so the comparison is the same one the row's
 * own label is rendered from.
 */
function isToday(scheduledFor: string | null, timeZone: string | null): boolean {
  if (scheduledFor === null) return false;
  const when = new Date(scheduledFor);
  if (Number.isNaN(when.getTime())) return false;
  const zone = timeZone ?? undefined;
  try {
    const format = (value: Date) => value.toLocaleDateString("en-IN", { timeZone: zone });
    return format(when) === format(new Date());
  } catch {
    // An unknown IANA zone from a future service area must not take the list
    // down over a badge. Not-today is the quiet answer.
    return false;
  }
}

/**
 * One slot, as a card you scan rather than a paragraph you read.
 *
 * The row used to carry the vendor sentence, the money sentence, the estimate
 * deadline sentence and up to two destructive controls — four blocks of prose
 * per row, three rows deep. All of it still exists; it moved to the visit's own
 * page, which is linked from here and is where somebody who has picked a row
 * actually wants to be.
 *
 * What stays is what a scanning reader needs to choose between rows: who,
 * when, how much, and what state it is in.
 */
function VisitRow({
  row,
  planSize,
  visitHref,
}: {
  row: VisitSlotRow;
  planSize: number;
  visitHref: (visitId: string) => string;
}) {
  const badge = SLOT_BADGE[row.state] ?? SLOT_BADGE.awaiting;
  // The visit's own zone since 1.26.0, not the deprecated single-city constant.
  const when = formatVisitSlot(row.scheduledFor, row.timeZone);
  const day = calendarDay(row.scheduledFor, row.timeZone);
  const today = isToday(row.scheduledFor, row.timeZone);

  if (row.visitId === null) {
    return <AwaitingVisitRow row={row} planSize={planSize} />;
  }

  return (
    <li
      className={cn(
        "rounded-[10px] border bg-surface p-3 shadow-sm",
        // Today's visit is the one row that might need somebody in the next hour,
        // so it is the one row drawn differently. Emphasis is the palette's own
        // action tint rather than a second colour.
        today ? "border-action-line bg-action-surface" : "border-line",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        {row.vendor !== null ? (
          <VendorIdentity vendor={row.vendor} />
        ) : (
          <div className="min-w-0">
            <p className="text-sm font-medium text-text">
              {row.state === "awaiting"
                ? "Still finding a professional"
                : "We will name them before they arrive"}
            </p>
            <p className="text-sm text-text-secondary">
              Visit {row.position} of {planSize}
            </p>
          </div>
        )}
        <Badge tone={badge.tone}>{badge.label}</Badge>
      </div>

      <Link
        href={visitHref(row.visitId)}
        className={cn(
          "mt-3 flex items-center gap-3 rounded-control px-3 py-2.5",
          "transition-colors duration-fast",
          "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring",
          today
            ? "bg-action text-action-text hover:bg-action-hover"
            : "bg-surface-sunken hover:bg-warm-200",
        )}
      >
        <SlotWhen when={when} day={day} onAction={today} />
        <SlotMoney row={row} onAction={today} />
        <svg
          viewBox="0 0 24 24"
          aria-hidden
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-4 shrink-0"
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
        <span className="sr-only">
          {today ? "Open today's visit" : "Open this visit"}
        </span>
      </Link>
    </li>
  );
}

/**
 * The money, in three words rather than three lines.
 *
 * Every clause is the short form of the sentence `SlotMoneyLine` still renders
 * in full on the visit page. The list says which of the five things happened;
 * the page says what it means.
 */
const MONEY_CLAUSE: Record<VisitSlotRow["money"]["kind"], string> = {
  unspent: "ready",
  committed: "covering this visit",
  earned: "paid out",
  refunded: "refunded",
  replaced: "held for a free replacement",
};

/**
 * The day, as a tile where there is one and as words where there is not.
 *
 * A slot without a confirmed date cannot print a placeholder day, because that
 * would be an invented fact. It says the time is still being confirmed instead.
 */
function SlotWhen({
  when,
  day,
  onAction = false,
}: {
  when: string | null;
  day: { weekday: string; dayOfMonth: string; month: string } | null;
  onAction?: boolean;
}) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2.5">
      {day === null ? null : (
        <span
          aria-hidden
          className={cn(
            "flex size-9 shrink-0 flex-col items-center justify-center rounded-plate",
            onAction ? "bg-navy-900/10" : "bg-surface",
          )}
        >
          <span className="text-[0.5625rem] font-bold uppercase leading-none opacity-70">
            {day.weekday}
          </span>
          <span className="text-sm font-extrabold leading-none">{day.dayOfMonth}</span>
        </span>
      )}
      <span className="truncate text-sm font-semibold">
        {when ?? "Time being confirmed"}
      </span>
    </span>
  );
}

function AwaitingVisitRow({
  row,
  planSize,
}: {
  row: VisitSlotRow;
  planSize: number;
}) {
  return (
    <li className="rounded-[10px] border border-info-line bg-selected-surface p-4 sm:p-5">
      <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
        <SearchBeacon />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            <Badge tone="info" dot>
              Matching now
            </Badge>
            <span className="text-xs font-bold uppercase text-text-secondary">
              Visit {row.position} of {planSize}
            </span>
          </div>
          <h3 className="mt-3 text-xl font-extrabold leading-tight text-text sm:text-lg">
            Finding your next professional
          </h3>
          <p className="mt-1 max-w-[34rem] text-sm font-medium leading-6 text-text-secondary">
            We are checking verified professionals near you. The moment one accepts,
            their visit time appears here.
          </p>
        </div>
      </div>
    </li>
  );
}

function SearchBeacon() {
  return (
    <div
      aria-hidden
      className="relative flex size-28 shrink-0 items-center justify-center overflow-hidden rounded-full border border-orange-200 bg-white shadow-sm sm:size-20"
    >
      <LottiePlayer
        src={searchAnimationData}
        loop
        autoplay
        className="size-full max-h-[85px] max-w-[85px]"
      />
    </div>
  );
}

/**
 * What this slot's money did, in three words.
 *
 * Every clause is the short form of the sentence `SlotMoneyLine` renders in
 * full on the visit page. The list says which of the five things happened; the
 * page says what it means.
 */
function SlotMoney({ row, onAction = false }: { row: VisitSlotRow; onAction?: boolean }) {
  return (
    <span
      className={cn(
        "shrink-0 text-right text-xs font-semibold tabular-nums",
        onAction ? "opacity-80" : "text-text-secondary",
      )}
    >
      {row.money.amountLabel} {MONEY_CLAUSE[row.money.kind]}
    </span>
  );
}
