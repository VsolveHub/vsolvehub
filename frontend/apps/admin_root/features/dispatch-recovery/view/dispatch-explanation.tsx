"use client";

import { Badge, Card, EmptyState, ErrorState, Spinner } from "@vsolve/ui";

import { maskId } from "@/features/shared/identifiers";
import {
  eligibilityEntries,
  hasRankingSnapshot,
  dispatchFailure,
  type Attempt,
} from "../model/commands";
import { useDispatchExplanation } from "../queries";

/**
 * Why dispatch offered this visit to the Partners it did.
 *
 * ## This screen is the version guard
 *
 * Every command on this surface carries `expected_unit_version`, and this is the
 * only published read that supplies it. So the version is shown, prominently,
 * next to the status it belongs to: an operator deciding to pull a Partner off a
 * job is deciding about the state on this screen, and the guard is what makes
 * that literally true rather than approximately true.
 *
 * ## The ranking is reported, not interpreted
 *
 * `apps/assignments/ranking.py` still orders candidates by Partner UUID —
 * explainability landed with BE-07, the business ranking did not. So the factors
 * are rendered as sent, the policy and its version are printed, and nothing here
 * describes the order as a quality judgement. A console that said "best match"
 * over a UUID sort would be inventing a claim the platform cannot make yet.
 *
 * An attempt with no snapshot is said to have none. Rendering an empty `ranked`
 * list as "no candidates were found" would tell an operator dispatch found
 * nobody when it simply did not record who it found.
 */

const TIME = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

function Moment({ value }: { value: string }) {
  return (
    <time dateTime={value} data-numeric>
      {TIME.format(new Date(value))}
    </time>
  );
}

function AttemptCard({ attempt }: { attempt: Attempt }) {
  const eligibility = eligibilityEntries(attempt);

  return (
    <li className="rounded-card border border-line p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-sm font-bold text-text">
          Attempt <span data-numeric>#{attempt.rank}</span> · Partner{" "}
          <span data-numeric>{maskId(attempt.partner_id)}</span>
        </h4>
        <Badge tone={attempt.offer_status === null ? "neutral" : "info"}>
          {attempt.offer_status === null
            ? "no offer made"
            : attempt.offer_status.toLowerCase().replace(/_/g, " ")}
        </Badge>
      </div>

      <p className="mt-1 text-sm text-text-secondary">
        Offered <Moment value={attempt.created_at} />
      </p>

      {eligibility.length > 0 ? (
        <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_minmax(0,1fr)]">
          {eligibility.map((entry) => (
            <div key={entry.key} className="contents">
              <dt className="text-text-muted">{entry.key.replace(/_/g, " ")}</dt>
              <dd className="text-text" data-numeric>
                {entry.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {!hasRankingSnapshot(attempt) ? (
        <p className="mt-3 text-sm text-text-secondary">
          No ranking snapshot was recorded for this attempt, so who else was
          considered is not known. That is a gap in the record, not a dispatch
          that found nobody.
        </p>
      ) : (
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <h5 className="text-xs font-bold uppercase tracking-wide text-text-muted">
              Considered, in the order dispatch used
            </h5>
            <ol className="mt-1 flex list-none flex-col gap-1 p-0 text-sm text-text-secondary">
              {attempt.ranked.map((candidate) => (
                <li key={candidate.partner_id} data-numeric>
                  {candidate.rank}. {maskId(candidate.partner_id)}
                </li>
              ))}
            </ol>
          </div>

          <div>
            <h5 className="text-xs font-bold uppercase tracking-wide text-text-muted">
              Ruled out
            </h5>
            {attempt.excluded.length === 0 ? (
              <p className="mt-1 text-sm text-text-secondary">Nobody was ruled out.</p>
            ) : (
              <ul className="mt-1 flex list-none flex-col gap-1 p-0 text-sm text-text-secondary">
                {attempt.excluded.map((candidate) => (
                  <li key={candidate.partner_id}>
                    <span data-numeric>{maskId(candidate.partner_id)}</span> —{" "}
                    {candidate.reasons.join(", ")}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

export function DispatchExplanation({ unitId }: { unitId: string | null }) {
  const explanation = useDispatchExplanation(unitId);

  if (unitId === null) {
    return (
      <Card className="p-5">
        <p className="text-sm text-text-secondary">
          Paste a fulfilment unit id to see who dispatch offered this visit to,
          and why.
        </p>
      </Card>
    );
  }

  if (explanation.isPending) {
    return (
      <p className="flex items-center gap-2 py-8 text-text-secondary">
        <Spinner size="sm" />
        Reading the dispatch record…
      </p>
    );
  }

  if (explanation.isError) {
    const failure = dispatchFailure(explanation.error);
    return (
      <ErrorState
        title={failure?.title ?? "We could not read this visit"}
        message={failure?.message ?? "Nothing has changed. Check your connection and try again."}
        actionLabel="Try again"
        onAction={() => void explanation.refetch()}
      />
    );
  }

  const data = explanation.data;

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-base font-bold text-text">
          Visit <span data-numeric>{maskId(data.fulfilment_unit_id)}</span>
        </h3>
        <Badge tone="neutral">{data.unit_status.toLowerCase().replace(/_/g, " ")}</Badge>
      </div>

      <p className="mt-1 text-sm text-text-secondary">
        {/* The number every command below is guarded on. */}
        Version <span data-numeric>{data.unit_version}</span> · read at{" "}
        <Moment value={data.server_now} />
      </p>

      <p className="mt-3 text-sm leading-6 text-text-secondary">
        Dispatch policy <span data-numeric>{data.policy}</span>, version{" "}
        <span data-numeric>{data.policy_version}</span>. The order below is the
        order dispatch used — it is a record of what happened, not a ranking of
        who was best.
      </p>

      <h4 className="mt-5 text-sm font-bold text-text">
        Attempts (<span data-numeric>{data.attempts.length}</span>)
      </h4>

      {data.attempts.length === 0 ? (
        <div className="mt-3">
          <EmptyState
            title="Dispatch has not offered this visit to anyone yet"
            description="There is no attempt on record. If the visit has been waiting, running recovery will tell you whether the sweep can move it."
          />
        </div>
      ) : (
        <ul className="mt-3 flex list-none flex-col gap-3 p-0">
          {data.attempts.map((attempt) => (
            <AttemptCard key={attempt.attempt_id} attempt={attempt} />
          ))}
        </ul>
      )}
    </Card>
  );
}
