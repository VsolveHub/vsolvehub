// Ported from frontend/apps/customer/features/assistant/view/assistant-widget.tsx
import { describeError } from "@vsolve/query/native";
import { Logo, Text } from "@vsolve/mobile-ui";
import { type Href, useFocusEffect, usePathname, useRouter } from "expo-router";
import { Check, Pencil, Send, SquarePen, Trash2, Volume2, VolumeX, X } from "lucide-react-native";
import {
  type ComponentRef,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SUPPORT } from "@/lib/support";

import {
  emitAssistantSync,
  filterVisibleAssistantMessages,
  readSoundMuted,
  writeSeenSequence,
  writeSoundMuted,
} from "../alerts";
import {
  useAssistantChat,
  useConversation,
  useSendMessage,
  useStartConversation,
  type AssistantAction,
  type AssistantMessage,
} from "../queries";
import { HelperBot, WelcomeHero } from "./welcome-hero";

/**
 * The booking assistant. It books through the same commands as the booking flow
 * and pays through the same booking screen: a Pay card here opens `/bookings/{id}`,
 * never a second payment surface.
 */

const MAX_MESSAGE_LENGTH = 1000;
const KEYBOARD_OPEN_DELAY_MS = 300;

/**
 * Height of the on-screen keyboard (0 when hidden). The pop-up sheet uses it to sit on top of the
 * keyboard: a KeyboardAvoidingView inside a transformed, fixed-height sheet measures the wrong
 * frame, so the keyboard covered the message box.
 */
function useKeyboardHeight(): number {
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const show = Keyboard.addListener(showEvent, (event) => setKeyboardHeight(event.endCoordinates.height));
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return keyboardHeight;
}

