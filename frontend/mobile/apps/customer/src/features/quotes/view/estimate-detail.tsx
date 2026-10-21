// Ported from frontend/apps/customer/features/quotes/view/estimate-detail-screen.tsx
import { blocksNewSelection } from "@vsolve/query/native";
import { Badge, Button, Disclosure, ErrorState, Skeleton, Text, buttonStyles, cn } from "@vsolve/mobile-ui";
import { Link, useRouter } from "expo-router";
import { useState, type ReactNode } from "react";
import { Pressable, RefreshControl, ScrollView, Share, View } from "react-native";

import { useRequirement } from "@/features/requirement/queries";
import { estimateConfirmHref, estimateQuestionsHref, requestQuotesHref } from "@/lib/routes";

import {
  canAskAboutPrice,
  firstStageOf,
  scopeGaps,
  stageTotalMismatchPaise,
  type QuoteCardView,
} from "../adapters";
import {
  useEntitledQuoteList,
  useRejectQuote,
  useRequestRevision,
  useRevalidateQuote,
  useSelection,
} from "../queries";
import { AccessRefusal } from "./access-refusal";
import { IncludedSupplyCard } from "./included-supply-card";
import { PriceAskSheet } from "./price-ask-sheet";
import { PriceLines, type PriceLineView } from "./price-lines";
import { QuestionInbox } from "./question-inbox";
import { timelineLabel, validityLabel } from "./quote-card";
import { RejectQuoteDialog } from "./reject-quote-dialog";
import { ShoppingListCard } from "./shopping-list-card";
import { StageMismatchNotice } from "./stage-mismatch-notice";
import { titleForSlug } from "./title-for-slug";
import { VendorMark, VendorTrustLine, vendorTypeLabel } from "./vendor-trust-line";

