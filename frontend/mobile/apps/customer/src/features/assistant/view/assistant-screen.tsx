// Ported from frontend/apps/customer/features/assistant/view/assistant-widget.tsx
import { describeError } from "@vsolve/query/native";
import { Logo, Text } from "@vsolve/mobile-ui";
import { type Href, useFocusEffect, useRouter } from "expo-router";
import { Check, Pencil, Send, SquarePen, Trash2, X } from "lucide-react-native";
import { type ComponentRef, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  useAssistantChat,
  useConversation,
  useSendMessage,
  useStartConversation,
  type AssistantAction,
  type AssistantMessage,
} from "../queries";
import { WelcomeHero } from "./welcome-hero";

/**
 * The booking assistant. It books through the same commands as the booking flow
 * and pays through the same booking screen: a Pay card here opens `/bookings/{id}`,
 * never a second payment surface.
 */

const MAX_MESSAGE_LENGTH = 1000;
/** `create_session` in backend/apps/assistant/services.py writes the greeting first. */
const OPENING_GREETING_SEQUENCE = 1;
const KEYBOARD_OPEN_DELAY_MS = 300;

export function AssistantScreen() {
  const insets = useSafeAreaInsets();
  const { token, loaded, hidden, open, reset, hideMessages } = useAssistantChat();
  const start = useStartConversation(open);
  // A conversation the server no longer knows is left behind, and a fresh one starts.
  const conversation = useConversation(token, reset);
  const send = useSendMessage(token);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const listRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);

  // Opening the chat opens the keyboard, every time the screen comes into view. The short wait
  // lets the screen finish arriving; Android can drop a focus asked for mid-transition.
  useFocusEffect(
    useCallback(() => {
      const timer = setTimeout(() => inputRef.current?.focus(), KEYBOARD_OPEN_DELAY_MS);
      return () => clearTimeout(timer);
    }, []),
  );

  const startConversation = start.mutate;
  const needsConversation = loaded && token === null && !start.isPending && !start.isError;
  useEffect(() => {
    if (needsConversation) startConversation();
  }, [needsConversation, startConversation]);

  // The server opens every conversation with a greeting as message #1; the app's own welcome
  // block replaces it, so that one message is not shown. Messages edited or deleted on this
  // phone are not shown either. Every other message is.
  const hiddenHere = new Set(hidden);
  const messages = (conversation.data?.messages ?? []).filter(
    (message) =>
      !hiddenHere.has(message.sequence) &&
      !(message.sequence === OPENING_GREETING_SEQUENCE && message.sender === "assistant"),
  );
  const answering = send.isPending || Boolean(conversation.data?.is_answering);
  const hasCustomerMessage = pending !== null || messages.some((message) => message.sender === "customer");

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

  // A chat nobody has written in is already a new chat: do not replace it with another.
  const startNewChat = () => {
    if (token && hasCustomerMessage) reset();
  };

  // A failed start leaves no token, so Send stays off until it runs again; a failed read just re-reads.
  const retry = () => {
    if (start.isError) start.reset();
    else void conversation.refetch();
  };

  const lastAssistantSequence = [...messages].reverse().find((m) => m.sender === "assistant")
    ?.sequence;
  const error = start.error ?? send.error ?? conversation.error;

  /*
   * Edit and delete, on the customer's latest message only, and only while no answer is being
   * written, so neither can contradict a step the assistant has already taken. The server keeps
   * every message, so both work by hiding on this phone: that message and the replies after it.
   * An edit then sends the new text as a fresh message, so it reads as replaced.
   */
  const lastCustomerMessage = [...messages].reverse().find((m) => m.sender === "customer");
  const canEdit = Boolean(token) && !answering && pending === null;

  const hideFrom = (sequence: number) => {
    if (!token) return;
    hideMessages(messages.filter((m) => m.sequence >= sequence).map((m) => m.sequence));
  };
  const saveEdit = (sequence: number, text: string) => {
    hideFrom(sequence);
    sendText(text);
  };

  return (
    <KeyboardAvoidingView
      // Android draws edge to edge, so the window does not resize for the keyboard: pad on both.
      behavior="padding"
      className="flex-1 bg-white"
    >
      <View
        style={{ paddingTop: Math.max(insets.top, 24) + 10 }}
        className="flex-row items-center justify-between gap-3 border-b border-line bg-[#FAF9F7] px-4 pb-3"
      >
        <Logo className="flex-1" />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="New chat"
          hitSlop={8}
          onPress={startNewChat}
          className="min-h-11 min-w-11 items-center justify-center rounded-full active:bg-slate-100"
        >
          <SquarePen size={21} color="#1E293B" />
        </Pressable>
      </View>

      <ScrollView
        ref={listRef}
        className="flex-1"
        contentContainerClassName="gap-3 px-4 py-4"
        keyboardShouldPersistTaps="handled"
      >
        {/* Always at the top of the chat, so the starter chips stay one tap away. */}
        <WelcomeHero
          key={token ?? "new"}
          disabled={!token || send.isPending}
          onPick={(categoryName) => sendText(`I need ${categoryName}`)}
        />
        {messages.map((message) =>
          canEdit && message.sequence === lastCustomerMessage?.sequence ? (
            <OwnMessage
              key={`${token}-${message.sequence}`}
              text={message.text}
              onSave={(text) => saveEdit(message.sequence, text)}
              onDelete={() => hideFrom(message.sequence)}
            />
          ) : (
            <MessageBubble
              key={message.sequence}
              message={message}
              interactive={message.sequence === lastAssistantSequence && !answering}
              onSend={sendText}
            />
          ),
        )}
        {pending ? <Bubble sender="customer" text={pending} muted /> : null}
        {answering ? <ReplyingDots /> : null}
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
          ref={inputRef}
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

/** An assistant-side bubble with three pulsing dots, shown while an answer is on its way. */
function ReplyingDots() {
  const [pulses] = useState(() => [0, 1, 2].map(() => new Animated.Value(0.3)));

  useEffect(() => {
    const loops = pulses.map((pulse, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * 160),
          Animated.timing(pulse, { toValue: 1, duration: 360, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 0.3, duration: 360, useNativeDriver: true }),
          Animated.delay((2 - index) * 160),
        ]),
      ),
    );
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [pulses]);

  return (
    <View
      accessible
      accessibilityLabel="The assistant is replying"
      accessibilityLiveRegion="polite"
      className="items-start"
    >
      <View className="flex-row items-center gap-1 rounded-2xl bg-slate-100 px-3 py-2.5">
        {pulses.map((pulse, index) => (
          <Animated.View key={index} style={{ opacity: pulse }} className="size-1.5 rounded-full bg-slate-500" />
        ))}
      </View>
    </View>
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

/** A round icon button for the message tools. */
function IconAction({
  label,
  onPress,
  disabled,
  children,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      className={`min-h-11 min-w-11 items-center justify-center rounded-full active:bg-slate-200 ${
        disabled ? "opacity-40" : ""
      }`}
    >
      {children}
    </Pressable>
  );
}

/**
 * The customer's latest message. Tapping it shows an edit and a delete icon; editing turns the
 * bubble itself into a text box with cancel and send icons. Its state lives here, so it resets
 * by itself when the message stops being the editable one (a new message, another chat).
 */
function OwnMessage({
  text,
  onSave,
  onDelete,
}: {
  text: string;
  onSave: (text: string) => void;
  onDelete: () => void;
}) {
  const [mode, setMode] = useState<"idle" | "tools" | "editing">("idle");
  const [value, setValue] = useState(text);

  if (mode === "editing") {
    const edited = value.trim().slice(0, MAX_MESSAGE_LENGTH);
    return (
      <View className="items-end">
        <View className="w-[85%] rounded-2xl bg-[#00112e] px-3 py-1">
          <TextInput
            value={value}
            onChangeText={setValue}
            multiline
            autoFocus
            maxLength={MAX_MESSAGE_LENGTH}
            accessibilityLabel="Edit your message"
            className="max-h-40 min-h-11 text-sm text-white"
          />
        </View>
        <View className="flex-row">
          <IconAction
            label="Cancel edit"
            onPress={() => {
              setValue(text);
              setMode("idle");
            }}
          >
            <X size={18} color="#475569" />
          </IconAction>
          <IconAction
            label="Send edited message"
            disabled={!edited}
            onPress={() => {
              // Nothing changed: there is nothing new to send.
              if (edited === text.trim()) setMode("idle");
              else onSave(edited);
            }}
          >
            <Check size={18} color="#00112e" />
          </IconAction>
        </View>
      </View>
    );
  }

  return (
    <View className="items-end">
      <Pressable
        accessibilityRole="button"
        accessibilityHint="Shows edit and delete"
        onPress={() => setMode(mode === "tools" ? "idle" : "tools")}
        className="max-w-[85%] rounded-2xl bg-[#00112e] px-3 py-2 active:opacity-80"
      >
        <Text className="text-sm text-white">{text}</Text>
      </Pressable>
      {mode === "tools" ? (
        <View className="flex-row">
          <IconAction label="Edit message" onPress={() => setMode("editing")}>
            <Pencil size={17} color="#475569" />
          </IconAction>
          <IconAction label="Delete message" onPress={onDelete}>
            <Trash2 size={17} color="#DC2626" />
          </IconAction>
        </View>
      ) : null}
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
