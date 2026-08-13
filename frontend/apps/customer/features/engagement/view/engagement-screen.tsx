"use client";

import { describeError, isStageNotFundable } from "@vsolve/query";
import { Badge, Button, ErrorState, Skeleton, buttonStyles } from "@vsolve/ui";
import Link from "next/link";

import { AccessRefusal } from "@/features/access/view/access-refusal";
import { toEngagementView, type EngagementView, type StageView } from "../adapters";
import { useEngagement, useFundStage } from "../queries";

/**
 * The agreement — `M2-FE-415`..`M2-FE-418`.
 *
 * ## The first thing this screen reads, and everything else follows from it
 *
 * `commercial_mode`. It is the field that decides whether the UI promises Vsolve
 * protection or tells the Customer to settle directly with the vendor, and it is
 * published rather than derived precisely so a client cannot keep promising
 * protection through a policy change.
 *
 * - **`LEAD_ONLY` (A3).** `M2-FE-415`. The Customer pays the vendor directly.
 *   Service payment, service refunds and warranty are **between the Customer and
 *   the vendor**, and Vsolve's protection is matching, quote support and
 *   replacement. This screen must never describe it as a protected booking, and
 *   the panel below says the opposite in as many words — because a Customer who
 *   believes they are covered will not ask the questions that actually protect
 *   them.
 * - **`MANAGED_PAYMENT_REQUIRED` (A5).** `M2-FE-416`. One stage at a time, **at
 *   face value**. There is no stage credit: the visit-plan money was spent on the
 *   visits themselves, and discounting a stage by it would pay for those visits
 *   twice out of the vendor's work. Nothing on this screen subtracts anything
 *   from a stage.
 * - **Anything else** renders as "we cannot describe this". On this surface the
 *   optimistic fallback is "protected booking", which is the one claim M2 must
 *   not make wrongly.
 *
 * ## `M2-FE-418` — durable access, and what it can honestly offer
 *
 * The agreement, its stages and its amounts are readable from this route for as
 * long as the engagement exists, by both parties through their own projections.
 * A receipt or invoice document is **not** reachable from here: `Engagement`
 * publishes no order id and no tax-document id, and `GET /tax-documents/{id}/`
 * needs one. The screen says where the record is rather than linking to a
 * document it cannot name. Logged in `frontend-execution-plan.md` §7.
 */

export interface EngagementScreenProps {
  engagementId: string;
  /**
   * Where the request this came from lives. This feature owns no route.
   *
   * A function rather than a string, because the requirement id is on the
   * **record** and not in the path — the engagement route is keyed by the
   * engagement alone so it survives a notification opened months later.
   */
  requestHrefFor: (requirementId: string) => string;
  /** Where the Customer's own list of requests lives, for a failed read. */
  requestsHref: string;
}

