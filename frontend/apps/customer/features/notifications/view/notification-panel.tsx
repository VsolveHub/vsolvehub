"use client";

import { describeError } from "@vsolve/query";
import { Button, EmptyState, ErrorState, Sheet, Skeleton, cn } from "@vsolve/ui";
import { X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { isUnread, targetHref } from "../model/feed";
import {
  useMarkNotificationRead,
  useNotificationFeed,
  useUnreadNotificationCount,
  type Notification,
} from "../queries";

export interface NotificationPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NotificationPanel({ open, onOpenChange }: NotificationPanelProps) {
  const [visitId, setVisitId] = useState(0);

  return (
    <NotificationPanelBody
      key={visitId}
      open={open}
      onOpenChange={(next) => {
        if (!next) setVisitId((id) => id + 1);
        onOpenChange(next);
      }}
    />
  );
}

function NotificationPanelBody({ open, onOpenChange }: NotificationPanelProps) {
  const feed = useNotificationFeed(open);
  const count = useUnreadNotificationCount();
  const markRead = useMarkNotificationRead();
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [dismissedAll, setDismissedAll] = useState(false);

  const rawRows = (feed.data?.pages ?? []).flatMap((page) => page.results);
  const rows = dismissedAll ? [] : rawRows.filter((item) => !dismissedIds.has(item.id));

  const unreadTotal = count.data?.unread ?? null;
  const canMarkAll = unreadTotal !== null && unreadTotal > 0 && !markRead.isPending;
  const markFailure = markRead.isError ? describeError(markRead.error, "mutation") : null;

  const handleDismiss = (id: string) => {
    setDismissedIds((prev) => new Set(prev).add(id));
    markRead.mutate({ all: false, notificationId: id });
  };

  const handleDismissAll = () => {
    setDismissedAll(true);
    markRead.mutate({ all: true });
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Notifications"
      description="Updates about your requests, bookings and projects."
      className={cn(
        // Desktop: dropdown panel under the header bell, not a centred modal.
        "md:inset-x-auto md:right-4 md:bottom-auto md:top-[calc(4rem+0.25rem)]",
        "md:w-[min(24rem,calc(100vw-2rem))] md:max-w-none md:max-h-[min(32rem,calc(100vh-5.5rem))]",
        "md:rounded-card md:rounded-b-card",
      )}
      footer={
        <Button
          variant="ghost"
          disabled={!canMarkAll}
          loading={markRead.isPending}
          loadingLabel="Marking read"
          onClick={handleDismissAll}
        >
          Mark all read
        </Button>
      }
    >
      {markFailure !== null ? (
        <ErrorState
          inline
          className="mb-4"
          title={markFailure.title}
          message={markFailure.message}
          severity={markFailure.severity}
          reference={markFailure.reference}
        />
      ) : null}

      <FeedBody
        feed={feed}
        rows={rows}
        onDismissRow={handleDismiss}
        onOpenRow={(notification) => {
          if (isUnread(notification)) {
            markRead.mutate({ all: false, notificationId: notification.id });
          }
          // A linked row navigates; leaving the sheet open would stack it over
          // whatever it opened.
          if (targetHref(notification.target) !== null) onOpenChange(false);
        }}
      />
    </Sheet>
  );
}

function FeedBody({
  feed,
  rows,
  onOpenRow,
  onDismissRow,
}: {
  feed: ReturnType<typeof useNotificationFeed>;
  rows: Notification[];
  onOpenRow: (notification: Notification) => void;
  onDismissRow: (id: string) => void;
}) {
  if (feed.isPending) {
    return (
      <div aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading your notifications</span>
        <Skeleton className="h-16 w-full" />
        <Skeleton className="mt-2 h-16 w-full" />
        <Skeleton className="mt-2 h-16 w-full" />
      </div>
    );
  }

  // A failed read is never an empty list. See the module header.
  if (feed.isError) {
    const presentation = describeError(feed.error, "read");
    return (
      <ErrorState
        title={presentation.title}
        message={presentation.message}
        severity={presentation.severity}
        actionLabel="Try again"
        onAction={() => void feed.refetch()}
        reference={presentation.reference}
      />
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        compact
        title="Nothing new"
        description="When a professional responds, work needs checking or a payment changes, it appears here."
      />
    );
  }

  return (
    <>
      <ul className="flex list-none flex-col gap-2 p-0">
        {rows.map((notification) => (
          <Row
            key={notification.id}
            notification={notification}
            onOpen={onOpenRow}
            onDismiss={onDismissRow}
          />
        ))}
      </ul>

      {feed.hasNextPage ? (
        <div className="mt-4">
          <Button
            variant="outline"
            onClick={() => void feed.fetchNextPage()}
            loading={feed.isFetchingNextPage}
            loadingLabel="Loading older"
          >
            Show older
          </Button>
        </div>
      ) : null}
    </>
  );
}

function Row({
  notification,
  onOpen,
  onDismiss,
}: {
  notification: Notification;
  onOpen: (notification: Notification) => void;
  onDismiss: (id: string) => void;
}) {
  const href = targetHref(notification.target);
  const unread = isUnread(notification);

  const shell = "relative rounded-card border p-3 text-left";
  const tone = unread ? "border-line bg-surface-sunken" : "border-line bg-surface";

  return (
    <li className="relative">
      <div className={cn("flex flex-col gap-1", shell, tone, "transition-colors")}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            {href !== null ? (
              <Link
                href={href}
                onClick={() => onOpen(notification)}
                className="group block"
              >
                <RowContent notification={notification} unread={unread} />
              </Link>
            ) : unread ? (
              <button
                type="button"
                onClick={() => onOpen(notification)}
                className="text-left w-full cursor-pointer"
              >
                <RowContent notification={notification} unread={unread} />
              </button>
            ) : (
              <RowContent notification={notification} unread={unread} />
            )}
          </div>

          {/* Dismiss (X) button for every notification */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onDismiss(notification.id);
            }}
            title="Remove notification"
            aria-label={`Remove notification: ${notification.title}`}
            className="shrink-0 -mr-1 -mt-1 grid size-7 place-items-center rounded-full text-text-muted hover:bg-surface-hover hover:text-navy-900 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
    </li>
  );
}