export function EstimateDetail({
  requirementId,
  proposalId,
}: {
  requirementId: string;
  proposalId: string;
}) {
  const router = useRouter();
  const access = useEntitledQuoteList(requirementId);
  const selectionQuery = useSelection(requirementId);
  const requirementQuery = useRequirement(requirementId);
  const serviceName = requirementQuery.data === undefined ? "this job" : titleForSlug(requirementQuery.data.category_slug);
  const reject = useRejectQuote();
  const revalidate = useRevalidateQuote();
  const revision = useRequestRevision();
  const [rejecting, setRejecting] = useState(false);
  const [asking, setAsking] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([access.refetch(), selectionQuery.refetch(), requirementQuery.refetch()]);
    setRefreshing(false);
  };

  const cards = access.list?.cards ?? [];
  const card = cards.find((entry) => entry.proposalId === proposalId) ?? null;
  const canChoose = !blocksNewSelection(selectionQuery.data ?? null);
  const supportAction = (
    <Link href="/account/messages" asChild>
      <Pressable accessibilityRole="button" className={buttonStyles({ variant: "outline" })}>
        <Text className="text-sm font-semibold text-text">Talk to us about this</Text>
      </Pressable>
    </Link>
  );

  if (access.isPending) {
    return (
      <View className="mx-auto w-full max-w-3xl px-4 py-5" accessibilityState={{ busy: true }}>
        <Text className="sr-only">Loading this estimate</Text>
        <Skeleton className="h-72 w-full" />
      </View>
    );
  }

  if (!access.entitled || card === null) {
    return (
      <View className="mx-auto w-full max-w-3xl px-4 py-5">
        <ErrorState
          title={access.entitled ? "We could not find this estimate" : "This estimate is not readable yet"}
          message={
            access.entitled
              ? "It may have been withdrawn, or the link is out of date."
              : "Once a professional has visited and written it, it appears here in full."
          }
          severity="warning"
          actionLabel="Back to the estimates"
          onAction={() => router.replace(requestQuotesHref(requirementId) as never)}
        />
      </View>
    );
  }

  const gaps = scopeGaps(card, cards);
  const firstStage = firstStageOf(card);
  const timeline = timelineLabel(card);
  const validity = validityLabel(card);
  const mismatch = stageTotalMismatchPaise(card);
  const openQuestions = card.questions.filter((question) => question.askedByRole === "VENDOR" && question.answer === null).length;
  const chooseable = canChoose && card.isSelectable && !card.isExpired;
  const priceAskable = canChoose && canAskAboutPrice(card);
  const confirmHref = estimateConfirmHref(requirementId, proposalId);
  const questionsHref = estimateQuestionsHref(requirementId, proposalId);

  const priceLines: readonly PriceLineView[] = [
    ...card.itemLines.map((line) => ({
      title: line.title,
      note: line.quantityLabel,
      amountLabel: line.amountLabel,
      amountPaise: line.amountPaise,
    })),
    ...card.labourLines.map((line) => ({
      title: line.team === null ? line.role : `${line.role} — ${line.team}`,
      note: line.crewLabel,
      amountLabel: line.amountLabel,
      amountPaise: line.amountPaise,
    })),
    ...card.otherCharges.map((charge) => ({
      title: charge.label,
      note: "Named charge",
      amountLabel: charge.amountLabel,
      amountPaise: charge.amountPaise,
    })),
    ...card.materials.map((material) => ({
      title: material.title,
      note:
        material.quantityLabel === null
          ? "Materials the pro supplies · paid as an advance"
          : `${material.quantityLabel} · materials the pro supplies · paid as an advance`,
      amountLabel: material.amountLabel ?? "—",
      amountPaise: null,
    })),
  ];

  const hasShoppingList = card.materialFulfilmentMode === "PARTNER_TURNKEY" || card.materialList.length > 0;
  const summaryIsMachineJoin =
    card.scopeSummary !== null &&
    card.itemLines.length > 1 &&
    card.itemLines.filter((line) => card.scopeSummary!.includes(line.title)).length >= card.itemLines.length;
  const prose = summaryIsMachineJoin ? null : card.scopeSummary;

  return (
    <View className="flex-1 bg-canvas">
      <ScrollView
        className="flex-1"
        contentContainerClassName="mx-auto w-full max-w-3xl gap-5 px-4 pb-8 pt-5"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#EA580C"]} tintColor="#EA580C" />
        }
      >
        <View className="mb-4 flex-row items-center justify-between gap-3">
          <View className="flex-row items-center gap-2.5">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back to all estimates"
              hitSlop={8}
              onPress={() => router.back()}
              className="size-9 shrink-0 items-center justify-center rounded-full border border-line bg-surface shadow-sm active:scale-95"
            >
              <Text className="text-lg text-text">‹</Text>
            </Pressable>
            <Link href={requestQuotesHref(requirementId) as never} asChild>
              <Pressable accessibilityRole="link">
                <Text className="text-sm font-bold text-navy-900">All estimates</Text>
              </Pressable>
            </Link>
          </View>
          <ShareButton card={card} />
        </View>

        <View className="min-w-0 gap-5">
          <View className="flex-row items-start gap-3">
            <VendorMark name={card.vendorName} className="size-14" />
            <View className="min-w-0 flex-1">
              <View className="flex-row flex-wrap items-center gap-2">
                <Text className="text-xl font-extrabold leading-tight text-text">
                  {card.vendorName ?? "This professional"}
                </Text>
                {card.isVerified ? <Badge tone="success">Verified</Badge> : null}
                {card.isOutOfBudget ? <Badge tone="warning">Over budget</Badge> : null}
                {card.isExpired ? <Badge tone="neutral">Price expired</Badge> : null}
                {card.discountPaise > 0 ? (
                  <Badge tone="success">
                    {card.discountPercent === null ? "Price reduced" : `${card.discountPercent}% off`}
                  </Badge>
                ) : null}
              </View>
              {vendorTypeLabel(card.vendorType) !== null ? (
                <Text className="mt-0.5 text-sm font-semibold text-text-secondary">{vendorTypeLabel(card.vendorType)}</Text>
              ) : null}
              <VendorTrustLine trust={card.trust} size="md" className="mt-0.5" />
            </View>
          </View>

          <View className="rounded-[18px] bg-navy-900 p-5">
            <Text className="text-xs font-bold uppercase tracking-[0.12em] text-signal-300">
              {card.discountPaise > 0 ? "Discounted estimate" : "Their estimate"}
            </Text>
            <Text className="mt-2 text-[34px] font-extrabold leading-none text-white">{card.payableLabel}</Text>
            {card.discountPaise > 0 ? (
              <View className="mt-2 flex-row flex-wrap items-center gap-x-3 gap-y-1">
                <Text className="text-sm text-white/60 line-through">{card.discountBaseLabel}</Text>
                <Text className="text-sm font-bold text-success-200">You save {card.discountLabel}</Text>
              </View>
            ) : null}
            <Text className="mt-2 text-sm text-white/75">
              {card.taxBasis === "INCLUSIVE"
                ? `Includes ${card.taxLabel} tax`
                : `Includes ${card.taxLabel} tax added to service rates`}
              {validity !== null ? ` · ${validity.text.toLowerCase()}` : ""}
              {card.revision > 1 ? ` · revision ${card.revision}` : ""}
            </Text>
            <View className="mt-4 flex-row gap-3 border-t border-white/10 pt-4">
              <View className="w-[48%]">
                <Text className="text-[11px] font-bold uppercase tracking-[0.08em] text-white/60">To start</Text>
                <Text className="mt-0.5 text-lg font-extrabold text-white">{firstStage?.amountLabel ?? "Not stated"}</Text>
              </View>
              <View className="w-[48%]">
                <Text className="text-[11px] font-bold uppercase tracking-[0.08em] text-white/60">Takes</Text>
                <Text className="mt-0.5 text-lg font-extrabold text-white">{timeline ?? "Not stated"}</Text>
              </View>
            </View>
            {priceAskable ? (
              <Pressable accessibilityRole="button" onPress={() => setAsking(true)} className="mt-4 flex-row items-center justify-between gap-2 border-t border-white/10 pt-3">
                <Text className="text-sm font-bold text-signal-300">Any negotiations?</Text>
                <Text className="text-base text-signal-300">→</Text>
              </Pressable>
            ) : null}
          </View>

          {mismatch !== null ? <StageMismatchNotice card={card} driftPaise={mismatch} /> : null}
          {card.revisionRequest !== null ? (
            <RevisionRequestNotice request={card.revisionRequest} priceLabel={card.payableLabel} />
          ) : null}
          {card.discountPaise > 0 ? <CustomerDiscountSummary card={card} /> : null}

          <AccessRefusal error={reject.error} attempting="turn this estimate down" supportAction={supportAction} />
          <AccessRefusal error={revalidate.error} attempting="ask for a fresh price" supportAction={supportAction} />
          <AccessRefusal error={revision.error} attempting="ask about this estimate" supportAction={supportAction} />

          {prose !== null ? (
            <Section title="In their words">
              <Text className="text-[15px] leading-7 text-text">“{prose}”</Text>
            </Section>
          ) : null}

          {priceLines.length > 0 ? (
            <Section title={`The work — ${priceLines.length} ${priceLines.length === 1 ? "line" : "lines"}, ${card.payableLabel}`}>
              <PriceLines lines={priceLines} totalPaise={card.discountBasePaise || card.payablePaise} />
            </Section>
          ) : null}

          <Section title="Not included">
            {card.exclusions.length === 0 ? (
              <View className="flex-row flex-wrap items-center justify-between gap-3">
                <Text className="text-sm leading-6 text-text-secondary">They listed nothing as excluded.</Text>
                <Link href={questionsHref as never} asChild>
                  <Pressable accessibilityRole="link">
                    <Text className="text-sm font-bold text-text-link">Ask what’s out →</Text>
                  </Pressable>
                </Link>
              </View>
            ) : (
              <View className="gap-1">
                {card.exclusions.map((line) => (
                  <View key={line} className="flex-row items-start gap-2">
                    <Text className="font-bold text-warm-400">✗</Text>
                    <Text className="flex-1 text-sm leading-6 text-text-secondary">{line}</Text>
                  </View>
                ))}
              </View>
            )}
            {gaps.length > 0 ? (
              <Text className="mt-3 rounded-[10px] border border-warning-line bg-warning-surface px-3 py-2 text-[13px] leading-5 text-text">
                <Text className="text-[13px] font-bold text-text">Other estimates include:</Text> {gaps.join(", ")}. Not listed here — it may be priced elsewhere or left out. Worth asking.
              </Text>
            ) : null}
          </Section>

          {card.stages.length > 0 ? (
            <Section title="How you pay">
              <View className="gap-2">
                {card.stages.map((stage, index) => (
                  <View key={`s-${index}`} className="flex-row items-start gap-3 rounded-[12px] border border-line p-3">
                    <View className="size-7 shrink-0 items-center justify-center rounded-full bg-action-surface">
                      <Text className="text-xs font-bold text-signal-700">{index + 1}</Text>
                    </View>
                    <View className="min-w-0 flex-1">
                      <Text className="font-semibold text-text">{stage.title === "" ? `Stage ${index + 1}` : stage.title}</Text>
                      {stage.deliverable !== null ? <Text className="text-sm text-text-secondary">{stage.deliverable}</Text> : null}
                      {stage.endsOn !== null ? <Text className="text-xs text-text-muted">By {stage.endsOn}</Text> : null}
                    </View>
                    <Text className="shrink-0 font-extrabold text-text">{stage.amountLabel}</Text>
                  </View>
                ))}
              </View>
              <Text className="mt-2 text-sm text-text-secondary">
                You fund one stage at a time. Work money reaches the professional after each stage is done.
              </Text>
              {card.completionDays !== null ? (
                <Text className="mt-2 rounded-[10px] border border-success-line bg-success-surface px-3 py-2 text-[13px] leading-5 text-text">
                  <Text className="text-[13px] font-bold text-text">
                    {card.completionDays} working {card.completionDays === 1 ? "day" : "days"}, at this price.
                  </Text>{" "}
                  If the work runs longer, you pay nothing extra — the price above is fixed from the moment you choose them.
                </Text>
              ) : null}
            </Section>
          ) : null}

          {hasShoppingList ? (
            card.materialFulfilmentMode === "PARTNER_TURNKEY" ? (
              <IncludedSupplyCard rows={card.includedSupplyList} />
            ) : (
              <ShoppingListCard
                requirementId={requirementId}
                proposalId={proposalId}
                rows={card.materialList}
                brandTierLabel={card.brandTierLabel}
                vendorName={card.vendorName}
                serviceName={serviceName}
              />
            )
          ) : null}

          {card.rateLabel !== null ? (
            <Section title="Rate">
              <View className="flex-row flex-wrap gap-3">
                <Fact label="Per worker, per day" value={card.rateLabel} />
                <Fact label="Workers" value={card.workerCount === null ? null : String(card.workerCount)} />
                <Fact
                  label="Minimum"
                  value={card.minimumDays === null ? null : `${card.minimumDays} ${card.minimumDays === 1 ? "day" : "days"}`}
                />
              </View>
            </Section>
          ) : null}

          <View className="rounded-[18px] border border-line bg-surface px-4 shadow-sm">
            <Disclosure summary="Terms, warranty and dates">
              <View className="gap-3 pb-3">
                <Fact label="Warranty" value={card.warrantyTerms} empty="Not stated" />
                <Fact
                  label="Valid until"
                  value={
                    card.validUntil === null
                      ? null
                      : new Date(card.validUntil).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
                  }
                  empty="No validity given"
                />
                <Fact label="Written" value={card.visitCompletedAt === null ? null : "On site, after their visit"} empty="Not recorded" />
                <Fact label="Sent" value={new Date(card.submittedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} />
                {card.revision > 1 ? <Fact label="Revision" value={String(card.revision)} /> : null}
              </View>
            </Disclosure>
          </View>

          <View className="flex-row gap-2">
            <Link href={questionsHref as never} asChild>
              <Pressable accessibilityRole="button" className={cn(buttonStyles({ variant: "outline" }), "flex-1 justify-center")}>
                <Text className="text-sm font-semibold text-text">
                  Ask them{openQuestions > 0 ? ` (${openQuestions} waiting)` : ""}
                </Text>
              </Pressable>
            </Link>
            {card.isExpired ? (
              card.hasAskedForRevalidation ? (
                <Text className="flex-1 items-center justify-center rounded-control bg-surface-sunken px-3 text-sm text-text-secondary">
                  Fresh price asked for
                </Text>
              ) : (
                <Button
                  variant="outline"
                  onPress={() => revalidate.mutate({ requirementId, proposalId })}
                  loading={revalidate.isPending}
                  loadingLabel="Asking"
                >
                  Ask for a fresh price — free
                </Button>
              )
            ) : (
              <Button variant="outline" disabled={!priceAskable} onPress={() => setAsking(true)}>
                Ask for a change
              </Button>
            )}
          </View>
        </View>

        {!chooseable && !canChoose ? (
          <Text className="mt-5 text-sm leading-6 text-text-secondary">
            You have already chosen a professional on this request. If it falls through, the others come back at no extra charge.
          </Text>
        ) : null}
      </ScrollView>

      {chooseable ? (
        <View className="border-t border-line bg-surface px-4 py-3 shadow-lg">
          <View className="mx-auto w-full max-w-3xl flex-row items-center gap-3">
            <View className="min-w-0 flex-1">
              <Text numberOfLines={1} className="text-sm font-extrabold text-text">
                {card.payableLabel}
              </Text>
              <Text className="text-xs text-text-secondary">Nothing is charged now.</Text>
            </View>
            <Button variant="ghost" size="sm" onPress={() => setRejecting(true)}>
              Not this one
            </Button>
            <Link href={confirmHref as never} asChild>
              <Pressable accessibilityRole="button" className={buttonStyles({ variant: "primary" })}>
                <Text className="text-sm font-semibold text-action-text">Choose ›</Text>
              </Pressable>
            </Link>
          </View>
        </View>
      ) : null}

      <RejectQuoteDialog
        open={rejecting}
        onOpenChange={setRejecting}
        vendorName={card.vendorName}
        replacementsRemaining={access.list?.replacementsRemaining ?? null}
        replacementKind={access.isA5 ? "visit" : "quote"}
        isPending={reject.isPending}
        onReject={(reason, note) => {
          setRejecting(false);
          reject.mutate({ requirementId, proposalId, reason, note });
        }}
      />
      <PriceAskSheet
        open={asking}
        onOpenChange={setAsking}
        card={card}
        isPending={revision.isPending}
        onAccept={() => {
          setAsking(false);
          router.push(confirmHref as never);
        }}
        onSend={(input) => {
          revision.mutate({ requirementId, proposalId, ...input }, { onSuccess: () => setAsking(false) });
        }}
      />
      <QuestionInbox requirementId={requirementId} />
    </View>
  );
}

