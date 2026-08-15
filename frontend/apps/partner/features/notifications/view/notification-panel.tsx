"use client";

import { Button, EmptyState, ErrorState, Sheet, cn } from "@vsolve/ui";
import { BellOff } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import { AsyncSection, asyncStateFrom } from "@/components/async-section";
import { timeAgo } from "@/lib/format";

import { isUnread, targetHref } from "../model/feed";
import {
  isNotificationNotFound,
  useMarkNotificationRead,
  useNotificationFeed,
  type Notification,
  type NotificationPage,
} from "../queries";

/**
 * The notification feed, in a bottom sheet.
 *
 * ## Why a `Sheet` and not a popover under the bell
 *
 * `Sheet` is the shared bottom-docked native `<dialog>`, and picking it settles
 * three questions at once rather than one:
 *
 *  - **Reach.** This app is used one-handed on a phone. A panel anchored to a
 *    control in the top bar puts its rows at the far end of the thumb's arc; a
 *    bottom sheet puts them under it.
 *  - **Z-index.** A modal `<dialog>` renders in the top layer, which is above
 *    every stacking context in the app by definition. The header is `z-30`, the
 *    tab bar `z-40` and the toasts `z-50`, and a hand-rolled popover would have
 *    had to pick a number in that ladder and then be re-picked every time the
 *    ladder changed.
 *  - **Dismissal and focus.** Escape closes it, focus is trapped inside it and the
 *    page behind it goes inert — all from the platform, none of it re-implemented
 *    per surface.
 *
 * ## Seven states, borrowed rather than re-derived
 *
 * Loading, offline, forbidden and server-error come from `AsyncSection`, which is
 * the one place this app decides what a failed read looks like. Writing four more
 * branches here is how three screens end up wording a lock-out three ways — the
 * lesson `PartnerShell` already learned about login forms. Empty and truncated are
 * this panel's own, because only it knows what an empty feed means; pending
 * belongs to the two controls that cause it.
 */

export interface NotificationPanelProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /**
   * The M2 workspace keys Django granted this Partner.
   *
   * Passed down rather than read here: the shell has already resolved them, and a
   * second `usePartnerWorkspaceGrants` inside a modal would be a duplicate request
   * for an answer that is on screen. `targetHref` explains what they decide.
   */
  readonly workspaceKeys: readonly string[];
  /**
   * The badge's number, or `null` where it is unknown.
   *
   * Only decides whether **Mark all read** is offered. It is the count read rather
   * than the loaded rows because "all" genuinely means all — including notices
   * older than the one page this panel holds.
   */
  readonly unreadCount: number | null;
}

