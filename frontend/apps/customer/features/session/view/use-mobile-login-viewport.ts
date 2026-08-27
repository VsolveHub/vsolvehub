"use client";

import { useSyncExternalStore } from "react";

const MOBILE_LOGIN_QUERY = "(max-width: 767px)";

function subscribe(onStoreChange: () => void): () => void {
  const media = window.matchMedia(MOBILE_LOGIN_QUERY);
  media.addEventListener("change", onStoreChange);
  return () => media.removeEventListener("change", onStoreChange);
}

function getSnapshot(): boolean {
  return window.matchMedia(MOBILE_LOGIN_QUERY).matches;
}

/** True below the `md` breakpoint — dedicated mobile login layout. */
export function useMobileLoginViewport(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