function CustomerDiscountSummary({ card }: { readonly card: QuoteCardView }) {
  return (
    <View accessibilityLabel="Overall discount applied" className="rounded-[18px] border border-success-line bg-success-surface p-4">
      <View className="flex-row flex-wrap items-center justify-between gap-2">
        <Text className="font-extrabold text-text">Overall discount applied</Text>
        <Badge tone="success">{card.discountPercent === null ? "Price reduced" : `${card.discountPercent}% off`}</Badge>
      </View>
      <View className="mt-3 gap-2">
        <View className="flex-row items-baseline justify-between gap-3">
          <Text className="text-sm text-text-secondary">Original estimate</Text>
          <Text className="text-sm text-text-secondary line-through">{card.discountBaseLabel}</Text>
        </View>
        <View className="flex-row items-baseline justify-between gap-3">
          <Text className="text-sm text-text-secondary">Overall discount</Text>
          <Text className="text-sm font-bold text-success-text">−{card.discountLabel}</Text>
        </View>
        <View className="flex-row items-baseline justify-between gap-3 border-t border-success-line pt-2">
          <Text className="font-extrabold text-text">Your final total</Text>
          <Text className="text-lg font-extrabold text-text">{card.payableLabel}</Text>
        </View>
      </View>
      <Text className="mt-2 text-xs leading-5 text-success-text">
        The scope, warranty and line-item rates are unchanged. The saving is spread across your payment stages automatically.
      </Text>
    </View>
  );
}

