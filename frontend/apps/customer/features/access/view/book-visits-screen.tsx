"use client";

import {
  canCheckOutVisitPlan,
  visitPlanPhase,
  type VisitPlanPhase,
} from "@vsolve/query";
import { Badge, Button, Skeleton, buttonStyles, cn } from "@vsolve/ui";
import Link from "next/link";
import { useState } from "react";

import { useProfileCompletionGate } from "@/features/account/view/profile-completion-dialog";

import {
  calendarDay,
  formatVisitSlot,
  toPlanCheckoutView,
  toVisitTrackerView,
  type VisitSlotRow,
} from "../adapters";
import {
  canSimulateAccessCheckout,
  useSimulateVisitPlanCapture,
  useStartVisitPlanCheckout,
  useVisitPlan,
} from "../queries";
import { AccessRefusal } from "./access-refusal";
import { VisitPaymentDialog } from "./visit-payment-dialog";

/**
 * The visit-plan checkout — `M2-FE-420`.
 *
 * Opened when the **first professional holds a slot**, which is the only moment
 * an A5 Customer is ever asked for money before work is agreed. The whole plan
 * is charged once here; later professionals book against it without any further
 * payment.
 *
 * ## Why this route can exist before the money does
 *
 * The held slot is a real commitment by a real vendor, and it **lapses
 * harmlessly** if the Customer never pays: the time returns to the availability
 * grid and nothing was charged. So arriving here and leaving is a safe outcome,
 * and the screen says so rather than pressuring.
 *
 * ## Never success from the redirect
 *
 * `M2-FE-404` applies here as much as to the unlock. `POST .../checkout/`
 * answers with an `AccessCheckout` that says an attempt exists; the plan reaches
 * `ACTIVE`, and the held slot hardens to `SCHEDULED`, only on a verified
 * provider callback. The screen therefore polls the plan read and shows the
 * pending state until the server answers — and offers nothing to press while it
 * does, because every control that could exist there is a way to pay twice.
 */

export interface BookVisitsScreenProps {
  requirementId: string;
  /** Back to the request. This feature owns no route. */
  requestHref: string;
}

