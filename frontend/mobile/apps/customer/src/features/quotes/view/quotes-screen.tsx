// Ported from frontend/apps/customer/features/quotes/view/quotes-screen.tsx
import {
  blocksNewSelection,
  describeError,
  isSelectionConflict,
  isUnlockRequired,
  isVisitPlanRequired,
  useServerCountdown,
  type RejectionReason,
} from "@vsolve/query/native";
import { Button, EmptyState, ErrorState, Skeleton, Text, buttonStyles } from "@vsolve/mobile-ui";
import { Link, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";

import { useVisitPlan } from "@/features/access/queries";
import { useRequirement } from "@/features/requirement/queries";
import { estimateConfirmHref, estimateQuestionsHref, requestEstimateHref, requestHref } from "@/lib/routes";

import {
  priceSpread,
  scopeGaps,
  stageTotalMismatchPaise,
  toSelectionView,
  unansweredVendorQuestions,
  type QuoteListView,
} from "../adapters";
import {
  useEntitledQuoteList,
  useRejectQuote,
  useRequestRevision,
  useRevalidateQuote,
  useSelection,
} from "../queries";
import { AccessRefusal } from "./access-refusal";
import { PriceAskSheet } from "./price-ask-sheet";
import { QuestionInbox } from "./question-inbox";
import { QuoteCard } from "./quote-card";
import { QuoteComparison } from "./quote-comparison";
import { RejectQuoteDialog } from "./reject-quote-dialog";
import { SelectionStatus } from "./selection-status";
import { ShoppingListCard } from "./shopping-list-card";
import { StageMismatchNotice } from "./stage-mismatch-notice";
import { titleForSlug } from "./title-for-slug";
import { canAskAboutPrice } from "../adapters";

export interface QuotesScreenProps {
  requirementId: string;
  requestHref?: string;
}

function QuoteBreadcrumb({ requestLabel, requestHref: href }: { requestLabel: string; requestHref: string }) {
  const router = useRouter();
  return (
    <View className="mb-4 flex-row items-center gap-3">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Go back"
        onPress={() => {
          if (router.canGoBack()) {
            router.back();
          } else {
            router.replace("/activity" as never);
          }
        }}
        className="size-9 shrink-0 items-center justify-center rounded-full border border-line bg-surface shadow-sm active:scale-95"
      >
        <Text className="text-lg text-text">‹</Text>
      </Pressable>
      <View accessibilityLabel="Breadcrumb" className="flex-1 flex-row flex-wrap items-center gap-2">
        <Link href="/activity" asChild>
          <Pressable accessibilityRole="link">
            <Text className="text-sm font-semibold text-text-muted">Bookings</Text>
          </Pressable>
        </Link>
        <Text className="text-sm text-warm-400">›</Text>
        <Link href={href as never} asChild>
          <Pressable accessibilityRole="link">
            <Text className="text-sm font-semibold text-text-muted">{requestLabel}</Text>
          </Pressable>
        </Link>
        <Text className="text-sm text-warm-400">›</Text>
        <Text accessibilityRole="header" className="text-sm font-extrabold text-text">
          Estimates
        </Text>
      </View>
    </View>
  );
}

function countWord(count: number): string {
  return count === 1 ? "One" : count === 2 ? "Two" : count === 3 ? "Three" : String(count);
}

function VisitProgress({ arrived, expected }: { arrived: number; expected: number }) {
  const total = Math.max(expected, arrived);
  return (
    <Text className="mt-2 text-sm font-semibold text-text-secondary">
      {Array.from({ length: total }, (_, index) => (index < arrived ? "●" : "○")).join(" ")}{" "}
      {arrived >= total
        ? `all ${total} ${total === 1 ? "visit" : "visits"} done`
        : `${arrived} of ${total} visits done`}
    </Text>
  );
}

function SupportLink() {
  return (
    <Link href="/account/messages" asChild>
      <Pressable accessibilityRole="button" className={buttonStyles({ variant: "outline" })}>
        <Text className="text-sm font-semibold text-text">Talk to us about this</Text>
      </Pressable>
    </Link>
  );
}

export function QuotesScreen({ requirementId, requestHref: requestHrefProp }: QuotesScreenProps) {
  const router = useRouter();
  const backHref = requestHrefProp ?? requestHref(requirementId);
  const access = useEntitledQuoteList(requirementId);
  const planQuery = useVisitPlan(requirementId);
  const requirementQuery = useRequirement(requirementId);
  const selectionQuery = useSelection(requirementId);

  const reject = useRejectQuote();
  const revalidate = useRevalidateQuote();
  const revision = useRequestRevision();

  const [rejecting, setRejecting] = useState<string | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);

  const list = access.list;
  const isA5 = access.isA5;
  const selection =
    selectionQuery.data === undefined || selectionQuery.data === null
      ? null
      : toSelectionView(selectionQuery.data);
  const countdown = useServerCountdown(selection?.reconfirmBy ?? null, 30_000);
  const selectedCard =
    selection === null ? null : (list?.cards.find((card) => card.proposalId === selection.proposalId) ?? null);

  const canChoose = !blocksNewSelection(selectionQuery.data ?? null);
  const defaultPicked =
    canChoose && list !== null
      ? (list.cards.find((card) => card.isSelectable && !card.isExpired)?.proposalId ?? null)
      : null;
  const pickedId = picked ?? defaultPicked;
  const pickedCard = list?.cards.find((card) => card.proposalId === pickedId) ?? null;
  const askingCard = list?.cards.find((card) => card.proposalId === asking) ?? null;

  const supportAction = <SupportLink />;
  const requestLabel =
    requirementQuery.data === undefined ? "This request" : titleForSlug(requirementQuery.data.category_slug);
  const expected = planQuery.data?.plan?.plan_size ?? null;
  const arrived = list?.cards.length ?? 0;
  const waiting = list === null ? [] : unansweredVendorQuestions(list.cards);
  const spread = list === null ? null : priceSpread(list.cards, list.isComparableOnOneBasis);
  const noun = isA5 ? "estimate" : "quote";
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([access.refetch(), planQuery.refetch(), requirementQuery.refetch(), selectionQuery.refetch()]);
    setRefreshing(false);
  };

  return (
    <View className="flex-1 bg-canvas">
      <ScrollView
        className="flex-1"
        contentContainerClassName="mx-auto w-full max-w-[1180px] gap-4 px-4 pb-8 pt-5"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#EA580C"]} tintColor="#EA580C" />
        }
      >
        <QuoteBreadcrumb requestLabel={requestLabel} requestHref={backHref} />

        <View>
          <Text className="text-[1.75rem] font-extrabold leading-tight text-text">
            {arrived === 0
              ? `No ${noun}s yet.`
              : `${countWord(arrived)} ${arrived === 1 ? noun : `${noun}s`} in.`}
          </Text>
          {spread !== null ? (
            <Text className="mt-1 text-[15px] font-bold text-text-secondary">
              {spread.lowLabel} — {spread.highLabel}
              <Text className="text-[15px] font-semibold text-text-muted"> · spread {spread.spreadPercent}%</Text>
            </Text>
          ) : null}
          {expected !== null && expected > 0 ? <VisitProgress arrived={arrived} expected={expected} /> : null}
        </View>

        {selection !== null ? (
          <SelectionStatus
            selection={selection}
            vendorName={selectedCard?.vendorName ?? null}
            reconfirmRemaining={countdown?.isExpired === false ? countdown.announce : null}
            supportAction={supportAction}
          />
        ) : null}

        {waiting.length > 0 ? (
          <View className="rounded-[14px] border border-warning-line bg-warning-surface px-4 py-3">
            <Text className="text-sm font-bold text-text">
              {waiting.length === 1
                ? `${waiting[0]!.card.vendorName ?? "A professional"} asked you a question`
                : `${waiting.length} questions are waiting on you`}
            </Text>
            <Text className="mt-0.5 text-sm leading-6 text-text-secondary">“{waiting[0]!.question.question}”</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setChatOpen(true)}
              className={buttonStyles({ variant: "primary", size: "sm", className: "mt-2" })}
            >
              <Text className="text-xs font-semibold text-action-text">Answer</Text>
            </Pressable>
          </View>
        ) : null}

        <AccessRefusal error={reject.error} attempting="turn this estimate down" supportAction={supportAction} />
        <AccessRefusal error={revalidate.error} attempting="ask for a fresh price" supportAction={supportAction} />
        <AccessRefusal error={revision.error} attempting="ask about this estimate" supportAction={supportAction} />

        <QuoteBody
          requirementId={requirementId}
          accessPending={access.isPending}
          entitled={access.entitled}
          isA5={isA5}
          serviceName={requestLabel}
          quotesError={access.error}
          onRetryQuotes={access.refetch}
          list={list}
          canChoose={canChoose}
          picked={pickedId}
          chosenId={selection?.proposalId ?? null}
          onPick={setPicked}
          isRevalidating={revalidate.isPending}
          onReject={setRejecting}
          onAskAboutPrice={setAsking}
          onRevalidate={(proposalId) => revalidate.mutate({ requirementId, proposalId })}
          requestHref={backHref}
        />

        {isSelectionConflict(selectionQuery.error) ? (
          <ErrorState
            title="Somebody chose first"
            message="Another session picked a professional a moment ago. This page shows what actually happened."
            severity="warning"
            inline
          />
        ) : null}
      </ScrollView>

      {pickedCard !== null && canChoose ? (
        <View className="gap-3 border-t border-line bg-surface px-4 py-3 shadow-lg">
          <View>
            <Text className="text-sm font-extrabold text-text">
              {pickedCard.vendorName ?? "This professional"} · {pickedCard.payableLabel}
            </Text>
            <Text className="mt-0.5 text-xs font-medium leading-5 text-text-secondary">
              You confirm what you are agreeing to on the next screen. Nothing is charged now.
            </Text>
          </View>
          <Button
            className="min-w-[198px] justify-between gap-4 px-7"
            onPress={() => router.push(estimateConfirmHref(requirementId, pickedCard.proposalId) as never)}
          >
            {`Choose ${pickedCard.vendorName ?? "this professional"} ›`}
          </Button>
        </View>
      ) : null}

      <RejectQuoteDialog
        open={rejecting !== null}
        onOpenChange={(open) => setRejecting(open ? rejecting : null)}
        vendorName={list?.cards.find((card) => card.proposalId === rejecting)?.vendorName ?? null}
        replacementsRemaining={list?.replacementsRemaining ?? null}
        replacementKind={isA5 ? "visit" : "quote"}
        isPending={reject.isPending}
        onReject={(reason: RejectionReason, note: string) => {
          const proposalId = rejecting;
          setRejecting(null);
          if (proposalId !== null) reject.mutate({ requirementId, proposalId, reason, note });
        }}
      />
      <PriceAskSheet
        open={asking !== null}
        onOpenChange={(open) => setAsking(open ? asking : null)}
        card={askingCard}
        isPending={revision.isPending}
        onAccept={(proposalId) => {
          setAsking(null);
          router.push(estimateConfirmHref(requirementId, proposalId) as never);
        }}
        onSend={(input) => {
          const proposalId = asking;
          if (proposalId === null) return;
          revision.mutate({ requirementId, proposalId, ...input }, { onSuccess: () => setAsking(null) });
        }}
      />
      <QuestionInbox
        requirementId={requirementId}
        supportAction={supportAction}
        open={chatOpen}
        onOpenChange={setChatOpen}
        showFab={false}
      />
    </View>
  );
}

