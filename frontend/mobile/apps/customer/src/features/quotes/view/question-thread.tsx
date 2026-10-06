// Ported from frontend/apps/customer/features/quotes/view/question-thread-screen.tsx
import { describeError } from "@vsolve/query/native";
import { ErrorState, Skeleton, Text, Textarea, buttonStyles, cn } from "@vsolve/mobile-ui";
import { Link, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { requestEstimateHref, requestQuotesHref } from "@/lib/routes";

import type { QuestionView } from "../adapters";
import { useAnswerQuestion, useAskVendorQuestion, useEntitledQuoteList } from "../queries";
import { AccessRefusal } from "./access-refusal";
import { VendorMark, VendorTrustLine } from "./vendor-trust-line";

const MAX_OPEN_QUESTIONS = 3;

function formatAt(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function QuestionThread({ requirementId, proposalId }: { requirementId: string; proposalId: string }) {
  const router = useRouter();
  const access = useEntitledQuoteList(requirementId);
  const answer = useAnswerQuestion();
  const ask = useAskVendorQuestion();
  const card = access.list?.cards.find((entry) => entry.proposalId === proposalId) ?? null;
  const supportAction = (
    <Link href="/account/messages" asChild>
      <Pressable accessibilityRole="button" className={buttonStyles({ variant: "outline" })}>
        <Text className="text-sm font-semibold text-text">Talk to us about this</Text>
      </Pressable>
    </Link>
  );

  return (
    <View className="mx-auto min-h-full w-full max-w-2xl flex-1 bg-canvas px-4 pt-3">
      <View className="flex-row items-center gap-3 border-b border-line pb-3">
        <Link href={requestEstimateHref(requirementId, proposalId) as never} asChild>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to estimate"
            className="size-10 items-center justify-center rounded-full"
          >
            <Text className="text-lg text-text-secondary">←</Text>
          </Pressable>
        </Link>
        {card ? (
          <View className="min-w-0 flex-1 flex-row items-center gap-2.5">
            <VendorMark name={card.vendorName} />
            <View className="min-w-0 flex-1">
              <Text numberOfLines={1} className="text-base font-bold leading-tight text-navy-900">
                {card.vendorName ?? "This professional"}
              </Text>
              <VendorTrustLine trust={card.trust} />
            </View>
          </View>
        ) : (
          <Text className="text-sm font-semibold text-text">Questions</Text>
        )}
      </View>

      <View className="-mx-4 flex-row items-center justify-center gap-1.5 border-b border-line/60 bg-navy-900/5 px-4 py-2">
        <Text className="text-center text-xs text-text-secondary">
          Keep details to the work. Phone numbers unlock once booked.
        </Text>
      </View>

      {access.isPending ? (
        <View accessibilityState={{ busy: true }} className="py-6">
          <Text className="sr-only">Loading</Text>
          <Skeleton className="h-40 w-full" />
        </View>
      ) : card === null ? (
        <View className="py-6">
          <ErrorState
            title="We could not find this estimate"
            message="It may have been withdrawn, or the link is out of date."
            severity="warning"
            actionLabel="See all estimates"
            onAction={() => router.replace(requestQuotesHref(requirementId) as never)}
          />
        </View>
      ) : (
        <View className="flex-1">
          <AccessRefusal error={answer.error} attempting="send that answer" supportAction={supportAction} />
          {ask.error && !answer.error ? (
            <ErrorState
              inline
              title={describeError(ask.error, "mutation").title}
              message={describeError(ask.error, "mutation").message}
              severity="error"
            />
          ) : null}
          <ThreadBody
            questions={card.questions}
            vendorName={card.vendorName}
            canAsk={access.entitled}
            isAnswering={answer.isPending}
            isAsking={ask.isPending}
            onAnswer={(questionId, text) => answer.mutate({ requirementId, questionId, answer: text })}
            onAsk={(question) => ask.mutate({ requirementId, proposalId, question })}
          />
        </View>
      )}
    </View>
  );
}

function ThreadBody({
  questions,
  vendorName,
  onAnswer,
  onAsk,
  isAnswering,
  isAsking,
  canAsk,
}: {
  questions: readonly QuestionView[];
  vendorName: string | null;
  onAnswer: (questionId: string, answer: string) => void;
  onAsk?: (question: string) => void;
  isAnswering: boolean;
  isAsking: boolean;
  canAsk: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState("");
  const openMine = questions.filter((question) => question.askedByRole === "CUSTOMER" && question.answer === null).length;
  const left = Math.max(0, MAX_OPEN_QUESTIONS - openMine);
  const who = vendorName ?? "Professional";
  const pendingVendorQuestion = questions.find(
    (q) => (q.askedByRole === "VENDOR" || q.askedByRole === "OPERATIONS") && q.answer === null,
  );
  const blocked = isAnswering || isAsking || (pendingVendorQuestion === undefined && (!canAsk || left === 0));

  function handleSubmit() {
    if (draft.trim() === "" || isAnswering || isAsking) return;
    if (pendingVendorQuestion) {
      onAnswer(pendingVendorQuestion.id, draft.trim());
      setDraft("");
    } else if (onAsk && canAsk && left > 0) {
      onAsk(draft.trim());
      setDraft("");
    }
  }

  return (
    <View className="flex-1 justify-between">
      <ScrollView className="flex-1" contentContainerClassName="gap-4 py-3">
        {questions.length === 0 ? (
          <View className="rounded-card border border-line bg-surface-sunken p-6">
            <Text className="text-center text-sm font-semibold text-text">No questions asked yet</Text>
            <Text className="mt-1 text-center text-xs text-text-muted">
              Use this chat to ask {who} about job scope, timing, materials, or site details.
            </Text>
          </View>
        ) : (
          questions.map((question) => {
            const isVendor = question.askedByRole === "VENDOR" || question.askedByRole === "OPERATIONS";
            return (
              <View key={question.id} className="gap-2">
                <ChatBubble side={isVendor ? "theirs" : "mine"} who={isVendor ? who : "You"} at={question.askedAt}>
                  {question.question}
                </ChatBubble>
                {question.answer !== null && question.answer.trim() !== "" ? (
                  <ChatBubble
                    side={isVendor ? "mine" : "theirs"}
                    who={isVendor ? "You" : who}
                    at={question.answeredAt ?? question.askedAt}
                  >
                    {question.answer}
                  </ChatBubble>
                ) : isVendor ? (
                  <Text className="pl-2 text-left text-[11px] font-medium text-warning-text">
                    Waiting for your reply below…
                  </Text>
                ) : (
                  <Text className="pr-2 text-right text-[11px] font-medium text-text-muted">
                    Waiting for {who} to answer…
                  </Text>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      <View
        className="-mx-4 border-t border-line bg-white px-4 pt-3 shadow-lg"
        style={{ paddingBottom: Math.max(20, insets.bottom + 12) }}
      >
        <View className="mb-1.5 flex-row items-center justify-between px-1">
          <Text className="text-[11px] font-medium text-text-muted">
            {pendingVendorQuestion ? `Replying to ${who}` : `Message ${who}`}
          </Text>
          {canAsk && pendingVendorQuestion === undefined ? (
            <Text className="text-[11px] font-medium text-text-muted">
              {left} {left === 1 ? "question" : "questions"} left
            </Text>
          ) : null}
        </View>
        <View className="flex-row items-center gap-2">
          <View className="flex-1">
            <Textarea
              maxLength={2000}
              placeholder={
                pendingVendorQuestion
                  ? `Type your answer to ${who}…`
                  : canAsk && left > 0
                    ? `Ask ${who} a question…`
                    : "Wait for a reply before asking another…"
              }
              value={draft}
              onChangeText={setDraft}
              editable={!blocked}
              className="min-h-[44px] rounded-[22px] border border-line bg-[#F8F9FA] px-4 py-2.5 text-sm leading-5 text-navy-900"
            />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send message"
            disabled={draft.trim() === "" || blocked}
            onPress={handleSubmit}
            className={cn(
              "size-11 items-center justify-center rounded-full bg-navy-900",
              draft.trim() === "" || blocked ? "opacity-40" : "",
            )}
          >
            <Text className="text-xs font-bold text-white">{isAnswering || isAsking ? "…" : "Send"}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function ChatBubble({
  side,
  at,
  who,
  children,
}: {
  side: "mine" | "theirs";
  at: string;
  who: string;
  children: string;
}) {
  const isMine = side === "mine";
  return (
    <View className={cn("gap-1", isMine ? "items-end" : "items-start")}>
      <View
        className={cn(
          "max-w-[85%] rounded-[18px] px-4 py-2.5",
          isMine ? "rounded-br-[4px] bg-navy-900" : "rounded-bl-[4px] border border-line/70 bg-surface",
        )}
      >
        <Text className={cn("text-sm leading-relaxed", isMine ? "text-white" : "text-navy-900")}>{children}</Text>
      </View>
      <Text className="px-1.5 text-[11px] text-text-muted">
        {who} · {formatAt(at)}
      </Text>
    </View>
  );
}
