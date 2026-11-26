"use client";

import { describeError } from "@vsolve/query";
import { Check, Pencil, Send, Trash2, Volume2, VolumeX, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import {
  isAssistantRouteAvailable,
  subscribeOpenAssistant,
  updateAssistantLauncherState,
} from "../launcher-bridge";
import {
  playReplyChime,
  readNudgeDismissed,
  readSeenSequence,
  readSoundMuted,
  useDocumentTitleAlert,
  writeNudgeDismissed,
  writeSeenSequence,
  writeSoundMuted,
} from "../alerts";
import {
  useAssistantToken,
  useConversation,
  useSendMessage,
  useStartConversation,
  type AssistantAction,
  type AssistantMessage,
} from "../queries";
import { HelperBot, WelcomeHero } from "./welcome-hero";

/**
 * The floating booking assistant.
 *
 * It books through the same commands as the booking flow and pays through the
 * same booking page: a Pay card here is a link to `/bookings/{id}`, never a
 * second payment surface. Hidden on screens that already own the bottom of the
 * viewport (cart, checkout, the booking flow, sign-in) so it never covers a
 * docked action.
 */

const MAX_MESSAGE_LENGTH = 1000;
/** `create_session` in backend/apps/assistant/services.py writes the greeting first. */
const OPENING_GREETING_SEQUENCE = 1;

export function AssistantWidget() {
  const pathname = usePathname() ?? "/";
  if (!isAssistantRouteAvailable(pathname)) return null;
  return <AssistantLauncher pathname={pathname} />;
}

function filterVisibleMessages(
  raw: AssistantMessage[] | undefined,
  hidden: number[],
): AssistantMessage[] {
  const hiddenHere = new Set(hidden);
  return (raw ?? []).filter(
    (message) =>
      !hiddenHere.has(message.sequence) &&
      !(message.sequence === OPENING_GREETING_SEQUENCE && message.sender === "assistant"),
  );
}

function maxSequence(messages: AssistantMessage[]): number {
  return messages.reduce((highest, message) => Math.max(highest, message.sequence), 0);
}

function AssistantLauncher({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);
  const tokenState = useAssistantToken();
  const { token, loaded, hidden, save: saveToken } = tokenState;
  const start = useStartConversation(saveToken);
  const forget = useCallback(() => saveToken(null), [saveToken]);
  const conversation = useConversation(token, forget);
  const send = useSendMessage(token);

  const [muted, setMuted] = useState(false);
  const [nudgeVisible, setNudgeVisible] = useState(false);
  const [seenState, setSeenState] = useState<{ token: string; sequence: number } | null>(null);
  const [dismissedPeekSeq, setDismissedPeekSeq] = useState<number | null>(null);
  const lastAlertedSeqRef = useRef(0);

  const visibleMessages = useMemo(
    () => filterVisibleMessages(conversation.data?.messages, hidden),
    [conversation.data?.messages, hidden],
  );

  // Sync mute preference from localStorage after mount so SSR and initial HTML match.
  useEffect(() => {
    setMuted(readSoundMuted());
  }, []);

  // Show a gentle first-visit nudge once per browser session when the launcher is idle.
  useEffect(() => {
    if (!loaded || open || token !== null || readNudgeDismissed()) return;
    const showTimer = window.setTimeout(() => setNudgeVisible(true), 1800);
    const hideTimer = window.setTimeout(() => {
      setNudgeVisible(false);
      writeNudgeDismissed();
    }, 8500);
    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
    };
  }, [loaded, open, token]);

  // Baseline or advance seen sequence so historical messages never trigger alerts on mount.
  useEffect(() => {
    if (!token) {
      setSeenState(null);
      setDismissedPeekSeq(null);
      lastAlertedSeqRef.current = 0;
      return;
    }

    const latestSeq = maxSequence(visibleMessages);
    if (open) {
      if (latestSeq > 0) {
        writeSeenSequence(token, latestSeq);
        lastAlertedSeqRef.current = latestSeq;
      }
      setSeenState((prev) =>
        prev?.token === token && prev.sequence >= latestSeq
          ? prev
          : { token, sequence: latestSeq },
      );
      setDismissedPeekSeq(null);
      return;
    }

    setSeenState((prev) => {
      if (prev?.token === token) return prev;
      const stored = readSeenSequence(token);
      if (stored !== null) {
        lastAlertedSeqRef.current = stored;
        return { token, sequence: stored };
      }
      // First load without a stored baseline: treat already-loaded history as read.
      if (conversation.data) {
        writeSeenSequence(token, latestSeq);
        lastAlertedSeqRef.current = latestSeq;
        return { token, sequence: latestSeq };
      }
      return prev;
    });
  }, [conversation.data, open, token, visibleMessages]);

  const unreadMessages = useMemo(() => {
    if (open || !token || seenState?.token !== token) return [];
    return visibleMessages.filter(
      (message) => message.sender === "assistant" && message.sequence > seenState.sequence,
    );
  }, [open, seenState, token, visibleMessages]);

  const unreadCount = unreadMessages.length;
  const latestUnread = unreadCount > 0 ? unreadMessages[unreadCount - 1] : null;

  useDocumentTitleAlert(unreadCount);

  // Play a subtle chime once per newly arrived unread assistant message while minimized.
  useEffect(() => {
    if (open || !latestUnread) return;
    if (latestUnread.sequence <= lastAlertedSeqRef.current) return;
    lastAlertedSeqRef.current = latestUnread.sequence;
    if (!muted) playReplyChime();
  }, [latestUnread, muted, open]);

  const openAssistant = useCallback(() => {
    setNudgeVisible(false);
    writeNudgeDismissed();
    setOpen(true);
  }, []);

  useEffect(() => subscribeOpenAssistant(openAssistant), [openAssistant]);

  useEffect(() => {
    updateAssistantLauncherState({ open, unreadCount });
  }, [open, unreadCount]);

  useEffect(
    () => () => {
      updateAssistantLauncherState({ open: false, unreadCount: 0 });
    },
    [],
  );

  const dismissNudge = useCallback(() => {
    setNudgeVisible(false);
    writeNudgeDismissed();
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      writeSoundMuted(next);
      return next;
    });
  }, []);

  const showPeek = Boolean(!open && latestUnread && dismissedPeekSeq !== latestUnread.sequence);

  return (
    <>
      {open ? (
        <AssistantPanel
          pathname={pathname}
          onClose={() => setOpen(false)}
          tokenState={tokenState}
          start={start}
          conversation={conversation}
          send={send}
          visibleMessages={visibleMessages}
          muted={muted}
          onToggleMute={toggleMute}
        />
      ) : null}
      {!open ? (
        <>
          {showPeek && latestUnread ? (
            <div
              role="status"
              aria-live="polite"
              className="assistant-peek-enter fixed inset-x-4 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-xs items-start gap-2 rounded-2xl border border-[#EA580C]/25 bg-white px-3.5 py-2.5 shadow-xl md:inset-x-auto md:right-24 md:bottom-6 md:mx-0 md:max-w-[16.5rem]"
            >
              <button
                type="button"
                onClick={openAssistant}
                className="min-w-0 flex-1 text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00112e]"
              >
                <p className="text-xs font-bold text-[#00112e]">V Solve Hub AI</p>
                <p className="mt-0.5 line-clamp-2 text-xs text-slate-600">{latestUnread.text}</p>
              </button>
              <button
                type="button"
                onClick={() => setDismissedPeekSeq(latestUnread.sequence)}
                aria-label="Dismiss reply preview"
                className="-mr-1 -mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </div>
          ) : nudgeVisible ? (
            <div className="assistant-peek-enter fixed inset-x-4 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-40 mx-auto flex w-fit items-center gap-1.5 rounded-full border border-[#EA580C]/25 bg-white px-3.5 py-2 shadow-lg md:inset-x-auto md:right-24 md:bottom-8 md:mx-0">
              <button
                type="button"
                onClick={openAssistant}
                className="whitespace-nowrap text-xs font-semibold text-[#00112e] cursor-pointer"
              >
                Need help booking?
              </button>
              <button
                type="button"
                onClick={dismissNudge}
                aria-label="Dismiss chat suggestion"
                className="-mr-1 grid size-5 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
              >
                <X className="size-3" aria-hidden />
              </button>
            </div>
          ) : null}

          <button
            type="button"
            onClick={openAssistant}
            className="fixed right-6 bottom-6 z-40 hidden size-16 cursor-pointer place-items-center rounded-full border border-[#EA580C]/25 bg-orange-50 shadow-lg transition-transform hover:scale-105 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00112e] md:grid"
            aria-label={
              unreadCount > 0
                ? `Open the booking assistant, ${unreadCount} unread`
                : "Open the booking assistant"
            }
            title="V Solve Hub AI"
          >
            {unreadCount > 0 ? (
              <>
                <span
                  aria-hidden
                  className="assistant-ring-pulse pointer-events-none absolute inset-0 rounded-full border-2 border-[#EA580C]"
                />
                <span
                  aria-hidden
                  className="absolute -top-1 -right-1 grid h-5 min-w-5 place-items-center rounded-full bg-[#EA580C] px-1 text-xs font-extrabold text-white ring-2 ring-[#FAF9F7]"
                >
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              </>
            ) : null}
            <span className="assistant-bot-float grid place-items-center">
              <HelperBot className="size-12" />
            </span>
          </button>
        </>
      ) : null}
    </>
  );
}

