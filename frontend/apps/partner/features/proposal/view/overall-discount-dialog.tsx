"use client";

import { describeError } from "@vsolve/query";
import { Button, Dialog, ErrorState, Field, Input, cn, formatMoney, useT } from "@vsolve/ui";
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
  const t = useT();
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
      ? t("proposal.screens.discount.percentError")
      : undefined;
  const finalError =
    mode === "FIXED" &&
    (parsedFinal === null || parsedFinal <= 0 || fixedSaving <= 0 || fixedSaving > maximumSaving)
      ? t("proposal.screens.discount.finalError", {
          min: formatMoney(proposal.total_paise - maximumSaving),
          max: formatMoney(proposal.total_paise - 1),
        })
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
      title={t("proposal.screens.discount.title")}
      description={t("proposal.screens.discount.description", { revision: proposal.revision + 1 })}
      dismissable={!apply.isPending}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={apply.isPending}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={submit}
            disabled={body === null || preview.data === undefined || preview.isFetching}
            loading={apply.isPending}
            loadingLabel={t("proposal.screens.discount.applying")}
          >
            {t("proposal.screens.discount.apply")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        <div aria-label={t("proposal.screens.discount.format")} className="grid grid-cols-2 gap-2" role="group">
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
            {t("proposal.screens.discount.percentage")}
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
            {t("proposal.screens.discount.finalAmount")}
          </button>
        </div>

        {mode === "PERCENT" ? (
          <Field
            label={t("proposal.status.overallDiscount")}
            description={t("proposal.screens.discount.percentDescription")}
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
            label={t("proposal.status.finalCustomerTotal")}
            description={t("proposal.screens.discount.finalDescription")}
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
          <MoneyRow label={t("proposal.status.currentEstimate")} value={formatMoney(proposal.total_paise)} />
          <MoneyRow
            label={t("proposal.status.overallDiscount")}
            value={preview.data ? `−${formatMoney(preview.data.discount_paise)}` : "—"}
            tone="success"
          />
          <div aria-hidden className="my-3 border-t border-dashed border-line" />
          <MoneyRow
            label={t("proposal.screens.discount.newTotal")}
            value={preview.data ? formatMoney(preview.data.customer_total_paise) : "—"}
            emphasis
          />
          <MoneyRow
            label={t("proposal.status.fact.tax")}
            value={preview.data ? formatMoney(preview.data.tax_paise) : t("proposal.screens.discount.recalculating")}
          />
          <MoneyRow
            label={t("proposal.screens.discount.youReceive")}
            value={preview.data ? formatMoney(preview.data.partner_net_paise) : "—"}
            tone="success"
          />
          <p className="mt-3 text-xs leading-5 text-text-muted">
            {preview.data
              ? t("proposal.screens.discount.partsRecalculated", {
                  count: preview.data.stages.length + preview.data.material_lines.length,
                })
              : preview.isFetching
                ? t("proposal.screens.discount.recalculatingAll")
                : t("proposal.screens.discount.enterValid")}
          </p>
        </div>

        {previewError ? (
          <ErrorState inline title={previewError.title} message={previewError.message} severity={previewError.severity} />
        ) : null}
        {applyError ? (
          <ErrorState inline title={applyError.title} message={applyError.message} severity={applyError.severity} />
        ) : null}

        <p className="text-xs leading-5 text-text-muted">
          {t("proposal.screens.discount.footnote")}
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
