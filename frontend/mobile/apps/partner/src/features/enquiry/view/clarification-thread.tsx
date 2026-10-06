// Ported from frontend/apps/partner/features/enquiry/view/clarification-thread.tsx
import { describeError } from "@vsolve/query/native";
import { Button, ErrorState, Text, cn } from "@vsolve/mobile-ui";
import { ArrowLeft, CheckCheck, Lock, MessageCircle, Send, User, X } from "lucide-react-native";
import { useState } from "react";
import { Modal, Pressable, ScrollView, TextInput, View } from "react-native";

import type { EnquiryRecord } from "../model/wire";
import { useAnswerQuestion, useAskQuestion } from "../queries";

const MAX_OPEN = 3;

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export interface ClarificationThreadProps {
  readonly enquiry: EnquiryRecord;
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
}

export function ClarificationThread({ enquiry, open, onOpenChange }: ClarificationThreadProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isOpen = open ?? uncontrolledOpen;
  const setIsOpen = (next: boolean) => {
    setUncontrolledOpen(next);
    onOpenChange?.(next);
  };
  const ask = useAskQuestion(enquiry.id);
  const answer = useAnswerQuestion(enquiry.id);
  const [draft, setDraft] = useState("");
  const closed = enquiry.status === "DECLINED" || enquiry.status === "EXPIRED" || enquiry.status === "WITHDRAWN";
  const openMine = enquiry.questions.filter((row) => row.asked_by_role === "VENDOR" && row.answered_at === null).length;
  const left = Math.max(0, MAX_OPEN - openMine);
  const failure = ask.error ?? answer.error;

  function send() {
    if (draft.trim() === "" || left === 0 || ask.isPending) return;
    ask.mutate({ question: draft.trim() }, { onSuccess: () => setDraft("") });
  }

  return (
    <Modal visible={isOpen} animationType="slide" onRequestClose={() => setIsOpen(false)}>
      <View className="flex-1 bg-canvas">
        <View className="h-16 flex-row items-center justify-between border-b border-line bg-surface px-4">
          <View className="min-w-0 flex-1 flex-row items-center gap-3">
            <Pressable accessibilityRole="button" accessibilityLabel="Back to enquiry" onPress={() => setIsOpen(false)} className="h-10 w-10 items-center justify-center rounded-full">
              <ArrowLeft size={20} color="#453f37" />
            </Pressable>
            <View className="h-10 w-10 items-center justify-center rounded-full bg-navy-900">
              <User size={20} color="#ffffff" />
            </View>
            <View className="min-w-0 flex-1">
              <Text numberOfLines={1} className="text-base font-bold leading-tight text-navy-900">Customer</Text>
              <Text numberOfLines={1} className="text-xs font-medium text-text-muted">{enquiry.serviceName ? enquiry.serviceName : "Project Enquiry"}</Text>
            </View>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close chat" onPress={() => setIsOpen(false)} className="h-9 w-9 items-center justify-center rounded-full">
            <X size={20} color="#756c5e" />
          </Pressable>
        </View>
        <View className="flex-row items-center justify-center gap-1.5 border-b border-line bg-navy-900/5 px-4 py-2">
          <Lock size={14} color="#756c5e" />
          <Text className="text-center text-xs text-text-secondary">Keep details to the work. Direct phone numbers unlock once booked.</Text>
        </View>
        {failure ? (
          <View className="shrink-0 p-4">
            <ErrorState inline title={describeError(failure, "mutation").title} message={describeError(failure, "mutation").message} severity="error" />
          </View>
        ) : null}
        <ScrollView className="flex-1" contentContainerClassName="gap-4 p-4">
          <View className="items-center">
            <Text className="rounded-full bg-black/5 px-3 py-1 text-[11px] font-semibold text-text-muted">Questions & Clarifications</Text>
          </View>
          {enquiry.questions.length === 0 ? (
            <View className="h-56 items-center justify-center px-6">
              <View className="mb-3 h-12 w-12 items-center justify-center rounded-full bg-navy-100">
                <MessageCircle size={24} color="#00246b" />
              </View>
              <Text className="text-sm font-bold text-navy-900">No questions yet</Text>
              <Text className="mt-1 max-w-xs text-center text-xs leading-relaxed text-text-secondary">
                Have questions regarding site access, materials, or requirements? Send a message below to clarify with the customer.
              </Text>
            </View>
          ) : (
            enquiry.questions.map((row) => {
              const mine = row.asked_by_role === "VENDOR";
              return (
                <View key={row.id} className="flex-col gap-2">
                  <ChatBubble side={mine ? "mine" : "theirs"} at={row.asked_at}>{row.question}</ChatBubble>
                  {row.answered_at !== null && row.answer.trim() !== "" ? (
                    <ChatBubble side={mine ? "theirs" : "mine"} at={row.answered_at}>{row.answer}</ChatBubble>
                  ) : row.asked_by_role === "CUSTOMER" ? (
                    <View className="ml-2 max-w-[92%] rounded-2xl border border-line bg-white p-3.5">
                      <Text className="text-xs font-bold uppercase tracking-wide text-signal-700">Customer is waiting for your reply</Text>
                      <AnswerBox onAnswer={(text) => answer.mutate({ questionId: row.id, answer: text })} pending={answer.isPending} />
                    </View>
                  ) : (
                    <Text className="pr-2 text-right text-[11px] font-medium text-text-muted">Waiting for customer reply…</Text>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>
        {closed ? (
          <View className="border-t border-line bg-surface p-4">
            <Text className="text-center text-xs text-text-muted">This enquiry is closed. Messaging is no longer available.</Text>
          </View>
        ) : (
          <View className="border-t border-line bg-white px-3.5 pb-5 pt-2.5">
            <View className="mb-1.5 flex-row items-center justify-between px-1">
              <Text className="text-[11px] font-medium text-text-muted">{left === 0 ? "Wait for reply before asking another" : `${left} open question${left === 1 ? "" : "s"} allowed`}</Text>
              <Text className="text-[11px] font-medium text-text-muted">Max 2000 chars</Text>
            </View>
            <View className="flex-row items-center gap-2">
              <TextInput
                multiline
                maxLength={2000}
                placeholder="Type a message to the customer…"
                placeholderTextColor="#756c5e"
                value={draft}
                onChangeText={setDraft}
                editable={!(left === 0 || ask.isPending)}
                className="min-h-[44px] flex-1 rounded-[22px] border border-line bg-surface-sunken px-4 py-2.5 text-sm leading-5 text-navy-900"
              />
              <Pressable accessibilityRole="button" accessibilityLabel="Send message" disabled={draft.trim() === "" || left === 0 || ask.isPending} onPress={send} className="h-11 w-11 items-center justify-center rounded-full bg-navy-900 disabled:opacity-40">
                <Send size={20} color="#ffffff" />
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

function ChatBubble({ side, at, children }: { side: "mine" | "theirs"; at: string; children: string }) {
  const isMine = side === "mine";
  return (
    <View className={cn("flex-col gap-1", isMine ? "items-end" : "items-start")}>
      <View className={cn("max-w-[84%] rounded-2xl px-4 py-2.5", isMine ? "rounded-br-xs bg-navy-900" : "rounded-bl-xs border border-line/80 bg-white")}>
        <Text className={isMine ? "text-sm leading-relaxed text-white" : "text-sm leading-relaxed text-navy-900"}>{children}</Text>
        <View className="mt-1 flex-row items-center justify-end gap-1">
          <Text className={isMine ? "text-[10px] text-navy-200" : "text-[10px] text-text-muted"}>{when(at)}</Text>
          {isMine ? <CheckCheck size={12} color="#7dd3fc" /> : null}
        </View>
      </View>
    </View>
  );
}

function AnswerBox({ onAnswer, pending }: { onAnswer: (text: string) => void; pending: boolean }) {
  const [text, setText] = useState("");
  return (
    <View className="mt-2 flex-col gap-2">
      <TextInput
        multiline
        maxLength={2000}
        placeholder="Type your answer here…"
        placeholderTextColor="#756c5e"
        value={text}
        onChangeText={setText}
        editable={!pending}
        className="min-h-11 w-full rounded-xl border border-line bg-white p-2.5 text-sm text-navy-900"
      />
      <View className="items-end">
        <Button size="sm" disabled={text.trim() === ""} loading={pending} loadingLabel="Sending" onPress={() => { onAnswer(text.trim()); setText(""); }}>Send reply</Button>
      </View>
    </View>
  );
}
