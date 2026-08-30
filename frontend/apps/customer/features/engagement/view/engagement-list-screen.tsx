"use client";

import { describeError } from "@vsolve/query";
import { Badge, Button, EmptyState, ErrorState, Skeleton, buttonStyles } from "@vsolve/ui";
import Link from "next/link";

import { engagementHref, stageHref } from "@/lib/routes";
import { toEngagementLists, type EngagementRowView } from "../adapters";
import { useEngagements } from "../queries";
import {
  EngagementStatusBadge,
  nextActionCopy,
  nounsFor,
  type ModeNouns,
} from "./engagement-status";

/**
 * `My bookings` (A3) and `My projects` (A5) — `M2-FE-509` and `M2-FE-608`.
 *
 * ## One component, two screens, and why that is not a shortcut
 *
 * Both lists read `GET /engagements/`, which is one cursor page over everything
 * the caller has commissioned. `commercial_mode` is what separates them, and it
 * is the *only* thing that separates them: the same spine, the same statuses,
 * the same next action. Building two components would mean maintaining two
 * renderings of one record, and the audit's own warning applies — the two drift
 * and one quietly grows a field the other lacks.
 *
 * What is **not** shared is the words. `08-frontend-information-architecture.md`
 * files A3 under a booking noun and A5 under a project noun, and states the
 * reason plainly: filing both under one noun would need one set of words for two
 * different promises about who holds the money, which is exactly the
 * misrepresentation `M2-FE-415` forbids. So the nouns, the direct-payment
 * reminder and the money columns come in per mode.
 *
 * ## What an A3 row may never say
 *
 * `LEAD_ONLY` is a connection, not a protected booking. The A3 list therefore
 * shows **no funded amount** — there is none, Vsolve holds nothing — and carries
 * the direct-payment reminder at the top of the screen rather than buried in a
 * row, because a Customer who skims the list and never opens a row is exactly
 * the person who needs to have read it.
 */

export interface EngagementListScreenProps {
  /** Which half of the one list this screen is. */
  mode: "lead_only" | "managed";
  /** Where a Customer with nothing here goes to start one. */
  newRequestHref: string;
  requestsHref: string;
  /**
   * Whether this is the whole page or a section of one.
   *
   * `page` is the original standalone route: its own heading, its own reading
   * column, its own way back to the requests list. `embedded` is the same list
   * inside the Activity hub, which already supplies all three — so the frame is
   * dropped and nothing else is.
   *
   * What is deliberately **not** conditional is the `LEAD_ONLY` direct-payment
   * reminder. It is the one sentence on this screen that changes what a
   * Customer believes about who holds their money, and a layout flag must never
   * be able to remove it. `M2-FE-509` puts it above the list precisely because
   * somebody who skims and never opens a row is who it is for, and that person
   * skims the hub exactly as readily as the standalone page.
   */
  chrome?: "page" | "embedded";
}

/**
 * `engagementHref` and `stageHref` are **imported, not taken as props**.
 *
 * They used to be `engagementHrefFor` / `stageHrefFor`, supplied by the page, so
 * that this feature owned no route. The principle survives — the literals still
 * live in one module — but the mechanism could not: the pages are Server
 * Components, this is a Client Component, and React cannot serialize a function
 * across that boundary. It threw on every render of `/bookings/workforce`,
 * `/projects` and the quotes screen. `lib/routes.ts` exists for exactly this and
 * says so in its own header.
 */
