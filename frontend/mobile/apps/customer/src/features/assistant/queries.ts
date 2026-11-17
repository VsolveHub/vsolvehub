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
 * Chat history lives on this phone only: the server finds a conversation by its
 * token and offers no "list" or "delete", so the app keeps its own list of tokens
 * with a title taken from the first message. Deleting a chat forgets its token.
 */
export interface SavedChat {
  token: string;
  /** The first thing the customer said; null until they say something. */
  title: string | null;
  /**
   * Messages edited or deleted on this phone, by sequence. The server cannot remove them and the
   * assistant still remembers them; they are only no longer shown here.
   */
  hidden?: number[];
}

interface ChatState {
  token: string | null;
  chats: SavedChat[];
  loaded: boolean;
}

const CHATS_STORAGE_KEY = "assistant.chats";
const MAX_SAVED_CHATS = 30;
const TITLE_LENGTH = 40;

async function readStoredState(): Promise<{ token: string | null; chats: SavedChat[] }> {
  try {
    const token = await kvGet(TOKEN_STORAGE_KEY);
    const raw = await kvGet(CHATS_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const chats = Array.isArray(parsed)
      ? (parsed as SavedChat[]).filter((chat) => typeof chat?.token === "string")
      : [];
    // A conversation from before the list existed still belongs in it.
    if (token && !chats.some((chat) => chat.token === token)) chats.unshift({ token, title: null });
    return { token, chats };
  } catch {
    return { token: null, chats: [] };
  }
}

async function writeStoredState(state: ChatState): Promise<void> {
  try {
    if (state.token) await kvSet(TOKEN_STORAGE_KEY, state.token);
    else await kvRemove(TOKEN_STORAGE_KEY);
    await kvSet(CHATS_STORAGE_KEY, JSON.stringify(state.chats));
  } catch {
    // Storage unavailable: chats last for this app session only.
  }
}

/**
 * The open chat's token and the saved chats, read after mount. `loaded` stops the
 * screen from starting a second conversation before the first one's token has been read.
 */
export function useAssistantChats() {
  const [state, setState] = useState<ChatState>({ token: null, chats: [], loaded: false });
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

  /** A conversation was just created: open it and put it first in the list. */
  const add = useCallback(
    (token: string) =>
      apply({
        loaded: true,
        token,
        chats: [{ token, title: null }, ...latest.current.chats.filter((c) => c.token !== token)].slice(
          0,
          MAX_SAVED_CHATS,
        ),
      }),
    [apply],
  );

  /** Open a saved chat. The blank page it replaces is dropped, so blank chats never pile up. */
  const select = useCallback(
    (token: string) =>
      apply({
        ...latest.current,
        token,
        chats: latest.current.chats.filter(
          (c) => c.token === token || c.token !== latest.current.token || c.title,
        ),
      }),
    [apply],
  );

  /** Leave the open chat (kept in the list); with no token, a fresh conversation starts. */
  const openNew = useCallback(() => apply({ ...latest.current, token: null }), [apply]);

  /** Forget a chat. Forgetting the open one also leaves no token, so a fresh one starts. */
  const remove = useCallback(
    (token: string) =>
      apply({
        loaded: true,
        token: latest.current.token === token ? null : latest.current.token,
        chats: latest.current.chats.filter((c) => c.token !== token),
      }),
    [apply],
  );

  /** Name a chat after its first message; later messages never rename it. */
  const nameFromMessage = useCallback(
    (token: string, text: string) =>
      apply({
        ...latest.current,
        chats: latest.current.chats.map((c) =>
          c.token === token && !c.title ? { ...c, title: text.trim().slice(0, TITLE_LENGTH) } : c,
        ),
      }),
    [apply],
  );

  /**
   * Stop showing these messages of a chat on this phone. When none of the customer's own words
   * are left, the chat loses its title too, so it is a blank chat again and leaves the history.
   */
  const hideMessages = useCallback(
    (token: string, sequences: number[], { noneLeft }: { noneLeft: boolean }) =>
      apply({
        ...latest.current,
        chats: latest.current.chats.map((c) =>
          c.token === token
            ? {
                ...c,
                title: noneLeft ? null : c.title,
                hidden: [...new Set([...(c.hidden ?? []), ...sequences])],
              }
            : c,
        ),
      }),
    [apply],
  );

  return { ...state, add, select, openNew, remove, nameFromMessage, hideMessages };
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
