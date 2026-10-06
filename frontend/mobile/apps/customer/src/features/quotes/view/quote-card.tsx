// Ported from frontend/apps/customer/features/quotes/view/quote-card.tsx
import { Badge, Button, Disclosure, Text, cn } from "@vsolve/mobile-ui";
import { Link } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";

import {
  canAskAboutPrice,
  firstStageOf,
  materialCountLabel,
  superlativeFor,
  type QuoteCardView,
} from "../adapters";
import { MaterialListRows } from "./material-list-rows";
import { VendorMark, VendorTrustLine } from "./vendor-trust-line";

export function timelineLabel(card: QuoteCardView): string | null {
  const last = [...card.stages].reverse().find((stage) => stage.endsOn !== null);
  if (last?.endsOn != null) {
    const date = new Date(last.endsOn);
    if (Number.isNaN(date.getTime())) return `Ends ${last.endsOn}`;
    return `Ends ${new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(date)}`;
  }
  if (card.completionDays !== null) {
    return `${card.completionDays} working ${card.completionDays === 1 ? "day" : "days"}`;
  }
  return null;
}

export function validityLabel(card: QuoteCardView): { text: string; urgent: boolean } | null {
  if (card.isExpired) return { text: "Price expired", urgent: true };
  if (card.validityDaysLeft === null) return null;
  if (card.validityDaysLeft === 0) return { text: "Runs out today", urgent: true };
  return {
    text: `Valid ${card.validityDaysLeft} more ${card.validityDaysLeft === 1 ? "day" : "days"}`,
    urgent: card.validityDaysLeft <= 2,
  };
}

const PREVIEW_INCLUSIONS = 4;

export interface QuoteCardProps {
  card: QuoteCardView;
  index: number;
  detailHref: string;
  questionsHref: string;
  scopeGaps?: readonly string[];
  siblings?: readonly QuoteCardView[];
  onPick?: (proposalId: string) => void;
  isPicked?: boolean;
  isChosen?: boolean;
  onReject?: (proposalId: string) => void;
  onRequestRevision?: (proposalId: string) => void;
  onAskAboutPrice?: (proposalId: string) => void;
  onRevalidate?: (proposalId: string) => void;
  isRevalidating?: boolean;
}

