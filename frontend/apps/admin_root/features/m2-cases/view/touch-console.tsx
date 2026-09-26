"use client";

import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Spinner,
  formatMoney,
} from "@vsolve/ui";
import { useState } from "react";

import { isUuid, maskId } from "@/features/shared/identifiers";
import { useTouchMetric, useTouchRollup } from "../queries";
import { formatMoment, humanise } from "../model/cases";

/**
 * What it costs us to work a request (`M2-FE-711`, `GAP-033`, `PLN-07`).
 *
 * ## `within_budget: null` is not `false`, and it is not `true`
 *
 * This is the fourth trap 1.32.0 names and the whole reason this screen is careful. `false` reads
 * as a breach and `true` as a pass; when the owner has not set a budget **neither is known**, and
 * the honest render is "no budget set". A screen that treated null as false would page somebody
 * about every request on the platform; one that treated it as true would report a design as
 * within an economics envelope nobody has drawn. So the three states are three renders, and the
 * null one says what it actually means.
 *
 * ## Why this screen exists at all
 *
 * `GAP-033` says the M2 fee is the platform's entire revenue on a lead-only request, and that one
 * fifteen-minute Operations touch plus a refund makes it loss-making. `PLN-07` says the recovery
 * design assumes a margin nobody modelled. The touch count is the measurement that settles it —
 * which means it has to be read as a measurement, not as a scoreboard.
 */

