"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { FlaticonIcon } from "@/components/ui/FlaticonIcon";
import { LoadingState } from "@/components/ui/LoadingState";
import { Alert, EmptyState } from "@/components/ui/primitives";
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
    <div className="mx-auto w-full max-w-2xl p-4">
      <header className="mb-5">
        <div className="mb-4 flex items-center justify-between">
          <Link
            href={backHref}
            className="inline-flex items-center gap-2 text-sm font-semibold text-gray-600 transition-colors hover:text-[var(--color-brand)]"
          >
            <span aria-hidden>←</span>
            <span>{backLabel}</span>
          </Link>
          {unread > 0 && (
            <button
              type="button"
              className="text-sm font-bold text-[var(--color-brand)] transition-opacity hover:opacity-70"
              onClick={() => markAllRead(items.map((n) => n.id))}
            >
              Mark all read
            </button>
          )}
        </div>

        <h1 className="text-2xl font-black tracking-tight text-gray-900">Notifications</h1>
        <p className="mt-1 text-sm text-gray-500">
          {unread > 0 ? `${unread} unread` : "Booking status updates"}
        </p>
      </header>

      {loading && <LoadingState label="Loading notifications…" variant="inline" />}

      {!loading && loadError && <Alert variant="error">{loadError}</Alert>}

      {!loading && !loadError && items.length === 0 && (
        <EmptyState
          icon={<FlaticonIcon name="bell" size={36} color="var(--color-brand)" />}
          title="No notifications yet."
          description="Updates appear here when your bookings change status."
        />
      )}

      {!loading && !loadError && items.length > 0 && (
        <ul className="flex flex-col gap-2">
          {items.map((item) => {
            const isUnread = !readIds.has(item.id);
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => openItem(item)}
                  className={`flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition-colors ${
                    isUnread
                      ? "border-[var(--color-brand)]/20 bg-[var(--color-brand-light)]/50"
                      : "border-gray-200 bg-white hover:bg-gray-50"
                  }`}
                >
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${TONE_STYLES[item.tone] ?? TONE_STYLES.default}`}>
                    <FlaticonIcon name={item.icon} size={20} color="currentColor" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <strong className="block text-sm font-bold text-gray-900">{item.title}</strong>
                    <span className="mt-0.5 block text-sm text-gray-600">{item.body}</span>
                    <span className="mt-1 block text-xs text-gray-400">
                      {formatRelativeTime(item.createdAt)}
                    </span>
                  </span>
                  {isUnread && (
                    <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--color-brand-accent)]" aria-hidden />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const TONE_STYLES: Record<string, string> = {
  success: "bg-green-100 text-green-700",
  warning: "bg-amber-100 text-amber-700",
  danger: "bg-red-100 text-red-700",
  error: "bg-red-100 text-red-700",
  info: "bg-blue-100 text-blue-700",
  default: "bg-[var(--color-brand-light)] text-[var(--color-brand)]",
};