export function EngagementScreen({
  engagementId,
  requestHrefFor,
  requestsHref,
}: EngagementScreenProps) {
  const engagementQuery = useEngagement(engagementId);
  const fund = useFundStage();

  const view = engagementQuery.data === undefined ? null : toEngagementView(engagementQuery.data);
  // Only known once the record has loaded. A failed read falls back to the
  // list, which is a real page, rather than to a requirement id we do not have.
  const requestHref = view === null ? requestsHref : requestHrefFor(view.requirementId);

  if (engagementQuery.isPending) {
    return (
      <Wrapper>
        <div aria-busy="true" aria-live="polite">
          <span className="sr-only">Loading your agreement</span>
          <Skeleton className="h-64 w-full" />
        </div>
      </Wrapper>
    );
  }

  if (view === null) {
    const presentation = describeError(engagementQuery.error, "read");
    return (
      <Wrapper>
        <ErrorState
          title={presentation.title}
          message={presentation.message}
          severity={presentation.severity}
          actionLabel="Try again"
          onAction={() => void engagementQuery.refetch()}
          reference={presentation.reference}
        />
        <BackLink href={requestHref} />
      </Wrapper>
    );
  }

  return (
    <Wrapper>
      <header>
        <h1 className="text-xl font-semibold text-text">Your agreement</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Agreed on {view.createdAt}
        </p>
      </header>

      <ModePanel view={view} />

      <section aria-labelledby="totals-heading" className="mt-6">
        <h2 id="totals-heading" className="text-lg font-semibold text-text">
          What was agreed
        </h2>
        <dl className="mt-3 rounded-card border border-line bg-surface">
          <Row label="Total" value={view.totalLabel} strong />
          <Row label="Tax" value={view.taxLabel} />
          {view.mode === "managed" ? <Row label="Funded so far" value={view.fundedLabel} /> : null}
          {view.commissionTreatment !== null ? (
            <Row label="Commission" value={view.commissionTreatment} />
          ) : null}
        </dl>
      </section>

      <StageList
        view={view}
        onFund={(stageId) => fund.mutate({ engagementId, stageId })}
        isFunding={fund.isPending}
      />

      {isStageNotFundable(fund.error) ? (
        <div className="mt-4">
          <ErrorState
            title="That stage cannot be funded right now"
            message="Either it is already funded, an earlier stage is not, or this agreement is paid directly to the professional. We have re-read it — what you see now is what is actually there."
            severity="warning"
            inline
          />
        </div>
      ) : (
        <div className="mt-4">
          <AccessRefusal error={fund.error} attempting="fund this stage" />
        </div>
      )}

      <section aria-labelledby="record-heading" className="mt-8">
        <h2 id="record-heading" className="text-lg font-semibold text-text">
          The record
        </h2>
        <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
          Everything that has happened on this job — what you asked for, who was
          invited, what they quoted, when they visited and what you chose — stays
          on the request it came from, for both of you.
        </p>
        <div className="mt-3">
          <Link href={requestHref} className={buttonStyles({ variant: "outline" })}>
            Open the full history
          </Link>
        </div>
      </section>

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

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line p-4 last:border-0">
      <dt className="text-sm text-text-secondary">{label}</dt>
      <dd className={strong ? "text-lg font-semibold text-text" : "text-text"}>{value}</dd>
    </div>
  );
}

/** `M2-FE-415` / `M2-FE-416` — what this platform is and is not responsible for. */
function ModePanel({ view }: { view: EngagementView }) {
  if (view.mode === "lead_only") {
    return (
      <section className="mt-4 rounded-card border border-warning-line bg-warning-surface p-4">
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-semibold text-text">You pay the professional directly</h2>
          <Badge tone="warning">Not a Vsolve booking</Badge>
        </div>
        <p className="mt-2 max-w-prose text-sm leading-6 text-text">
          We connected you and we will help if the connection fails — we will find
          you somebody else. We do{" "}
          <strong className="font-semibold">not</strong> hold your money for this
          work, so{" "}
          <strong className="font-semibold">
            payment, refunds and any guarantee on the work are between you and
            them
          </strong>
          . Agree what you are paying, and when, before anybody starts.
        </p>
        {view.contactReleasedAt !== null ? (
          <p className="mt-2 text-sm text-text-secondary">
            You can contact each other from {view.contactReleasedAt}.
          </p>
        ) : null}
      </section>
    );
  }

  if (view.mode === "managed") {
    return (
      <section className="mt-4 rounded-card border border-success-line bg-success-surface p-4">
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-semibold text-text">You pay through Vsolve, one stage at a time</h2>
          <Badge tone="success">Staged funding</Badge>
        </div>
        <p className="mt-2 max-w-prose text-sm leading-6 text-text">
          You are never asked for the whole project up front. Each stage is funded
          when it starts, and the money reaches the professional after you have
          approved what they did. If the work stops, only the unearned stages are
          at stake.
        </p>
        <p className="mt-2 max-w-prose text-sm leading-6 text-text-secondary">
          What you paid for the site visits is separate and is already spent — it
          paid the professionals who came out and wrote your estimates. It does
          not come off these stages.
        </p>
        {view.workMayStartAt === null ? (
          <p className="mt-2 text-sm text-text-secondary">
            Work starts once the first stage is funded.
          </p>
        ) : null}
      </section>
    );
  }

  return (
    <section className="mt-4 rounded-card border border-line bg-surface-sunken p-4">
      <h2 className="font-semibold text-text">We cannot describe this agreement</h2>
      <p className="mt-2 max-w-prose text-sm leading-6 text-text-secondary">
        This app does not recognise how this job is being paid for, so it is not
        going to guess. Nothing here is a promise about who holds your money.
      </p>
    </section>
  );
}

