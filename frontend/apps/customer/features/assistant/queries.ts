"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createApiClient,
  isApiRequestError,
  request,
  type ApiClient,
  type Schemas,
} from "@vsolve/api-client";
import { useCallback, useEffect, useState } from "react";

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

function readStoredToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredToken(token: string | null): void {
  try {
    if (token) window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    else window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // Private mode or storage disabled: the conversation lasts for this page only.
  }
}

/**
 * The stored token, read after mount (storage does not exist during server
 * rendering). `loaded` is what stops a panel from starting a second
 * conversation in the moment before the first one's token has been read.
 */
export function useAssistantToken(): {
  token: string | null;
  loaded: boolean;
  save: (token: string | null) => void;
} {
  const [state, setState] = useState<{ token: string | null; loaded: boolean }>({
    token: null,
    loaded: false,
  });
  useEffect(() => setState({ token: readStoredToken(), loaded: true }), []);
  const save = useCallback((next: string | null) => {
    writeStoredToken(next);
    setState({ token: next, loaded: true });
  }, []);
  return { ...state, save };
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
