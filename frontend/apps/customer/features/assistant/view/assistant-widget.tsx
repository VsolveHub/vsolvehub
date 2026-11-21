"use client";

import { describeError } from "@vsolve/query";
import { Check, Loader2, MessageCircle, Pencil, Send, Trash2, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import {
  useAssistantToken,
  useConversation,
  useSendMessage,
  useStartConversation,
  type AssistantAction,
  type AssistantMessage,
} from "../queries";
import { WelcomeHero } from "./welcome-hero";

/**
 * The floating booking assistant.
 *
 * It books through the same commands as the booking flow and pays through the
 * same booking page: a Pay card here is a link to `/bookings/{id}`, never a
 * second payment surface. Hidden on screens that already own the bottom of the
 * viewport (cart, checkout, the booking flow, sign-in) so it never covers a
 * docked action.
 */

const ENABLED = process.env.NEXT_PUBLIC_ASSISTANT_ENABLED === "true";
const HIDDEN_PREFIXES = ["/cart", "/checkout", "/login", "/signup", "/book/", "/bookings/"];
const MAX_MESSAGE_LENGTH = 1000;
/** `create_session` in backend/apps/assistant/services.py writes the greeting first. */
const OPENING_GREETING_SEQUENCE = 1;

export function AssistantWidget() {
  const pathname = usePathname() ?? "/";
  if (!ENABLED || HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return null;
  return <AssistantLauncher pathname={pathname} />;
}

function AssistantLauncher({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {open ? <AssistantPanel pathname={pathname} onClose={() => setOpen(false)} /> : null}
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed right-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 flex items-center gap-2 rounded-full bg-[#00112e] px-4 py-3 text-sm font-semibold text-white shadow-lg md:bottom-6"
          aria-label="Open the booking assistant"
        >
          <MessageCircle className="size-5" aria-hidden />
          Book by chat
        </button>
      ) : null}
    </>
  );
}

function AssistantPanel({ pathname, onClose }: { pathname: string; onClose: () => void }) {
  const { token, loaded, hidden, save: saveToken, hideMessages } = useAssistantToken();
  const start = useStartConversation(saveToken);
  const forget = useCallback(() => saveToken(null), [saveToken]);
  const conversation = useConversation(token, forget);
  const send = useSendMessage(token);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const startConversation = start.mutate;
  const needsConversation = loaded && token === null && !start.isPending && !start.isError;
  useEffect(() => {
    if (needsConversation) startConversation();
  }, [needsConversation, startConversation]);

  // The server opens every conversation with a greeting as message #1; the welcome block replaces
  // it, so that one message is not shown. Messages edited or deleted in this browser are not shown
  // either. Every other message is. Same as the phone app.
  const hiddenHere = new Set(hidden);
  const messages = (conversation.data?.messages ?? []).filter(
    (message) =>
      !hiddenHere.has(message.sequence) &&
      !(message.sequence === OPENING_GREETING_SEQUENCE && message.sender === "assistant"),
  );
  const answering = send.isPending || Boolean(conversation.data?.is_answering);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, pending]);

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
      className="fixed inset-x-0 bottom-0 z-50 flex h-[85dvh] flex-col rounded-t-2xl bg-white shadow-2xl md:inset-x-auto md:right-6 md:bottom-6 md:h-[36rem] md:w-[24rem] md:rounded-2xl"
    >
      <header className="flex items-center justify-between rounded-t-2xl bg-[#00112e] px-4 py-3 text-white">
        <div>
          <p className="text-sm font-semibold">Booking assistant</p>
          <p className="text-xs text-white/70">Tell me what you need done at home</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close the assistant" className="p-1">
          <X className="size-5" aria-hidden />
        </button>
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
        {answering ? (
          <p className="flex items-center gap-2 text-xs text-slate-500">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Typing…
          </p>
        ) : null}
        {error && !answering ? (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
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

function Bubble({ sender, text, muted }: { sender: string; text: string; muted?: boolean }) {
  const mine = sender === "customer";
  return (
    <div className={mine ? "flex justify-end" : "flex justify-start"}>
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
        <div className="flex flex-wrap gap-2">
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
