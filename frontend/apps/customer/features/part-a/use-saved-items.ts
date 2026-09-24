"use client";

import { useCallback, useEffect, useState } from "react";

export type SavedKind = "listing" | "rental" | "stay";

function storageKey(kind: SavedKind): string {
  return `vsolve-saved-${kind}`;
}

function readIds(kind: SavedKind): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(kind));
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

/** Browser-only hearts. Not a server ledger. */
export function useSavedItems(kind: SavedKind) {
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    setIds(readIds(kind));
  }, [kind]);

  const persist = useCallback(
    (next: string[]) => {
      setIds(next);
      window.localStorage.setItem(storageKey(kind), JSON.stringify(next));
    },
    [kind],
  );

  const toggle = useCallback(
    (id: string) => {
      const current = readIds(kind);
      persist(current.includes(id) ? current.filter((row) => row !== id) : [...current, id]);
    },
    [kind, persist],
  );

  return {
    ids,
    isSaved: (id: string) => ids.includes(id),
    toggle,
  };
}
