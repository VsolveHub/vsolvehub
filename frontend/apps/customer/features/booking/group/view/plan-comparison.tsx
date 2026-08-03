"use client";

import type { Schemas } from "@vsolve/api-client";
import { Badge, Button, EmptyState, ErrorState } from "@vsolve/ui";

import { ChoiceCard } from "../../view/choice-card";
import { describePlanReasons, describeUnitReasons } from "../reasons";
import type { Cart, Plan, PlanSet, PlanUnit } from "../queries";
import { Money } from "./money";

/**
 * The server's fulfilment alternatives, rendered as it ranked them.
 *
 * Nothing on this screen is computed. Which services share a visit, whether two
 * units run at the same time, how many professionals are needed, what each unit
 * costs and why anything was separated all arrive as fields. The component's
 * only job is to make a server decision legible enough to choose between — and
 * in particular to never let matching categories look like a reason things were
 * grouped, because Django's plan is the only thing that says they can be.
 */

/** Structure copy. Keyed by the generated `StructureEnum`, so a new member is a type error. */
const STRUCTURE_TITLES: Record<Schemas["StructureEnum"], string> = {
  SINGLE_PARTNER_SEQUENTIAL: "One professional, one visit",
  COORDINATED_PARALLEL: "Several professionals at the same time",
  INDEPENDENT_VISITS: "Separate visits",
  MIXED: "A mix of shared and separate visits",
};

const STRUCTURE_DESCRIPTIONS: Record<Schemas["StructureEnum"], string> = {
  SINGLE_PARTNER_SEQUENTIAL:
    "One person does everything in your booking, one job after another.",
  COORDINATED_PARALLEL:
    "Different people work on different jobs during the same overlapping window.",
  INDEPENDENT_VISITS: "Each job is its own visit with its own professional.",
  MIXED: "Some jobs share a visit and the rest get visits of their own.",
};

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * A unit's window, as the server timed it.
 *
 * Both ends are server fields. The duration alongside them is the server's own
 * `estimated_duration_minutes`, not the difference between the two — the window
 * is when someone arrives, the estimate is how long they stay, and subtracting
 * one from the other would silently invent a third number.
 */
function UnitWindow({ unit }: { unit: PlanUnit }) {
  const format = (value: string) =>
    new Date(value).toLocaleString("en-IN", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    });

  return (
    <p className="text-sm text-text-secondary">
      <time dateTime={unit.starts_at}>{format(unit.starts_at)}</time>
      {" – "}
      <time dateTime={unit.ends_at}>
        {new Date(unit.ends_at).toLocaleTimeString("en-IN", {
          hour: "numeric",
          minute: "2-digit",
        })}
      </time>
      {" · arrival window "}
      {unit.arrival_window_minutes} min · about {unit.estimated_duration_minutes} min of work
    </p>
  );
}

/**
 * One fulfilment unit: a visit, its services and its own money.
 *
 * Services are resolved through `cart_item_id` against the cart the plan was
 * built from — the same identity the server used — so a line is named by the
 * item the customer created rather than by anything reconstructed here.
 */
