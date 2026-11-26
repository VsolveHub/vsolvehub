import { kvGet, kvRemove, kvSet } from "@vsolve/mobile-core/storage";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DeviceEventEmitter, Platform, Vibration } from "react-native";

import { useConversation, type AssistantMessage } from "./queries";

const TOKEN_STORAGE_KEY = "assistant.conversation";
const HIDDEN_STORAGE_KEY = "assistant.hidden";
const SEEN_STORAGE_KEY = "assistant.seen";
const MUTED_STORAGE_KEY = "assistant.muted";
const SYNC_EVENT = "vsolve.assistant.sync";
const OPENING_GREETING_SEQUENCE = 1;
let nudgeDismissedThisLaunch = false;

interface StoredSeen {
  token: string;
  sequence: number;
}

export async function readSeenSequence(token: string | null): Promise<number | null> {
  if (!token) return null;
  try {
    const raw = await kvGet(SEEN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSeen>;
    if (parsed.token === token && typeof parsed.sequence === "number") {
      return parsed.sequence;
    }
    return null;
  } catch {
    return null;
  }
}

export async function writeSeenSequence(token: string | null, sequence: number): Promise<void> {
  try {
    if (!token) {
      await kvRemove(SEEN_STORAGE_KEY);
      return;
    }
    await kvSet(SEEN_STORAGE_KEY, JSON.stringify({ token, sequence }));
  } catch {
    // Storage unavailable: keep unread state in memory for this session.
  }
}

export async function readSoundMuted(): Promise<boolean> {
  try {
    return (await kvGet(MUTED_STORAGE_KEY)) === "true";
  } catch {
    return false;
  }
}

export async function writeSoundMuted(muted: boolean): Promise<void> {
  try {
    await kvSet(MUTED_STORAGE_KEY, String(muted));
  } catch {
    // Ignore storage errors.
  }
}

export function emitAssistantSync(): void {
  DeviceEventEmitter.emit(SYNC_EVENT);
}

/**
 * Triggers a gentle alert when an assistant reply arrives while the chat tab is closed:
 * a soft two-tone chime on Expo Web, or a brief tactile vibration pulse on iOS/Android.
 */
export function notifyReplyAlert(): void {
  if (Platform.OS !== "web") {
    try {
      Vibration.vibrate(40);
    } catch {
      // Vibration unavailable on simulator or restricted devices.
    }
    return;
  }
  try {
    const win = globalThis as unknown as {
      AudioContext?: typeof AudioContext;
      webkitAudioContext?: typeof AudioContext;
    };
    const AudioCtx = win.AudioContext ?? win.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    [587.33, 880].forEach((frequency, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = now + index * 0.09;
      osc.type = "sine";
      osc.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.07, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.24);
    });
    setTimeout(() => {
      void ctx.close().catch(() => undefined);
    }, 500);
  } catch {
    // Autoplay policy or missing Web Audio API: skip chime silently.
  }
}

export function filterVisibleAssistantMessages(
  raw: AssistantMessage[] | undefined,
  hidden: number[],
): AssistantMessage[] {
  const hiddenSet = new Set(hidden);
  return (raw ?? []).filter(
    (message) =>
      !hiddenSet.has(message.sequence) &&
      !(message.sequence === OPENING_GREETING_SEQUENCE && message.sender === "assistant"),
  );
}

async function readAlertSnapshot(): Promise<{
  token: string | null;
  hidden: number[];
  seen: number | null;
  muted: boolean;
}> {
  try {
    const [token, hiddenRaw, muted] = await Promise.all([
      kvGet(TOKEN_STORAGE_KEY),
      kvGet(HIDDEN_STORAGE_KEY),
      readSoundMuted(),
    ]);
    const parsedHidden: unknown = hiddenRaw ? JSON.parse(hiddenRaw) : [];
    const hidden = Array.isArray(parsedHidden)
      ? parsedHidden.filter((seq): seq is number => typeof seq === "number")
      : [];
    const seen = await readSeenSequence(token);
    return { token, hidden, seen, muted };
  } catch {
    return { token: null, hidden: [], seen: null, muted: false };
  }
}

/**
 * Tracks unread assistant replies across tabs in `TabsLayout` so the elevated center orb
 * and desktop floating orb display live unread counts and peek previews when minimized.
 */
