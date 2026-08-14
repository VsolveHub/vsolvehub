"use client";

import { Badge } from "@vsolve/ui";

import type { RetentionView } from "../adapters";

/**
 * The warranty hold-back, and what to do inside the window — `M2-FE-611` /
 * `M2-BE-546`.
 *
 * ## The sentence this panel exists to get right
 *
 * **Retention is payout-side money.** The Customer funds every milestone at
 * face value — nothing on this project asks them for less, and nothing is
 * subtracted from a stage anywhere in this app. What retention changes is how
 * much of an approved milestone the **professional** may draw before the
 * warranty is over. Describing it as money withheld from the Customer's payments
 * would be describing the wrong side of the transaction, and the funding
 * controls two sections up would contradict it on the same screen.
 *
 * ## And the one it must not say
 *
 * Not "held back from the last stage". `M2-BE-546`'s own docstring records why:
 * an additive amendment appends a milestone, so which one is last stops being
 * knowable the moment somebody accepts one, and a retention already released out
 * of what turned out not to be the final milestone cannot be un-released. It is
 * allocated against the **cumulative** approved total instead — so the honest
 * description is that it builds up as stages are approved and is complete when
 * the last one is, whichever that turns out to be. No milestone is named.
 *
 * ## Nothing here is a claim about cover
 *
 * A project with no configured retention gets `phase: "none"`, and that means
 * exactly one thing: **Vsolve is holding nothing back against a warranty.** It
 * is not a statement that the work carries no guarantee — the terms are the ones
 * on the estimate the Customer accepted, and this app has never been given them.
 * Saying "you have no warranty" would be inventing a fact in the direction that
 * costs the Customer.
 *
 * ## Reporting a fault is not a button, and that is said rather than implied
 *
 * There is **no warranty-claim endpoint at contract 1.31.0.** `m2_stage_dispute`
 * accepts only a stage in `AWAITING_REVIEW`, and by the time a warranty is
 * running every stage is approved or released — so nothing in this contract can
 * carry the report. The case machinery that will is Wave C6. Logged as a
 * contract gap in `frontend-execution-plan.md` §7. This panel therefore names
 * the route that does exist rather than rendering a control that would 404, and
 * it is deliberately not dressed as a missing feature: the platform has no
 * warranty-claim workflow at all, and a "coming soon" block would imply the
 * money is unreachable meanwhile. It is not — Vsolve is still holding it.
 */

export interface WarrantyPanelProps {
  retention: RetentionView;
  /** "project" — the noun this agreement uses. */
  engagementNoun: string;
}

export function WarrantyPanel({ retention, engagementNoun }: WarrantyPanelProps) {
  if (retention.phase === "none") {
    return (
      <section aria-labelledby="warranty-heading" className="mt-8">
        <h2 id="warranty-heading" className="text-lg font-semibold text-text">
          After the work is finished
        </h2>
        <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
          Vsolve is not holding any money back on this {engagementNoun} against a
          warranty. That is not the same as saying there is no guarantee on the
          work — whatever the estimate you accepted says about that still stands
          between you and the professional. If something goes wrong, contact
          support and we will take it from there.
        </p>
      </section>
    );
  }

  if (retention.phase === "accruing") {
    return (
      <section aria-labelledby="warranty-heading" className="mt-8">
        <h2 id="warranty-heading" className="text-lg font-semibold text-text">
          Money held back for the warranty
        </h2>
        <p className="mt-1 max-w-prose text-sm leading-6 text-text">
          You pay every stage in full, and{" "}
          <strong className="font-semibold">{retention.targetLabel}</strong> of what
          the professional earns is held by Vsolve until the warranty period is
          over. It builds up as each stage is approved, and it is complete when
          the last one is.
        </p>
        <dl className="mt-3 rounded-card border border-line bg-surface">
          <Row label="Held so far" value={retention.withheldLabel} />
          <Row label="Held by the end" value={retention.targetLabel} strong />
        </dl>
        <p className="mt-2 max-w-prose text-sm leading-6 text-text-secondary">
          The warranty has not started yet, so there is no release date to show.
          It begins when the work is finished and you confirm it.
        </p>
      </section>
    );
  }

  if (retention.phase === "held") {
    return (
      <section aria-labelledby="warranty-heading" className="mt-8">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 id="warranty-heading" className="text-lg font-semibold text-text">
            Your warranty is running
          </h2>
          <Badge tone="success">{retention.withheldLabel} held</Badge>
        </div>
        <p className="mt-1 max-w-prose text-sm leading-6 text-text">
          The work is finished and{" "}
          <strong className="font-semibold">{retention.withheldLabel}</strong> of
          what the professional earned is still held by Vsolve
          {retention.warrantyEndsAt === null ? (
            "."
          ) : (
            <>
              {" "}
              until <strong className="font-semibold">{retention.warrantyEndsAt}</strong>
            </>
          )}
          . It is released to them when the warranty period ends, and this{" "}
          {engagementNoun} closes at the same moment.
        </p>
        {retention.warrantyEndsAt === null ? (
          // Fail closed rather than guessing. The window is read from the
          // variant's configuration at completion, and an engagement whose
          // configuration was retired keeps its retention held and waits for
          // Operations — a date invented here would be a promise nobody made.
          <p className="mt-2 max-w-prose text-sm leading-6 text-text-secondary">
            We do not have an end date for this warranty on file, so we are not
            going to show you one. The money stays held until we do. Contact
            support and quote this {engagementNoun} if you need the date.
          </p>
        ) : null}
        <FaultRoute engagementNoun={engagementNoun} />
      </section>
    );
  }

  return (
    <section aria-labelledby="warranty-heading" className="mt-8">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 id="warranty-heading" className="text-lg font-semibold text-text">
          The warranty period is over
        </h2>
        <Badge tone="neutral">Closed</Badge>
      </div>
      <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
        The {retention.withheldLabel} Vsolve was holding has been released to the
        professional and this {engagementNoun} is closed. Everything that
        happened on it stays readable for both of you. If something has gone
        wrong since, contact support — this closes the platform&apos;s side of it
        and gives up no legal right you have.
      </p>
    </section>
  );
}

/**
 * What to do about a fault while the window is open.
 *
 * The one honest instruction available at 1.31.0. It names what Vsolve still
 * holds, because that is the fact that makes contacting support worth doing —
 * "get in touch" with nothing behind it is advice; "get in touch, we are still
 * holding this much of their money" is a reason.
 */
function FaultRoute({ engagementNoun }: { engagementNoun: string }) {
  return (
    <div className="mt-3 rounded-card border border-line bg-surface-sunken p-4">
      <h3 className="text-sm font-semibold text-text">If something goes wrong</h3>
      <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
        Reporting a warranty fault is not something you can do from this screen —
        contact support with this {engagementNoun} and tell them what has
        happened. Do it before the warranty ends: after that date the money is
        released and there is nothing held to put right against.
      </p>
    </div>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line p-4 last:border-0">
      <dt className="text-sm text-text-secondary">{label}</dt>
      <dd className={strong ? "text-lg font-semibold text-text" : "text-text"}>{value}</dd>
    </div>
  );
}
