"use client";

import { useEffect, useRef } from "react";

const SEEN_STORAGE_KEY = "vsolve.assistant.seen";
const MUTED_STORAGE_KEY = "vsolve.assistant.muted";
const NUDGE_DISMISSED_KEY = "vsolve.assistant.nudge_dismissed";

interface StoredSeen {
  token: string;
  sequence: number;
}

/** Reads the highest message sequence already seen for `token` in this browser. */
export function readSeenSequence(token: string | null): number | null {
  if (!token) return null;
  try {
    const raw = window.localStorage.getItem(SEEN_STORAGE_KEY);
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

/** Saves the highest message sequence seen for `token` so reload keeps unread state accurate. */
export function writeSeenSequence(token: string | null, sequence: number): void {
  try {
    if (!token) {
      window.localStorage.removeItem(SEEN_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify({ token, sequence }));
  } catch {
    // Private browsing or disabled storage: unread state stays in memory only.
  }
}

export function readSoundMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function writeSoundMuted(muted: boolean): void {
  try {
    window.localStorage.setItem(MUTED_STORAGE_KEY, String(muted));
  } catch {
    // Storage disabled: mute preference applies for this session only.
  }
}

export function readNudgeDismissed(): boolean {
  try {
    return window.sessionStorage.getItem(NUDGE_DISMISSED_KEY) === "true";
  } catch {
    return false;
  }
}

export function writeNudgeDismissed(): void {
  try {
    window.sessionStorage.setItem(NUDGE_DISMISSED_KEY, "true");
  } catch {
    // Ignore storage failure.
  }
}

/** Plays a soft two-note notification chime when an assistant reply arrives. */
export function playReplyChime(): void {
  if (typeof window === "undefined") return;
  try {
    const AudioCtx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const notes = [587.33, 880];
    notes.forEach((frequency, index) => {
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
    window.setTimeout(() => {
      void ctx.close().catch(() => undefined);
    }, 500);
  } catch {
    // Autoplay policy or missing Web Audio API: skip chime silently.
  }
}

/**
 * Surfaces unread reply counts in the browser tab title while the tab is hidden,
 * restoring the page's real title as soon as the customer returns or reads the chat.
 */
export function useDocumentTitleAlert(unreadCount: number): void {
  const baseTitleRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const syncTitle = () => {
      if (unreadCount > 0 && document.hidden) {
        if (baseTitleRef.current === null) {
          baseTitleRef.current = document.title;
        }
        const prefix = unreadCount === 1 ? "(1) New reply" : `(${unreadCount}) New replies`;
        document.title = `${prefix} — ${baseTitleRef.current}`;
      } else if (baseTitleRef.current !== null) {
        document.title = baseTitleRef.current;
        baseTitleRef.current = null;
      }
    };

    syncTitle();
    document.addEventListener("visibilitychange", syncTitle);
    window.addEventListener("focus", syncTitle);
    return () => {
      document.removeEventListener("visibilitychange", syncTitle);
      window.removeEventListener("focus", syncTitle);
      if (baseTitleRef.current !== null) {
        document.title = baseTitleRef.current;
        baseTitleRef.current = null;
      }
    };
  }, [unreadCount]);
}