export function RevisionRequestNotice({
  request,
  priceLabel,
}: {
  request: NonNullable<QuoteCardView["revisionRequest"]>;
  priceLabel: string;
}) {
  const agreed =
    request.counteredDiscountPercent !== null &&
    request.requestedDiscountPercent !== null &&
    request.counteredDiscountPercent >= request.requestedDiscountPercent;
  const countered =
    request.isPriceAsk &&
    request.counteredDiscountPercent !== null &&
    request.requestedDiscountPercent !== null &&
    request.counteredDiscountPercent < request.requestedDiscountPercent;

  const tone =
    request.status === "OPEN"
      ? "border-info-line bg-info-surface"
      : request.status === "DECLINED"
        ? "border-line bg-surface-sunken"
        : "border-success-line bg-success-surface";

  const heading =
    request.status === "OPEN"
      ? request.isPriceAsk && request.requestedDiscountPercent !== null
        ? `You asked for ${request.requestedDiscountPercent}% off — waiting for their answer`
        : "You asked for a revision — waiting for their answer"
      : request.status === "ANSWERED"
        ? countered
          ? `They came back at ${request.counteredDiscountPercent}%, not ${request.requestedDiscountPercent}%`
          : agreed
            ? "They agreed — a new estimate is on this request"
            : "They answered with a fresh estimate"
        : request.isPriceAsk
          ? "They cannot move on price"
          : "They could not make that change";

  return (
    <View className={cn("rounded-[14px] border px-4 py-3", tone)}>
      <Text className="text-sm font-bold text-text">{heading}</Text>
      <Text className="mt-1 text-sm leading-6 text-text-secondary">
        {request.reasonLabel}
        {request.excludedItems.length > 0 ? `: ${request.excludedItems.join(", ")}` : ""}
        {request.note !== null ? ` — “${request.note}”` : ""}
      </Text>
      {request.declineNote !== null ? (
        <Text className="mt-1 text-sm leading-6 text-text">Their note: “{request.declineNote}”</Text>
      ) : null}
      {request.status === "OPEN" ? (
        <Text className="mt-1 text-xs text-text-muted">
          This estimate stays valid, and you can still choose it at {priceLabel} while you wait.
        </Text>
      ) : null}
      {request.status === "DECLINED" ? (
        <Text className="mt-1 text-xs text-text-muted">Their estimate stands at {priceLabel}.</Text>
      ) : null}
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="rounded-[18px] border border-line bg-surface p-4 shadow-sm">
      <Text className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-text-muted">{title}</Text>
      <View className="mt-3">{children}</View>
    </View>
  );
}

function Fact({ label, value, empty }: { label: string; value: string | null; empty?: string }) {
  if (value === null && empty === undefined) return null;
  return (
    <View className="w-[48%]">
      <Text className="text-xs font-semibold text-text-muted">{label}</Text>
      <Text className={cn("mt-0.5 text-sm", value === null ? "text-warning-text" : "text-text")}>{value ?? empty}</Text>
    </View>
  );
}

function ShareButton({ card }: { card: QuoteCardView }) {
  const text = [
    `${card.vendorName ?? "Estimate"} — ${card.payableLabel}`,
    card.scopeSummary ?? null,
    card.inclusions.length > 0 ? `Includes: ${card.inclusions.join(", ")}` : null,
    card.exclusions.length > 0 ? `Not included: ${card.exclusions.join(", ")}` : null,
    card.warrantyTerms !== null ? `Warranty: ${card.warrantyTerms}` : null,
    "Shared from Vsolve",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  return (
    <Button
      variant="ghost"
      size="sm"
      onPress={() => {
        void Share.share({ title: `${card.vendorName ?? "Estimate"} — ${card.payableLabel}`, message: text });
      }}
    >
      Share
    </Button>
  );
}
