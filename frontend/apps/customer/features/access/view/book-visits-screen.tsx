"use client";

import {
  canCheckOutVisitPlan,
  visitPlanPhase,
  type VisitPlanPhase,
} from "@vsolve/query";
import { Button, Skeleton, buttonStyles } from "@vsolve/ui";
import Link from "next/link";

import { formatVisitSlot, toPlanCheckoutView, toVisitTrackerView } from "../adapters";
import { useStartVisitPlanCheckout, useVisitPlan } from "../queries";
import { AccessRefusal } from "./access-refusal";

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
  const planQuery = useVisitPlan(requirementId);
  const checkout = useStartVisitPlanCheckout();

  const state = planQuery.data ?? null;
  const phase: VisitPlanPhase | null = state === null ? null : visitPlanPhase(state);
  const view = state === null ? null : toPlanCheckoutView(state);
  const tracker = state === null ? null : toVisitTrackerView(state);
  const heldSlot = tracker?.rows.find((row) => row.state === "held") ?? null;

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
      <h1 className="text-xl font-semibold text-text">Book your visits</h1>

      {heldSlot !== null ? (
        <p className="mt-2 max-w-prose text-sm leading-6 text-text-secondary">
          {heldSlot.vendorName ?? "A professional"} has confirmed{" "}
          <strong className="font-semibold text-text">
            {formatVisitSlot(heldSlot.scheduledFor, heldSlot.timeZone) ?? "a time"}
          </strong>{" "}
          and is holding it while you finish this.
        </p>
      ) : null}

      <PlanSummary
        planSize={view.planSize}
        priceLabel={view.priceLabel}
        creditLabel={view.creditLabel}
        chargeableLabel={view.chargeableLabel}
      />

      <p className="mt-4 max-w-prose text-sm leading-6 text-text-secondary">
        This is <strong className="font-semibold text-text">one payment for the whole plan</strong>,
        not one per visit. Any visit that never happens{" "}
        <strong className="font-semibold text-text">refunds its share on its own</strong> — you
        do not have to ask us, and you do not have to notice.
      </p>

      <div className="mt-6">
        <CheckoutAction
          phase={phase}
          canCheckOut={canCheckOutVisitPlan(state)}
          chargeableLabel={view.chargeableLabel}
          isPending={checkout.isPending}
          onStart={() =>
            checkout.mutate({
              requirementId,
              planId: view.planId,
              isRetryAfterFailure: phase === "failed",
            })
          }
          requestHref={requestHref}
        />
      </div>

      <div className="mt-4">
        <AccessRefusal error={checkout.error} attempting="pay for these visits" />
      </div>

      <BackLink href={requestHref} />
    </Wrapper>
  );
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex w-full max-w-2xl flex-col px-4 py-6">{children}</div>;
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
    <dl className="mt-4 rounded-card border border-line bg-surface">
      <div className="flex items-baseline justify-between gap-3 border-b border-line p-4">
        <dt className="text-sm text-text-secondary">
          {planSize === 1 ? "One professional visits" : `${planSize} professionals visit`}
        </dt>
        <dd className="font-medium text-text">{priceLabel}</dd>
      </div>
      {creditLabel !== null ? (
        <div className="flex items-baseline justify-between gap-3 border-b border-line p-4">
          <dt className="text-sm text-text-secondary">Already paid on this request</dt>
          <dd className="font-medium text-text">−{creditLabel}</dd>
        </div>
      ) : null}
      <div className="flex items-baseline justify-between gap-3 p-4">
        <dt className="font-semibold text-text">To pay now</dt>
        <dd className="text-lg font-semibold text-text">{chargeableLabel}</dd>
      </div>
    </dl>
  );
}

function CheckoutAction({
  phase,
  canCheckOut,
  chargeableLabel,
  isPending,
  onStart,
  requestHref,
}: {
  phase: VisitPlanPhase;
  canCheckOut: boolean;
  chargeableLabel: string;
  isPending: boolean;
  onStart: () => void;
  requestHref: string;
}) {
  switch (phase) {
    case "pending":
      return (
        <div role="status">
          <p className="font-medium text-text">We are confirming your payment</p>
          <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
            Your bank or UPI app tells us the outcome, and that can take a few
            minutes. This page updates itself when it arrives. Do not pay again —
            if the first payment lands afterwards you would have paid for the
            plan twice.
          </p>
        </div>
      );

    case "active":
    case "settled":
      return (
        <div>
          <p className="font-medium text-text">These visits are paid for</p>
          <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
            Nothing more to do here. Every confirmed time, and every share that
            comes back to you, is on the request itself.
          </p>
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
          <p className="font-medium text-text">That payment did not go through</p>
          <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
            You have not been charged. If the professional is still holding the
            time, paying now keeps it.
          </p>
          <div className="mt-3">
            <Button onClick={onStart} loading={isPending} loadingLabel="Starting your payment">
              Try again — {chargeableLabel}
            </Button>
          </div>
        </div>
      );

    case "void":
      return (
        <p className="max-w-prose text-sm leading-6 text-text-secondary">
          This request closed before any professional confirmed a visit, so there
          is nothing to pay for. Nothing was charged.
        </p>
      );

    case "unpriced":
    case "choosing":
      return (
        <p className="max-w-prose text-sm leading-6 text-text-secondary">
          There is no visit plan on this request yet, so there is nothing to pay
          for.
        </p>
      );

    case "chosen":
      if (!canCheckOut) {
        return (
          <p className="max-w-prose text-sm leading-6 text-text-secondary">
            No professional is holding a time for you right now, so there is
            nothing to pay for yet. We will ask you the moment one confirms.
          </p>
        );
      }
      return (
        <Button onClick={onStart} loading={isPending} loadingLabel="Starting your payment">
          Pay {chargeableLabel} for the plan
        </Button>
      );

    default:
      return (
        <p className="max-w-prose text-sm leading-6 text-text-secondary">
          We cannot describe where this plan stands right now. Nothing has been
          charged.
        </p>
      );
  }
}
