"use client";

import { describeError, type ReclassificationTarget, type RefundReviewDecision } from "@vsolve/query";
import {
  Badge,
  Button,
  Card,
  ConfirmAction,
  ErrorState,
  Field,
  Input,
  Select,
  Textarea,
  buttonStyles,
} from "@vsolve/ui";
import Link from "next/link";
import { useState, type ReactNode } from "react";

import {
  useExtendDeadline,
  useReclassifyRequest,
  useRefundReview,
  useRematchRequest,
} from "../queries";

/**
 * `M2-FE-704`: the recovery actions, each with a reason and a named consequence.
 *
 * ## What gates these, and what does not
 *
 * The gate is the server's own published grant, in two layers, and neither is a
 * role string this file assembles. `OperationsShell` mounts nothing until
 * `useAuthGuard` reports that Django's session projection holds the Operations
 * role **and is currently acting as it** — `IsOperationsUser` asks the same
 * question, so a console rendered here is a console whose commands will not
 * 403 for want of a role. Below that, every command is re-checked server-side
 * and a refusal is rendered as a refusal.
 *
 * There is deliberately **no finer client-side check**. The contract publishes a
 * per-action grant list for Partners (`workspace_key` + `actions[]`) and nothing
 * equivalent for Operations, so a per-button permission map here would be
 * invented — and invented in the dangerous direction, because it would either
 * hide a control the operator is entitled to or show one that always fails. The
 * step-up gate on refunds already settled this argument on this app: ask the
 * server, do not keep a copy of the answer.
 *
 * ## Every action takes a reason, and the reason is required by the server
 *
 * `M2-AC-804`. The forms do not offer a way to skip it and do not default it —
 * a pre-filled reason is a reason nobody gave.
 *
 * ## Refund review records; it does not move money
 *
 * There is no amount field here and there will not be one. Each product refunds
 * through the module that owns it, idempotently, on the M1 rail; a second path
 * from this screen would have none of the first's reconciliation.
 */

function ActionCard({
  title,
  description,
  children,
}: {
  title: string;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold text-text">{title}</h3>
      <div className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">{description}</div>
      <div className="mt-4">{children}</div>
    </Card>
  );
}

function Refusal({ error }: { error: unknown }) {
  const presentation = describeError(error, "mutation");
  return (
    <ErrorState
      inline
      className="mt-3"
      severity={presentation.severity}
      title={presentation.title}
      message={presentation.message}
      reference={presentation.reference}
    />
  );
}

