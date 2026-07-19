"use client";

import { useCallback, useEffect, useState } from "react";
import { getCookie, setCookie } from "@/lib/cookies";

function storageKey(audience: "customer" | "provider") {
  return `vsh_notif_read_${audience}`;
}

export function useNotificationReadState(audience: "customer" | "provider") {
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    try {
      const raw = getCookie(storageKey(audience));
      if (raw) {
        const parsed = JSON.parse(raw) as string[];
        setReadIds(new Set(parsed));
      }
    } catch {
      setReadIds(new Set());
    }
  }, [audience]);

  const persist = useCallback(
    (next: Set<string>) => {
      setReadIds(next);
      try {
        setCookie(storageKey(audience), JSON.stringify([...next]), 30); // keep read states for 30 days
      } catch {
        /* ignore errors */
      }
    },
    [audience]
  );

  function markRead(id: string) {
    persist(new Set(readIds).add(id));
  }

  function markAllRead(ids: string[]) {
    persist(new Set(ids));
  }

  return { readIds, markRead, markAllRead };
}

export function countUnread(ids: string[], readIds: Set<string>) {
  return ids.filter((id) => !readIds.has(id)).length;
}
