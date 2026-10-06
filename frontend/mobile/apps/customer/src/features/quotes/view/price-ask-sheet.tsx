// Ported from frontend/apps/customer/features/quotes/view/price-ask-sheet.tsx
import type { RevisionRequestReasonCode } from "@vsolve/query/native";
import { Button, Dialog, Field, Input, Text, Textarea, cn } from "@vsolve/mobile-ui";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { discountPreview, type QuoteCardView } from "../adapters";

const QUICK_BPS = [300, 500] as const;
const MAX_PERCENT = 15;
const STEER_TO_SCOPE_PERCENT = 10;

const SCOPE_REASONS: readonly { code: RevisionRequestReasonCode; label: string; hint: string }[] = [
  { code: "LEAVE_OUT", label: "Leave something out", hint: "Tick the lines you do not need." },
  { code: "CHANGE_MATERIALS", label: "Change materials or finish", hint: "Say what you would prefer." },
  { code: "PHASE_WORK", label: "Split the work into phases", hint: "Say what should come first." },
  { code: "OTHER", label: "Something else", hint: "A sentence is enough." },
];

type Choice =
  | { kind: "ACCEPT" }
  | { kind: "PRICE"; bps: number }
  | { kind: "CUSTOM" }
  | { kind: "SCOPE" };

export interface PriceAskSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  card: QuoteCardView | null;
  isPending: boolean;
  onAccept: (proposalId: string) => void;
  onSend: (input: {
    reasonCode: RevisionRequestReasonCode;
    excludedItems: readonly string[];
    note: string;
    requestedDiscountBps: number | null;
  }) => void;
}