function AssistantPanel({
  pathname,
  onClose,
  tokenState,
  start,
  conversation,
  send,
  visibleMessages,
  muted,
  onToggleMute,
}: {
  pathname: string;
  onClose: () => void;
  tokenState: ReturnType<typeof useAssistantToken>;
  start: ReturnType<typeof useStartConversation>;
  conversation: ReturnType<typeof useConversation>;
  send: ReturnType<typeof useSendMessage>;
  visibleMessages: AssistantMessage[];
  muted: boolean;
  onToggleMute: () => void;
}) {
  const { token, loaded, hideMessages } = tokenState;
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const startConversation = start.mutate;
  const needsConversation = loaded && token === null && !start.isPending && !start.isError;
  useEffect(() => {
    if (needsConversation) startConversation();
  }, [needsConversation, startConversation]);

  const messages = visibleMessages;
  const answering = send.isPending || Boolean(conversation.data?.is_answering);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, pending, answering]);

  useEffect(() => {
    inputRef.current?.focus();
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

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    sendText(draft);
  };

  const lastAssistantSequence = [...messages].reverse().find((m) => m.sender === "assistant")
    ?.sequence;
  const error = start.error ?? send.error ?? conversation.error;

  /*
   * Edit and delete, on the customer's latest message only, and only while no answer is being
   * written, so neither can contradict a step the assistant has already taken. The server keeps
   * every message, so both work by hiding in this browser: that message and the replies after it.
   * An edit then sends the new text as a fresh message, so it reads as replaced.
   */
  const lastCustomerSequence = [...messages].reverse().find((m) => m.sender === "customer")?.sequence;
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
    <section
      role="dialog"
      aria-label="Booking assistant"
      className="assistant-panel-enter fixed inset-x-0 bottom-0 z-50 flex h-[85dvh] flex-col rounded-t-2xl bg-white shadow-2xl md:inset-x-auto md:right-6 md:bottom-6 md:h-[36rem] md:w-[24rem] md:rounded-2xl"
    >
      <header className="flex items-center justify-between rounded-t-2xl bg-[#00112e] px-4 py-3 text-white">
        <div>
          <p className="text-sm font-semibold">Booking assistant</p>
          <p className="text-xs text-white/70">Tell me what you need done at home</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onToggleMute}
            aria-label={muted ? "Unmute reply alerts" : "Mute reply alerts"}
            title={muted ? "Unmute reply alerts" : "Mute reply alerts"}
            className="rounded-lg p-1.5 text-white/80 hover:bg-white/10 hover:text-white cursor-pointer"
          >
            {muted ? <VolumeX className="size-4" aria-hidden /> : <Volume2 className="size-4" aria-hidden />}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close the assistant"
            className="rounded-lg p-1.5 text-white/80 hover:bg-white/10 hover:text-white cursor-pointer"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
      </header>

      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
        {/* Always at the top of the chat, so the starter chips stay one tap away. */}
        <WelcomeHero
          key={token ?? "new"}
          disabled={!token || send.isPending}
          onPick={(categoryName) => sendText(`I need ${categoryName}`)}
        />
        {messages.map((message) =>
          canEdit && message.sequence === lastCustomerSequence ? (
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
              pathname={pathname}
              interactive={message.sequence === lastAssistantSequence && !answering}
              onSend={sendText}
            />
          ),
        )}
        {pending ? <Bubble sender="customer" text={pending} muted /> : null}
        {answering ? <TypingIndicator /> : null}
        {error && !answering ? (
          <p role="alert" className="assistant-msg-enter rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
            {describeError(error, "mutation").message}
          </p>
        ) : null}
      </div>

      <form onSubmit={onSubmit} className="flex items-end gap-2 border-t border-slate-200 p-3">
        <textarea
          ref={inputRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              sendText(draft);
            }
          }}
          rows={1}
          maxLength={MAX_MESSAGE_LENGTH}
          placeholder="e.g. AC not cooling, tomorrow evening"
          aria-label="Your message"
          className="max-h-28 flex-1 resize-none rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#00112e]"
        />
        <button
          type="submit"
          disabled={!draft.trim() || !token || send.isPending}
          aria-label="Send"
          className="rounded-xl bg-[#00112e] p-2.5 text-white disabled:opacity-40"
        >
          <Send className="size-4" aria-hidden />
        </button>
      </form>
    </section>
  );
}

