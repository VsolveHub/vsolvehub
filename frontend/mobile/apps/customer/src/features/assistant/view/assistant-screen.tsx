// Ported from frontend/apps/customer/features/assistant/view/assistant-widget.tsx
import { describeError } from "@vsolve/query/native";
import { Spinner, Text } from "@vsolve/mobile-ui";
import { type Href, useRouter } from "expo-router";
import { Send } from "lucide-react-native";
import { type ComponentRef, useCallback, useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  useAssistantToken,
  useConversation,
  useSendMessage,
  useStartConversation,
  type AssistantAction,
  type AssistantMessage,
} from "../queries";

/**
 * The booking assistant. It books through the same commands as the booking flow
 * and pays through the same booking screen: a Pay card here opens `/bookings/{id}`,
 * never a second payment surface.
 */

const MAX_MESSAGE_LENGTH = 1000;

export function AssistantScreen() {
  const insets = useSafeAreaInsets();
  const { token, loaded, save: saveToken } = useAssistantToken();
  const start = useStartConversation(saveToken);
  const forget = useCallback(() => saveToken(null), [saveToken]);
  const conversation = useConversation(token, forget);
  const send = useSendMessage(token);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const listRef = useRef<ComponentRef<typeof ScrollView>>(null);

  const startConversation = start.mutate;
  const needsConversation = loaded && token === null && !start.isPending && !start.isError;
  useEffect(() => {
    if (needsConversation) startConversation();
  }, [needsConversation, startConversation]);

  const messages = conversation.data?.messages ?? [];
  const answering = send.isPending || Boolean(conversation.data?.is_answering);

  useEffect(() => {
    listRef.current?.scrollToEnd({ animated: true });
  }, [messages.length, pending]);

  const sendText = useCallback(
    (text: string) => {
      const trimmed = text.trim().slice(0, MAX_MESSAGE_LENGTH);
      if (!trimmed || !token || send.isPending) return;
      setPending(trimmed);
      setDraft("");
      send.mutate(trimmed, { onSettled: () => setPending(null) });
    },
    [send, token],
  );

  // A failed start leaves no token, so Send stays off until it runs again; a failed read just re-reads.
  const retry = () => {
    if (start.isError) start.reset();
    else void conversation.refetch();
  };

  const lastAssistantSequence = [...messages].reverse().find((m) => m.sender === "assistant")
    ?.sequence;
  const error = start.error ?? send.error ?? conversation.error;

  return (
    <KeyboardAvoidingView
      // Android draws edge to edge, so the window does not resize for the keyboard: pad on both.
      behavior="padding"
      className="flex-1 bg-white"
    >
      <View
        style={{ paddingTop: Math.max(insets.top, 24) + 10 }}
        className="border-b border-line bg-[#FAF9F7] px-4 pb-3"
      >
        <Text className="text-sm font-semibold text-navy-900">Booking assistant</Text>
        <Text className="text-xs text-[#6B6560]">Tell me what you need done at home</Text>
      </View>

      <ScrollView
        ref={listRef}
        className="flex-1"
        contentContainerClassName="gap-3 px-4 py-4"
        keyboardShouldPersistTaps="handled"
      >
        {messages.map((message) => (
          <MessageBubble
            key={message.sequence}
            message={message}
            interactive={message.sequence === lastAssistantSequence && !answering}
            onSend={sendText}
          />
        ))}
        {pending ? <Bubble sender="customer" text={pending} muted /> : null}
        {answering ? (
          <View className="flex-row items-center gap-2">
            <Spinner size="sm" />
            <Text className="text-xs text-slate-500">Typing…</Text>
          </View>
        ) : null}
        {error && !answering ? (
          <View accessibilityRole="alert" className="gap-2 rounded-lg bg-red-50 px-3 py-2">
            <Text className="text-xs text-red-700">{describeError(error, "mutation").message}</Text>
            {start.isError || conversation.isError ? (
              <Pressable
                accessibilityRole="button"
                onPress={retry}
                className="min-h-11 items-center justify-center self-start rounded-full border border-red-300 px-4"
              >
                <Text className="text-xs font-semibold text-red-700">Try again</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      <View className="flex-row items-end gap-2 border-t border-slate-200 p-3">
        <TextInput
          value={draft}
          onChangeText={setDraft}
          multiline
          maxLength={MAX_MESSAGE_LENGTH}
          placeholder="e.g. AC not cooling, tomorrow evening"
          placeholderTextColor="#94A3B8"
          accessibilityLabel="Your message"
          className="max-h-28 min-h-11 flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send"
          disabled={!draft.trim() || !token || send.isPending}
          onPress={() => sendText(draft)}
          className={`min-h-11 min-w-11 items-center justify-center rounded-xl bg-[#00112e] ${
            !draft.trim() || !token || send.isPending ? "opacity-40" : ""
          }`}
        >
          <Send size={16} color="#FFFFFF" />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function Bubble({ sender, text, muted }: { sender: string; text: string; muted?: boolean }) {
  const mine = sender === "customer";
  return (
    <View className={mine ? "items-end" : "items-start"}>
      <View
        className={`max-w-[85%] rounded-2xl px-3 py-2 ${mine ? "bg-[#00112e]" : "bg-slate-100"} ${
          muted ? "opacity-60" : ""
        }`}
      >
        <Text className={`text-sm ${mine ? "text-white" : "text-slate-900"}`}>{text}</Text>
      </View>
    </View>
  );
}

function MessageBubble({
  message,
  interactive,
  onSend,
}: {
  message: AssistantMessage;
  interactive: boolean;
  onSend: (text: string) => void;
}) {
  return (
    <View className="gap-2">
      <Bubble sender={message.sender} text={message.text} />
      {message.actions.length ? (
        <View className="flex-row flex-wrap gap-2">
          {message.actions.map((action, index) => (
            <ActionCard
              key={`${action.action_type}-${index}`}
              action={action}
              interactive={interactive}
              onSend={onSend}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const LINK_CLASS = "rounded-full border border-[#00112e] px-3 py-1.5";

function ActionCard({
  action,
  interactive,
  onSend,
}: {
  action: AssistantAction;
  interactive: boolean;
  onSend: (text: string) => void;
}) {
  const router = useRouter();

  switch (action.action_type) {
    case "QUICK_REPLY":
      // An old reply chip answers a question that has moved on; only the latest are live.
      return interactive ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => onSend(action.message ?? action.label)}
          className="rounded-full bg-slate-100 px-3 py-1.5 active:bg-slate-200"
        >
          <Text className="text-xs font-medium text-slate-800">{action.label}</Text>
        </Pressable>
      ) : null;
    case "QUOTE":
      return (
        <View className="w-full rounded-xl border border-slate-200 p-3">
          <Text className="text-base font-semibold text-slate-900">Total {action.amount}</Text>
          <View className="mt-1 gap-0.5">
            {(action.lines ?? []).map((line) => (
              <Text key={line} className="text-xs text-slate-600">
                {line}
              </Text>
            ))}
          </View>
          {interactive ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => onSend(action.message ?? action.label)}
              className="mt-3 w-full items-center rounded-lg bg-[#00112e] py-2"
            >
              <Text className="text-sm font-semibold text-white">{action.label}</Text>
            </Pressable>
          ) : null}
        </View>
      );
    case "PAY":
      return (
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push((action.href ?? "/bookings") as Href)}
          className="w-full items-center rounded-lg bg-emerald-600 py-2"
        >
          <Text className="text-sm font-semibold text-white">{action.label}</Text>
        </Pressable>
      );
    case "LOGIN":
      return (
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push("/login" as Href)}
          className={LINK_CLASS}
        >
          <Text className="text-xs font-semibold text-[#00112e]">{action.label}</Text>
        </Pressable>
      );
    default:
      return (
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push((action.href ?? "/") as Href)}
          className={LINK_CLASS}
        >
          <Text className="text-xs font-semibold text-[#00112e]">{action.label}</Text>
        </Pressable>
      );
  }
}
