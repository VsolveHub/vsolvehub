"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FlaticonIcon } from "@/components/ui/FlaticonIcon";
import { LoadingState } from "@/components/ui/LoadingState";
import type { AppNotification } from "@/lib/notifications/types";
import { formatRelativeTime } from "@/lib/notifications/format";
import { countUnread, useNotificationReadState } from "./useNotificationReadState";

type Audience = "customer" | "provider";

type Props = {
  audience: Audience;
  backHref: string;
  backLabel: string;
};

const API: Record<Audience, string> = {
  customer: "/api/notifications",
  provider: "/api/provider/notifications",
};

export function NotificationsScreen({ audience, backHref, backLabel }: Props) {
  const router = useRouter();
  const { readIds, markRead, markAllRead } = useNotificationReadState(audience);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(API[audience]);
        if (!active) return;

        if (res.status === 401) {
          const redirect =
            audience === "customer"
              ? "/booking/otp?redirect=/notifications"
              : "/partner/login?redirect=/partner/notifications";
          router.replace(redirect);
          return;
        }

        if (!res.ok) {
          setError("Could not load notifications.");
          setLoading(false);
          return;
        }

        const json = (await res.json()) as { items: AppNotification[] };
        setItems(json.items ?? []);
        setLoading(false);
      } catch {
        if (!active) return;
        setError("Could not load notifications.");
        setLoading(false);
      }
    }

    load();
    const interval = setInterval(load, 15_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [audience, router]);

  const unread = countUnread(
    items.map((n) => n.id),
    readIds
  );

  function openItem(item: AppNotification) {
    markRead(item.id);
    router.push(item.href);
  }

  return (
    <div className="notif-page">
      <header className="notif-page-header">
        <div className="notif-page-toprow">
          <Link href={backHref} className="notif-page-back">
            <span className="notif-page-back-icon" aria-hidden>
              ←
            </span>
            <span>{backLabel}</span>
          </Link>
          {unread > 0 && (
            <button
              type="button"
              className="notif-page-mark-all"
              onClick={() => markAllRead(items.map((n) => n.id))}
            >
              Mark all read
            </button>
          )}
        </div>

        <h1 className="notif-page-title">Notifications</h1>
        <p className="notif-page-sub">
          {unread > 0 ? `${unread} unread` : "Booking status updates"}
        </p>
      </header>

      {loading && <LoadingState label="Loading notifications…" variant="inline" />}

      {!loading && error && <div className="alert alert-error">{error}</div>}

      {!loading && !error && items.length === 0 && (
        <div className="notif-page-empty">
          <FlaticonIcon name="bell" size={36} color="var(--color-text-muted)" />
          <p>No notifications yet.</p>
          <span className="text-sm text-muted">
            Updates appear here when your bookings change status.
          </span>
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <ul className="notif-page-list">
          {items.map((item) => {
            const isUnread = !readIds.has(item.id);
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className={`notif-page-item notif-page-item--${item.tone}${isUnread ? " is-unread" : ""}`}
                  onClick={() => openItem(item)}
                >
                  <span className={`notif-page-icon notif-page-icon--${item.tone}`}>
                    <FlaticonIcon name={item.icon} size={20} color="currentColor" />
                  </span>
                  <span className="notif-page-body">
                    <strong>{item.title}</strong>
                    <span className="notif-page-text">{item.body}</span>
                    <span className="notif-page-time">{formatRelativeTime(item.createdAt)}</span>
                  </span>
                  {isUnread && <span className="notif-page-dot" aria-hidden />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