export function EngagementListScreen({
  mode,
  newRequestHref,
  requestsHref,
  chrome = "page",
}: EngagementListScreenProps) {
  const query = useEngagements();
  const nouns = nounsFor(mode);

  const engagements = (query.data?.pages ?? []).flatMap((page) => page.results);
  const lists = toEngagementLists(engagements);
  const rows = mode === "lead_only" ? lists.workforce : lists.projects;

  if (query.isPending) {
    return (
      <Wrapper mode={mode} chrome={chrome} hasRows={rows.length > 0}>
        <div aria-busy="true" aria-live="polite">
          <span className="sr-only">Loading your {nouns.engagement}s</span>
          <Skeleton className="h-24 w-full" />
          <Skeleton className="mt-3 h-24 w-full" />
        </div>
      </Wrapper>
    );
  }

  // A failed read is never an empty list. They render identically and mean
  // opposite things, and "you have nothing" is the more damaging of the two to
  // say wrongly — somebody with a funded project would conclude it was gone.
  if (query.isError) {
    const presentation = describeError(query.error, "read");
    return (
      <Wrapper mode={mode} chrome={chrome} hasRows={rows.length > 0}>
        <ErrorState
          title={presentation.title}
          message={presentation.message}
          severity={presentation.severity}
          actionLabel="Try again"
          onAction={() => void query.refetch()}
          reference={presentation.reference}
        />
      </Wrapper>
    );
  }

  return (
    <Wrapper mode={mode} chrome={chrome} hasRows={rows.length > 0}>
      {rows.length === 0 ? (
        <EmptyState
          title={`No ${nouns.engagement}s yet`}
          description={
            mode === "lead_only"
              ? "When you choose a professional for a job and they confirm, it appears here."
              : "When you accept an estimate and the professional confirms, your project appears here."
          }
          action={
            <Link href={newRequestHref} className={buttonStyles({ variant: "primary" })}>
              Ask for a quote
            </Link>
          }
        />
      ) : (
        <ol className="mt-4 flex list-none flex-col gap-3 p-0">
          {rows.map((row) => (
            <EngagementListRow
              key={row.engagementId}
              row={row}
            />
          ))}
        </ol>
      )}

      {/* An engagement whose commercial mode this build cannot describe appears
          on neither list. Saying so beats a silent filter: `VISITS_BOOKED`
          taught this column exactly what a correct filter costs when the value
          it drops is one the Customer has money in. */}
      {lists.undescribable.length > 0 ? (
        <p className="mt-4 rounded-card border border-line bg-surface-sunken p-4 text-sm leading-6 text-text-secondary">
          {lists.undescribable.length === 1 ? "One other agreement is" : `${lists.undescribable.length} other agreements are`}{" "}
          not shown here because this app does not recognise how they are paid
          for. Nothing has been lost — please contact support and we will read it
          out for you.
        </p>
      ) : null}

      {query.hasNextPage ? (
        <div className="mt-6">
          <Button
            variant="outline"
            onClick={() => void query.fetchNextPage()}
            loading={query.isFetchingNextPage}
            loadingLabel="Loading older"
          >
            Show older
          </Button>
        </div>
      ) : null}

      {chrome === "page" ? (
        <div className="mt-8">
          <Link href={requestsHref} className={buttonStyles({ variant: "ghost" })}>
            All your requests
          </Link>
        </div>
      ) : null}
    </Wrapper>
  );
}

function Wrapper({
  mode,
  chrome,
  hasRows,
  children,
}: {
  mode: "lead_only" | "managed";
  chrome: "page" | "embedded";
  /**
   * Whether the list under this frame has anything in it.
   *
   * Only consulted for the embedded direct-payment reminder. See the render
   * condition below for why an exception exists at all.
   */
  hasRows: boolean;
  children: React.ReactNode;
}) {
  const framed = chrome === "page";

  return (
    <div
      className={
        framed ? "mx-auto flex w-full max-w-3xl flex-col px-4 pb-16 pt-6" : "flex w-full flex-col"
      }
    >
      {framed ? (
        <>
          <h1 className="text-xl font-bold text-text">
            {mode === "lead_only" ? "People you have hired" : "Your projects"}
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            {mode === "lead_only"
              ? "Jobs where you agreed a rate with a professional and pay them directly."
              : "Work you are funding through Vsolve, one stage at a time."}
          </p>
        </>
      ) : null}

      {/* `M2-FE-509`: the direct-payment reminder, above the list rather than
          inside a row. Somebody who skims and never opens a row is precisely
          the person this sentence exists for. */}
      {/* Standalone, this is a whole page about hiring people directly, so the
          reminder belongs on it whether or not the list has filled up yet.
          Embedded, it is one section of a hub — and a money warning standing
          over an empty list warns about nothing while looking exactly like a
          problem, which is its own kind of dishonesty. It appears the instant
          there is a single row to warn about, which is the only moment it can
          mislead by being absent. */}
      {mode === "lead_only" && (framed || hasRows) ? (
        <p className="mt-4 rounded-card border border-warning-line bg-warning-surface p-4 text-sm leading-6 text-text">
          <strong className="font-semibold">You pay these professionals directly.</strong>{" "}
          Vsolve does not hold your money for this work, so payment, refunds and
          any guarantee are between you and them. We will help if the connection
          fails and we will find you somebody else.
        </p>
      ) : null}

      {children}
    </div>
  );
}

