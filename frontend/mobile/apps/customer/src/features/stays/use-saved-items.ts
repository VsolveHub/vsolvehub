import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";

export type SavedKind = "listing" | "rental" | "stay";

function storageKey(kind: SavedKind): string {
  return `vsolve-saved-${kind}`;
}

export function useSavedItems(kind: SavedKind) {
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    void AsyncStorage.getItem(storageKey(kind))
      .then((raw) => {
        if (!cancelled && raw) {
          try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              setIds(parsed.filter((item): item is string => typeof item === "string"));
            }
          } catch {
            // ignore
          }
        }
      })
      .catch((err) => {
        console.warn("[useSavedItems] Failed to read saved items from storage:", err);
      });

    return () => {
      cancelled = true;
    };
  }, [kind]);

  const toggle = useCallback(
    (id: string) => {
      setIds((current) => {
        const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
        void AsyncStorage.setItem(storageKey(kind), JSON.stringify(next)).catch((err) => {
          console.warn("[useSavedItems] Failed to persist saved items to storage:", err);
        });
        return next;
      });
    },
    [kind]
  );

  return {
    ids,
    isSaved: (id: string) => ids.includes(id),
    toggle,
  };
}
