"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { BellIcon } from "@/components/ui/AppIcons";
import { countUnread, useNotificationReadState } from "@/components/notifications/useNotificationReadState";
import { api } from "@/lib/query/api";
import { qk } from "@/lib/query/keys";

export function CustomerNotificationBell() {
  const { readIds } = useNotificationReadState("customer");
  const { data } = useQuery({
    queryKey: qk.notifications("customer"),
    queryFn: () => api.notifications("customer"),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const unread = countUnread((data?.items ?? []).map((n) => n.id), readIds);

  return (
    <Link
      href="/notifications"
      className="relative inline-flex h-10 w-10 items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-gray-100"
      aria-label={unread > 0 ? `${unread} unread notifications` : "Notifications"}
    >
      <BellIcon />
      {unread > 0 && (
        <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full border-2 border-white bg-[var(--color-brand-accent)]" />
      )}
    </Link>
  );
}