export function BookVisitsScreen({ requirementId, requestHref }: BookVisitsScreenProps) {
  const profileGate = useProfileCompletionGate("payment");
  const planQuery = useVisitPlan(requirementId);
  const checkout = useStartVisitPlanCheckout();
  const simulateCapture = useSimulateVisitPlanCapture();
  const [paying, setPaying] = useState(false);

  const state = planQuery.data ?? null;
  const phase: VisitPlanPhase | null = state === null ? null : visitPlanPhase(state);
  const view = state === null ? null : toPlanCheckoutView(state);
  const tracker = state === null ? null : toVisitTrackerView(state);
  const heldSlot = tracker?.rows.find((row) => row.state === "held") ?? null;
  const pendingPaymentAttemptId = state?.plan?.payment_attempt_id ?? null;
  const canSimulatePendingCapture =
    state?.plan?.simulated_capture_available === true && pendingPaymentAttemptId !== null;

  function markVisitPlanPaid(paymentAttemptId: string) {
    simulateCapture.mutate({ requirementId, paymentAttemptId });
  }

  function startCheckout() {
    if (view === null || phase === null) return;
    checkout.mutate(
      {
        requirementId,
        planId: view.planId,
        isRetryAfterFailure: phase === "failed",
      },
      {
        onSuccess: (started) => {
          if (canSimulateAccessCheckout(started)) {
            markVisitPlanPaid(started.payment_attempt_id);
          }
        },
        // Closed either way. A `201` hands off to the provider and this screen
        // takes over the pending state; a refusal is rendered here too, because
        // the dialog is about to be replaced by whatever the server now says.
        onSettled: () => setPaying(false),
      },
    );
  }

  if (planQuery.isPending) {
    return (
      <Wrapper>
        <div aria-busy="true" aria-live="polite">
          <span className="sr-only">Loading your visit plan</span>
          <Skeleton className="h-40 w-full" />
        </div>
      </Wrapper>
    );
  }

  if (planQuery.isError || state === null || view === null || phase === null) {
    return (
      <Wrapper>
        <AccessRefusal
          error={planQuery.error ?? new Error("No visit plan")}
          attempting="book your visits"
          onRetry={() => void planQuery.refetch()}
          inline={false}
        />
        <BackLink href={requestHref} />
      </Wrapper>
    );
  }

  return (
    <Wrapper>
      <header className="max-w-2xl">
        <Badge tone={phase === "active" || phase === "settled" ? "success" : "info"}>
          {phase === "active" || phase === "settled" ? "Visits locked" : "Ready to book"}
        </Badge>
        <h1 className="mt-3 text-3xl font-extrabold leading-tight text-text sm:text-4xl">
          Lock your on-site estimates
        </h1>
        <p className="mt-2 text-sm font-medium leading-6 text-text-secondary sm:text-base">
          One payment covers the complete visit plan. The project itself is priced later.
        </p>
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-5">
          <HeldVisitVisual heldSlot={heldSlot} planSize={view.planSize} openSlots={view.openSlots} />
          <PaymentBenefits />
        </div>

        <aside className="rounded-[10px] border border-line bg-surface p-5 shadow-card lg:sticky lg:top-24">
          <PlanSummary
            planSize={view.planSize}
            priceLabel={view.priceLabel}
            creditLabel={view.creditLabel}
            chargeableLabel={view.chargeableLabel}
          />

          <div className="mt-5 border-t border-line pt-5">
            <CheckoutAction
              phase={phase}
              canCheckOut={canCheckOutVisitPlan(state)}
              chargeableLabel={view.chargeableLabel}
              isPending={checkout.isPending || simulateCapture.isPending}
              canSimulatePendingCapture={canSimulatePendingCapture}
              onStart={() => setPaying(true)}
              onSimulateCapture={() => {
                if (pendingPaymentAttemptId !== null) {
                  profileGate.run(() => markVisitPlanPaid(pendingPaymentAttemptId));
                }
              }}
              requestHref={requestHref}
            />
          </div>

          <div className="mt-4">
            <AccessRefusal
              error={checkout.error ?? simulateCapture.error}
              attempting="pay for these visits"
            />
          </div>
        </aside>
      </div>

      <BackLink href={requestHref} />

      <VisitPaymentDialog
        open={paying}
        onOpenChange={setPaying}
        planSize={view.planSize}
        chargeableLabel={view.chargeableLabel}
        creditLabel={view.creditLabel}
        rows={tracker?.rows ?? []}
        isPending={checkout.isPending || simulateCapture.isPending}
        onConfirm={() => {
          setPaying(false);
          profileGate.run(startCheckout);
        }}
      />
      {profileGate.dialog}
    </Wrapper>
  );
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col px-4 py-6 sm:px-6 lg:py-10">
      {children}
    </div>
  );
}

function BackLink({ href }: { href: string }) {
  return (
    <div className="mt-8">
      <Link href={href} className={buttonStyles({ variant: "ghost" })}>
        Back to this request
      </Link>
    </div>
  );
}

/**
 * What is being charged, from the plan's own fields.
 *
 * `chargeable_paise` and not `price_paise`: a request reclassified from A3
 * carries its unlock across as visit-plan credit, and quoting the tier price at
 * somebody who owes less than it would be wrong in the direction that costs
 * them money. Both are published and the server decides which is which.
 */
function PlanSummary({
  planSize,
  priceLabel,
  creditLabel,
  chargeableLabel,
}: {
  planSize: number;
  priceLabel: string;
  creditLabel: string | null;
  chargeableLabel: string;
}) {
  return (
    <dl>
      <div className="flex items-start justify-between gap-3">
        <div>
          <dt className="text-[0.6875rem] font-extrabold uppercase text-text-muted">
            Pay once
          </dt>
          <dd data-numeric className="mt-1 text-3xl font-extrabold leading-none text-text">
            {chargeableLabel}
          </dd>
        </div>
        <span aria-hidden className="grid size-11 place-items-center rounded-full bg-action-surface text-action-active ring-1 ring-action-line">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="size-5">
            <rect x="3" y="6" width="18" height="13" rx="2" />
            <path d="M3 10h18m-5 5h2" />
          </svg>
        </span>
      </div>
      <div className="mt-5 flex items-baseline justify-between gap-3 border-t border-line pt-4">
        <dt className="text-sm text-text-secondary">
          {planSize === 1 ? "1 visit + written estimate" : `${planSize} visits + written estimates`}
        </dt>
        <dd className="text-sm font-bold text-text">{priceLabel}</dd>
      </div>
      {creditLabel !== null ? (
        <div className="mt-3 flex items-baseline justify-between gap-3">
          <dt className="text-sm text-text-secondary">Already paid on this request</dt>
          <dd className="font-medium text-text">−{creditLabel}</dd>
        </div>
      ) : null}
    </dl>
  );
}

