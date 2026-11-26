"use client";

import { useSyncExternalStore } from "react";

export const ASSISTANT_HIDDEN_PREFIXES = [
  "/cart",
  "/checkout",
  "/login",
  "/signup",
  "/book/",
  "/bookings/",
] as const;

export function isAssistantRouteAvailable(pathname: string): boolean {
  if (process.env.NEXT_PUBLIC_ASSISTANT_ENABLED !== "true") return false;
  return !ASSISTANT_HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export interface AssistantLauncherSnapshot {
  open: boolean;
  unreadCount: number;
}

let snapshot: AssistantLauncherSnapshot = { open: false, unreadCount: 0 };
const stateListeners = new Set<() => void>();
const openListeners = new Set<() => void>();

function emitState() {
  for (const listener of stateListeners) listener();
}

function subscribeState(listener: () => void) {
  stateListeners.add(listener);
  return () => {
    stateListeners.delete(listener);
  };
}

function getSnapshot(): AssistantLauncherSnapshot {
  return snapshot;
}

/** Reactive launcher open/unread state so mobile BottomNav stays in sync with AssistantWidget. */
export function useAssistantLauncherState(): AssistantLauncherSnapshot {
  return useSyncExternalStore(subscribeState, getSnapshot, getSnapshot);
}

export function updateAssistantLauncherState(next: AssistantLauncherSnapshot): void {
  if (snapshot.open === next.open && snapshot.unreadCount === next.unreadCount) return;
  snapshot = next;
  emitState();
}

export function requestOpenAssistant(): void {
  for (const listener of openListeners) listener();
}

export function subscribeOpenAssistant(listener: () => void): () => void {
  openListeners.add(listener);
  return () => {
    openListeners.delete(listener);
  };
}
