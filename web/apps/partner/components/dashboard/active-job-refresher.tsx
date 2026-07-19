"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { jsonFetch } from "@/lib/query";

/**
 * Keeps the dashboard live without page reloads. Polls a tiny change-token for
 * the partner's active job every few seconds; when it changes — a new job was
 * directly assigned, or the job's status moved — it calls router.refresh(),
 * which re-runs the server component and feeds fresh props to captain-live. That
 * reuses all existing serialization (no duplication) and captain-live's own
 * stage-sync effect advances the work loop.
 *
 * Renders nothing. Polling (not websockets) keeps this portable to a future
 * non-Supabase backend.
 */
export function ActiveJobRefresher({ enabled = true }: { enabled?: boolean }) {
  const router = useRouter();
  const lastToken = useRef<string | null>(null);

  const { data } = useQuery({
    queryKey: ["active-job-token"],
    queryFn: () => jsonFetch<{ token: string }>("/api/jobs/active", { cache: "no-store" }),
    refetchInterval: 3000,
    enabled,
  });

  useEffect(() => {
    const token = data?.token;
    if (!token) return;
    // Seed on first read so we don't refresh on initial mount (props are fresh).
    if (lastToken.current === null) {
      lastToken.current = token;
      return;
    }
    if (token !== lastToken.current) {
      lastToken.current = token;
      router.refresh();
    }
  }, [data?.token, router]);

  return null;
}
