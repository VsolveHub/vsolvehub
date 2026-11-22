"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createApiClient,
  isApiRequestError,
  request,
  type ApiClient,
  type Schemas,
} from "@vsolve/api-client";
import { useCallback, useEffect, useRef, useState } from "react";

import { getApiClient } from "@/lib/api/browser";
import { PUBLIC_API_BASE_URL } from "@/lib/api/config";

/**
 * The booking assistant's data layer (contract 1.98.0).
 *
 * ## What the browser holds
 *
 * Only the conversation token, in `localStorage`, sent as `X-Assistant-Token`.
 * The server keeps a hash of it and nothing else, so a lost token is a new
 * conversation, never a recovered one. A 404 means exactly that and starts over.
 *
 * ## What it never decides
 *
 * Booking state. "Payment received" and "confirmed" arrive as server-written
 * messages, read from the booking's live status, which only a provider-verified
 * capture can set. Polling is how they arrive; nothing here infers them.
 */

export type AssistantConversation = Schemas["AssistantConversation"];
export type AssistantMessage = Schemas["AssistantMessage"];
export type AssistantAction = Schemas["AssistantAction"];

const TOKEN_STORAGE_KEY = "vsolve.assistant.conversation";
const TOKEN_HEADER = "X-Assistant-Token";
const POLL_MS = 4_000;
/**
 * A turn may make several model calls. The server starts none after 30 seconds,
 * so a turn ends inside ~45; this outlasts it. If it is still cut off, the
 * answer is stored anyway and the next read shows it.
 */
const TURN_TIMEOUT_MS = 55_000;

let turnClient: ApiClient | undefined;

function getTurnClient(): ApiClient {
  turnClient ??= createApiClient({ baseUrl: PUBLIC_API_BASE_URL, timeoutMs: TURN_TIMEOUT_MS });
  return turnClient;
}

export const assistantKeys = {
  conversation: (token: string) => ["assistant", "conversation", token] as const,
};

/**
 * Messages edited or deleted in this browser, by sequence. The server keeps every message, so
 * these are only no longer shown (same as the phone app). They belong to the open conversation
 * and are cleared whenever it is replaced.
 */
const HIDDEN_STORAGE_KEY = "vsolve.assistant.hidden";

function readStored(): { token: string | null; hidden: number[] } {
  try {
    const token = window.localStorage.getItem(TOKEN_STORAGE_KEY);
    const raw = token ? window.localStorage.getItem(HIDDEN_STORAGE_KEY) : null;
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const hidden = Array.isArray(parsed)
      ? parsed.filter((sequence): sequence is number => typeof sequence === "number")
      : [];
    return { token, hidden };
  } catch {
    return { token: null, hidden: [] };
  }
}

function writeStored(token: string | null, hidden: number[]): void {
  try {
    if (token) window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    else window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    if (token && hidden.length) window.localStorage.setItem(HIDDEN_STORAGE_KEY, JSON.stringify(hidden));
    else window.localStorage.removeItem(HIDDEN_STORAGE_KEY);
  } catch {
    // Private mode or storage disabled: the conversation lasts for this page only.
  }
}

interface ChatState {
  token: string | null;
  hidden: number[];
  loaded: boolean;
}

/**
 * The stored token and hidden messages, read after mount (storage does not exist during server
 * rendering). `loaded` is what stops a panel from starting a second conversation in the moment
 * before the first one's token has been read.
 */
export function useAssistantToken(): ChatState & {
  save: (token: string | null) => void;
  hideMessages: (sequences: number[]) => void;
} {
  const [state, setState] = useState<ChatState>({ token: null, hidden: [], loaded: false });
  // The latest state, so the actions keep one identity and never act on a stale copy.
  const latest = useRef(state);

  const apply = useCallback((next: ChatState) => {
    latest.current = next;
    writeStored(next.token, next.hidden);
    setState(next);
  }, []);

  useEffect(() => {
    latest.current = { ...readStored(), loaded: true };
    setState(latest.current);
  }, []);

  /** A new (or no) conversation: nothing in it is hidden yet. */
  const save = useCallback((token: string | null) => apply({ token, hidden: [], loaded: true }), [apply]);

  /** Stop showing these messages of the open conversation in this browser. */
  const hideMessages = useCallback(
    (sequences: number[]) =>
      apply({ ...latest.current, hidden: [...new Set([...latest.current.hidden, ...sequences])] }),
    [apply],
  );

  return { ...state, save, hideMessages };
}

export function useStartConversation(onToken: (token: string) => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => request(() => getApiClient().POST("/api/v1/assistant/conversations/")),
    onSuccess: (created) => {
      queryClient.setQueryData(
        assistantKeys.conversation(created.conversation_token),
        created.conversation,
      );
      onToken(created.conversation_token);
    },
  });
}

export function useConversation(token: string | null, onLost: () => void) {
  const query = useQuery({
    queryKey: assistantKeys.conversation(token ?? ""),
    enabled: Boolean(token),
    retry: false,
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/assistant/conversation/", {
          params: { header: { [TOKEN_HEADER]: token ?? "" } },
        }),
      ),
    // Poll only while something is happening: an answer being written, or a
    // booking whose next step (a professional accepting, a payment) is the
    // server's news to deliver.
    refetchInterval: (current) =>
      current.state.data?.is_answering || current.state.data?.has_open_booking ? POLL_MS : false,
  });
  const lost = isApiRequestError(query.error) && query.error.status === 404;
  useEffect(() => {
    if (lost) onLost();
  }, [lost, onLost]);
  return query;
}

function mergeBySequence(
  current: AssistantMessage[],
  incoming: AssistantMessage[],
): AssistantMessage[] {
  const bySequence = new Map(current.map((message) => [message.sequence, message]));
  for (const message of incoming) bySequence.set(message.sequence, message);
  return [...bySequence.values()].sort((a, b) => a.sequence - b.sequence);
}

function newClientMessageId(): string {
  return crypto.randomUUID().replaceAll("-", "");
}

export function useSendMessage(token: string | null) {
  const queryClient = useQueryClient();
  const key = assistantKeys.conversation(token ?? "");
  return useMutation({
    mutationFn: (text: string) =>
      request(() =>
        getTurnClient().POST("/api/v1/assistant/conversation/messages/", {
          params: { header: { [TOKEN_HEADER]: token ?? "" } },
          body: { text, client_message_id: newClientMessageId() },
        }),
      ),
    onSuccess: (turn) => {
      queryClient.setQueryData<AssistantConversation>(key, (current) =>
        current ? { ...current, messages: mergeBySequence(current.messages, turn.messages) } : current,
      );
    },
    // Whatever happened, the server's copy is the truth: re-read it.
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}