function RollupPanel() {
  const rollup = useTouchRollup();

  if (rollup.isPending) {
    return (
      <Card className="flex items-center gap-2 p-6 text-text-secondary">
        <Spinner size="sm" />
        Reading the rollup…
      </Card>
    );
  }

  if (rollup.isError || !rollup.data) {
    return (
      <ErrorState
        title="We could not read the touch rollup"
        message="Nothing has changed. Try again."
        actionLabel="Try again"
        onAction={() => void rollup.refetch()}
      />
    );
  }

  const data = rollup.data;

  return (
    <Card className="p-6">
      <h2 className="text-base font-bold text-text">Across the platform</h2>
      <p className="mt-1 text-sm leading-6 text-text-secondary">
        Since {formatMoment(data.since)}, as at {formatMoment(data.server_now)}. Counted over
        requests that were touched at all — a request nobody had to touch is the product working,
        and averaging it in would flatter the number this measurement exists to test.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-control border border-line p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
            Requests touched
          </p>
          <p data-numeric className="mt-1 text-2xl font-bold text-text">
            {data.requests_touched}
          </p>
        </div>
        <div className="rounded-control border border-line p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
            Touches in total
          </p>
          <p data-numeric className="mt-1 text-2xl font-bold text-text">
            {data.total_touches}
          </p>
        </div>
        <div className="rounded-control border border-line p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
            Mean, per touched request
          </p>
          <p data-numeric className="mt-1 text-2xl font-bold text-text">
            {data.mean_touches_per_touched_request.toFixed(2)}
          </p>
        </div>
      </div>

      <h3 className="mt-6 text-sm font-semibold text-text">By action</h3>
      {data.by_action.length === 0 ? (
        <p className="mt-2 text-sm text-text-secondary">
          Nothing recorded in this window. A real zero, not a missing read.
        </p>
      ) : (
        <ul className="mt-2 list-none space-y-1 p-0">
          {data.by_action.map((row) => (
            <li
              key={row.action}
              className="flex items-center justify-between gap-3 border-b border-line py-1.5 text-sm last:border-0"
            >
              <span className="text-text">{humanise(row.action)}</span>
              <span data-numeric className="font-semibold text-text">
                {row.count}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** The three states of `within_budget`, rendered as three different things. */
function BudgetVerdict({
  budget,
  withinBudget,
  touches,
}: {
  budget: number | null;
  withinBudget: boolean | null;
  touches: number;
}) {
  if (withinBudget === null) {
    return (
      <div className="rounded-control border border-line bg-surface-sunken p-4">
        <Badge tone="neutral">No budget set</Badge>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          The owner has not set a touches-per-request budget, so there is nothing to judge this
          against. {touches} {touches === 1 ? "touch is" : "touches are"} the measurement;
          whether that is acceptable is a decision nobody has taken. This is not a pass and it is
          not a breach.
        </p>
      </div>
    );
  }

  if (withinBudget) {
    return (
      <div className="rounded-control border border-success-line bg-success-surface p-4">
        <Badge tone="success">Within budget</Badge>
        <p className="mt-2 text-sm leading-6 text-text">
          {touches} of {budget ?? "—"} touches used.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-control border border-danger-line bg-danger-surface p-4">
      <Badge tone="danger">Over budget</Badge>
      <p className="mt-2 text-sm leading-6 text-text">
        {touches} touches against a budget of {budget ?? "—"}. On a lead-only request the platform
        fee is the entire revenue, so this one is likely to have cost more to work than it earned.
      </p>
    </div>
  );
}

function RequestTouchPanel() {
  const [typed, setTyped] = useState("");
  const [requirementId, setRequirementId] = useState<string | null>(null);
  const metric = useTouchMetric(requirementId);

  const shapeProblem =
    typed.trim() !== "" && !isUuid(typed) ? "That is not the shape of a request id." : undefined;

  return (
    <Card className="p-6">
      <h2 className="text-base font-bold text-text">One request</h2>
      <p className="mt-1 text-sm leading-6 text-text-secondary">
        Every privileged Operations action on a request is recorded as a touch with its reason.
        This reads them back for one request, against the budget — or against the absence of one.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <Field label="Request id" error={shapeProblem} className="min-w-[22rem] flex-1">
          <Input value={typed} onChange={(event) => setTyped(event.target.value)} />
        </Field>
        <Button
          className="mb-1"
          disabled={!isUuid(typed)}
          onClick={() => setRequirementId(typed.trim())}
        >
          Measure it
        </Button>
      </div>

      {requirementId === null ? null : metric.isPending ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-text-secondary">
          <Spinner size="sm" />
          Reading {maskId(requirementId)}…
        </p>
      ) : metric.isError || !metric.data ? (
        <ErrorState
          inline
          className="mt-4"
          title="We could not read that request"
          message="It may not exist. Nothing has changed."
          actionLabel="Try again"
          onAction={() => void metric.refetch()}
        />
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          <p className="text-sm text-text-secondary">
            {humanise(metric.data.archetype)} · as at {formatMoment(metric.data.server_now)}
          </p>

          <BudgetVerdict
            budget={metric.data.budget}
            withinBudget={metric.data.within_budget}
            touches={metric.data.touches}
          />

          <div className="rounded-control border border-line p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
              Platform revenue on this request
            </p>
            <p data-numeric className="mt-1 text-2xl font-bold text-text">
              {formatMoney(metric.data.platform_revenue_paise)}
            </p>
            <p className="mt-1 text-sm text-text-secondary">
              Server-sent, and the whole of it: wages on a workforce booking are paid directly to
              the lead and never pass through the platform, so none of that money is here and none
              of it is ours.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-text">Every touch, with its reason</h3>
            {metric.data.touches_detail.length === 0 ? (
              <EmptyState
                compact
                className="mt-2"
                title="Nobody has had to touch this request"
                description="Which is the product working. It is counted in neither the mean nor the budget check."
              />
            ) : (
              <ul className="mt-2 list-none space-y-2 p-0">
                {metric.data.touches_detail.map((touch) => (
                  <li key={touch.id} className="rounded-control border border-line p-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-sm font-semibold text-text">
                        {humanise(touch.action)}
                      </span>
                      <span className="text-xs text-text-muted">
                        {formatMoment(touch.occurred_at)}
                      </span>
                    </div>
                    {touch.reason ? (
                      <p className="mt-1 text-sm text-text-secondary">{touch.reason}</p>
                    ) : (
                      <p className="mt-1 text-sm italic text-text-secondary">
                        No reason recorded against this one.
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

export function TouchConsole() {
  return (
    <div className="flex flex-col gap-6">
      <RollupPanel />
      <RequestTouchPanel />
    </div>
  );
}
