"use client";

import { Badge, Button, Card, EmptyState, ErrorState, Spinner } from "@vsolve/ui";
import Link from "next/link";
import { useState } from "react";

import { useOperationsCases } from "@/features/cases/queries";
import { CASE_KIND_COPY, SEVERITY_TONE, formatMoment, teamLabel } from "../model/cases";

/**
 * Signals a person judges — never a verdict this screen delivers (`M2-FE-710`).
 *
 * ## The distinction this whole screen exists to hold
 *
 * `GAP-009` and `GAP-010` both ask for detection and both say, in the plan's own words, "not
 * automatic punishment — a review signal, consistent with the plan's own stance". So a row here
 * says what was reported and by whom, and it never says who was at fault. The vocabulary the
 * server offers backs that up: an off-platform claim resolves as `SUBSTANTIATED`,
 * `UNSUBSTANTIATED` or `SETTLED`, and even `SUBSTANTIATED` records only that the evidence bore
 * the account out — what follows from it is a separate decision with its own unset threshold.
 *
 * ## Two of the four signals do not exist yet, and this screen says which
 *
 * Contract 1.32.0 publishes off-platform claims and chargebacks as cases. It publishes **no**
 * Operations read for quote-slot squatting (`GAP-009`) and **none** for price-band clustering
 * (`GAP-010`): the price band is a Customer-facing teaser field, the non-responsive rejection
 * that controls squatting has no staff read, and neither has an aggregate. Rendering an invented
 * one would be exactly the fabricated-signal failure the plan forbids, so the absence is named.
 * Both are logged as contract gaps in `frontend-execution-plan.md` §7.
 */

function SignalQueue({
  kind,
  emptyTitle,
  emptyDescription,
}: {
  kind: "OFF_PLATFORM" | "CHARGEBACK";
  emptyTitle: string;
  emptyDescription: string;
}) {
  const [includeClosed, setIncludeClosed] = useState(false);
  const cases = useOperationsCases(includeClosed ? { kind } : { kind, status: "OPEN" });
  const rows = cases.data?.pages.flatMap((page) => page.results) ?? [];
  const copy = CASE_KIND_COPY[kind];

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-text">{copy.label}</h2>
          <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">{copy.claim}</p>
        </div>
        <Button
          size="sm"
          variant={includeClosed ? "primary" : "outline"}
          aria-pressed={includeClosed}
          onClick={() => setIncludeClosed(!includeClosed)}
        >
          {includeClosed ? "All" : "Open only"}
        </Button>
      </div>

      <p className="mt-3 text-sm text-text-secondary">
        Ends in a documented finding, not a label. The outcomes this kind may reach are published
        per case and shown on the case itself.
      </p>

      {cases.isPending ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-text-secondary">
          <Spinner size="sm" />
          Loading…
        </p>
      ) : null}

      {cases.isError ? (
        <ErrorState
          inline
          className="mt-4"
          title="We could not load these"
          message="Nothing has changed. An error here is not an all-clear."
          actionLabel="Try again"
          onAction={() => void cases.refetch()}
        />
      ) : null}

      {!cases.isPending && !cases.isError && rows.length === 0 ? (
        <EmptyState compact className="mt-4" title={emptyTitle} description={emptyDescription} />
      ) : null}

      <ul className="mt-4 list-none space-y-2 p-0">
        {rows.map((row) => (
          <li key={row.id} className="rounded-control border border-line p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={SEVERITY_TONE[row.severity]}>{row.severity}</Badge>
              {row.is_overdue ? <Badge tone="danger">Past SLA</Badge> : null}
              {row.holds_payout ? <Badge tone="warning">Holds payout</Badge> : null}
              <span className="text-xs text-text-muted">{formatMoment(row.created_at)}</span>
            </div>
            <p className="mt-1 text-sm font-semibold text-text">{row.summary}</p>
            <p className="text-sm text-text-secondary">{teamLabel(row.owner_team)}</p>
            <Link
              href={`/operations/cases?case=${row.id}`}
              className="mt-1 inline-block text-sm font-semibold text-text-link hover:underline"
            >
              Read the evidence and decide
            </Link>
          </li>
        ))}
      </ul>

      {cases.hasNextPage ? (
        <Button
          className="mt-3"
          variant="outline"
          loading={cases.isFetchingNextPage}
          loadingLabel="Loading"
          onClick={() => void cases.fetchNextPage()}
        >
          Load more
        </Button>
      ) : null}
    </Card>
  );
}

function NotPublishedYet({
  title,
  gap,
  what,
  why,
}: {
  title: string;
  gap: string;
  what: string;
  why: string;
}) {
  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-bold text-text">{title}</h2>
        <Badge tone="neutral">{gap}</Badge>
      </div>
      <p className="mt-2 max-w-prose text-sm leading-6 text-text-secondary">{what}</p>
      <p className="mt-2 max-w-prose text-sm leading-6 text-text-secondary">{why}</p>
      <p className="mt-3 text-sm font-semibold text-warning-text">
        No read exists at contract 1.32.0. This panel shows nothing rather than showing something
        made up — a fabricated signal in a record somebody makes a judgement from is worse than a
        gap, because it looks like evidence.
      </p>
    </Card>
  );
}

export function ReviewSignals() {
  return (
    <div className="flex flex-col gap-6">
      <Card className="p-6">
        <h2 className="text-base font-bold text-text">What a signal is here</h2>
        <p className="mt-2 max-w-prose text-sm leading-6 text-text-secondary">
          Something worth a person&rsquo;s attention, with the evidence and the history attached.
          Nothing on this screen is a finding, and nothing on it accuses anybody. Every row ends at
          a case, and a case ends by naming what happened — including when what happened is that
          the account was not borne out.
        </p>
      </Card>

      <SignalQueue
        kind="OFF_PLATFORM"
        emptyTitle="No off-platform claims open"
        emptyDescription="Nobody has reported money moving outside the platform on a live request. This is a real zero from the case queue, not an unchecked one."
      />

      <SignalQueue
        kind="CHARGEBACK"
        emptyTitle="No chargebacks open"
        emptyDescription="No bank has pulled a charge back that is still being worked. Record one from the Refunds and holds screen."
      />

      <NotPublishedYet
        title="Quote-slot squatting"
        gap="GAP-009"
        what="A deliberately junk-but-valid proposal consumes a paid quote slot, so a Customer who paid for two quotes gets one real one."
        why="The control that exists is the Customer's own non-responsive rejection, which restores the slot and buys a replacement at no extra charge. There is no staff read of those rejections and no per-vendor count of them."
      />

      <NotPublishedYet
        title="Price-band clustering"
        gap="GAP-010"
        what="With three to five eligible vendors in one city who know each other, coordinated pricing is trivial, and the promise to compare real quotes quietly stops being true."
        why="The price band is published to the Customer on a quote teaser. There is no reference band per variant and no read that groups quotes by how tightly they cluster, so there is nothing here a reviewer could judge."
      />
    </div>
  );
}