export function EngagementListRow({ row }: { row: EngagementRowView }) {
  const nouns = nounsFor(row.mode);
  const href = engagementHref(row.engagementId);
  const actionHref =
    row.actionStageId === null ? null : stageHref(row.engagementId, row.actionStageId);

  return (
    <EngagementRow
      row={row}
      nouns={nouns}
      engagementHref={href}
      actionHref={actionHref}
    />
  );
}

function EngagementRow({
  row,
  nouns,
  engagementHref,
  actionHref,
}: {
  row: EngagementRowView;
  nouns: ModeNouns;
  engagementHref: string;
  actionHref: string | null;
}) {
  const { done, total } = row.progress;

  return (
    <li className="rounded-card border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-semibold text-text">
            <Link href={engagementHref} className="hover:underline">
              {row.serviceName ?? row.activeStageLabel ?? nouns.engagementTitle}
            </Link>
          </h2>
          {row.activeStageOn !== null ? (
            <p className="mt-0.5 text-sm text-text-secondary">{row.activeStageOn}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {row.isDisputed ? <Badge tone="danger">Problem raised</Badge> : null}
          <EngagementStatusBadge status={row.status} />
        </div>
      </div>

      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1">
        <div className="flex items-baseline gap-2">
          <dt className="text-sm text-text-secondary">
            {nouns.stages.charAt(0).toUpperCase() + nouns.stages.slice(1)} done
          </dt>
          <dd className="text-sm font-medium text-text">
            {done} of {total}
          </dd>
        </div>
        <div className="flex items-baseline gap-2">
          <dt className="text-sm text-text-secondary">Agreed</dt>
          <dd className="text-sm font-medium text-text">{row.stagedTotalLabel}</dd>
        </div>
        {/* `M2-FE-608` asks for the funded amount and it is a published running
            total. It is absent from an A3 row because on `LEAD_ONLY` the answer
            is always zero and a "Funded ₹0" beside a job in progress reads as a
            failure rather than as a design. */}
        {row.mode === "managed" ? (
          <div className="flex items-baseline gap-2">
            <dt className="text-sm text-text-secondary">Funded</dt>
            <dd className="text-sm font-medium text-text">{row.fundedTotalLabel}</dd>
          </div>
        ) : null}
      </dl>

      {/* The kind of the row this action is about, so a materials line is never
          announced as a stage that "starts" when it is funded. */}
      <p className="mt-3 text-sm leading-6 text-text">
        {nextActionCopy(row.nextAction, nouns, row.actionStageKind)}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {/* The stage link is offered only for the actions that are genuinely
            about one stage. A review is; waiting for the vendor is not. */}
        {actionHref !== null && row.nextAction === "review_stage" ? (
          <Link href={actionHref} className={buttonStyles({ variant: "primary" })}>
            {row.actionStageKind === "material_advance" ? "Check the materials" : "Check the work"}
          </Link>
        ) : null}
        <Link href={engagementHref} className={buttonStyles({ variant: "outline" })}>
          Open {nouns.engagement}
        </Link>
      </div>
    </li>
  );
}