function HeldVisitVisual({
  heldSlot,
  planSize,
  openSlots,
}: {
  heldSlot: VisitSlotRow | null;
  planSize: number;
  openSlots: number;
}) {
  const day = calendarDay(heldSlot?.scheduledFor ?? null, heldSlot?.timeZone ?? null);
  const when = formatVisitSlot(heldSlot?.scheduledFor ?? null, heldSlot?.timeZone ?? null);

  return (
    <section className="overflow-hidden rounded-[10px] border border-action-line bg-selected-surface shadow-card">
      <div className="grid gap-5 p-5 sm:grid-cols-[8rem_minmax(0,1fr)] sm:items-center sm:p-6">
        <div className="mx-auto grid size-28 place-items-center rounded-full bg-surface shadow-raised ring-1 ring-action-line sm:mx-0">
          {day === null ? (
            <span className="relative grid size-14 place-items-center rounded-full bg-action-surface text-action-active">
              <span className="absolute inset-0 animate-ping rounded-full bg-action opacity-15 motion-reduce:animate-none" />
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="relative size-6"><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></svg>
            </span>
          ) : (
            <span className="flex flex-col items-center text-center">
              <span className="text-xs font-extrabold uppercase text-text-muted">{day.weekday}</span>
              <span className="text-4xl font-extrabold leading-none text-text">{day.dayOfMonth}</span>
              <span className="mt-1 text-xs font-bold uppercase text-text-secondary">{day.month}</span>
            </span>
          )}
        </div>

        <div className="min-w-0 text-center sm:text-left">
          <Badge tone={heldSlot === null ? "info" : "warning"} dot>
            {heldSlot === null ? "Finding a time" : "Held for you"}
          </Badge>
          <h2 className="mt-3 text-2xl font-extrabold leading-tight text-text">
            {heldSlot?.vendorName ?? "Your first professional"}
          </h2>
          <p className="mt-1 text-sm font-semibold text-text-secondary">
            {when ?? "We will show the visit time as soon as a professional accepts."}
          </p>
        </div>
      </div>

      <div className="border-t border-action-line bg-surface/70 px-5 py-4 sm:px-6">
        <ol className="grid" style={{ gridTemplateColumns: `repeat(${planSize}, minmax(0, 1fr))` }} aria-label="Visits included">
          {Array.from({ length: planSize }, (_, index) => {
            const isHeld = heldSlot !== null && index + 1 === heldSlot.position;
            return (
              <li key={index} className="relative flex flex-col items-center text-center before:absolute before:left-0 before:right-0 before:top-3 before:h-px before:bg-line first:before:left-1/2 last:before:right-1/2">
                <span aria-hidden className={isHeld ? "relative z-10 grid size-6 place-items-center rounded-full bg-action text-action-text ring-4 ring-surface" : "relative z-10 grid size-6 place-items-center rounded-full bg-surface-sunken text-text-muted ring-4 ring-surface"}>
                  {isHeld ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="size-3"><path d="m5 12 4 4 10-10" /></svg> : <span className="size-1.5 rounded-full bg-current" />}
                </span>
                <span className="mt-2 text-[0.6875rem] font-bold text-text-secondary">Visit {index + 1}</span>
                <span className="text-xs font-extrabold text-text">{isHeld ? "Held" : "Auto-matched"}</span>
              </li>
            );
          })}
        </ol>
        {openSlots > 0 ? (
          <p className="mt-4 text-center text-xs font-medium text-text-secondary">
            Unfilled visits refund automatically.
          </p>
        ) : null}
      </div>
    </section>
  );
}

