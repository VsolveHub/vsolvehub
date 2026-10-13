// Ported from frontend/apps/customer/features/quotes/view/confirm-choice-screen.tsx
import { blocksNewSelection, isSelectionConflict } from "@vsolve/query/native";
import { Button, ErrorState, Skeleton, Text, buttonStyles, cn } from "@vsolve/mobile-ui";
import { Link, useRouter } from "expo-router";
import { useState, type ReactNode } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";

import { requestEstimateHref, requestQuotesHref } from "@/lib/routes";

import { firstStageOf } from "../adapters";
import { destinationAfterSelection } from "../model/selection-navigation";
import { useEntitledQuoteList, useSelectProposal, useSelection } from "../queries";
import { timelineLabel } from "./quote-card";
import { AccessRefusal } from "./access-refusal";
import { VendorMark, VendorTrustLine } from "./vendor-trust-line";

export function ConfirmChoice({ requirementId, proposalId }: { requirementId: string; proposalId: string }) {
  const router = useRouter();
  const access = useEntitledQuoteList(requirementId);
  const selectionQuery = useSelection(requirementId);
  const select = useSelectProposal();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([access.refetch(), selectionQuery.refetch()]);
    setRefreshing(false);
  };

  const card = access.list?.cards.find((entry) => entry.proposalId === proposalId) ?? null;
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
      <View className="mx-auto w-full max-w-2xl px-4 py-5" accessibilityState={{ busy: true }}>
        <Text className="sr-only">Loading</Text>
        <Skeleton className="h-64 w-full" />
      </View>
    );
  }

  if (card === null || !card.isSelectable || card.isExpired || !canChoose) {
    return (
      <View className="mx-auto w-full max-w-2xl px-4 py-5">
        <ErrorState
          title={!canChoose ? "You have already chosen a professional" : "This estimate cannot be chosen"}
          message={
            !canChoose
              ? "If that choice falls through, the other estimates come back at no extra charge."
              : "It may have expired, been withdrawn, or been replaced by a newer revision."
          }
          severity="warning"
          actionLabel="Back to the estimates"
          onAction={() => router.replace(requestQuotesHref(requirementId) as never)}
        />
      </View>
    );
  }

  const firstStage = firstStageOf(card);
  const timeline = timelineLabel(card);
  const others = (access.list?.cards.length ?? 1) - 1;

  return (
    <ScrollView
      className="flex-1 bg-canvas"
      contentContainerClassName="mx-auto w-full max-w-2xl gap-5 px-4 py-5"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#EA580C"]} tintColor="#EA580C" />
      }
    >
      <Link href={requestEstimateHref(requirementId, proposalId) as never} asChild>
        <Pressable accessibilityRole="link">
          <Text className="text-sm font-semibold text-text-link">← Back to the estimate</Text>
        </Pressable>
      </Link>

      <View>
        <Text className="text-xs font-bold uppercase tracking-[0.12em] text-signal-700">Confirm your choice</Text>
        <View className="mt-2 flex-row items-center gap-3">
          <VendorMark name={card.vendorName} />
          <View className="min-w-0 flex-1">
            <Text className="text-xl font-extrabold leading-tight text-text">
              {card.vendorName ?? "This professional"} · {card.payableLabel}
            </Text>
            <VendorTrustLine trust={card.trust} />
          </View>
        </View>
      </View>

      {isSelectionConflict(select.error) ? (
        <ErrorState
          title="Somebody chose first"
          message="Another session picked a professional for this request a moment before you did."
          severity="warning"
          inline
        />
      ) : (
        <AccessRefusal error={select.error} attempting="choose this professional" supportAction={supportAction} />
      )}

      <View className="rounded-[18px] border border-line bg-surface p-4 shadow-sm">
        <Text className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-text-muted">You are agreeing to</Text>
        <View className="mt-3 gap-2.5">
          <Line ok>
            The scope on their estimate
            {card.inclusions.length > 0
              ? ` (${card.inclusions.length} ${card.inclusions.length === 1 ? "item" : "items"} included)`
              : ""}
            {card.scopeSummary !== null ? `\n“${card.scopeSummary}”` : ""}
          </Line>
          {card.stages.length > 0 ? (
            <Line ok>
              {`${card.stages.length} payment ${card.stages.length === 1 ? "stage" : "stages"}, funded one at a time`}
              {firstStage !== null ? ` — first ${firstStage.amountLabel} when work is scheduled` : ""}
            </Line>
          ) : null}
          {timeline !== null ? <Line ok>{timeline}</Line> : null}
          {card.warrantyTerms !== null ? (
            <Line ok>{`Warranty: ${card.warrantyTerms}`}</Line>
          ) : (
            <Line ok={false} warn>
              No warranty stated
            </Line>
          )}
          {card.exclusions.map((line) => (
            <Line key={line} ok={false}>
              {`${line} — you arrange this`}
            </Line>
          ))}
        </View>
      </View>

      <Text className="rounded-[14px] border border-info-line bg-info-surface px-4 py-3 text-sm leading-6 text-info-text">
        Any change after this is a written change order you approve in the app.{" "}
        <Text className="text-sm font-bold text-info-text">Nothing is charged now.</Text>
      </Text>

      <View className="gap-2">
        <Button
          size="lg"
          block
          loading={select.isPending}
          loadingLabel="Opening the agreement"
          onPress={() =>
            select.mutate(
              { requirementId, proposalId },
              {
                onSuccess: (chosen) => {
                  const destination = destinationAfterSelection(chosen);
                  if (destination !== null) router.replace(destination as never);
                },
              },
            )
          }
        >
          Confirm and open agreement
        </Button>
        <Text className="text-center text-xs leading-5 text-text-muted">
          {others > 0
            ? `The other ${others === 1 ? "estimate stays" : "estimates stay"} available if this falls through — at no extra charge.`
            : "If this falls through, we look for another professional at no extra charge."}
        </Text>
      </View>
    </ScrollView>
  );
}

function Line({ ok, warn = false, children }: { ok: boolean; warn?: boolean; children: ReactNode }) {
  return (
    <View className="flex-row items-start gap-2.5">
      <Text className={cn("mt-0.5 font-bold", ok ? "text-success-text" : warn ? "text-warning-text" : "text-warm-400")}>
        {ok ? "✓" : warn ? "⚠" : "✗"}
      </Text>
      <Text className="min-w-0 flex-1 text-sm leading-6 text-text">{children}</Text>
    </View>
  );
}
