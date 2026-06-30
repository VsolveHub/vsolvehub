"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BellIcon } from "@/components/ui/AppIcons";
import { countUnread, useNotificationReadState } from "@/components/notifications/useNotificationReadState";
import type { AppNotification } from "@/lib/notifications/types";

export function CustomerNotificationBell() {
  const { readIds } = useNotificationReadState("customer");
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const res = await fetch("/api/notifications");
        if (!active || !res.ok) return;
        const json = (await res.json()) as { items: AppNotification[] };
        setUnread(countUnread((json.items ?? []).map((n) => n.id), readIds));
      } catch {
        // Network errors (dev server restart / offline) shouldn't crash the app shell.
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
