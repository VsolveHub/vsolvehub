"use client";

import { describeError } from "@vsolve/query";
import { Button, Dialog, ErrorState, Field, Input, cn, formatMoney } from "@vsolve/ui";
import { useState } from "react";

import { paiseToRupeeInput, rupeesToPaise } from "../model/proposal-draft";
import {
  useApplyOverallDiscount,
  useOverallDiscountPreview,
  type Proposal,
  type ProposalDiscountRequest,
} from "../queries";

export interface OverallDiscountDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly proposal: Proposal;
  readonly requestId: string;
  readonly requestedBps: number;
  readonly requirementId: string;
  readonly initialMode?: "PERCENT" | "FIXED";
}

export function OverallDiscountDialog(props: OverallDiscountDialogProps) {
  if (!props.open) return null;
  return <OverallDiscountForm {...props} />;
}

function OverallDiscountForm({
  onClose,
  proposal,
  requestId,
  requestedBps,
  requirementId,
  initialMode = "PERCENT",
}: OverallDiscountDialogProps) {
  const requestedTarget =
    proposal.total_paise - Math.round((proposal.total_paise * requestedBps) / 10_000);
  const [mode, setMode] = useState<"PERCENT" | "FIXED">(initialMode);
  const [percentage, setPercentage] = useState(String(requestedBps / 100));
  const [finalTotal, setFinalTotal] = useState(paiseToRupeeInput(requestedTarget));
  const apply = useApplyOverallDiscount();

  const parsedPercent = Number(percentage);
  const bps = Number.isFinite(parsedPercent) ? Math.round(parsedPercent * 100) : 0;
  const parsedFinal = rupeesToPaise(finalTotal);
  const fixedSaving = parsedFinal === null ? 0 : proposal.total_paise - parsedFinal;
  const maximumSaving = Math.round((proposal.total_paise * 1_500) / 10_000);
  const percentError =
    mode === "PERCENT" && (bps < 100 || bps > 1_500)
      ? "Enter a discount from 1% to 15%."
      : undefined;
  const finalError =
    mode === "FIXED" &&
    (parsedFinal === null || parsedFinal <= 0 || fixedSaving <= 0 || fixedSaving > maximumSaving)
      ? `Enter a final total between ${formatMoney(proposal.total_paise - maximumSaving)} and ${formatMoney(proposal.total_paise - 1)}.`
      : undefined;
  const body: ProposalDiscountRequest | null =
    mode === "PERCENT" && percentError === undefined
      ? { discount_kind: "PERCENT", discount_bps: bps, final_total_paise: null }
      : mode === "FIXED" && finalError === undefined && parsedFinal !== null
        ? { discount_kind: "FIXED", discount_bps: null, final_total_paise: parsedFinal }
        : null;
  const preview = useOverallDiscountPreview({
    proposalId: proposal.id,
    requestId,
    body,
  });
  const previewError = preview.error ? describeError(preview.error, "read") : null;
  const applyError = apply.error ? describeError(apply.error, "mutation") : null;

  function submit() {
    if (body === null || preview.data === undefined) return;
    apply.mutate(
      { proposalId: proposal.id, requestId, requirementId, body },
      { onSuccess: onClose },
    );
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !apply.isPending) onClose();
      }}
      title="Apply overall discount"
      description={`Confirm the final amount before estimate revision ${proposal.revision + 1} is sent to the customer.`}
      dismissable={!apply.isPending}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={apply.isPending}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={body === null || preview.data === undefined || preview.isFetching}
            loading={apply.isPending}
            loadingLabel="Applying discount"
          >
            Apply and send revised estimate
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        <div aria-label="Discount format" className="grid grid-cols-2 gap-2" role="group">
          <button
            type="button"
            aria-pressed={mode === "PERCENT"}
            className={cn(
              "min-h-11 rounded-control border px-3 text-sm font-bold transition-colors",
              mode === "PERCENT"
                ? "border-action-border bg-action-surface text-text-link"
                : "border-line bg-surface text-text-secondary hover:bg-surface-hover",
            )}
            onClick={() => setMode("PERCENT")}
          >
            Percentage
          </button>
          <button
            type="button"
            aria-pressed={mode === "FIXED"}
            className={cn(
              "min-h-11 rounded-control border px-3 text-sm font-bold transition-colors",
              mode === "FIXED"
                ? "border-action-border bg-action-surface text-text-link"
                : "border-line bg-surface text-text-secondary hover:bg-surface-hover",
            )}
            onClick={() => setMode("FIXED")}
          >
            Final amount
          </button>
        </div>

        {mode === "PERCENT" ? (
          <Field
            label="Overall discount"
            description="The same percentage is allocated across the estimate by the server."
            error={percentError}
            required
          >
            <div className="relative">
              <Input
                inputMode="decimal"
                value={percentage}
                onChange={(event) => setPercentage(event.target.value)}
                className="pr-10 tabular-nums"
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center font-bold text-text-secondary">
                %
              </span>
            </div>
          </Field>
        ) : (
          <Field
            label="Final customer total"
            description="Enter the complete amount the customer should pay after the discount."
            error={finalError}
            required
          >
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center font-bold text-text-secondary">
                ₹
              </span>
              <Input
                inputMode="decimal"
                value={finalTotal}
                onChange={(event) => setFinalTotal(event.target.value)}
                className="pl-8 tabular-nums"
              />
            </div>
          </Field>
        )}

        <div className="rounded-card border border-line bg-surface-sunken p-4" aria-live="polite">
          <MoneyRow label="Current estimate" value={formatMoney(proposal.total_paise)} />
          <MoneyRow
            label="Overall discount"
            value={preview.data ? `−${formatMoney(preview.data.discount_paise)}` : "—"}
            tone="success"
          />
          <div aria-hidden className="my-3 border-t border-dashed border-line" />
          <MoneyRow
            label="New customer total"
            value={preview.data ? formatMoney(preview.data.customer_total_paise) : "—"}
            emphasis
          />
          <MoneyRow
            label="Tax"
            value={preview.data ? formatMoney(preview.data.tax_paise) : "Recalculating…"}
          />
          <MoneyRow
            label="You receive"
            value={preview.data ? formatMoney(preview.data.partner_net_paise) : "—"}
            tone="success"
          />
          <p className="mt-3 text-xs leading-5 text-text-muted">
            {preview.data
              ? `${preview.data.stages.length + preview.data.material_lines.length} payment ${preview.data.stages.length + preview.data.material_lines.length === 1 ? "part" : "parts"} will be recalculated automatically.`
              : preview.isFetching
                ? "Recalculating tax, payout and payment parts…"
                : "Enter a valid discount to see the server-checked total."}
          </p>
        </div>

        {previewError ? (
          <ErrorState inline title={previewError.title} message={previewError.message} severity={previewError.severity} />
        ) : null}
        {applyError ? (
          <ErrorState inline title={applyError.title} message={applyError.message} severity={applyError.severity} />
        ) : null}

        <p className="text-xs leading-5 text-text-muted">
          Scope, warranty and line-item rates stay unchanged. The previous estimate remains in
          history, and only the new discounted revision can be chosen.
        </p>
      </div>
    </Dialog>
  );
}

function MoneyRow({
  label,
  value,
  emphasis = false,
  tone = "default",
}: {
  readonly label: string;
  readonly value: string;
  readonly emphasis?: boolean;
  readonly tone?: "default" | "success";
}) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3 py-1 text-sm", emphasis && "text-base")}>
      <span className={emphasis ? "font-extrabold text-text" : "text-text-secondary"}>{label}</span>
      <span
        className={cn(
          "shrink-0 font-bold tabular-nums text-text",
          emphasis && "text-lg font-extrabold",
          tone === "success" && "text-success-text",
        )}
      >
        {value}
      </span>
    </div>
  );
}