function PaymentBenefits() {
  const benefits = [
    { title: "Visits reserved", detail: "Accepted times become confirmed", icon: "calendar" as const },
    { title: "Written estimates", detail: "Keep every estimate you receive", icon: "document" as const },
    { title: "Automatic refunds", detail: "Unfilled visits return their share", icon: "refund" as const },
  ];

  return (
    <section aria-labelledby="payment-benefits-heading">
      <h2 id="payment-benefits-heading" className="text-sm font-extrabold uppercase text-text-muted">
        What this payment unlocks
      </h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {benefits.map((benefit) => (
          <div key={benefit.title} className="flex items-center gap-3 rounded-[10px] border border-line bg-surface p-4 shadow-card sm:flex-col sm:items-start">
            <BenefitIcon kind={benefit.icon} />
            <div>
              <h3 className="text-sm font-extrabold text-text">{benefit.title}</h3>
              <p className="mt-0.5 text-xs font-medium leading-5 text-text-secondary">{benefit.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function BenefitIcon({ kind }: { kind: "calendar" | "document" | "refund" }) {
  const path = {
    calendar: "M7 3v3m10-3v3M5 9h14M6 5h12a1 1 0 0 1 1 1v13H5V6a1 1 0 0 1 1-1Z",
    document: "M7 3h7l4 4v14H7V3Zm7 0v5h5M10 13h5m-5 4h5",
    refund: "M4 8h11a5 5 0 1 1 0 10H9m-5-10 4-4m-4 4 4 4",
  }[kind];

  return (
    <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-sunken text-action-active">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="size-4.5"><path d={path} /></svg>
    </span>
  );
}

function CheckoutAction({
  phase,
  canCheckOut,
  chargeableLabel,
  isPending,
  canSimulatePendingCapture,
  onStart,
  onSimulateCapture,
  requestHref,
}: {
  phase: VisitPlanPhase;
  canCheckOut: boolean;
  chargeableLabel: string;
  isPending: boolean;
  canSimulatePendingCapture: boolean;
  onStart: () => void;
  onSimulateCapture: () => void;
  requestHref: string;
}) {
  switch (phase) {
    case "pending":
      return (
        <div role="status">
          <CheckoutNotice
            tone="info"
            title="Confirming payment"
            body="This page updates automatically. Do not pay again while your bank responds."
          />
          {canSimulatePendingCapture ? (
            <div className="mt-3">
              <Button
                onClick={onSimulateCapture}
                loading={isPending}
                loadingLabel="Marking as paid"
              >
                Mark as paid
              </Button>
            </div>
          ) : null}
        </div>
      );

    case "active":
    case "settled":
      return (
        <div>
          <CheckoutNotice
            tone="success"
            title="Visits locked"
            body="Confirmed times and any automatic refunds appear on your request."
          />
          <div className="mt-3">
            <Link href={requestHref} className="inline-block">
              <Button>Back to this request</Button>
            </Link>
          </div>
        </div>
      );

    case "failed":
      return (
        <div>
          <CheckoutNotice
            tone="danger"
            title="Payment did not go through"
            body="Nothing was charged. Try again while the professional is still holding the time."
          />
          <div className="mt-3">
            <Button onClick={onStart} loading={isPending} loadingLabel="Starting your payment">
              Try again — {chargeableLabel}
            </Button>
          </div>
        </div>
      );

    case "void":
      return (
        <CheckoutNotice
          tone="neutral"
          title="No payment needed"
          body="The request closed before a visit was confirmed. Nothing was charged."
        />
      );

    case "unpriced":
    case "choosing":
      return (
        <CheckoutNotice
          tone="neutral"
          title="Plan not ready"
          body="Choose a visit plan before payment can open."
        />
      );

    case "chosen":
      if (!canCheckOut) {
        return (
          <CheckoutNotice
            tone="info"
            title="Waiting for a professional"
            body="Payment opens only after someone accepts a time."
          />
        );
      }
      return (
        <Button block size="lg" onClick={onStart} loading={isPending}>
          Pay {chargeableLabel} and lock the visits
        </Button>
      );

    default:
      return (
        <CheckoutNotice
          tone="neutral"
          title="Payment unavailable"
          body="Nothing has been charged. Return to the request for the latest update."
        />
      );
  }
}

function CheckoutNotice({
  tone,
  title,
  body,
}: {
  tone: "info" | "success" | "danger" | "neutral";
  title: string;
  body: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span
        aria-hidden
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-full",
          tone === "info" ? "bg-info-surface text-info-text" : null,
          tone === "success" ? "bg-success-surface text-success-text" : null,
          tone === "danger" ? "bg-danger-surface text-danger-text" : null,
          tone === "neutral" ? "bg-surface-sunken text-text-muted" : null,
        )}
      >
        {tone === "success" ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" className="size-4">
            <path d="m5 12 4 4 10-10" />
          </svg>
        ) : tone === "danger" ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-4">
            <circle cx="12" cy="12" r="9" />
            <path d="m9 9 6 6m0-6-6 6" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-4">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v4m0 4h.01" />
          </svg>
        )}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-extrabold text-text">{title}</p>
        <p className="mt-0.5 text-xs font-medium leading-5 text-text-secondary">{body}</p>
      </div>
    </div>
  );
}
