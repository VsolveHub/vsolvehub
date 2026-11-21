"use client";

import { friendlyErrorMessage } from "@vsolve/query";
import {
  Badge,
  Button,
  Dialog,
  Spinner,
  formatDateTime,
  formatMoney,
} from "@vsolve/ui";

import {
  isSelfPayment,
  isStepUpRequired,
  isVersionConflict,
  usePayoutBatchPreview,
  type PayoutAuditEvent,
  type PayoutBatch,
} from "../queries";

/**
 * Review before money moves, and the history after.
 *
 * Approve and Pay open `RunReviewDialog`, built from the server's preview: the same checks Pay
 * runs, with nothing changed. Confirm carries the preview's `version`, so a run that changed
 * after it was reviewed is refused (`409`) and the operator is asked to review it again rather
 * than acting on what they no longer see.
 */

/** Why a Partner was or would be left out. Codes from the server's last-moment checks. */
export const SKIP_REASON: Record<string, string> = {
  payouts_paused: "Payouts are paused",
  withdrawals_disabled: "Withdrawals are switched off",
  partner_suspended: "Partner is suspended",
  account_not_payable: "Bank account changed, not verified, or still cooling",
  earning_on_hold: "Earning is on hold (dispute or case)",
  no_payable_account: "No verified bank account",
  below_minimum: "Owed less than the minimum payout",
  declined_by_operations: "Declined by Operations",
};

export function skipReasonLabel(code: string): string {
  return SKIP_REASON[code] ?? code.replaceAll("_", " ");
}

const APPROVAL_BASIS: Record<string, string> = {
  OPERATIONS: "by a second person",
  SELF: "by the proposer",
  POLICY: "automatically, by the withdrawal rules",
};

function actorLabel(event: PayoutAuditEvent): string {
  if (event.actor_role === "SYSTEM") return "the system";
  return (
    event.actor_name ||
    (event.actor_role === "PARTNER" ? "the partner" : "an Operations user")
  );
}

function amount(paise: number | null | undefined): string {
  return typeof paise === "number" ? formatMoney(paise) : "";
}

/** One sentence per event, in the order they happened. Exported for tests. */
export function describeEvent(event: PayoutAuditEvent): string {
  const who = actorLabel(event);
  const details = (event.details ?? {}) as Record<string, unknown>;
  const total =
    typeof details.total_paise === "number"
      ? formatMoney(details.total_paise)
      : "";
  const count =
    typeof details.item_count === "number" ? details.item_count : null;
  switch (event.event_type) {
    case "RUN_PROPOSED":
      return `Proposed by ${who}${count !== null ? ` · ${count} payouts, ${total}` : ""}`;
    case "RUN_APPROVED":
      return `Approved by ${who} (${APPROVAL_BASIS[event.approval_basis] ?? event.approval_basis})`;
    case "RUN_PAY_STARTED":
      return `Payment started by ${who}${count !== null ? ` · ${count} transfers, ${total}` : ""}`;
    case "RUN_CANCELLED": {
      const released =
        typeof details.released_paise === "number"
          ? formatMoney(details.released_paise)
          : "";
      return `Cancelled by ${who}${released ? ` · ${released} returned to balances` : ""}`;
    }
    case "PARTNER_SKIPPED":
      return `${event.partner_name || "A partner"} skipped${
        event.amount_paise ? ` (${amount(event.amount_paise)})` : ""
      }: ${skipReasonLabel(event.reason)}`;
    case "WITHDRAWAL_REQUESTED":
      return `Requested by ${who} · ${amount(event.amount_paise)}${
        event.approval_basis === "POLICY"
          ? " · approved automatically"
          : " · sent for review"
      }`;
    case "WITHDRAWAL_APPROVED":
      return `Approved by ${who}`;
    case "WITHDRAWAL_DECLINED":
      return `Declined by ${who}`;
    default:
      return event.event_type;
  }
}