/**
 * The stages, and the single funding control.
 *
 * Exactly one stage can carry a button, and it is the first unsettled one:
 * `POST /engagement-stages/{id}/funding/` refuses a later stage while an earlier
 * one is unfunded, so a second button would be a second refusal. A stage whose
 * charge is in flight shows the pending state and no control — `M2-FE-417`, and
 * the same rule as every other charge in this wave: **never a false confirmed
 * state, and never a second charge while the first is unresolved.**
 */
function StageList({
  view,
  onFund,
  isFunding,
}: {
  view: EngagementView;
  onFund: (stageId: string) => void;
  isFunding: boolean;
}) {
  if (view.stages.length === 0) return null;

  return (
    <section aria-labelledby="stages-heading" className="mt-6">
      <h2 id="stages-heading" className="text-lg font-semibold text-text">
        {view.mode === "lead_only" ? "The days you agreed" : "The stages"}
      </h2>
      <ol className="mt-3 flex list-none flex-col gap-2 p-0">
        {view.stages.map((stage) => (
          <StageRow
            key={stage.stageId}
            stage={stage}
            mode={view.mode}
            onFund={onFund}
            isFunding={isFunding}
          />
        ))}
      </ol>
    </section>
  );
}

const STAGE_STATUS_LABEL: Record<StageView["status"], string> = {
  PENDING: "Not started",
  IN_PROGRESS: "In progress",
  AWAITING_REVIEW: "Waiting for you to check",
  APPROVED: "Approved",
  CORRECTION_REQUESTED: "Correction asked for",
  DISPUTED: "Disputed",
  RELEASED: "Paid out",
};

function StageRow({
  stage,
  mode,
  onFund,
  isFunding,
}: {
  stage: StageView;
  mode: EngagementView["mode"];
  onFund: (stageId: string) => void;
  isFunding: boolean;
}) {
  return (
    <li className="rounded-card border border-line p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-text">{stage.label}</p>
          {stage.scheduledOn !== null ? (
            <p className="mt-0.5 text-sm text-text-secondary">{stage.scheduledOn}</p>
          ) : null}
          <p className="mt-0.5 text-sm text-text-secondary">
            {STAGE_STATUS_LABEL[stage.status] ?? "We cannot describe this"}
          </p>
        </div>
        <p className="shrink-0 font-medium text-text">{stage.amountLabel}</p>
      </div>

      {mode !== "managed" ? null : stage.isFundingPending ? (
        <p className="mt-3 text-sm leading-6 text-text-secondary" role="status">
          We are confirming your payment for this stage. Your bank or UPI app
          tells us the outcome and that can take a few minutes — do not pay again.
        </p>
      ) : stage.fundingState === "FUNDED" ? (
        <p className="mt-3 text-sm text-text-secondary">
          Funded. It reaches the professional once you approve the work.
        </p>
      ) : stage.isNextToFund ? (
        <div className="mt-3">
          <p className="max-w-prose text-sm leading-6 text-text-secondary">
            Funding this at its full price — {stage.amountLabel} — is what starts
            it.
          </p>
          <div className="mt-2">
            <Button
              onClick={() => onFund(stage.stageId)}
              loading={isFunding}
              loadingLabel="Starting your payment"
            >
              Fund this stage — {stage.amountLabel}
            </Button>
          </div>
        </div>
      ) : stage.fundingState === "REQUIRED" ? (
        <p className="mt-3 text-sm text-text-secondary">
          You will be asked for this when the stage before it is done.
        </p>
      ) : null}
    </li>
  );
}