export function QuoteCard({
  card,
  index,
  detailHref,
  questionsHref,
  scopeGaps = [],
  siblings = [],
  onPick,
  isPicked,
  isChosen = false,
  onReject,
  onRequestRevision,
  onAskAboutPrice,
  onRevalidate,
  isRevalidating,
}: QuoteCardProps) {
  const headingId = `quote-${card.proposalId}`;
  const pickable = onPick !== undefined && card.isSelectable && !card.isExpired;
  const firstStage = firstStageOf(card);
  const timeline = timelineLabel(card);
  const validity = validityLabel(card);
  const superlative = superlativeFor(card, siblings);
  const openQuestions = card.questions.filter(
    (question) => question.askedByRole === "VENDOR" && question.answer === null,
  ).length;

  return (
    <View
      accessibilityLabelledBy={headingId}
      className={cn(
        "overflow-hidden rounded-[18px] bg-surface",
        isPicked || isChosen ? "border-2 border-selected shadow-lg" : "border border-line shadow-sm",
      )}
    >
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ selected: isPicked, disabled: !pickable }}
        disabled={!pickable}
        onPress={() => onPick?.(card.proposalId)}
        className={cn("p-4", isPicked || isChosen ? "bg-selected-surface" : undefined)}
      >
        <View className="flex-row items-start gap-3">
          <VendorMark name={card.vendorName} />
          <View className="min-w-0 flex-1">
            <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
              <Text nativeID={headingId} className="text-base font-bold leading-tight text-text">
                {card.vendorName ?? `Estimate ${index + 1}`}
              </Text>
              {card.isVerified ? <Badge tone="success">Verified</Badge> : null}
              {isChosen ? <Badge tone="success">Chosen</Badge> : null}
              {card.isOutOfBudget ? <Badge tone="warning">Over budget</Badge> : null}
              {card.discountPaise > 0 ? (
                <Badge tone="success">
                  {card.discountPercent === null ? "Price reduced" : `${card.discountPercent}% off`}
                </Badge>
              ) : null}
            </View>
            <VendorTrustLine trust={card.trust} className="mt-0.5" />
          </View>
          {pickable ? (
            <View
              className={cn(
                "mt-1 size-6 shrink-0 items-center justify-center rounded-full",
                isPicked ? "bg-selected" : "border-2 border-warm-300",
              )}
            >
              {isPicked ? <Text className="text-xs font-bold text-text-inverse">✓</Text> : null}
            </View>
          ) : null}
        </View>

        <View className="mt-4 flex-row flex-wrap gap-3">
          <Fact label="Total" value={card.payableLabel} hint={`incl. ${card.taxLabel} tax`} emphasis />
          <Fact
            label="To start"
            value={firstStage?.amountLabel ?? "Not stated"}
            hint={
              firstStage !== null && firstStage.title.toLowerCase() !== "to start" ? firstStage.title : undefined
            }
            emphasis
          />
          <Fact label="Takes" value={timeline ?? "Not stated"} />
          <Fact label="Holds for" value={validity?.text ?? "No end date"} urgent={validity?.urgent ?? false} />
        </View>

        {card.discountPaise > 0 ? (
          <View className="mt-3 rounded-[12px] border border-success-line bg-success-surface px-3 py-2.5">
            <View className="flex-row items-baseline justify-between gap-3">
              <Text className="text-sm text-text-secondary">
                Previously <Text className="text-sm text-text-secondary line-through">{card.discountBaseLabel}</Text>
              </Text>
              <Text className="text-sm font-extrabold text-success-text">You save {card.discountLabel}</Text>
            </View>
          </View>
        ) : null}

        {card.rateLabel !== null ? (
          <Text className="mt-3 text-sm text-text-secondary">
            {card.rateLabel} per worker per day
            {card.workerCount !== null ? ` · ${card.workerCount} workers` : ""}
            {card.minimumDays !== null
              ? ` · ${card.minimumDays === 1 ? "1 day" : `${card.minimumDays} days`} minimum`
              : ""}
          </Text>
        ) : null}

        {superlative !== null ? (
          <Text className="mt-3 self-start rounded-full bg-success-surface px-2.5 py-1 text-xs font-extrabold text-success-text">
            {superlative.label}
          </Text>
        ) : null}

        {card.materialFulfilmentMode === "PARTNER_TURNKEY" ? (
          <View className="mt-3 flex-row gap-2.5 rounded-[12px] border border-success-line bg-success-surface p-3">
            <Text className="text-success-text">✓</Text>
            <View className="min-w-0 flex-1">
              <Text className="text-sm font-bold text-success-text">Materials, setup & removal included</Text>
              <Text className="mt-0.5 text-xs leading-5 text-text-secondary">
                The decorator handles the full supply. You only approve and pay the estimate.
              </Text>
            </View>
          </View>
        ) : null}

        {card.inclusions.length > 0 || card.exclusions.length > 0 ? (
          <View className="mt-3 gap-1">
            {card.inclusions.slice(0, PREVIEW_INCLUSIONS).map((line) => (
              <ScopeLine key={`in-${line}`} included>
                {line}
              </ScopeLine>
            ))}
            {card.exclusions.slice(0, 1).map((line) => (
              <ScopeLine key={`out-${line}`} included={false}>
                {line}
              </ScopeLine>
            ))}
          </View>
        ) : null}

        {scopeGaps.length > 0 ? (
          <Text className="mt-3 rounded-[10px] border border-warning-line bg-warning-surface px-3 py-2 text-[13px] leading-5 text-text">
            <Text className="text-[13px] font-bold text-text">Leaves out:</Text> {scopeGaps.slice(0, 3).join(", ")}
            {scopeGaps.length > 3 ? ` and ${scopeGaps.length - 3} more` : ""}
            <Text className="text-[13px] text-text-secondary"> — the other estimates include these.</Text>
          </Text>
        ) : null}

        {card.isOutOfBudget ? (
          <Text className="mt-3 text-[13px] leading-5 text-text-secondary">
            Above the budget you gave. Shown rather than hidden — they may be pricing something the cheaper estimates left out.
          </Text>
        ) : null}

        <View className="mt-3 flex-row flex-wrap items-center gap-x-3 gap-y-1">
          {card.revision > 1 ? <Text className="text-xs font-semibold text-text-muted">Revision {card.revision}</Text> : null}
          {card.revisionRequest?.status === "OPEN" ? (
            <Text className="text-xs font-semibold text-info-text">Revision asked for</Text>
          ) : null}
          {openQuestions > 0 ? (
            <Text className="text-xs font-semibold text-warning-text">
              {openQuestions === 1 ? "1 question for you" : `${openQuestions} questions for you`}
            </Text>
          ) : null}
        </View>
      </Pressable>

      {card.materialFulfilmentMode === "CUSTOMER_PROCURES" && card.materialList.length > 0 ? (
        <View className="border-t border-line px-4 py-2">
          <Disclosure summary={`What you need to buy · ${materialCountLabel(card.materialList.length) ?? "items"}`}>
            <MaterialListRows rows={card.materialList} />
          </Disclosure>
        </View>
      ) : null}

      <View className="flex-row items-center gap-2 border-t border-line px-4 py-3">
        <Link href={detailHref as never} asChild>
          <Pressable
            accessibilityRole="button"
            className="min-h-10 flex-row items-center rounded-control border border-line-strong bg-surface px-3.5"
          >
            <Text className="text-sm font-bold text-text">Read in full ›</Text>
          </Pressable>
        </Link>

        {card.isExpired && !card.hasAskedForRevalidation && onRevalidate !== undefined ? (
          <Button
            size="sm"
            variant="outline"
            onPress={() => onRevalidate(card.proposalId)}
            loading={isRevalidating}
            loadingLabel="Asking them"
          >
            Ask for a fresh price — free
          </Button>
        ) : null}
        {card.isExpired && card.hasAskedForRevalidation ? (
          <Text accessibilityRole="text" className="text-sm text-text-secondary">
            Fresh price asked for
          </Text>
        ) : null}

        <CardOverflow
          card={card}
          questionsHref={questionsHref}
          onReject={onReject}
          onRequestRevision={onRequestRevision}
          onAskAboutPrice={onAskAboutPrice}
        />
      </View>
    </View>
  );
}