export function AssistantScreen({
  variant = "screen",
  onClose,
}: {
  variant?: "screen" | "popup";
  onClose?: () => void;
} = {}) {
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const { token, loaded, hidden, open, reset, hideMessages } = useAssistantChat();
  const start = useStartConversation(open);
  // A conversation the server no longer knows is left behind, and a fresh one starts.
  const conversation = useConversation(token, reset);
  const send = useSendMessage(token);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const listRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);

  useEffect(() => {
    let active = true;
    void readSoundMuted().then((storedMuted) => {
      if (active) setMuted(storedMuted);
    });
    return () => {
      active = false;
    };
  }, []);

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
  const messages = useMemo(
    () => filterVisibleAssistantMessages(conversation.data?.messages, hidden),
    [conversation.data?.messages, hidden],
  );
  const answering = send.isPending || Boolean(conversation.data?.is_answering);
  const hasCustomerMessage = pending !== null || messages.some((message) => message.sender === "customer");
  const latestSequence = useMemo(
    () => messages.reduce((highest, msg) => Math.max(highest, msg.sequence), 0),
    [messages],
  );
  const lastSyncedRef = useRef<{ token: string; sequence: number } | null>(null);

  useEffect(() => {
    if (!token) return;
    if (lastSyncedRef.current?.token !== token) {
      lastSyncedRef.current = { token, sequence: latestSequence };
      if (latestSequence > 0) {
        void writeSeenSequence(token, latestSequence).then(() => emitAssistantSync());
      } else {
        emitAssistantSync();
      }
      return;
    }
    if (latestSequence > 0 && lastSyncedRef.current.sequence < latestSequence) {
      lastSyncedRef.current = { token, sequence: latestSequence };
      void writeSeenSequence(token, latestSequence).then(() => emitAssistantSync());
    }
  }, [latestSequence, token]);

  useEffect(() => {
    listRef.current?.scrollToEnd({ animated: true });
  }, [messages.length, pending, answering]);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      void writeSoundMuted(next).then(() => emitAssistantSync());
      return next;
    });
  }, []);

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
      // The pop-up sheet lifts itself above the keyboard (see AssistantPopup), so only the
      // full-screen route pads here; doing both would leave a gap the height of the keyboard.
      behavior={variant === "popup" ? undefined : "padding"}
      enabled={variant !== "popup"}
      className="flex-1 bg-white"
    >
      {variant === "popup" ? (
        <View className="flex-row items-center justify-between gap-2 rounded-t-2xl bg-[#00112e] px-4 py-3">
          <View className="min-w-0 flex-1">
            <Text className="text-sm font-semibold text-white">Booking assistant</Text>
            <Text numberOfLines={1} className="text-xs text-white/70">
              Tell me what you need done at home
            </Text>
          </View>
          <View className="flex-row items-center gap-0.5">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={muted ? "Unmute reply alerts" : "Mute reply alerts"}
              hitSlop={8}
              onPress={toggleMute}
              className="min-h-10 min-w-10 items-center justify-center rounded-lg active:bg-white/10"
            >
              {muted ? <VolumeX size={18} color="#FFFFFF" /> : <Volume2 size={18} color="#FFFFFF" />}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="New chat"
              hitSlop={8}
              onPress={startNewChat}
              className="min-h-10 min-w-10 items-center justify-center rounded-lg active:bg-white/10"
            >
              <SquarePen size={18} color="#FFFFFF" />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close the assistant"
              hitSlop={8}
              onPress={onClose}
              className="min-h-10 min-w-10 items-center justify-center rounded-lg active:bg-white/10"
            >
              <X size={20} color="#FFFFFF" />
            </Pressable>
          </View>
        </View>
      ) : (
        <View
          style={{ paddingTop: Math.max(insets.top, 24) + 10 }}
          className="flex-row items-center justify-between gap-3 border-b border-line bg-[#FAF9F7] px-4 pb-3"
        >
          <Logo className="flex-1" />
          <View className="flex-row items-center gap-1">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={muted ? "Unmute reply alerts" : "Mute reply alerts"}
              hitSlop={8}
              onPress={toggleMute}
              className="min-h-11 min-w-11 items-center justify-center rounded-full active:bg-slate-100"
            >
              {muted ? <VolumeX size={20} color="#64748B" /> : <Volume2 size={20} color="#1E293B" />}
            </Pressable>
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
        </View>
      )}

      <ScrollView
        ref={listRef}
        className="flex-1"
        contentContainerClassName="gap-3 px-4 py-4"
        contentContainerStyle={{ alignItems: "stretch" }}
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
              onNavigate={onClose}
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

      <View
        style={
          variant === "popup"
            ? { paddingBottom: keyboardHeight > 0 ? 10 : Math.max(12, insets.bottom) }
            : undefined
        }
        className="flex-row items-end gap-2 border-t border-slate-100 bg-white px-3 pt-2.5"
      >
        <TextInput
          ref={inputRef}
          value={draft}
          onChangeText={setDraft}
          multiline
          maxLength={MAX_MESSAGE_LENGTH}
          placeholder="e.g. AC not cooling, tomorrow evening"
          placeholderTextColor="#94A3B8"
          accessibilityLabel="Your message"
          textAlignVertical="center"
          className="max-h-28 min-h-11 flex-1 rounded-2xl border border-slate-200 bg-[#F8F7F5] px-4 py-2.5 text-sm text-slate-900"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send"
          disabled={!draft.trim() || !token || send.isPending}
          onPress={() => sendText(draft)}
          className={`size-11 items-center justify-center rounded-full bg-[#EA580C] ${
            !draft.trim() || !token || send.isPending ? "opacity-40" : ""
          }`}
        >
          <Send size={16} color="#FFFFFF" />
        </Pressable>
      </View>

    </KeyboardAvoidingView>
  );
}

