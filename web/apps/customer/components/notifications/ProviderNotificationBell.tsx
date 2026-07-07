"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { FlaticonIcon } from "@/components/ui/FlaticonIcon";
import { countUnread, useNotificationReadState } from "@/components/notifications/useNotificationReadState";
import { api } from "@/lib/query/api";
import { qk } from "@/lib/query/keys";

type Props = {
  className?: string;
};

export function ProviderNotificationBell({ className = "mode-topbar-bell" }: Props) {
  const router = useRouter();
  const { readIds } = useNotificationReadState("provider");
  const { data } = useQuery({
    queryKey: qk.notifications("provider"),
    queryFn: () => api.notifications("provider"),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const unread = countUnread((data?.items ?? []).map((n) => n.id), readIds);

  return (
    <button
      type="button"
      className={className}
      onClick={() => router.push("/partner/notifications")}
      aria-label={unread > 0 ? `${unread} unread notifications` : "Notifications"}
    >
      <span className="mode-topbar-bell-wrap">
        <FlaticonIcon name="bell" size={20} />
        {unread > 0 && (
          <span className="mode-topbar-bell-badge">{unread > 9 ? "9+" : unread}</span>
        )}
      </span>
    </button>
  );
}