function QuoteBody({
  requirementId,
  accessPending,
  entitled,
  isA5,
  serviceName,
  quotesError,
  onRetryQuotes,
  list,
  canChoose,
  picked,
  chosenId,
  onPick,
  isRevalidating,
  onReject,
  onAskAboutPrice,
  onRevalidate,
  requestHref: href,
}: {
  requirementId: string;
  accessPending: boolean;
  entitled: boolean;
  isA5: boolean;
  serviceName: string;
  quotesError: unknown;
  onRetryQuotes: () => void;
  list: QuoteListView | null;
  canChoose: boolean;
  picked: string | null;
  chosenId: string | null;
  onPick: (proposalId: string) => void;
  isRevalidating: boolean;
  onReject: (proposalId: string) => void;
  onAskAboutPrice: (proposalId: string) => void;
  onRevalidate: (proposalId: string) => void;
  requestHref: string;
}) {
  if (accessPending) {
    return (
      <View accessibilityState={{ busy: true }}>
        <Text className="sr-only">Loading your estimates</Text>
        <Skeleton className="h-64 w-full" />
      </View>
    );
  }

  if (!entitled) {
    return (
      <EmptyState
        title={isA5 ? "Your estimates are not ready yet" : "These quotes are not unlocked yet"}
        description={
          isA5
            ? "Once a professional has visited and written your estimate, it appears here in full — you will not be asked to pay again to read it."
            : "Unlock them from your request to read the full scope, price and terms."
        }
        action={
          <Link href={href as never} asChild>
            <Pressable accessibilityRole="button" className={buttonStyles({ variant: "primary" })}>
              <Text className="text-sm font-semibold text-action-text">Back to this request</Text>
            </Pressable>
          </Link>
        }
      />
    );
  }

  if (quotesError !== null && quotesError !== undefined) {
    if (isUnlockRequired(quotesError) || isVisitPlanRequired(quotesError)) {
      return (
        <EmptyState
          title="You cannot read these right now"
          description="Your access to these estimates has changed since this page loaded. Open your request to see where it stands."
          action={
            <Link href={href as never} asChild>
              <Pressable accessibilityRole="button" className={buttonStyles({ variant: "primary" })}>
                <Text className="text-sm font-semibold text-action-text">Back to this request</Text>
              </Pressable>
            </Link>
          }
        />
      );
    }
    const presentation = describeError(quotesError, "read");
    return (
      <ErrorState
        title={presentation.title}
        message={presentation.message}
        severity={presentation.severity}
        actionLabel="Try again"
        onAction={onRetryQuotes}
        reference={presentation.reference}
      />
    );
  }

  if (list === null || list.cards.length === 0) {
    return (
      <EmptyState
        title={isA5 ? "No estimates yet" : "No quotes yet"}
        description={
          isA5
            ? "The professionals who visit write your estimate on site. They appear here as they arrive."
            : "Nothing has arrived yet. We will tell you when it does."
        }
      />
    );
  }

  const cards = list.cards;
  const cardList = (
    <View className="gap-4">
      {cards.map((card, index) => (
        <QuoteCard
          key={card.proposalId}
          card={card}
          index={index}
          detailHref={requestEstimateHref(requirementId, card.proposalId)}
          questionsHref={estimateQuestionsHref(requirementId, card.proposalId)}
          scopeGaps={scopeGaps(card, cards)}
          siblings={cards}
          onPick={canChoose ? onPick : undefined}
          isPicked={picked === card.proposalId}
          isChosen={chosenId === card.proposalId}
          onReject={canChoose ? onReject : undefined}
          onRequestRevision={canChoose ? onAskAboutPrice : undefined}
          onAskAboutPrice={canChoose ? onAskAboutPrice : undefined}
          onRevalidate={onRevalidate}
          isRevalidating={isRevalidating}
        />
      ))}
    </View>
  );

  if (cards.length === 1) {
    const only = cards[0]!;
    const mismatch = stageTotalMismatchPaise(only);
    return (
      <View className="gap-4">
        <View className="min-w-0 gap-4">
          {mismatch !== null ? <StageMismatchNotice card={only} driftPaise={mismatch} /> : null}
          {cardList}
        </View>
        <View className="gap-4">
          {only.materialFulfilmentMode === "CUSTOMER_PROCURES" ? (
            <ShoppingListCard
              requirementId={requirementId}
              proposalId={only.proposalId}
              rows={only.materialList}
              brandTierLabel={only.brandTierLabel}
              vendorName={only.vendorName}
              serviceName={serviceName}
            />
          ) : null}
          <View className="rounded-[14px] border border-line bg-surface p-5 shadow-sm">
            <Text className="text-[0.6875rem] font-extrabold uppercase tracking-[0.14em] text-text-muted">
              Before you decide
            </Text>
            <Text className="mt-2 text-lg font-extrabold leading-tight text-text">Nothing to compare it against yet.</Text>
            <Text className="mt-2 text-sm font-medium leading-6 text-text-secondary">
              One {isA5 ? "estimate" : "quote"} tells you a price. Two tell you whether it is a good one.
            </Text>
            {canChoose && only.isSelectable ? (
              <View className="mt-4 gap-2">
                <Button variant="outline" onPress={() => onReject(only.proposalId)}>
                  {`Get another ${isA5 ? "estimate" : "quote"} — free`}
                </Button>
                {canAskAboutPrice(only) ? (
                  <Button variant="outline" onPress={() => onAskAboutPrice(only.proposalId)}>
                    Any negotiations?
                  </Button>
                ) : null}
              </View>
            ) : null}
            {canChoose && only.isSelectable ? (
              <Text className="mt-3 text-xs leading-5 text-text-muted">
                Both keep this {isA5 ? "estimate" : "quote"} live. Nothing is charged either way.
              </Text>
            ) : null}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View className="gap-2">
      {cardList}
      <View className="mt-2">
        <QuoteComparison
          cards={cards}
          isComparableOnOneBasis={list.isComparableOnOneBasis}
          detailHrefFor={(proposalId) => requestEstimateHref(requirementId, proposalId)}
          confirmHrefFor={(proposalId) => estimateConfirmHref(requirementId, proposalId)}
          pickedId={picked}
          chosenId={chosenId}
          onPick={canChoose ? onPick : undefined}
          canChoose={canChoose}
        />
      </View>
      {!canChoose ? (
        <Text className="text-sm leading-6 text-text-secondary">
          You have already chosen one of these, so the others cannot be picked while that stands. If it falls through, they come back — at no extra charge.
        </Text>
      ) : null}
    </View>
  );
}
