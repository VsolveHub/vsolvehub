// Ported from frontend/apps/partner/features/proposal/view/estimate-preview-sheet.tsx
import type { ReactNode } from "react";
import { View } from "react-native";
import { PackageCheck } from "lucide-react-native";
import { Button, Sheet, Text, cn, formatMoney } from "@vsolve/mobile-ui";

import {
  itemLineAmount,
  labourLineAmount,
  materialLineAmount,
  type CommercialEstimateDraft,
  type MaterialListLineDraft,
} from "../model/commercial-estimate-draft";
import type { Proposal, ProposalFinancialSummary } from "../queries";

export function EstimatePreviewSheet({
  open,
  onClose,
  draft,
  preview,
  vendorName,
  materialList = [],
  partnerTurnkey = false,
  title = "As the customer sees it",
  description = "This is the page they compare against the other estimates.",
  closeLabel = "Back to editing",
}: {
  open: boolean;
  onClose: () => void;
  draft: CommercialEstimateDraft;
  preview:
    | (Pick<ProposalFinancialSummary, "customer_total_paise" | "stages"> &
        Partial<Pick<Proposal, "discount_bps" | "discount_base_paise" | "discount_paise">>)
    | undefined;
  vendorName: string;
  materialList?: readonly MaterialListLineDraft[];
  partnerTurnkey?: boolean;
  title?: string;
  description?: string;
  closeLabel?: string;
}) {
  const lines =
    draft.mode === "ITEM_WISE"
      ? draft.itemLines.map((line) => ({ title: line.title || "Untitled", note: `${line.quantity} × ${formatMoney(line.ratePaise ?? 0)}`, amount: itemLineAmount(line) }))
      : draft.labourLines.map((line) => ({ title: line.team ? `${line.role} — ${line.team}` : line.role || "Untitled", note: `${line.memberCount} people × ${line.dayCount} days × ${formatMoney(line.ratePaisePerDay ?? 0)}/day`, amount: labourLineAmount(line) }));
  const first = draft.installments[0] ?? null;
  const firstDue = preview?.stages[0]?.total_due_paise ?? first?.amountPaise ?? null;
  const hasDiscount = (preview?.discount_paise ?? 0) > 0;

  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) onClose(); }} title={title} description={description} footer={<Button onPress={onClose}>{closeLabel}</Button>}>
      <View className="flex-col gap-3">
        <View className="rounded-[14px] bg-navy-900 p-4">
          <Text className="text-[11px] font-bold uppercase tracking-[0.1em] text-signal-300">{vendorName}</Text>
          <Text className="mt-1 text-[28px] font-extrabold leading-none text-surface">{preview ? formatMoney(preview.customer_total_paise) : "—"}</Text>
          {hasDiscount && preview ? (
            <View className="mt-2 flex-row flex-wrap items-center gap-x-3 gap-y-1">
              <Text className="text-sm text-surface/60 line-through">{formatMoney(preview.discount_base_paise ?? 0)}</Text>
              <Text className="text-sm font-bold text-success-200">
                {preview.discount_bps !== null && preview.discount_bps !== undefined ? `${preview.discount_bps / 100}% off · ` : ""}
                Save {formatMoney(preview.discount_paise ?? 0)}
              </Text>
            </View>
          ) : null}
          <View className="mt-3 flex-row gap-3 border-t border-surface/15 pt-3">
            <View className="flex-1">
              <Text className="text-[11px] uppercase text-surface/60">Pay to start</Text>
              <Text className="font-bold text-surface">{firstDue ? formatMoney(firstDue) : "Not stated"}</Text>
            </View>
            <View className="flex-1">
              <Text className="text-[11px] uppercase text-surface/60">Timeline</Text>
              <Text className="font-bold text-surface">{draft.installments.at(-1)?.endsOn ? `Ends ${draft.installments.at(-1)!.endsOn}` : "Not dated"}</Text>
            </View>
          </View>
        </View>
        {partnerTurnkey ? (
          <View className="flex-row gap-3 rounded-card border border-success-line bg-success-surface p-3">
            <PackageCheck size={20} color="#166534" />
            <View className="flex-1">
              <Text className="text-sm font-bold text-success-text">Materials, setup and removal included</Text>
              <Text className="mt-0.5 text-xs leading-5 text-success-text">The decorator manages the full supply. You do not need to shop for décor materials.</Text>
            </View>
          </View>
        ) : null}
        <Block title="What you get">
          {draft.scopeSummary.trim() === "" ? (
            <Text className="text-sm text-warning-text">You have not said what you will do. This is the first thing they read.</Text>
          ) : (
            <Text className="text-sm leading-6 text-text">“{draft.scopeSummary.trim()}”</Text>
          )}
          <View className="mt-2 flex-row gap-2">
            <View className="flex-1">
              {draft.inclusions.filter(Boolean).map((line) => (
                <Text key={line} className="text-sm text-text">✓ {line}</Text>
              ))}
              {draft.inclusions.filter(Boolean).length === 0 ? <Text className="text-sm text-text-muted">Nothing marked as included</Text> : null}
            </View>
            <View className="flex-1">
              {draft.exclusions.filter(Boolean).map((line) => (
                <Text key={line} className="text-sm text-text">✗ {line}</Text>
              ))}
            </View>
          </View>
        </Block>
        <Block title={`How the price is built${draft.mode === "ITEM_WISE" ? " — item-wise" : draft.mode === "LABOUR_WISE" ? " — labour-wise" : ""}`}>
          {lines.map((line, index) => (
            <View key={index} className="flex-row justify-between gap-3 border-b border-line py-1.5">
              <View className="flex-1">
                <Text className="text-sm font-medium text-text">{line.title}</Text>
                <Text className="text-xs text-text-muted">{line.note}</Text>
              </View>
              <Text className="text-sm font-semibold text-text">{line.amount === null ? "—" : formatMoney(line.amount)}</Text>
            </View>
          ))}
          {draft.otherCharges.map((charge) => (
            <View key={charge.id} className="flex-row justify-between gap-3 border-b border-line py-1.5">
              <Text className="text-sm text-text">{charge.label || "Named charge"}</Text>
              <Text className="text-sm font-semibold text-text">{charge.amountPaise === null ? "—" : formatMoney(charge.amountPaise)}</Text>
            </View>
          ))}
          {draft.materialLines.map((material) => (
            <View key={material.id} className="flex-row justify-between gap-3 border-b border-line py-1.5">
              <View className="flex-1">
                <Text className="text-sm text-text">{material.title || "Material"}</Text>
                <Text className="text-xs text-text-muted">Material, paid as an advance</Text>
              </View>
              <Text className="text-sm font-semibold text-text">{materialLineAmount(material) === null ? "—" : formatMoney(materialLineAmount(material)!)}</Text>
            </View>
          ))}
        </Block>
        {materialList.length > 0 ? (
          <Block title={partnerTurnkey ? "Materials & finish included" : "What you need to buy"}>
            <Text className="text-xs text-text-muted">
              {partnerTurnkey
                ? "Supplied, installed and managed by the decorator · already inside the estimate"
                : `${draft.materialBrandTier === "PREMIUM" ? "Premium brands" : draft.materialBrandTier === "STANDARD" ? "Standard brands" : "Any brand"} · you buy these, the estimate covers the work`}
            </Text>
            {materialList.map((row) => (
              <View key={`${row.title}|${row.unit}`} className="flex-row justify-between gap-3 border-b border-line py-1.5">
                <View className="flex-1">
                  <Text className="text-sm font-medium text-text">{row.title}</Text>
                  {row.spec ? <Text className="text-xs text-text-muted">{row.spec}</Text> : null}
                </View>
                <Text className="text-sm font-semibold text-text">{row.quantity} {row.unit}</Text>
              </View>
            ))}
          </Block>
        ) : null}
        <Block title="How they pay">
          {draft.installments.map((row, index) => {
            const due = preview?.stages[index]?.total_due_paise ?? row.amountPaise;
            return (
              <View key={row.id} className="flex-row justify-between gap-3 py-1">
                <View className="flex-1">
                  <Text className="text-sm text-text">{index + 1}. {row.title || `Stage ${index + 1}`}</Text>
                  {row.deliverable ? <Text className="text-xs text-text-muted">{row.deliverable}</Text> : null}
                </View>
                <Text className="text-sm font-semibold text-text">{due === null ? "—" : formatMoney(due)}</Text>
              </View>
            );
          })}
        </Block>
        <Block title="Terms">
          <View className="flex-row gap-2">
            <View className="flex-1">
              <Text className="text-xs text-text-muted">Warranty</Text>
              <Text className={cn("text-sm", draft.warrantyTerms.trim() === "" && "text-warning-text")}>{draft.warrantyTerms.trim() || "Not stated"}</Text>
            </View>
            <View className="flex-1">
              <Text className="text-xs text-text-muted">Valid until</Text>
              <Text className={cn("text-sm", draft.validUntil === null && "text-warning-text")}>{draft.validUntil ? draft.validUntil.slice(0, 10) : "No validity given"}</Text>
            </View>
          </View>
        </Block>
      </View>
    </Sheet>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="rounded-card border border-line bg-surface p-3">
      <Text className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-text-muted">{title}</Text>
      <View className="mt-2">{children}</View>
    </View>
  );
}