export function PriceAskSheet({ open, onOpenChange, card, isPending, onAccept, onSend }: PriceAskSheetProps) {
  const [choice, setChoice] = useState<Choice>({ kind: "ACCEPT" });
  const [customPercent, setCustomPercent] = useState("7");
  const [scopeReason, setScopeReason] = useState<RevisionRequestReasonCode>("LEAVE_OUT");
  const [excluded, setExcluded] = useState<readonly string[]>([]);
  const [note, setNote] = useState("");

  if (card === null) return null;

  const who = card.vendorName ?? "this professional";
  const lines = [...card.itemLines.map((line) => line.title), ...card.labourLines.map((line) => line.role)];
  const parsedCustom = Number.parseInt(customPercent, 10);
  const customValid = Number.isFinite(parsedCustom) && parsedCustom >= 1 && parsedCustom <= MAX_PERCENT;
  const customBps = customValid ? parsedCustom * 100 : null;
  const askedBps = choice.kind === "PRICE" ? choice.bps : choice.kind === "CUSTOM" ? customBps : null;
  const canSend =
    choice.kind === "ACCEPT"
      ? true
      : choice.kind === "PRICE"
        ? true
        : choice.kind === "CUSTOM"
          ? customValid
          : scopeReason === "LEAVE_OUT"
            ? excluded.length > 0 || note.trim() !== ""
            : scopeReason === "OTHER"
              ? note.trim() !== ""
              : true;

  function send() {
    if (card === null) return;
    if (choice.kind === "ACCEPT") {
      onAccept(card.proposalId);
      return;
    }
    if (choice.kind === "SCOPE") {
      onSend({
        reasonCode: scopeReason,
        excludedItems: scopeReason === "LEAVE_OUT" ? excluded : [],
        note: note.trim(),
        requestedDiscountBps: null,
      });
      return;
    }
    if (askedBps === null) return;
    onSend({
      reasonCode: "PRICE",
      excludedItems: [],
      note: note.trim(),
      requestedDiscountBps: askedBps,
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="About this price"
      description={`${who} · ${card.payableLabel}. Only they can change a price — this sends what you are hoping for, and they answer with a fresh estimate or say no.`}
      footer={
        <View className="flex-row gap-2">
          <Button variant="ghost" onPress={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!canSend} loading={isPending} loadingLabel="Sending" onPress={send}>
            {choice.kind === "ACCEPT" ? "Take me to Choose" : "Send the ask"}
          </Button>
        </View>
      }
    >
      <View className="gap-2.5">
        <ChoiceRow
          checked={choice.kind === "ACCEPT"}
          onSelect={() => setChoice({ kind: "ACCEPT" })}
          label="It works for me"
          detail="Take me to Choose."
          tone="positive"
        />
        {QUICK_BPS.map((bps) => {
          const preview = discountPreview(card.payablePaise, bps);
          return (
            <ChoiceRow
              key={bps}
              checked={choice.kind === "PRICE" && choice.bps === bps}
              onSelect={() => setChoice({ kind: "PRICE", bps })}
              label={`Ask for ${bps / 100}% off`}
              detail={`${card.payableLabel} → ${preview.newTotalLabel} −${preview.savingLabel}`}
            />
          );
        })}
        <ChoiceRow
          checked={choice.kind === "CUSTOM"}
          onSelect={() => setChoice({ kind: "CUSTOM" })}
          label="Name your own figure"
          detail={choice.kind === "CUSTOM" ? "Up to 15%." : "Up to 15%."}
        />
        {choice.kind === "CUSTOM" ? (
          <View className="flex-row flex-wrap items-center gap-2">
            <Input
              keyboardType="number-pad"
              value={customPercent}
              accessibilityLabel="Discount percent"
              onChangeText={setCustomPercent}
              className="w-20"
            />
            <Text className="text-sm font-semibold text-text-secondary">%</Text>
            {customBps !== null ? (
              <Text className="text-sm text-text-secondary">
                → {discountPreview(card.payablePaise, customBps).newTotalLabel} −
                {discountPreview(card.payablePaise, customBps).savingLabel}
              </Text>
            ) : (
              <Text className="text-sm text-warning-text">Between 1 and {MAX_PERCENT}.</Text>
            )}
          </View>
        ) : null}
        {choice.kind === "CUSTOM" && customValid && parsedCustom > STEER_TO_SCOPE_PERCENT ? (
          <Text className="rounded-[10px] border border-warning-line bg-warning-surface px-3 py-2 text-[13px] leading-5 text-text">
            Above {STEER_TO_SCOPE_PERCENT}% is usually a different job, not a discount. You are more likely to get a yes by asking them to leave something out — that is the option below.
          </Text>
        ) : null}
        <ChoiceRow
          checked={choice.kind === "SCOPE"}
          onSelect={() => setChoice({ kind: "SCOPE" })}
          label="It is not about the price"
          detail="Leave something out · cheaper finish · split into phases · something else"
        />
        {choice.kind === "SCOPE" ? (
          <View className="ml-1 gap-2 border-l-2 border-line pl-3">
            {SCOPE_REASONS.map((option) => (
              <Pressable
                key={option.code}
                accessibilityRole="radio"
                accessibilityState={{ selected: scopeReason === option.code }}
                onPress={() => setScopeReason(option.code)}
                className="flex-row items-start gap-2.5"
              >
                <Text className="mt-0.5 text-sm text-text">{scopeReason === option.code ? "●" : "○"}</Text>
                <View className="min-w-0 flex-1">
                  <Text className="text-sm font-semibold text-text">{option.label}</Text>
                  <Text className="text-xs text-text-secondary">{option.hint}</Text>
                </View>
              </Pressable>
            ))}
            {scopeReason === "LEAVE_OUT" && lines.length > 0 ? (
              <View className="rounded-card border border-line p-3">
                <Text className="px-1 text-xs font-bold uppercase tracking-[0.06em] text-text-muted">Leave out</Text>
                <View className="mt-1 gap-1.5">
                  {lines.map((line) => {
                    const checked = excluded.includes(line);
                    return (
                      <Pressable
                        key={line}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked }}
                        onPress={() =>
                          setExcluded((current) =>
                            checked ? current.filter((entry) => entry !== line) : [...current, line],
                          )
                        }
                        className="flex-row items-center gap-2.5"
                      >
                        <Text className="text-sm text-text">{checked ? "☑" : "☐"}</Text>
                        <Text className="flex-1 text-sm text-text">{line}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}
          </View>
        ) : null}
        {choice.kind !== "ACCEPT" ? (
          <Field
            label="Add a line"
            description="Optional. It goes to the professional — a reason lands better than a number alone."
          >
            <Textarea value={note} onChangeText={setNote} rows={2} maxLength={2000} />
          </Field>
        ) : null}
        <Text className="rounded-[10px] bg-surface-sunken px-3 py-2 text-xs leading-5 text-text-secondary">
          This estimate stays live and you can still choose it at {card.payableLabel} while they think. Nothing is charged. You can ask about the price once.
        </Text>
      </View>
    </Dialog>
  );
}

function ChoiceRow({
  checked,
  onSelect,
  label,
  detail,
  tone = "neutral",
}: {
  checked: boolean;
  onSelect: () => void;
  label: string;
  detail: string;
  tone?: "neutral" | "positive";
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: checked }}
      onPress={onSelect}
      className={cn(
        "flex-row items-start gap-3 rounded-card border p-3",
        checked
          ? tone === "positive"
            ? "border-success-line bg-success-surface"
            : "border-selected bg-selected-surface"
          : "border-line bg-surface",
      )}
    >
      <Text className="mt-0.5 text-sm text-text">{checked ? "●" : "○"}</Text>
      <View className="min-w-0 flex-1">
        <Text className="text-sm font-bold text-text">{label}</Text>
        <Text className="text-[13px] leading-5 text-text-secondary">{detail}</Text>
      </View>
    </Pressable>
  );
}