function TypingIndicator() {
  return (
    <div className="assistant-msg-enter flex items-center gap-2" role="status">
      <div className="grid size-7 shrink-0 place-items-center rounded-full border border-[#EA580C]/25 bg-orange-50">
        <HelperBot size={20} animated={false} />
      </div>
      <div className="flex items-center gap-1 rounded-2xl bg-slate-100 px-3 py-2.5">
        <span className="assistant-dot-1 size-1.5 rounded-full bg-[#0B1B3D]" aria-hidden />
        <span className="assistant-dot-2 size-1.5 rounded-full bg-[#0B1B3D]" aria-hidden />
        <span className="assistant-dot-3 size-1.5 rounded-full bg-[#0B1B3D]" aria-hidden />
        <span className="sr-only">Assistant is typing</span>
      </div>
    </div>
  );
}

function Bubble({ sender, text, muted }: { sender: string; text: string; muted?: boolean }) {
  const mine = sender === "customer";
  return (
    <div className={`assistant-msg-enter flex ${mine ? "justify-end" : "justify-start"}`}>
      <p
        className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
          mine ? "bg-[#00112e] text-white" : "bg-slate-100 text-slate-900"
        } ${muted ? "opacity-60" : ""}`}
      >
        {text}
      </p>
    </div>
  );
}

const ICON_BUTTON =
  "grid size-9 place-items-center rounded-full text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00112e] disabled:opacity-40";

/**
 * The customer's latest message. Clicking it shows an edit and a delete button; editing turns the
 * bubble into a text box with cancel and send. Its state lives here, so it resets by itself when
 * the message stops being the editable one (a new message, another chat). Same as the phone app.
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
    const cancel = () => {
      setValue(text);
      setMode("idle");
    };
    const save = () => {
      // Nothing changed: there is nothing new to send.
      if (edited === text.trim()) setMode("idle");
      else if (edited) onSave(edited);
    };
    return (
      <div className="flex flex-col items-end gap-1">
        <textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") cancel();
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              save();
            }
          }}
          autoFocus
          rows={2}
          maxLength={MAX_MESSAGE_LENGTH}
          aria-label="Edit your message"
          className="w-[85%] resize-none rounded-2xl bg-[#00112e] px-3 py-2 text-sm text-white outline-none"
        />
        <div className="flex">
          <button type="button" onClick={cancel} aria-label="Cancel edit" className={ICON_BUTTON}>
            <X className="size-4" aria-hidden />
          </button>
          <button type="button" onClick={save} disabled={!edited} aria-label="Send edited message" className={ICON_BUTTON}>
            <Check className="size-4 text-[#00112e]" aria-hidden />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => setMode(mode === "tools" ? "idle" : "tools")}
        aria-expanded={mode === "tools"}
        aria-label={`${text}. Show edit and delete`}
        className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-[#00112e] px-3 py-2 text-left text-sm text-white hover:opacity-90"
      >
        {text}
      </button>
      {mode === "tools" ? (
        <div className="flex">
          <button type="button" onClick={() => setMode("editing")} aria-label="Edit message" className={ICON_BUTTON}>
            <Pencil className="size-4" aria-hidden />
          </button>
          <button type="button" onClick={onDelete} aria-label="Delete message" className={ICON_BUTTON}>
            <Trash2 className="size-4 text-red-600" aria-hidden />
          </button>
        </div>
      ) : null}
    </div>
  );
}

function MessageBubble({
  message,
  pathname,
  interactive,
  onSend,
}: {
  message: AssistantMessage;
  pathname: string;
  interactive: boolean;
  onSend: (text: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Bubble sender={message.sender} text={message.text} />
      {message.actions.length ? (
        <div className="assistant-msg-enter flex flex-wrap gap-2">
          {message.actions.map((action, index) => (
            <ActionCard
              key={`${action.action_type}-${index}`}
              action={action}
              pathname={pathname}
              interactive={interactive}
              onSend={onSend}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

const LINK_CLASS =
  "rounded-full border border-[#00112e] px-3 py-1.5 text-xs font-semibold text-[#00112e]";

function ActionCard({
  action,
  pathname,
  interactive,
  onSend,
}: {
  action: AssistantAction;
  pathname: string;
  interactive: boolean;
  onSend: (text: string) => void;
}) {
  switch (action.action_type) {
    case "QUICK_REPLY":
      // An old reply chip answers a question that has moved on; only the latest are live.
      return interactive ? (
        <button
          type="button"
          onClick={() => onSend(action.message ?? action.label)}
          className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-200"
        >
          {action.label}
        </button>
      ) : null;
    case "QUOTE":
      return (
        <div className="w-full rounded-xl border border-slate-200 p-3 text-sm">
          <p className="text-base font-semibold">Total {action.amount}</p>
          <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
            {(action.lines ?? []).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {interactive ? (
            <button
              type="button"
              onClick={() => onSend(action.message ?? action.label)}
              className="mt-3 w-full rounded-lg bg-[#00112e] py-2 text-sm font-semibold text-white"
            >
              {action.label}
            </button>
          ) : null}
        </div>
      );
    case "PAY":
      return (
        <Link
          href={action.href ?? "/bookings"}
          className="w-full rounded-lg bg-emerald-600 py-2 text-center text-sm font-semibold text-white"
        >
          {action.label}
        </Link>
      );
    case "LOGIN":
      return (
        <Link href={`/login?next=${encodeURIComponent(pathname)}`} className={LINK_CLASS}>
          {action.label}
        </Link>
      );
    default:
      return (
        <Link href={action.href ?? "/"} className={LINK_CLASS}>
          {action.label}
        </Link>
      );
  }
}
