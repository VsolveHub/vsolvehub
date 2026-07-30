/**
 * Cross-tab coordination.
 *
 * Two tabs on the same booking are a real scenario, not an edge case: customers
 * open a service in a second tab to compare, then continue in whichever one is
 * in front. Without coordination that produces two capacity holds, two checkout
 * sessions, and a customer logged out in one tab still acting in the other.
 *
 * Plan document 09 §15:
 *  - broadcast logout, active checkout and mutation completion
 *  - `BroadcastChannel` with a storage-event fallback
 *  - server idempotency and version checks remain authoritative
 *  - a second tab must resume or reject the same checkout, never create a
 *    parallel conversion
 *
 * This module is coordination only. It is a convenience so tabs agree quickly;
 * it is never a correctness guarantee. The server is the guarantee.
 */

const CHANNEL_NAME = "vsolve.tabs";
const STORAGE_KEY = "vsolve.tabs.message";

/** Messages tabs exchange. Payloads carry identifiers, never sensitive records. */
export type TabMessage =
  /** The session ended in another tab. Clear caches and route to login. */
  | { type: "session.logout" }
  /** Authentication succeeded in another tab. Refetch session-scoped data. */
  | { type: "session.authenticated" }
  /**
   * A checkout session became active in another tab. Other tabs must not start
   * a competing checkout; they resume or defer to this one.
   */
  | { type: "checkout.started"; checkoutSessionId: string }
  /** A checkout reached a terminal outcome. Other tabs stop showing it as live. */
  | { type: "checkout.settled"; checkoutSessionId: string }
  /** A mutation completed elsewhere; invalidate the given key prefix. */
  | { type: "cache.invalidate"; queryKey: readonly unknown[] };

export type TabMessageListener = (message: TabMessage) => void;

export interface TabChannel {
  publish: (message: TabMessage) => void;
  subscribe: (listener: TabMessageListener) => () => void;
  close: () => void;
}

/** A no-op channel for server rendering and non-browser test runners. */
function inertChannel(): TabChannel {
  return {
    publish: () => undefined,
    subscribe: () => () => undefined,
    close: () => undefined,
  };
}

function isTabMessage(value: unknown): value is TabMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { type?: unknown }).type === "string"
  );
}

/**
 * Opens the cross-tab channel.
 *
 * Prefers `BroadcastChannel`. Falls back to `localStorage` write plus the
 * `storage` event, which fires in every *other* tab of the origin — enough for
 * the same fan-out with slightly more latency.
 */
export function createTabChannel(): TabChannel {
  if (typeof window === "undefined") return inertChannel();

  const listeners = new Set<TabMessageListener>();

  const emit = (message: TabMessage) => {
    for (const listener of listeners) {
      try {
        listener(message);
      } catch {
        // One bad listener must not stop the others from receiving the message.
      }
    }
  };

  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = (event: MessageEvent<unknown>) => {
      if (isTabMessage(event.data)) emit(event.data);
    };

    return {
      publish: (message) => {
        try {
          channel.postMessage(message);
        } catch {
          // Channel already closed during teardown; nothing to recover.
        }
      },
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      close: () => {
        listeners.clear();
        channel.close();
      },
    };
  }

  // Fallback. The `storage` event does not fire in the originating tab, which is
  // the behaviour we want: a publisher already knows what it just did.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try {
      const parsed: unknown = JSON.parse(event.newValue);
      const payload = (parsed as { message?: unknown }).message;
      if (isTabMessage(payload)) emit(payload);
    } catch {
      // Malformed payload from an older or newer app version. Ignore.
    }
  };

  window.addEventListener("storage", onStorage);

  return {
    publish: (message) => {
      try {
        // The nonce guarantees a value change, so repeating the same logical
        // message still fires the event in other tabs.
        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ message, nonce: Date.now() + Math.random() }),
        );
      } catch {
        // Storage blocked or full. Coordination degrades; server checks hold.
      }
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close: () => {
      listeners.clear();
      window.removeEventListener("storage", onStorage);
    },
  };
}

/** Process-wide channel, created lazily so importing this module is SSR-safe. */
let sharedChannel: TabChannel | null = null;

export function getTabChannel(): TabChannel {
  if (!sharedChannel) sharedChannel = createTabChannel();
  return sharedChannel;
}
