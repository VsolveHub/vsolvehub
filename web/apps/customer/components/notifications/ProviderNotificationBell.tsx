"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FlaticonIcon } from "@/components/ui/FlaticonIcon";
import { countUnread, useNotificationReadState } from "@/components/notifications/useNotificationReadState";
import type { AppNotification } from "@/lib/notifications/types";

type Props = {
  className?: string;
};

export function ProviderNotificationBell({ className = "mode-topbar-bell" }: Props) {
  const router = useRouter();
  const { readIds } = useNotificationReadState("provider");
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const res = await fetch("/api/provider/notifications");
        if (!active || !res.ok) return;
        const json = (await res.json()) as { items: AppNotification[] };
        setUnread(countUnread((json.items ?? []).map((n) => n.id), readIds));
      } catch {
        // Network errors (dev server restart / offline) shouldn't crash the portal chrome.
      }
    }

    load();
    const interval = setInterval(load, 30_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [readIds]);

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
