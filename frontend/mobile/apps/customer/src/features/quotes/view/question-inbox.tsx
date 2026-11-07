// Ported from frontend/apps/customer/features/quotes/view/question-inbox.tsx
import { Text, Textarea, cn } from "@vsolve/mobile-ui";
import type { ReactNode } from "react";
import { useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { toQuestionView } from "../adapters";
import { useAnswerQuestion, useRequirementQuestions } from "../queries";
import { AccessRefusal } from "./access-refusal";

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function QuestionInbox({
  requirementId,
  supportAction,
  open: controlledOpen,
  onOpenChange,
  showFab = true,
}: {
  requirementId: string;
  supportAction?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  showFab?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : internalOpen;
  const setIsOpen = (next: boolean) => {
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  };

  const query = useRequirementQuestions(requirementId);
  const answer = useAnswerQuestion();
  const [draftAnswer, setDraftAnswer] = useState("");
  const allQuestions = (query.data?.questions ?? []).map(toQuestionView);
  const waiting = allQuestions.filter((question) => question.askedByRole === "VENDOR" && question.answer === null);
  const activeQuestionToAnswer = waiting.length > 0 ? waiting[0] : null;

  return (
    <>
      {showFab && allQuestions.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open chat with professional"
          onPress={() => setIsOpen(true)}
          className="absolute bottom-20 right-4 z-30 size-12 items-center justify-center rounded-full bg-action shadow-lg"
        >
          <Text className="text-lg text-white">💬</Text>
          {waiting.length > 0 ? (
            <View className="absolute -right-1 -top-1 h-5 min-w-5 items-center justify-center rounded-full bg-signal-500 px-1.5">
              <Text className="text-[11px] font-extrabold text-white">{waiting.length}</Text>
            </View>
          ) : null}
        </Pressable>
      ) : null}

      <Modal visible={isOpen} animationType="slide" onRequestClose={() => setIsOpen(false)}>
        <View className="flex-1 bg-[#F4F6F8]" style={{ paddingTop: insets.top }}>
          <View className="h-16 flex-row items-center justify-between border-b border-line bg-surface px-4">
            <View className="min-w-0 flex-1 flex-row items-center gap-3">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Back to request"
                onPress={() => setIsOpen(false)}
                className="size-10 items-center justify-center rounded-full"
              >
                <Text className="text-lg text-text-secondary">←</Text>
              </Pressable>
              <View className="size-10 items-center justify-center rounded-full bg-navy-900">
                <Text className="text-sm font-bold text-white">P</Text>
              </View>
              <View className="min-w-0 flex-1">
                <Text numberOfLines={1} className="text-base font-bold leading-tight text-navy-900">
                  Service Professional
                </Text>
                <Text numberOfLines={1} className="text-xs font-medium text-text-muted">
                  Questions & Clarifications
                </Text>
              </View>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close chat"
              hitSlop={8}
              onPress={() => setIsOpen(false)}
              className="size-9 items-center justify-center rounded-full"
            >
              <Text className="text-lg text-text-muted">×</Text>
            </Pressable>
          </View>

          <View className="flex-row items-center justify-center gap-1.5 border-b border-line/60 bg-navy-900/5 px-4 py-2">
            <Text className="text-center text-xs text-text-secondary">
              Keep details to the work. Direct phone numbers unlock once booked.
            </Text>
          </View>

          <AccessRefusal error={answer.error} attempting="send that answer" supportAction={supportAction} />

          <ScrollView className="flex-1" contentContainerClassName="gap-4 p-4">
            <View className="items-center">
              <Text className="rounded-full bg-black/5 px-3 py-1 text-[11px] font-semibold text-text-muted">
                Questions & Clarifications
              </Text>
            </View>
            {allQuestions.length === 0 ? (
              <View className="h-56 items-center justify-center px-6">
                <Text className="text-sm font-bold text-navy-900">No questions yet</Text>
                <Text className="mt-1 text-center text-xs leading-relaxed text-text-secondary">
                  Have questions regarding site access, materials, or requirements? Messages from professionals will appear here.
                </Text>
              </View>
            ) : (
              allQuestions.map((row) => {
                const isPro = row.askedByRole === "VENDOR" || row.askedByRole === "OPERATIONS";
                return (
                  <View key={row.id} className="gap-2">
                    <ChatBubble side={isPro ? "theirs" : "mine"} at={row.askedAt}>
                      {row.question}
                    </ChatBubble>
                    {row.answer !== null && row.answer.trim() !== "" ? (
                      <ChatBubble side={isPro ? "mine" : "theirs"} at={row.answeredAt ?? row.askedAt}>
                        {row.answer}
                      </ChatBubble>
                    ) : isPro ? (
                      <Text className="pl-2 text-left text-[11px] font-medium text-warning-text">
                        Waiting for your reply below…
                      </Text>
                    ) : null}
                  </View>
                );
              })
            )}
          </ScrollView>

          {activeQuestionToAnswer ? (
            <InboxComposer
              draft={draftAnswer}
              onChange={setDraftAnswer}
              pending={answer.isPending}
              bottom={insets.bottom}
              onSend={() => {
                if (draftAnswer.trim() === "" || answer.isPending || activeQuestionToAnswer === null) return;
                answer.mutate(
                  { requirementId, questionId: activeQuestionToAnswer.id, answer: draftAnswer.trim() },
                  { onSuccess: () => setDraftAnswer("") },
                );
              }}
            />
          ) : (
            <View className="border-t border-line bg-surface p-3.5" style={{ paddingBottom: Math.max(16, insets.bottom) }}>
              <Text className="text-center text-xs text-text-muted">All questions have been answered.</Text>
            </View>
          )}
        </View>
      </Modal>
    </>
  );
}

function InboxComposer({
  draft,
  onChange,
  pending,
  bottom,
  onSend,
}: {
  draft: string;
  onChange: (value: string) => void;
  pending: boolean;
  bottom: number;
  onSend: () => void;
}) {
  return (
    <View className="border-t border-line bg-white px-3.5 pt-2.5" style={{ paddingBottom: Math.max(20, bottom + 12) }}>
      <View className="mb-1.5 flex-row items-center justify-between px-1">
        <Text className="text-[11px] font-medium text-text-muted">Replying to professional</Text>
        <Text className="text-[11px] font-medium text-text-muted">Max 2000 chars</Text>
      </View>
      <View className="flex-row items-center gap-2">
        <View className="flex-1">
          <Textarea
            value={draft}
            onChangeText={onChange}
            maxLength={2000}
            placeholder="Type your answer to the professional…"
            editable={!pending}
            className="min-h-[44px] rounded-[22px] border border-line bg-[#F8F9FA] px-4 py-2.5 text-sm text-navy-900"
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send reply"
          disabled={draft.trim() === "" || pending}
          onPress={onSend}
          className={cn(
            "size-11 items-center justify-center rounded-full bg-navy-900",
            draft.trim() === "" || pending ? "opacity-40" : "",
          )}
        >
          <Text className="text-sm font-bold text-white">Send</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ChatBubble({ side, at, children }: { side: "mine" | "theirs"; at: string; children: string }) {
  const isMine = side === "mine";
  return (
    <View className={cn("gap-1", isMine ? "items-end" : "items-start")}>
      <View
        className={cn(
          "max-w-[84%] rounded-2xl px-4 py-2.5",
          isMine ? "rounded-br-sm bg-navy-900" : "rounded-bl-sm border border-line/80 bg-white",
        )}
      >
        <Text className={cn("text-sm leading-relaxed", isMine ? "text-white" : "text-navy-900")}>{children}</Text>
        <Text className={cn("mt-1 text-right text-[10px]", isMine ? "text-navy-200" : "text-text-muted")}>{when(at)}</Text>
      </View>
    </View>
  );
}
