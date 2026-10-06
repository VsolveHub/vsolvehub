// Ported from frontend/apps/partner/features/proposal/view/overall-discount-dialog.tsx
import { describeError } from "@vsolve/query/native";
import { Button, Dialog, ErrorState, Field, Input, Text, cn, formatMoney } from "@vsolve/mobile-ui";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { paiseToRupeeInput, rupeesToPaise } from "../model/proposal-draft";
import {
  useApplyOverallDiscount,
  useOverallDiscountPreview,
  type Proposal,
  type ProposalDiscountRequest,
} from "../queries";

export function OverallDiscountDialog(props: {
  open: boolean;
  onClose: () => void;
  proposal: Proposal;
  requestId: string;
  requestedBps: number;
  requirementId: string;
  initialMode?: "PERCENT" | "FIXED";
}) {
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
}: {
  open: boolean;
  onClose: () => void;
  proposal: Proposal;
  requestId: string;
  requestedBps: number;
  requirementId: string;
  initialMode?: "PERCENT" | "FIXED";
}) {
  const requestedTarget = proposal.total_paise - Math.round((proposal.total_paise * requestedBps) / 10_000);
  const [mode, setMode] = useState<"PERCENT" | "FIXED">(initialMode);
  const [percentage, setPercentage] = useState(String(requestedBps / 100));
  const [finalTotal, setFinalTotal] = useState(paiseToRupeeInput(requestedTarget));
  const apply = useApplyOverallDiscount();
  const parsedPercent = Number(percentage);
  const bps = Number.isFinite(parsedPercent) ? Math.round(parsedPercent * 100) : 0;
  const parsedFinal = rupeesToPaise(finalTotal);
  const fixedSaving = parsedFinal === null ? 0 : proposal.total_paise - parsedFinal;
  const maximumSaving = Math.round((proposal.total_paise * 1_500) / 10_000);
  const percentError = mode === "PERCENT" && (bps < 100 || bps > 1_500) ? "Enter a discount from 1% to 15%." : undefined;
  const finalError =
    mode === "FIXED" && (parsedFinal === null || parsedFinal <= 0 || fixedSaving <= 0 || fixedSaving > maximumSaving)
      ? `Enter a final total between ${formatMoney(proposal.total_paise - maximumSaving)} and ${formatMoney(proposal.total_paise - 1)}.`
      : undefined;
  const body: ProposalDiscountRequest | null =
    mode === "PERCENT" && percentError === undefined
      ? { discount_kind: "PERCENT", discount_bps: bps, final_total_paise: null }
      : mode === "FIXED" && finalError === undefined && parsedFinal !== null
        ? { discount_kind: "FIXED", discount_bps: null, final_total_paise: parsedFinal }
        : null;
  const preview = useOverallDiscountPreview({ proposalId: proposal.id, requestId, body });
  const previewError = preview.error ? describeError(preview.error, "read") : null;
  const applyError = apply.error ? describeError(apply.error, "mutation") : null;

  function submit() {
    if (body === null || preview.data === undefined) return;
    apply.mutate({ proposalId: proposal.id, requestId, requirementId, body }, { onSuccess: onClose });
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => { if (!next && !apply.isPending) onClose(); }}
      title="Apply overall discount"
      description={`Confirm the final amount before estimate revision ${proposal.revision + 1} is sent to the customer.`}
      dismissable={!apply.isPending}
      footer={
        <>
          <Button variant="ghost" onPress={onClose} disabled={apply.isPending}>Cancel</Button>
          <Button onPress={submit} disabled={body === null || preview.data === undefined || preview.isFetching} loading={apply.isPending} loadingLabel="Applying discount">Apply and send revised estimate</Button>
        </>
      }
    >
      <View className="flex-col gap-4 pb-2">
        <View className="flex-row gap-2">
          <Pressable accessibilityRole="button" accessibilityState={{ selected: mode === "PERCENT" }} onPress={() => setMode("PERCENT")} className={cn("min-h-11 flex-1 items-center justify-center rounded-control border px-3", mode === "PERCENT" ? "border-action-border bg-action-surface" : "border-line bg-surface")}>
            <Text className={mode === "PERCENT" ? "text-sm font-bold text-text-link" : "text-sm font-bold text-text-secondary"}>Percentage</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityState={{ selected: mode === "FIXED" }} onPress={() => setMode("FIXED")} className={cn("min-h-11 flex-1 items-center justify-center rounded-control border px-3", mode === "FIXED" ? "border-action-border bg-action-surface" : "border-line bg-surface")}>
            <Text className={mode === "FIXED" ? "text-sm font-bold text-text-link" : "text-sm font-bold text-text-secondary"}>Final amount</Text>
          </Pressable>
        </View>
        {mode === "PERCENT" ? (
          <Field label="Overall discount" description="The same percentage is allocated across the estimate by the server." error={percentError} required>
            <Input keyboardType="decimal-pad" value={percentage} onChangeText={setPercentage} />
          </Field>
        ) : (
          <Field label="Final customer total" description="Enter the complete amount the customer should pay after the discount." error={finalError} required>
            <Input keyboardType="decimal-pad" value={finalTotal} onChangeText={setFinalTotal} />
          </Field>
        )}
        <View className="rounded-card border border-line bg-surface-sunken p-4">
          <MoneyRow label="Current estimate" value={formatMoney(proposal.total_paise)} />
          <MoneyRow label="Overall discount" value={preview.data ? `−${formatMoney(preview.data.discount_paise)}` : "—"} tone="success" />
          <View className="my-3 border-t border-dashed border-line" />
          <MoneyRow label="New customer total" value={preview.data ? formatMoney(preview.data.customer_total_paise) : "—"} emphasis />
          <MoneyRow label="Tax" value={preview.data ? formatMoney(preview.data.tax_paise) : "Recalculating…"} />
          <MoneyRow label="You receive" value={preview.data ? formatMoney(preview.data.partner_net_paise) : "—"} tone="success" />
          <Text className="mt-3 text-xs leading-5 text-text-muted">
            {preview.data
              ? `${preview.data.stages.length + preview.data.material_lines.length} payment ${preview.data.stages.length + preview.data.material_lines.length === 1 ? "part" : "parts"} will be recalculated automatically.`
              : preview.isFetching
                ? "Recalculating tax, payout and payment parts…"
                : "Enter a valid discount to see the server-checked total."}
          </Text>
        </View>
        {previewError ? <ErrorState inline title={previewError.title} message={previewError.message} severity={previewError.severity} /> : null}
        {applyError ? <ErrorState inline title={applyError.title} message={applyError.message} severity={applyError.severity} /> : null}
        <Text className="text-xs leading-5 text-text-muted">Scope, warranty and line-item rates stay unchanged. The previous estimate remains in history, and only the new discounted revision can be chosen.</Text>
      </View>
    </Dialog>
  );
}

function MoneyRow({ label, value, emphasis = false, tone = "default" }: { readonly label: string; readonly value: string; readonly emphasis?: boolean; readonly tone?: "default" | "success" }) {
  return (
    <View className={cn("flex-row items-baseline justify-between gap-3 py-1", emphasis && "py-1")}>
      <Text className={emphasis ? "text-base font-extrabold text-text" : "text-sm text-text-secondary"}>{label}</Text>
      <Text className={cn("shrink-0 text-sm font-bold text-text", emphasis && "text-lg font-extrabold", tone === "success" && "text-success-text")}>{value}</Text>
    </View>
  );
}
