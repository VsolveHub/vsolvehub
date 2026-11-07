// Ported from frontend/apps/customer/features/quotes/view/quote-comparison.tsx
import { Badge, Text, cn } from "@vsolve/mobile-ui";
import { Link } from "expo-router";
import { useState, type ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";

import {
  cheapestIndex,
  firstStageOf,
  materialCountLabel,
  scopeDifferenceRows,
  sharedScopeLines,
  superlativeFor,
  type QuoteCardView,
} from "../adapters";
import { timelineLabel, validityLabel } from "./quote-card";
import { VendorTrustLine } from "./vendor-trust-line";

export interface QuoteComparisonProps {
  cards: readonly QuoteCardView[];
  isComparableOnOneBasis: boolean;
  detailHrefFor?: (proposalId: string) => string;
  confirmHrefFor?: (proposalId: string) => string;
  pickedId?: string | null;
  chosenId?: string | null;
  onPick?: (proposalId: string) => void;
  canChoose?: boolean;
}

export function QuoteComparison(props: QuoteComparisonProps) {
  const {
    cards,
    pickedId = null,
    chosenId = null,
    onPick,
    isComparableOnOneBasis,
    detailHrefFor,
    confirmHrefFor,
    canChoose = false,
  } = props;
  const [showAll, setShowAll] = useState(false);

  if (cards.length === 0) return null;

  const cheapest = isComparableOnOneBasis ? cheapestIndex(cards) : null;
  const rows = comparisonRows(cards);
  const differences = scopeDifferenceRows(cards);
  const shared = sharedScopeLines(cards);

  return (
    <View accessibilityLabel="Estimates compared side by side">
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View className="min-w-[680px] flex-row overflow-hidden rounded-[14px] border border-line bg-surface shadow-sm">
          <View className="w-[132px] bg-surface-sunken">
            <View className="h-44 border-b border-line" />
            {rows.map((row) => (
              <Text
                key={row.label}
                className="border-b border-line px-4 py-3 text-[0.6875rem] font-extrabold uppercase tracking-[0.12em] text-text-muted"
              >
                {row.label}
              </Text>
            ))}
            {differences.length > 0 || shared.length > 0 ? (
              <View className="border-b border-line bg-surface-sunken px-4 py-2.5">
                <Text className="text-[0.6875rem] font-extrabold uppercase tracking-[0.12em] text-text-muted">
                  {differences.length > 0 ? "Where they differ" : "Scope"}
                </Text>
              </View>
            ) : null}
            {differences.map((row) => (
              <Text key={row.line} className="border-b border-line px-4 py-3 text-sm font-semibold text-text">
                {row.line}
              </Text>
            ))}
            {showAll
              ? shared.map((line) => (
                  <Text key={`shared-${line}`} className="border-b border-line px-4 py-3 text-sm font-semibold text-text">
                    {line}
                  </Text>
                ))
              : null}
            {detailHrefFor !== undefined ? <View className="h-12 border-b border-line" /> : null}
          </View>

          {cards.map((card, index) => {
            const picked = card.proposalId === pickedId;
            const chosen = card.proposalId === chosenId;
            const highlighted = picked || chosen;
            const pickable = onPick !== undefined && card.isSelectable && !card.isExpired;
            const superlative = superlativeFor(card, cards);
            return (
              <View key={card.proposalId} className={cn("min-w-[210px] flex-1", highlighted ? "bg-selected-surface" : "bg-surface")}>
                <View className="h-44 gap-1 border-b border-line px-4 py-4">
                  <View className="flex-row items-start justify-between gap-2">
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected: picked, disabled: !pickable }}
                      disabled={!pickable}
                      onPress={() => onPick?.(card.proposalId)}
                      className="min-w-0 flex-1"
                    >
                      <Text className="text-base font-extrabold leading-tight text-text">
                        {card.vendorName ?? `Estimate ${index + 1}`}
                      </Text>
                    </Pressable>
                    {chosen ? <Badge tone="success">Chosen</Badge> : card.isVerified ? <Badge tone="success">Verified</Badge> : null}
                  </View>
                  <VendorTrustLine trust={card.trust} />
                  <Text className="mt-2 text-[22px] font-extrabold leading-none text-text">{card.payableLabel}</Text>
                  {superlative !== null ? (
                    <Text className="mt-1 self-start rounded-full bg-success-surface px-2 py-0.5 text-[11px] font-extrabold text-success-text">
                      {superlative.label}
                    </Text>
                  ) : card.isOutOfBudget ? (
                    <Text className="mt-1 self-start rounded-full bg-warning-surface px-2 py-0.5 text-[11px] font-extrabold text-warning-text">
                      Over your budget
                    </Text>
                  ) : null}
                  {canChoose && pickable && confirmHrefFor !== undefined ? (
                    <Link href={confirmHrefFor(card.proposalId) as never} asChild>
                      <Pressable accessibilityRole="button" className="mt-2.5 min-h-[38px] items-center justify-center rounded-[8px] bg-action px-3">
                        <Text className="text-sm font-extrabold text-action-text">
                          Choose › {card.vendorName ?? `estimate ${index + 1}`}
                        </Text>
                      </Pressable>
                    </Link>
                  ) : null}
                </View>
                {rows.map((row) => (
                  <View key={row.label} className="border-b border-line px-4 py-3">
                    <Text
                      className={cn(
                        "text-[0.9375rem] font-semibold leading-6 text-text",
                        row.label === "Total" && cheapest === index ? "text-success-text" : null,
                      )}
                    >
                      {row.values[index] ?? "Not stated"}
                    </Text>
                  </View>
                ))}
                {differences.length > 0 || shared.length > 0 ? (
                  <View className="border-b border-line bg-surface-sunken px-4 py-2.5">
                    {index === cards.length - 1 && shared.length > 0 ? (
                      <Pressable accessibilityRole="button" onPress={() => setShowAll((current) => !current)}>
                        <Text className="text-xs font-bold text-text-link">
                          {showAll ? "Show differences only" : `Show all · ${shared.length} more all of them include`}
                        </Text>
                      </Pressable>
                    ) : (
                      <Text className="text-xs text-transparent"> </Text>
                    )}
                  </View>
                ) : null}
                {differences.map((row) => (
                  <View key={row.line} className="border-b border-line px-4 py-3">
                    <Text className={cn("font-bold", row.included[index] ? "text-success-text" : "text-warm-500")}>
                      {row.included[index] ? "✓ Included" : "✗ Not included"}
                    </Text>
                  </View>
                ))}
                {showAll
                  ? shared.map((line) => (
                      <View key={`shared-${line}`} className="border-b border-line px-4 py-3">
                        <Text className="font-bold text-success-text">✓ Included</Text>
                      </View>
                    ))
                  : null}
                {detailHrefFor !== undefined ? (
                  <View className="border-b border-line px-4 py-3">
                    <Link href={detailHrefFor(card.proposalId) as never} asChild>
                      <Pressable accessibilityRole="link">
                        <Text className="text-sm font-bold text-text-link">Read in full ›</Text>
                      </Pressable>
                    </Link>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      </ScrollView>
      {!isComparableOnOneBasis ? (
        <Text className="mt-2 text-sm text-text-secondary">
          These estimates state tax differently, so the totals are not ranked against each other.
        </Text>
      ) : null}
      <Text className="mt-2 text-xs leading-5 text-text-muted">
        A shorter list is not a worse offer — it may be a more careful one. What is not written down is what you would pay for separately.
      </Text>
    </View>
  );
}

interface MatrixRow {
  label: string;
  values: readonly (string | null)[];
}

function comparisonRows(cards: readonly QuoteCardView[]): readonly MatrixRow[] {
  const rows: MatrixRow[] = [
    { label: "Total", values: cards.map((card) => card.payableLabel) },
    { label: "To start", values: cards.map((card) => firstStageOf(card)?.amountLabel ?? null) },
    { label: "Takes", values: cards.map((card) => timelineLabel(card)) },
    {
      label: "Holds for",
      values: cards.map((card) => validityLabel(card)?.text ?? null),
    },
    {
      label: "Warranty",
      values: cards.map((card) => card.warrantyTerms ?? "Not stated"),
    },
    {
      label: "Priced",
      values: cards.map((card) =>
        card.itemLines.length > 0
          ? `Item-wise (${card.itemLines.length})`
          : card.labourLines.length > 0
            ? `Labour-wise (${card.labourLines.length})`
            : card.rateLabel !== null
              ? `${card.rateLabel} per worker per day`
              : null,
      ),
    },
    {
      label: "Materials",
      values: cards.map((card) =>
        card.materialFulfilmentMode === "PARTNER_TURNKEY"
          ? `Included · ${materialCountLabel(card.includedSupplyList.length) ?? "none"}`
          : `You buy · ${materialCountLabel(card.materialList.length) ?? "none"}`,
      ),
    },
    {
      label: "Tax",
      values: cards.map((card) => (card.taxBasis === "INCLUSIVE" ? `Included (${card.taxLabel})` : `On top (${card.taxLabel})`)),
    },
  ];
  return rows.filter((row) => row.values.some((value) => value !== null));
}
