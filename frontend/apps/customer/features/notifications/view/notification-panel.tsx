"use client";

import { describeError } from "@vsolve/query";
import { Button, EmptyState, ErrorState, Sheet, Skeleton, cn } from "@vsolve/ui";
import Link from "next/link";

import { isUnread, targetHref } from "../model/feed";
import {
  useMarkNotificationRead,
  useNotificationFeed,
  useUnreadNotificationCount,
  type Notification,
} from "../queries";

/**
 * The notice list behind the bell — `M2-FE-720`.
 *
 * ## Why a `Sheet` and not a popover
 *
 * There is no popover primitive in `@vsolve/ui`, and `dialog.tsx` argues at
 * length against rolling one: the native `<dialog>` gives focus trapping,
 * Escape, background inertness and top-layer rendering for free, and a
 * hand-rolled overlay gets some of that wrong every time. A notification panel
 * is a list somebody reads and acts on, so all four of those matter — not least
 * because half its rows are links that navigate away.
 *
 * `Sheet` rather than `Dialog` because on a phone the bottom edge is the
 * reachable position for a list, and this list is read one-handed far more
 * often than not.
 *
 * ## Three branches, never two
 *
 * Pending, failed and empty are three different sentences and they are rendered
 * as three. Collapsing failed into empty is the specific defect worth naming:
 * they look identical on screen and mean opposite things, and "you have no
 * notifications" is the more damaging of the two to say wrongly — somebody with
 * a stage awaiting review would conclude nothing needs them.
 *
 * ## The feed is not read until this opens
 *
 * `useNotificationFeed(open)` is the whole reason the unread count is a separate
 * endpoint. The badge is live on every authenticated screen; the list is a
 * request made once, when a person asks for it.
 */

export interface NotificationPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NotificationPanel({ open, onOpenChange }: NotificationPanelProps) {
  const feed = useNotificationFeed(open);
  const count = useUnreadNotificationCount();
  const markRead = useMarkNotificationRead();

  const rows = (feed.data?.pages ?? []).flatMap((page) => page.results);

  // Gated on the server's own total rather than on what this page happens to
  // hold: "Mark all read" clears every notice, including ones below the cursor,
  // so counting the loaded rows would disable it while older unread notices
  // remain. `null` while unknown — the button is simply not offered.
  const unreadTotal = count.data?.unread ?? null;
  const canMarkAll = unreadTotal !== null && unreadTotal > 0 && !markRead.isPending;

  // A refused mark is reported where the press happened, inline, rather than
  // replacing the list — the notices are still readable and still correct.
  const markFailure = markRead.isError ? describeError(markRead.error, "mutation") : null;

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Notifications"
      description="Updates about your requests, bookings and projects."
      footer={
        <Button
          variant="ghost"
          disabled={!canMarkAll}
          loading={markRead.isPending}
          loadingLabel="Marking read"
          onClick={() => markRead.mutate({ all: true })}
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
}: {
  feed: ReturnType<typeof useNotificationFeed>;
  rows: Notification[];
  onOpenRow: (notification: Notification) => void;
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
          <Row key={notification.id} notification={notification} onOpen={onOpenRow} />
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

/**
 * One notice, in one of three shapes.
 *
 * A row that leads somewhere is a link. A row that leads nowhere but is still
 * unread is a button — "opening" it is the acknowledgement, and it is the only
 * way an account-level notice ever gets cleared individually. A row that leads
 * nowhere and is already read is neither: offering a control that does nothing
 * is offering a dead press.
 */
function Row({
  notification,
  onOpen,
}: {
  notification: Notification;
  onOpen: (notification: Notification) => void;
}) {
  const href = targetHref(notification.target);
  const unread = isUnread(notification);

  const body = <RowContent notification={notification} unread={unread} />;

  // Mutually exclusive sets rather than overrides: `cn` has no tailwind-merge,
  // so a later class does not win against an earlier one of the same property.
  const shell = "rounded-card border p-3 text-left";
  const tone = unread ? "border-line bg-surface-sunken" : "border-line bg-surface";
  const focus =
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action";

  if (href !== null) {
    return (
      <li>
        <Link
          href={href}
          onClick={() => onOpen(notification)}
          className={cn("block", shell, tone, "hover:bg-surface-hover", focus)}
        >
          {body}
        </Link>
      </li>
    );
  }

  if (unread) {
    return (
      <li>
        <button
          type="button"
          onClick={() => onOpen(notification)}
          className={cn("block w-full", shell, tone, "hover:bg-surface-hover", focus)}
        >
          {body}
        </button>
      </li>
    );
  }

  return (
    <li>
      <div className={cn(shell, tone)}>{body}</div>
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
