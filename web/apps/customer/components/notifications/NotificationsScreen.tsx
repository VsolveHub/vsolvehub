"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { FlaticonIcon } from "@/components/ui/FlaticonIcon";
import { LoadingState } from "@/components/ui/LoadingState";
import type { AppNotification } from "@/lib/notifications/types";
import { formatRelativeTime } from "@/lib/notifications/format";
import { countUnread, useNotificationReadState } from "./useNotificationReadState";
import { api, ApiError } from "@/lib/query/api";
import { qk } from "@/lib/query/keys";

type Audience = "customer" | "provider";

type Props = {
  audience: Audience;
  backHref: string;
  backLabel: string;
};

export function NotificationsScreen({ audience, backHref, backLabel }: Props) {
  const router = useRouter();
  const { readIds, markRead, markAllRead } = useNotificationReadState(audience);

  const { data, isLoading, error } = useQuery({
    queryKey: qk.notifications(audience),
    queryFn: () => api.notifications(audience),
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  // A 401 means the session lapsed — bounce to the right sign-in screen.
  useEffect(() => {
    if (error instanceof ApiError && error.status === 401) {
      router.replace(
        audience === "customer"
          ? "/booking/otp?redirect=/notifications"
          : "/partner/login?redirect=/partner/notifications",
      );
    }
  }, [error, audience, router]);

  const items = data?.items ?? [];
  const loading = isLoading;
  const loadError = error && !(error instanceof ApiError && error.status === 401)
    ? "Could not load notifications."
    : "";

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

      {!loading && loadError && <div className="alert alert-error">{loadError}</div>}

      {!loading && !loadError && items.length === 0 && (
        <div className="empty-state notif-page-empty">
          <div className="empty-state-icon" aria-hidden>
            <FlaticonIcon name="bell" size={36} color="var(--vs-purple-700)" />
          </div>
          <p>No notifications yet.</p>
          <span className="text-sm text-muted">
            Updates appear here when your bookings change status.
          </span>
        </div>
      )}

      {!loading && !loadError && items.length > 0 && (
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