function CardOverflow({
  card,
  questionsHref,
  onReject,
  onRequestRevision,
  onAskAboutPrice,
}: {
  card: QuoteCardView;
  questionsHref: string;
  onReject?: (proposalId: string) => void;
  onRequestRevision?: (proposalId: string) => void;
  onAskAboutPrice?: (proposalId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const priceAskable = onAskAboutPrice !== undefined && canAskAboutPrice(card);
  const revisable =
    onRequestRevision !== undefined &&
    card.isSelectable &&
    !card.isExpired &&
    card.revisionRequest?.status !== "OPEN";
  const rejectable = onReject !== undefined && card.isSelectable;

  return (
    <View className="relative ml-auto">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`More actions for ${card.vendorName ?? "this estimate"}`}
        onPress={() => setOpen((current) => !current)}
        className="min-h-10 min-w-10 items-center justify-center rounded-control"
      >
        <Text className="text-lg text-text-secondary">⋯</Text>
      </Pressable>
      {open ? (
        <View className="absolute bottom-full right-0 z-20 mb-1 w-60 overflow-hidden rounded-[12px] border border-line bg-surface py-1 shadow-lg">
          <Link href={questionsHref as never} asChild>
            <Pressable accessibilityRole="button" className="px-3.5 py-2.5" onPress={() => setOpen(false)}>
              <Text className="text-left text-sm font-semibold text-text">Ask a question</Text>
            </Pressable>
          </Link>
          {priceAskable ? (
            <Pressable
              accessibilityRole="button"
              className="px-3.5 py-2.5"
              onPress={() => {
                setOpen(false);
                onAskAboutPrice(card.proposalId);
              }}
            >
              <Text className="text-sm font-semibold text-text">Any negotiations?</Text>
            </Pressable>
          ) : null}
          {revisable ? (
            <Pressable
              accessibilityRole="button"
              className="px-3.5 py-2.5"
              onPress={() => {
                setOpen(false);
                onRequestRevision(card.proposalId);
              }}
            >
              <Text className="text-sm font-semibold text-text">Ask for a change</Text>
            </Pressable>
          ) : null}
          {rejectable ? (
            <Pressable
              accessibilityRole="button"
              className="px-3.5 py-2.5"
              onPress={() => {
                setOpen(false);
                onReject(card.proposalId);
              }}
            >
              <Text className="text-sm font-semibold text-warning-text">Not this one</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function Fact({
  label,
  value,
  hint,
  emphasis = false,
  urgent = false,
}: {
  label: string;
  value: string;
  hint?: string;
  emphasis?: boolean;
  urgent?: boolean;
}) {
  return (
    <View className="w-[48%] min-w-0">
      <Text className="text-[11px] font-bold uppercase tracking-[0.07em] text-text-muted">{label}</Text>
      <Text
        className={cn(
          "mt-0.5 font-extrabold leading-tight",
          emphasis ? "text-[22px]" : "text-[15px]",
          urgent ? "text-warning-text" : "text-text",
        )}
      >
        {value}
      </Text>
      {hint ? (
        <Text numberOfLines={1} className="text-xs font-medium text-text-secondary">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

function ScopeLine({ included, children }: { included: boolean; children: string }) {
  return (
    <View className="flex-row items-start gap-1.5">
      <Text className={cn("mt-0.5 shrink-0 text-sm font-bold", included ? "text-success-text" : "text-warm-400")}>
        {included ? "✓" : "✗"}
      </Text>
      <Text numberOfLines={1} className="min-w-0 flex-1 text-[13px] leading-5 text-text-secondary">
        {children}
        {included ? " (included)" : " (not included)"}
      </Text>
    </View>
  );
}