export function NotificationPanel({
  open,
  onOpenChange,
  workspaceKeys,
  unreadCount,
}: NotificationPanelProps) {
  // Fetched when the panel opens, never before and never on a timer. See
  // `useNotificationFeed`.
  const feed = useNotificationFeed(open);
  const markRead = useMarkNotificationRead();

  /**
   * A refusal belongs to the visit it happened in.
   *
   * This panel is mounted for the whole session, so a failed mark-read would
   * otherwise still be on screen when the bell is next opened — an error about a
   * tap from an hour ago, sitting above a list that has been refetched since. The
   * mutation is reset on the way out rather than on the way in, so the message
   * stays visible for as long as the sheet that produced it is open.
   */
  const { reset: resetMarkRead } = markRead;
  useEffect(() => {
    if (!open) resetMarkRead();
  }, [open, resetMarkRead]);

  const state = asyncStateFrom<NotificationPage, NotificationPage>(feed, (page) => page);
  const hasUnread = unreadCount !== null && unreadCount > 0;

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Notifications"
      footer={
        hasUnread ? (
          <Button
            variant="ghost"
            onClick={() => markRead.mutate({ all: true })}
            loading={markRead.isPending}
            loadingLabel="Marking everything read"
            disabled={markRead.isPending}
          >
            Mark all read
          </Button>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-3">
        {markRead.isError ? <MarkReadRefusal error={markRead.error} /> : null}

        <AsyncSection
          state={state}
          label="Loading your notifications"
          isEmpty={(page) => page.results.length === 0}
          onRetry={() => void feed.refetch()}
          empty={
            <EmptyState
              compact
              icon={<BellOff size={24} aria-hidden />}
              title="Nothing to read yet"
              description="Vsolve tells you here when a job is confirmed, when a customer answers, and when money moves. There is nothing you need to do."
            />
          }
        >
          {(page) => (
            <>
              <ul className="flex list-none flex-col gap-1 p-0">
                {page.results.map((notification) => (
                  <li key={notification.id}>
                    <NotificationRow
                      notification={notification}
                      workspaceKeys={workspaceKeys}
                      onOpened={() => onOpenChange(false)}
                      onMarkRead={() =>
                        markRead.mutate({ notificationId: notification.id })
                      }
                    />
                  </li>
                ))}
              </ul>

              {/* Truncation, said rather than hidden. The newest are first, so
                  nothing waiting on the Partner is behind this line — but a capped
                  list that reads as a complete history is a quiet lie. */}
              {page.next === null ? null : (
                <p className="text-sm leading-6 text-text-secondary">
                  Only your most recent notices are shown here. Older ones stay on the job
                  they belong to.
                </p>
              )}
            </>
          )}
        </AsyncSection>
      </div>
    </Sheet>
  );
}

interface NotificationRowProps {
  readonly notification: Notification;
  readonly workspaceKeys: readonly string[];
  readonly onOpened: () => void;
  readonly onMarkRead: () => void;
}

/**
 * One notice.
 *
 * `title` and `body` are rendered by Django from `templates_registry`, so this
 * draws them and adds nothing: no client-side rewording, no severity inferred
 * from the purpose string, no icon chosen by matching a code prefix. A notice
 * whose copy changes on the server changes here on the next read.
 *
 * ## Exactly one control per row, and only where one is useful
 *
 * A linked notice gets **Open**; an unread notice with nowhere to go gets **Mark
 * read**; a read notice with nowhere to go gets neither, because there is nothing
 * left to do with it. The alternative — making the whole row a link or a button —
 * gives the control an accessible name that is the title, the body and the
 * timestamp read as one sentence, and nests the unread badge inside a control
 * where a screen reader announces it as part of the label.
 */
function NotificationRow({
  notification,
  workspaceKeys,
  onOpened,
  onMarkRead,
}: NotificationRowProps) {
  const href = targetHref(notification.target, workspaceKeys);
  const unread = isUnread(notification);

  return (
    <article
      className={cn(
        "flex flex-col gap-1 rounded-card border border-line p-3",
        unread ? "bg-surface" : "bg-surface-sunken",
      )}
    >
      <div className="flex items-start gap-2">
        {/* Shape as well as colour, and a word for anyone not reading either. */}
        {unread ? (
          <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-action" aria-hidden />
        ) : (
          <span className="mt-2 h-2 w-2 shrink-0" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-text">
            {unread ? <span className="sr-only">Unread. </span> : null}
            {notification.title}
          </p>
          <p className="mt-0.5 text-sm leading-6 text-text-secondary">{notification.body}</p>
          <time className="mt-1 block text-xs text-text-muted" dateTime={notification.created_at}>
            {timeAgo(notification.created_at)}
          </time>
        </div>
      </div>

      {href === null ? (
        unread ? (
          <button
            type="button"
            onClick={onMarkRead}
            className="inline-flex min-h-11 w-fit items-center rounded-control px-2 text-sm font-semibold text-action-secondary hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
          >
            Mark read
            <span className="sr-only">: {notification.title}</span>
          </button>
        ) : null
      ) : (
        <Link
          href={href}
          onClick={() => {
            // Marked read on the way out rather than on arrival: the destination
            // screen has no idea which notice sent somebody to it, and a notice
            // that stays bold after being opened is how a Partner stops trusting
            // the badge.
            if (unread) onMarkRead();
            onOpened();
          }}
          className="inline-flex min-h-11 w-fit items-center rounded-control px-2 text-sm font-semibold text-action-secondary hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
        >
          Open
          <span className="sr-only">: {notification.title}</span>
        </Link>
      )}
    </article>
  );
}

/**
 * A refused mark-read.
 *
 * `notification_not_found` is the one worth its own sentence, and it must not read
 * as an account problem: the row on screen is stale — read on another device, or
 * removed — and re-opening the panel is the entire fix. Everything else is a
 * generic failure that changed nothing, which is the important half: the notice is
 * still there and still unread.
 */
function MarkReadRefusal({ error }: { readonly error: unknown }) {
  if (isNotificationNotFound(error)) {
    return (
      <ErrorState
        inline
        severity="info"
        title="That notice is no longer here"
        message="It was read somewhere else, or it has been cleared. Close and re-open this panel to see what is actually waiting."
      />
    );
  }

  return (
    <ErrorState
      inline
      severity="warning"
      title="We could not mark that read"
      message="Nothing has changed and the notice is still here. Try again in a moment."
    />
  );
}
