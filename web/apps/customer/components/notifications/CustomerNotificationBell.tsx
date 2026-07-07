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
      className="icon-btn notif-btn"
      aria-label={unread > 0 ? `${unread} unread notifications` : "Notifications"}
    >
      <BellIcon />
      {unread > 0 && <span className="notif-dot" />}
    </Link>
  );
}