export function AuditHistory({ events }: { events?: PayoutAuditEvent[] }) {
  if (!events || events.length === 0) return null;
  return (
    <section aria-label="History" className="mt-4">
      <h3 className="text-sm font-semibold text-text">History</h3>
      <ol className="mt-2 list-none space-y-1 border-l border-line pl-3 text-sm">
        {events.map((event) => (
          <li key={event.id} className="text-text-secondary">
            <span className="text-text">{describeEvent(event)}</span>
            <span className="ml-2 text-xs text-text-muted">
              {formatDateTime(event.occurred_at)}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export type RunAction = "approve" | "pay";

const ACTION_TEXT: Record<
  RunAction,
  { title: string; confirm: string; pending: string }
> = {
  approve: {
    title: "Review and approve this run",
    confirm: "Approve",
    pending: "Approving",
  },
  pay: {
    title: "Review and start paying",
    confirm: "Start paying",
    pending: "Starting",
  },
};

/**
 * The exact effect of Approve or Pay, from the server. Confirm is disabled while the preview
 * loads, when it would send nothing, and when it includes the operator's own Partner account.
 */
export function RunReviewDialog({
  batch,
  action,
  isOwnProposal,
  pending,
  error,
  onConfirm,
  onClose,
}: {
  batch: PayoutBatch;
  action: RunAction;
  isOwnProposal: boolean;
  pending: boolean;
  error: unknown;
  onConfirm: (expectedVersion: number) => void;
  onClose: () => void;
}) {
  const preview = usePayoutBatchPreview(batch.id, true);
  const text = ACTION_TEXT[action];
  const data = preview.data;
  const changed =
    isVersionConflict(error) ||
    (data !== undefined && data.version !== batch.version);
  const blocked =
    !data ||
    data.send_count === 0 ||
    data.includes_actor ||
    changed ||
    preview.isFetching;

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !pending) onClose();
      }}
      title={text.title}
      description={`${batch.reference}. Nothing changes until you confirm.`}
      footer={
        <>
          <Button variant="outline" disabled={pending} onClick={onClose}>
            Back
          </Button>
          <Button
            disabled={blocked}
            loading={pending}
            loadingLabel={text.pending}
            onClick={() => data && onConfirm(data.version)}
          >
            {data && data.send_count > 0
              ? `${text.confirm} · ${formatMoney(data.send_total_paise)}`
              : text.confirm}
          </Button>
        </>
      }
    >
      {preview.isPending ? (
        <p className="flex items-center gap-2 text-sm text-text-secondary">
          <Spinner size="sm" />
          Checking every payout…
        </p>
      ) : preview.isError || !data ? (
        <p role="alert" className="text-sm text-danger-text">
          {friendlyErrorMessage(preview.error)} Nothing has changed.
        </p>
      ) : (
        <div className="flex flex-col gap-4 text-sm">
          <dl className="grid grid-cols-2 gap-3 rounded-control border border-line p-3">
            <div>
              <dt className="text-xs text-text-muted">Will be sent</dt>
              <dd data-numeric className="font-semibold text-text">
                {formatMoney(data.send_total_paise)} to {data.send_count}{" "}
                {data.send_count === 1 ? "partner" : "partners"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">Will be skipped</dt>
              <dd data-numeric className="font-semibold text-text">
                {data.skip_count === 0
                  ? "None"
                  : `${formatMoney(data.skip_total_paise)} · ${data.skip_count}`}
              </dd>
            </div>
          </dl>

          <ul className="max-h-72 list-none space-y-2 overflow-y-auto">
            {data.items.map((row) => (
              <li
                key={row.item_id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-line p-2"
              >
                <span className="min-w-0">
                  <span className="block font-medium text-text">
                    {row.partner_name || "Partner"}
                  </span>
                  <span data-numeric className="text-xs text-text-secondary">
                    ••••{row.account_last4} · {row.ifsc}
                  </span>
                  {row.skip_reason ? (
                    <span className="mt-1 block">
                      <Badge tone="warning">
                        Skipped: {skipReasonLabel(row.skip_reason)}
                      </Badge>
                    </span>
                  ) : null}
                </span>
                <span
                  data-numeric
                  className={
                    row.skip_reason
                      ? "text-text-muted line-through"
                      : "text-text"
                  }
                >
                  {formatMoney(row.amount_paise)}
                </span>
              </li>
            ))}
          </ul>

          {action === "pay" && data.send_count > 0 ? (
            <p className="rounded-control bg-info-surface p-3 text-info-text">
              Make sure your Cashfree wallet has at least{" "}
              {formatMoney(data.send_total_paise)} plus transfer fees. A
              transfer that fails for low balance returns the money to the
              partner&apos;s balance.
            </p>
          ) : null}
          {action === "approve" && isOwnProposal ? (
            <p className="rounded-control bg-surface-hover p-3 text-text-secondary">
              You proposed this run. Approving it yourself is recorded as
              &quot;approved by the proposer&quot; in its history.
            </p>
          ) : null}
          {data.skip_count > 0 ? (
            <p className="text-text-secondary">
              Skipped payouts are not sent. Their money stays in each
              partner&apos;s balance for a later payout.
            </p>
          ) : null}
          {data.send_count === 0 ? (
            <p role="alert" className="text-danger-text">
              Nothing would be sent, so this can&apos;t go ahead. Cancel the run
              or fix the reasons above.
            </p>
          ) : null}
          {data.includes_actor ? (
            <p role="alert" className="text-danger-text">
              This run includes money for your own partner account. Another
              Operations user must approve and send it.
            </p>
          ) : null}
          {changed ? (
            <p role="alert" className="text-danger-text">
              This run changed after you opened the review. Nothing happened.
              Close this and review it again.
            </p>
          ) : null}
          {error && !changed && !isStepUpRequired(error) ? (
            <p role="alert" className="text-danger-text">
              {isSelfPayment(error)
                ? "This run includes money for your own partner account. Another Operations user must approve and send it."
                : friendlyErrorMessage(error)}
            </p>
          ) : null}
        </div>
      )}
    </Dialog>
  );
}
