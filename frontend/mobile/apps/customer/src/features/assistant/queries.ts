// Ported from frontend/apps/customer/features/assistant/queries.ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createApiClient,
  createIdempotencyKey,
  isApiRequestError,
  request,
  type ApiClient,
  type Schemas,
} from "@vsolve/api-client";
import { apiBaseUrl, getApiClient, useAuthStore } from "@vsolve/mobile-core";
import { kvGet, kvSet, kvRemove } from "@vsolve/mobile-core/storage";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The booking assistant's data layer (contract 1.98.0).
 *
 * The phone holds only the conversation token (sent as `X-Assistant-Token`).
 * A 404 means the server no longer knows it, so a new conversation starts.
 * Booking state is never decided here: "payment received" and "confirmed"
 * arrive as server-written messages, through polling.
 */

export type AssistantConversation = Schemas["AssistantConversation"];
export type AssistantMessage = Schemas["AssistantMessage"];
export type AssistantAction = Schemas["AssistantAction"];

const TOKEN_STORAGE_KEY = "assistant.conversation";
const TOKEN_HEADER = "X-Assistant-Token";
const POLL_MS = 4_000;
/** A turn ends inside ~45 seconds on the server; this outlasts it (same as web). */
const TURN_TIMEOUT_MS = 55_000;

let turnClient: ApiClient | undefined;

function getTurnClient(): ApiClient {
  // Same bearer login as `getApiClient`, with the longer deadline a turn needs. Without `auth`
  // the client uses the browser's cookie + CSRF flow, which a phone cannot complete.
  turnClient ??= createApiClient({
    baseUrl: apiBaseUrl(),
    timeoutMs: TURN_TIMEOUT_MS,
    auth: { mode: "bearer", getToken: () => useAuthStore.getState().token },
  });
  return turnClient;
}

export const assistantKeys = {
  conversation: (token: string) => ["assistant", "conversation", token] as const,
};

/**
 * The one open chat, kept on this phone: its token, and the messages edited or deleted here. The
 * server keeps every message, so those are only no longer shown. A new chat replaces the open one;
 * there is no list of past chats.
 */
interface ChatState {
  token: string | null;
  /** Sequences of the open chat's messages hidden on this phone. */
  hidden: number[];
  loaded: boolean;
}

const HIDDEN_STORAGE_KEY = "assistant.hidden";
/** Written by the chat-history list that was removed; cleared from phones that still have it. */
const RETIRED_CHATS_STORAGE_KEY = "assistant.chats";

async function readStoredState(): Promise<{ token: string | null; hidden: number[] }> {
  try {
    await kvRemove(RETIRED_CHATS_STORAGE_KEY);
    const token = await kvGet(TOKEN_STORAGE_KEY);
    const raw = token ? await kvGet(HIDDEN_STORAGE_KEY) : null;
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const hidden = Array.isArray(parsed)
      ? parsed.filter((sequence): sequence is number => typeof sequence === "number")
      : [];
    return { token, hidden };
  } catch {
    return { token: null, hidden: [] };
  }
}

async function writeStoredState(state: ChatState): Promise<void> {
  try {
    if (state.token) await kvSet(TOKEN_STORAGE_KEY, state.token);
    else await kvRemove(TOKEN_STORAGE_KEY);
    if (state.hidden.length) await kvSet(HIDDEN_STORAGE_KEY, JSON.stringify(state.hidden));
    else await kvRemove(HIDDEN_STORAGE_KEY);
  } catch {
    // Storage unavailable: the chat lasts for this app session only.
  }
}

/**
 * The open chat, read after mount. `loaded` stops the screen from starting a second
 * conversation before the first one's token has been read.
 */
export function useAssistantChat() {
  const [state, setState] = useState<ChatState>({ token: null, hidden: [], loaded: false });
  // The latest state, so the actions below keep one identity and never act on a stale copy.
  const latest = useRef(state);

  const apply = useCallback((next: ChatState) => {
    latest.current = next;
    setState(next);
    void writeStoredState(next);
  }, []);

  useEffect(() => {
    let active = true;
    void readStoredState().then((stored) => {
      if (!active) return;
      latest.current = { ...stored, loaded: true };
      setState(latest.current);
    });
    return () => {
      active = false;
    };
  }, []);

  /** A conversation was just created: it is now the open chat. */
  const open = useCallback((token: string) => apply({ token, hidden: [], loaded: true }), [apply]);

  /** Leave the open chat for good; with no token, a fresh conversation starts. */
  const reset = useCallback(() => apply({ token: null, hidden: [], loaded: true }), [apply]);

  /** Stop showing these messages of the open chat on this phone. */
  const hideMessages = useCallback(
    (sequences: number[]) =>
      apply({ ...latest.current, hidden: [...new Set([...latest.current.hidden, ...sequences])] }),
    [apply],
  );

  return { ...state, open, reset, hideMessages };
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
    // booking whose next step is the server's news to deliver.
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
  return createIdempotencyKey().replaceAll("-", "");
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