function RowContent({
  notification,
  unread,
}: {
  notification: Notification;
  unread: boolean;
}) {
  return (
    <>
      <div className="flex items-start gap-2">
        {/* The unread affordance is a dot *and* a word. Colour alone would carry
            the state to sighted readers only, and this is the difference
            between a notice somebody has dealt with and one they have not. */}
        {unread ? (
          <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-action" />
        ) : null}
        <p className={cn("min-w-0 flex-1 text-sm", unread ? "font-semibold text-text" : "text-text")}>
          {notification.title}
          {unread ? <span className="sr-only"> (unread)</span> : null}
        </p>
      </div>

      <p className="mt-1 text-sm leading-6 text-text-secondary">{notification.body}</p>

      <p className="mt-1 text-xs text-text-muted">
        <time dateTime={notification.created_at} title={absoluteWhen(notification.created_at)}>
          {relativeWhen(notification.created_at)}
        </time>
      </p>
    </>
  );
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** The same absolute format the request timeline uses, so dates read alike. */
function absoluteWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * "Just now" through "23 hr ago", then the date.
 *
 * A future timestamp is clamped to "Just now" rather than rendered as "in 2
 * minutes": the only way one arrives is a device clock running behind the
 * server's, and a notice that has already been delivered must not be described
 * as not having happened yet. The exact instant is always on the `<time>`
 * element's `dateTime` and `title`, so nothing is lost to the rounding.
 */
function relativeWhen(iso: string): string {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return "";

  const elapsed = Date.now() - at;
  if (elapsed < MINUTE_MS) return "Just now";
  if (elapsed < HOUR_MS) return `${Math.floor(elapsed / MINUTE_MS)} min ago`;
  if (elapsed < DAY_MS) return `${Math.floor(elapsed / HOUR_MS)} hr ago`;
  return absoluteWhen(iso);
}