/** Smooth entrance animation (fade + slight rise) matching the web chat bubble motion. */
function AnimatedMessageEntry({ children }: { children: ReactNode }) {
  const [entrance] = useState(() => new Animated.Value(0));

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduceMotion) => {
      if (!active) return;
      if (reduceMotion) {
        entrance.setValue(1);
        return;
      }
      Animated.timing(entrance, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    });
    return () => {
      active = false;
    };
  }, [entrance]);

  return (
    <Animated.View
      style={{
        opacity: entrance,
        transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}

/** An assistant-side bubble with mini HelperBot avatar and three bouncing dots. */
function ReplyingDots() {
  const [dots] = useState(() => [0, 1, 2].map(() => new Animated.Value(0)));

  useEffect(() => {
    let active = true;
    const loops: Animated.CompositeAnimation[] = [];
    void AccessibilityInfo.isReduceMotionEnabled().then((reduceMotion) => {
      if (!active || reduceMotion) return;
      dots.forEach((dot, index) => {
        const loop = Animated.loop(
          Animated.sequence([
            Animated.delay(index * 160),
            Animated.timing(dot, {
              toValue: 1,
              duration: 320,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
            Animated.timing(dot, {
              toValue: 0,
              duration: 320,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
            Animated.delay((2 - index) * 160),
          ]),
        );
        loops.push(loop);
        loop.start();
      });
    });
    return () => {
      active = false;
      loops.forEach((loop) => loop.stop());
    };
  }, [dots]);

  return (
    <AnimatedMessageEntry>
      <View
        accessible
        accessibilityLabel="The assistant is replying"
        accessibilityLiveRegion="polite"
        className="flex-row items-center gap-2"
      >
        <View className="h-7 w-7 items-center justify-center rounded-full border border-[#EA580C]/25 bg-orange-50">
          <HelperBot size={20} animated={false} />
        </View>
        <View className="flex-row items-center gap-1 rounded-2xl bg-slate-100 px-3 py-2.5">
          {dots.map((dot, index) => (
            <Animated.View
              key={index}
              style={{
                opacity: dot.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }),
                transform: [{ translateY: dot.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }],
              }}
              className="size-1.5 rounded-full bg-[#0B1B3D]"
            />
          ))}
        </View>
      </View>
    </AnimatedMessageEntry>
  );
}

function Bubble({ sender, text, muted }: { sender: string; text: string; muted?: boolean }) {
  const mine = sender === "customer";
  return (
    <AnimatedMessageEntry>
      <View className={mine ? "items-end" : "items-start"}>
        <View
          className={`max-w-[85%] rounded-2xl px-3 py-2 ${mine ? "bg-[#00112e]" : "bg-slate-100"} ${
            muted ? "opacity-60" : ""
          }`}
        >
          <Text className={`text-sm ${mine ? "text-white" : "text-slate-900"}`}>{text}</Text>
        </View>
      </View>
    </AnimatedMessageEntry>
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
  onNavigate,
}: {
  message: AssistantMessage;
  interactive: boolean;
  onSend: (text: string) => void;
  onNavigate?: () => void;
}) {
  return (
    <View className="gap-2">
      <Bubble sender={message.sender} text={message.text} />
      {message.actions.length ? (
        <AnimatedMessageEntry>
          <View className="flex-row flex-wrap gap-2">
            {message.actions.map((action, index) => (
              <ActionCard
                key={`${action.action_type}-${index}`}
                action={action}
                interactive={interactive}
                onSend={onSend}
                onNavigate={onNavigate}
              />
            ))}
          </View>
        </AnimatedMessageEntry>
      ) : null}
    </View>
  );
}

const LINK_CLASS = "rounded-full border border-[#00112e] px-3 py-1.5";

function ActionCard({
  action,
  interactive,
  onSend,
  onNavigate,
}: {
  action: AssistantAction;
  interactive: boolean;
  onSend: (text: string) => void;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname().replace(/\/\([^)]+\)/g, "") || "/";
  const navigateTo = (target: Href) => {
    onNavigate?.();
    router.push(target);
  };
  // The site's Contact page has no screen in the app: reach the same team by phone, else email.
  const openContact = () => {
    onNavigate?.();
    void Linking.openURL(SUPPORT.phone?.telHref ?? `mailto:${SUPPORT.email}`).catch(() => undefined);
  };

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
          onPress={() => navigateTo((action.href ?? "/bookings") as Href)}
          className="w-full items-center rounded-lg bg-emerald-600 py-2"
        >
          <Text className="text-sm font-semibold text-white">{action.label}</Text>
        </Pressable>
      );
    case "LOGIN":
      return (
        <Pressable
          accessibilityRole="link"
          onPress={() => navigateTo(`/login?next=${encodeURIComponent(pathname)}` as Href)}
          className={LINK_CLASS}
        >
          <Text className="text-xs font-semibold text-[#00112e]">{action.label}</Text>
        </Pressable>
      );
    default:
      return (
        <Pressable
          accessibilityRole="link"
          onPress={() =>
            action.href === "/contact" ? openContact() : navigateTo((action.href ?? "/") as Href)
          }
          className={LINK_CLASS}
        >
          <Text className="text-xs font-semibold text-[#00112e]">{action.label}</Text>
        </Pressable>
      );
  }
}

/**
 * Floating pop-up presentation matching the website's `AssistantPanel`:
 * - Desktop (`isDesktop`): non-modal floating `384×576` card anchored bottom-right (`24px`).
 * - Mobile (`!isDesktop`): `85%` height bottom sheet over a dimmed backdrop.
 */
export function AssistantPopup({
  isDesktop,
  onClose,
}: {
  isDesktop: boolean;
  onClose: () => void;
}) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const [entrance] = useState(() => new Animated.Value(0));

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduceMotion) => {
      if (!active) return;
      if (reduceMotion) {
        entrance.setValue(1);
        return;
      }
      Animated.timing(entrance, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    });
    return () => {
      active = false;
    };
  }, [entrance]);

  if (isDesktop) {
    const desktopHeight = Math.min(576, Math.max(400, height - 48));
    return (
      <Animated.View
        accessibilityLabel="Booking assistant"
        style={{
          position: (Platform.OS === "web" ? "fixed" : "absolute") as "absolute",
          right: 24,
          bottom: 24,
          width: 384,
          height: desktopHeight,
          zIndex: 9999,
          opacity: entrance,
          transform: [
            { translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) },
            { scale: entrance.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) },
          ],
          shadowColor: "#00112E",
          shadowOpacity: 0.22,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: 10 },
          elevation: 16,
        }}
        className="z-50 overflow-hidden rounded-2xl border border-[#E5E0D8] bg-white"
      >
        <AssistantScreen variant="popup" onClose={onClose} />
      </Animated.View>
    );
  }

  const restingHeight = Math.max(360, Math.round(height * 0.85));
  // With the keyboard up, the sheet sits directly on it and takes the space that is left
  // (below the status bar), so the header, chat and message box all stay visible.
  const sheetHeight =
    keyboardHeight > 0
      ? Math.min(restingHeight, height - keyboardHeight - Math.max(insets.top, 24) - 8)
      : restingHeight;
  const sheetContent = (
    <View
      style={
        Platform.OS === "web"
          ? {
              position: "fixed" as unknown as "absolute",
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              zIndex: 9999,
            }
          : undefined
      }
      className="z-50 flex-1 justify-end"
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss booking assistant"
        onPress={onClose}
        style={{ top: 0, right: 0, bottom: 0, left: 0 }}
        className="absolute inset-0 bg-black/35"
      />
      <Animated.View
        accessibilityLabel="Booking assistant"
        style={{
          width: "100%",
          height: sheetHeight,
          marginBottom: keyboardHeight,
          opacity: entrance,
          transform: [
            { translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [28, 0] }) },
          ],
          shadowColor: "#00112E",
          shadowOpacity: 0.24,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: -6 },
          elevation: 20,
        }}
        className="w-full overflow-hidden rounded-t-2xl bg-white"
      >
        <AssistantScreen variant="popup" onClose={onClose} />
      </Animated.View>
    </View>
  );

  if (Platform.OS === "web") return sheetContent;

  return (
    <Modal transparent animationType="none" visible onRequestClose={onClose}>
      {sheetContent}
    </Modal>
  );
}