function PlanUnitCard({
  unit,
  cart,
  isParallel,
}: {
  unit: PlanUnit;
  cart: Cart;
  isParallel: boolean;
}) {
  const reasons = describeUnitReasons(unit.reason_codes);

  return (
    <li className="rounded-plate border border-line bg-surface-sunken p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold text-text">
          {isParallel ? `Professional ${unit.position + 1}` : `Visit ${unit.position + 1}`}
        </h4>
        <Money value={unit.total} className="text-sm font-semibold tabular-nums text-text" />
      </div>

      <UnitWindow unit={unit} />

      <ul className="mt-2 flex flex-col gap-1 text-sm text-text">
        {unit.items.map((item) => {
          const cartItem = cart.items.find((candidate) => candidate.id === item.cart_item_id);
          return (
            <li key={item.id} className="flex justify-between gap-3">
              <span>
                {cartItem
                  ? `${cartItem.service_name} — ${cartItem.variant_name}`
                  : // The plan references an item no longer in the cart, which
                    // means this plan is stale. Naming the id is more useful
                    // than a blank row, and the stale-plan recovery below is
                    // what actually resolves it.
                    "A service that is no longer in your cart"}
              </span>
              <span className="shrink-0 tabular-nums text-text-secondary">
                × {item.quantity}
              </span>
            </li>
          );
        })}
      </ul>

      {reasons.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-1 text-sm text-text-secondary">
          {reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function PlanCard({
  plan,
  cart,
  checked,
  disabled,
  onSelect,
}: {
  plan: Plan;
  cart: Cart;
  checked: boolean;
  disabled: boolean;
  onSelect: (planId: string) => void;
}) {
  const isParallel = plan.structure === "COORDINATED_PARALLEL";
  const reasons = describePlanReasons(plan.decisive_reasons);

  return (
    <ChoiceCard
      name="fulfilment-plan"
      value={plan.id}
      checked={checked}
      disabled={disabled}
      onSelect={onSelect}
      title={STRUCTURE_TITLES[plan.structure]}
      description={STRUCTURE_DESCRIPTIONS[plan.structure]}
      ariaLabel={`${STRUCTURE_TITLES[plan.structure]}, ${countLabel(
        plan.visit_count,
        "visit",
        "visits",
      )}, ${countLabel(plan.professional_count, "professional", "professionals")}`}
      trailing={
        <span className="flex flex-col items-end gap-1">
          {plan.is_recommended ? <Badge tone="success">Recommended</Badge> : null}
          <Money value={plan.total} className="text-base font-bold tabular-nums text-text" />
        </span>
      }
    >
      <p className="mt-1 text-sm text-text-secondary">
        {countLabel(plan.visit_count, "visit", "visits")} ·{" "}
        {countLabel(plan.professional_count, "professional", "professionals")}
      </p>

      {reasons.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-1 text-sm text-text-secondary">
          {reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}

      <ul className="mt-3 flex flex-col gap-2">
        {plan.units.map((unit) => (
          <PlanUnitCard key={unit.id} unit={unit} cart={cart} isParallel={isParallel} />
        ))}
      </ul>

      {/* Every figure is its own server field. The three above the total are not
          added up here and the total is not derived from them. */}
      <dl className="mt-3 flex flex-col gap-1 text-sm">
        <div className="flex justify-between">
          <dt className="text-text-secondary">Services</dt>
          <dd className="tabular-nums text-text">
            <Money value={plan.subtotal} />
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-text-secondary">Platform fee</dt>
          <dd className="tabular-nums text-text">
            <Money value={plan.platform_fee} />
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-text-secondary">Tax</dt>
          <dd className="tabular-nums text-text">
            <Money value={plan.tax} />
          </dd>
        </div>
        <div className="flex justify-between border-t border-line pt-1 font-semibold">
          <dt className="text-text">Total</dt>
          <dd className="tabular-nums text-text">
            <Money value={plan.total} />
          </dd>
        </div>
      </dl>
    </ChoiceCard>
  );
}

export interface PlanComparisonProps {
  planSet: PlanSet;
  cart: Cart;
  selectedPlanId: string | null;
  isPricing: boolean;
  onSelect: (planId: string) => void;
  onContinue: () => void;
  /** Re-plans against current cart truth when the set is no longer usable. */
  onReplan: () => void;
}

export function PlanComparison({
  planSet,
  cart,
  selectedPlanId,
  isPricing,
  onSelect,
  onContinue,
  onReplan,
}: PlanComparisonProps) {
  // The server declares this, and it is the one thing on the screen that can go
  // stale without any interaction. A set that is not ACTIVE cannot be quoted, so
  // offering the choice would be offering something that must fail.
  if (planSet.status !== "ACTIVE") {
    return (
      <ErrorState
        severity="warning"
        title="These options are no longer current"
        message={
          planSet.status === "EXPIRED"
            ? "They were held for a short time and that time has passed. Nothing has been booked or charged."
            : "Your cart changed after these were worked out, so they no longer describe what you are booking. Nothing has been booked or charged."
        }
        actionLabel="Work out fresh options"
        onAction={onReplan}
      />
    );
  }

  if (planSet.plans.length === 0) {
    return (
      <EmptyState
        title="No way to fulfil this booking came back"
        description="The server found no safe arrangement for these services at this address and time. Try a different time, or book some of them separately."
        action={
          <Button variant="outline" onClick={onReplan}>
            Try another time
          </Button>
        }
      />
    );
  }

  const recommended = planSet.plans.filter((plan) => plan.is_recommended);
  const alternatives = planSet.plans.filter((plan) => !plan.is_recommended);

  return (
    <div>
      <h2 className="text-lg font-bold text-text">How we can do this</h2>
      <p className="mt-1 text-sm text-text-secondary">
        Worked out for everything in your booking. Availability is confirmed when a
        professional accepts — nothing is held or charged yet.
      </p>

      <fieldset className="mt-4">
        <legend className="sr-only">Choose how your booking is fulfilled</legend>

        {recommended.length > 0 ? (
          <div className="flex flex-col gap-3">
            {recommended.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                cart={cart}
                checked={selectedPlanId === plan.id}
                disabled={isPricing}
                onSelect={onSelect}
              />
            ))}
          </div>
        ) : null}

        {alternatives.length > 0 ? (
          <>
            <h3 className="mt-6 text-sm font-semibold text-text">Other options</h3>
            <div className="mt-2 flex flex-col gap-3">
              {alternatives.map((plan) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  cart={cart}
                  checked={selectedPlanId === plan.id}
                  disabled={isPricing}
                  onSelect={onSelect}
                />
              ))}
            </div>
          </>
        ) : null}
      </fieldset>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button
          onClick={onContinue}
          disabled={selectedPlanId === null}
          loading={isPricing}
          loadingLabel="Pricing your booking"
        >
          Continue with this option
        </Button>
        {selectedPlanId === null ? (
          <p className="text-sm text-text-secondary" aria-live="polite">
            Choose an option to continue.
          </p>
        ) : null}
      </div>
    </div>
  );
}