function ReasonField({
  value,
  onChange,
  label = "Reason",
  description = "Lands on the timeline as an Operations touch and is read during a dispute. Say what you were told and by whom.",
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  description?: string;
}) {
  return (
    <Field label={label} description={description} required>
      <Textarea
        value={value}
        maxLength={2000}
        rows={3}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}

function RematchAction({ requirementId }: { requirementId: string }) {
  const rematch = useRematchRequest(requirementId);
  const [reason, setReason] = useState("");
  const ready = reason.trim() !== "";

  return (
    <ActionCard
      title="Rematch"
      description={
        <>
          One button, two engines. A rate-card booking advances its <strong>cascade</strong>;
          everything else runs another <strong>invitation wave</strong>. The server decides which.
          Neither charges anybody anything.
        </>
      }
    >
      <ReasonField value={reason} onChange={setReason} />
      {rematch.isError ? <Refusal error={rematch.error} /> : null}
      <Button
        className="mt-3"
        disabled={!ready || rematch.isPending}
        loading={rematch.isPending}
        loadingLabel="Rematching"
        onClick={() => rematch.mutate({ reason }, { onSuccess: () => setReason("") })}
      >
        Rematch this request
      </Button>
    </ActionCard>
  );
}

function DeadlineAction({ requirementId }: { requirementId: string }) {
  const extend = useExtendDeadline(requirementId);
  const [hours, setHours] = useState("24");
  const [reason, setReason] = useState("");

  const parsed = Number.parseInt(hours, 10);
  // Forward only, and the bounds are the contract's own (1..720). A negative
  // extension is refused rather than clamped by the server, so the form does not
  // offer one — pulling a needed-by date in would close somebody's live request
  // by moving its clock.
  const hoursValid = Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 720;
  const ready = hoursValid && reason.trim() !== "";

  return (
    <ActionCard
      title="Extend the needed-by date"
      description={
        <>
          Moves <strong>forward only</strong>, by up to 720 hours. There is no way to pull a date
          in from here, because that would be a way to close a live request rather than recover it.
        </>
      }
    >
      <Field
        label="Extra hours"
        description="Between 1 and 720."
        required
        error={hours !== "" && !hoursValid ? "Between 1 and 720 whole hours." : undefined}
      >
        <Input
          value={hours}
          inputMode="numeric"
          data-numeric
          onChange={(event) => setHours(event.target.value.replace(/[^\d]/g, ""))}
        />
      </Field>
      <div className="mt-3">
        <ReasonField value={reason} onChange={setReason} />
      </div>
      {extend.isError ? <Refusal error={extend.error} /> : null}
      <Button
        className="mt-3"
        disabled={!ready || extend.isPending}
        loading={extend.isPending}
        loadingLabel="Extending"
        onClick={() =>
          extend.mutate({ extraHours: parsed, reason }, { onSuccess: () => setReason("") })
        }
      >
        Extend by {hoursValid ? parsed : "…"} hours
      </Button>
    </ActionCard>
  );
}

const ARCHETYPE_LABELS: Record<ReclassificationTarget, string> = {
  A3_TIME_BLOCK: "Workforce (A3)",
  A5_CUSTOM_PROJECT: "Project (A5)",
};

function ReclassifyAction({
  requirementId,
  currentArchetype,
}: {
  requirementId: string;
  currentArchetype: string;
}) {
  const reclassify = useReclassifyRequest(requirementId);
  const [target, setTarget] = useState<ReclassificationTarget | "">("");
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const ready = target !== "" && reason.trim() !== "";

  return (
    <ActionCard
      title="Reclassify"
      description={
        <>
          Moves this request between the workforce and project lifecycles.{" "}
          <strong>Every paid value is preserved</strong> — unfilled visit shares refund or convert,
          a charged unlock survives — and matching restarts with no second charge. It is currently{" "}
          <Badge tone="neutral">{currentArchetype}</Badge>.
        </>
      }
    >
      <Field label="Reclassify to" required>
        <Select
          value={target}
          onChange={(event) => setTarget(event.target.value as ReclassificationTarget | "")}
        >
          <option value="">Choose a lifecycle…</option>
          {(Object.keys(ARCHETYPE_LABELS) as ReclassificationTarget[]).map((value) => (
            <option key={value} value={value}>
              {ARCHETYPE_LABELS[value]}
            </option>
          ))}
        </Select>
      </Field>
      <div className="mt-3">
        <ReasonField value={reason} onChange={setReason} />
      </div>
      {reclassify.isError ? <Refusal error={reclassify.error} /> : null}

      <Button
        className="mt-3"
        variant="outline"
        disabled={!ready || reclassify.isPending}
        onClick={() => setConfirming(true)}
      >
        Reclassify…
      </Button>

      <ConfirmAction
        open={confirming}
        onOpenChange={setConfirming}
        title="Reclassify this request"
        confirmLabel="Reclassify"
        pending={reclassify.isPending}
        consequence={
          <>
            The request restarts matching under{" "}
            {target === "" ? "the chosen lifecycle" : ARCHETYPE_LABELS[target]}. Nothing already
            paid is lost and nothing new is charged, but the customer&rsquo;s screens change shape
            and any vendor mid-quote loses the thread. It is not undone by reclassifying back.
          </>
        }
        onConfirm={() => {
          if (target === "") return;
          reclassify.mutate(
            { toArchetype: target, reason },
            {
              onSuccess: () => {
                setConfirming(false);
                setReason("");
                setTarget("");
              },
            },
          );
        }}
      />
    </ActionCard>
  );
}

const REFUND_DECISIONS: Record<RefundReviewDecision, string> = {
  APPROVED: "Approved",
  DECLINED: "Declined",
};

function RefundReviewAction({ requirementId }: { requirementId: string }) {
  const review = useRefundReview(requirementId);
  const [decision, setDecision] = useState<RefundReviewDecision | "">("");
  const [reason, setReason] = useState("");
  const ready = decision !== "" && reason.trim() !== "";

  return (
    <ActionCard
      title="Record a refund review"
      description={
        <>
          <strong>This records a decision and moves no money.</strong> Each product refunds through
          the module that owns it — the booking fee, the unlock, the visit share — so there is no
          amount field here and there will not be one. Execute the refund in the product, then
          record what was decided so the request carries the account of it.
        </>
      }
    >
      <Field label="Decision" required>
        <Select
          value={decision}
          onChange={(event) => setDecision(event.target.value as RefundReviewDecision | "")}
        >
          <option value="">Choose a decision…</option>
          {(Object.keys(REFUND_DECISIONS) as RefundReviewDecision[]).map((value) => (
            <option key={value} value={value}>
              {REFUND_DECISIONS[value]}
            </option>
          ))}
        </Select>
      </Field>
      <div className="mt-3">
        <ReasonField
          value={reason}
          onChange={setReason}
          description="What was decided and why. This is the account a customer or a vendor is given later."
        />
      </div>
      {review.isError ? <Refusal error={review.error} /> : null}
      <Button
        className="mt-3"
        disabled={!ready || review.isPending}
        loading={review.isPending}
        loadingLabel="Recording"
        onClick={() => {
          if (decision === "") return;
          review.mutate(
            { decision, reason },
            {
              onSuccess: () => {
                setReason("");
                setDecision("");
              },
            },
          );
        }}
      >
        Record this review
      </Button>
    </ActionCard>
  );
}

export function RecoveryActions({
  requirementId,
  archetype,
}: {
  requirementId: string;
  archetype: string;
}) {
  return (
    <section aria-labelledby="recovery-actions" className="space-y-4">
      <div>
        <h2 id="recovery-actions" className="text-lg font-bold text-text">
          Recovery actions
        </h2>
        <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
          Each one takes a reason, lands on the timeline above as an Operations touch, and is
          re-checked by the server. Nothing here accepts an offer for a vendor, publishes a
          vendor&rsquo;s price, or moves an arbitrary amount of money — there is no endpoint that
          would.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <RematchAction requirementId={requirementId} />
        <DeadlineAction requirementId={requirementId} />
        <ReclassifyAction requirementId={requirementId} currentArchetype={archetype} />
        <RefundReviewAction requirementId={requirementId} />
      </div>

      <Card className="p-5">
        <h3 className="text-sm font-semibold text-text">Clarification and quote capture</h3>
        <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
          Writing down what a vendor said on the phone is its own surface, because it records
          consent and attributes what was said to the named party rather than to you.
        </p>
        <Link
          className={buttonStyles({ variant: "outline", className: "mt-3" })}
          href={`/operations/requests/${requirementId}/assisted-quote`}
        >
          Open assisted capture
        </Link>
      </Card>
    </section>
  );
}