export function useMobileAssistantAlerts({
  activeOnChat,
  enabled = true,
}: {
  activeOnChat: boolean;
  enabled?: boolean;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [storageReady, setStorageReady] = useState(false);
  const [hidden, setHidden] = useState<number[]>([]);
  const [seenState, setSeenState] = useState<{ token: string; sequence: number } | null>(null);
  const [muted, setMuted] = useState(false);
  const [dismissedPeekSeq, setDismissedPeekSeq] = useState<number | null>(null);
  const [nudgeVisible, setNudgeVisible] = useState(false);
  const lastAlertedSeqRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      lastAlertedSeqRef.current = 0;
      return;
    }
    let mounted = true;
    const syncFromStorage = () => {
      void readAlertSnapshot().then((snap) => {
        if (!mounted) return;
        setToken(snap.token);
        setHidden(snap.hidden);
        setMuted(snap.muted);
        setStorageReady(true);
        if (snap.token && snap.seen !== null) {
          lastAlertedSeqRef.current = Math.max(lastAlertedSeqRef.current, snap.seen);
          setSeenState({ token: snap.token, sequence: snap.seen });
        } else if (!snap.token) {
          setSeenState(null);
          lastAlertedSeqRef.current = 0;
        }
      });
    };

    syncFromStorage();
    const sub = DeviceEventEmitter.addListener(SYNC_EVENT, syncFromStorage);
    return () => {
      mounted = false;
      sub.remove();
    };
  }, [enabled]);

  const activeToken = enabled ? token : null;

  // Show a gentle first-visit nudge once per app launch when the customer has no open chat yet.
  useEffect(() => {
    if (activeOnChat || !enabled || !storageReady || activeToken !== null || nudgeDismissedThisLaunch) {
      return;
    }
    const showTimer = setTimeout(() => setNudgeVisible(true), 1800);
    const hideTimer = setTimeout(() => {
      setNudgeVisible(false);
      nudgeDismissedThisLaunch = true;
    }, 8500);
    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    };
  }, [activeOnChat, activeToken, enabled, storageReady]);

  const forgetToken = useCallback(() => {
    setToken(null);
    setSeenState(null);
    void kvRemove(TOKEN_STORAGE_KEY);
    void writeSeenSequence(null, 0);
  }, []);

  const conversation = useConversation(activeToken, forgetToken);

  const visibleMessages = useMemo(
    () => filterVisibleAssistantMessages(conversation.data?.messages, hidden),
    [conversation.data?.messages, hidden],
  );

  // Establish baseline or advance seen sequence when actively viewing /ai-chat.
  useEffect(() => {
    if (!activeToken) return;
    let mounted = true;
    const latestSeq = visibleMessages.reduce((max, m) => Math.max(max, m.sequence), 0);
    if (activeOnChat) {
      lastAlertedSeqRef.current = Math.max(lastAlertedSeqRef.current, latestSeq);
      void writeSeenSequence(activeToken, latestSeq).then(() => {
        if (!mounted) return;
        setSeenState((prev) =>
          prev?.token === activeToken && prev.sequence >= latestSeq
            ? prev
            : { token: activeToken, sequence: latestSeq },
        );
        setDismissedPeekSeq(null);
      });
      return () => {
        mounted = false;
      };
    }
    if (seenState?.token !== activeToken && conversation.data) {
      lastAlertedSeqRef.current = latestSeq;
      void writeSeenSequence(activeToken, latestSeq).then(() => {
        if (!mounted) return;
        setSeenState({ token: activeToken, sequence: latestSeq });
      });
    }
    return () => {
      mounted = false;
    };
  }, [activeOnChat, activeToken, conversation.data, seenState?.token, visibleMessages]);

  const unreadMessages = useMemo(() => {
    if (activeOnChat || !activeToken || seenState?.token !== activeToken) return [];
    return visibleMessages.filter(
      (message) => message.sender === "assistant" && message.sequence > seenState.sequence,
    );
  }, [activeOnChat, activeToken, seenState, visibleMessages]);

  const unreadCount = unreadMessages.length;
  const latestUnread = unreadCount > 0 ? unreadMessages[unreadCount - 1] : null;

  useEffect(() => {
    if (activeOnChat || !latestUnread) return;
    if (latestUnread.sequence <= lastAlertedSeqRef.current) return;
    lastAlertedSeqRef.current = latestUnread.sequence;
    if (!muted) notifyReplyAlert();
  }, [activeOnChat, latestUnread, muted]);

  const dismissPeek = useCallback(() => {
    if (latestUnread) setDismissedPeekSeq(latestUnread.sequence);
  }, [latestUnread]);

  const dismissNudge = useCallback(() => {
    nudgeDismissedThisLaunch = true;
    setNudgeVisible(false);
  }, []);

  return {
    unreadCount,
    latestUnread:
      !activeOnChat && latestUnread && dismissedPeekSeq !== latestUnread.sequence
        ? latestUnread
        : null,
    nudgeVisible: !activeOnChat && enabled && activeToken === null && nudgeVisible,
    dismissPeek,
    dismissNudge,
  };
}
