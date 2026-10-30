"use client";

import { Button, EmptyState, ErrorState, Sheet, cn, useT } from "@vsolve/ui";
import { BellOff, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

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
  /**
   * A visit counter, not a boolean.
   *
   * `Sheet` keeps this component mounted for the whole session — `<dialog>` is
   * shown and hidden, not remounted — so the dismissed-ids set and the mark-read
   * refusal from one visit would otherwise still be sitting there the next time
   * the bell is opened. Bumping this on every close and keying the body below
   * with it forces React to throw the old instance away and mount a fresh one,
   * resetting all of that state in the same commit the sheet closes in — with
   * no effect and no ref read during render.
   */
  const [visitId, setVisitId] = useState(0);

  return (
    <NotificationPanelBody
      key={visitId}
      open={open}
      onOpenChange={(next) => {
        if (!next) setVisitId((id) => id + 1);
        onOpenChange(next);
      }}
      workspaceKeys={workspaceKeys}
      unreadCount={unreadCount}
    />
  );
}

function NotificationPanelBody({
  open,
  onOpenChange,
  workspaceKeys,
  unreadCount,
}: NotificationPanelProps) {
  const t = useT();
  // Fetched when the panel opens, never before and never on a timer. See
  // `useNotificationFeed`.
  const feed = useNotificationFeed(open);
  const markRead = useMarkNotificationRead();
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [dismissedAll, setDismissedAll] = useState(false);

  const state = asyncStateFrom<NotificationPage, NotificationPage>(feed, (page) => page);
  const hasUnread = unreadCount !== null && unreadCount > 0;

  const handleDismiss = (id: string) => {
    setDismissedIds((prev) => new Set(prev).add(id));
    markRead.mutate({ notificationId: id });
  };

  const handleDismissAll = () => {
    setDismissedAll(true);
    markRead.mutate({ all: true });
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("notifications.panel.title")}
      footer={
        hasUnread ? (
          <Button
            variant="ghost"
            onClick={handleDismissAll}
            loading={markRead.isPending}
            loadingLabel={t("notifications.panel.markingAllRead")}
            disabled={markRead.isPending}
          >
            {t("notifications.panel.markAllRead")}
          </Button>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-3">
        {markRead.isError ? <MarkReadRefusal error={markRead.error} /> : null}

        <AsyncSection
          state={state}
          label={t("notifications.panel.loading")}
          isEmpty={(page) =>
            dismissedAll ||
            page.results.filter((item) => !dismissedIds.has(item.id)).length === 0
          }
          onRetry={() => {
            setDismissedIds(new Set());
            setDismissedAll(false);
            void feed.refetch();
          }}
          empty={
            <EmptyState
              compact
              icon={<BellOff size={24} aria-hidden />}
              title={t("notifications.panel.empty.title")}
              description={t("notifications.panel.empty.description")}
            />
          }
        >
          {(page) => {
            const visible = dismissedAll
              ? []
              : page.results.filter((item) => !dismissedIds.has(item.id));

            return (
              <>
                <ul className="flex list-none flex-col gap-1 p-0">
                  {visible.map((notification) => (
                    <li key={notification.id}>
                      <NotificationRow
                        notification={notification}
                        workspaceKeys={workspaceKeys}
                        onOpened={() => onOpenChange(false)}
                        onMarkRead={() => handleDismiss(notification.id)}
                      />
                    </li>
                  ))}
                </ul>

                {/* Truncation, said rather than hidden. The newest are first, so
                    nothing waiting on the Partner is behind this line — but a capped
                    list that reads as a complete history is a quiet lie. */}
                {page.next === null ? null : (
                  <p className="text-sm leading-6 text-text-secondary">
                    {t("notifications.panel.truncated")}
                  </p>
                )}
              </>
            );
          }}
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
  const t = useT();
  const href = targetHref(notification.target, workspaceKeys);
  const unread = isUnread(notification);

  return (
    <article
      className={cn(
        "relative flex flex-col gap-1 rounded-card border border-line p-3 transition-all",
        unread ? "bg-surface shadow-xs" : "bg-surface-sunken opacity-80",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5 min-w-0 flex-1">
          {/* Shape as well as colour, and a word for anyone not reading either. */}
          {unread ? (
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-signal-600" aria-hidden />
          ) : (
            <span className="mt-1.5 h-2 w-2 shrink-0" aria-hidden />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-text">
              {unread ? <span className="sr-only">{t("notifications.row.unreadSr")}</span> : null}
              {notification.title}
            </p>
            <p className="mt-0.5 text-sm leading-6 text-text-secondary">{notification.body}</p>
            <time className="mt-1 block text-xs text-text-muted" dateTime={notification.created_at}>
              {timeAgo(notification.created_at)}
            </time>
          </div>
        </div>

        {/* Clear / Dismiss (X) button for every notification */}
        <button
          type="button"
          onClick={onMarkRead}
          title={t("notifications.row.clearTitle")}
          aria-label={t("notifications.row.clearAriaLabel", { title: notification.title })}
          className="shrink-0 -mr-1 -mt-1 grid h-7 w-7 place-items-center rounded-full text-text-muted hover:bg-surface-hover hover:text-navy-900 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {href === null ? (
        unread ? (
          <button
            type="button"
            onClick={onMarkRead}
            className="inline-flex min-h-9 w-fit items-center rounded-control px-2.5 text-xs font-bold text-action-secondary hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
          >
            {t("notifications.row.markRead")}
            <span className="sr-only">{t("notifications.row.markReadSr", { title: notification.title })}</span>
          </button>
        ) : null
      ) : (
        <div className="mt-1 flex items-center justify-between">
          <Link
            href={href}
            onClick={() => {
              if (unread) onMarkRead();
              onOpened();
            }}
            className="inline-flex min-h-9 items-center rounded-lg bg-navy-900 px-3 py-1 text-xs font-bold text-white hover:bg-navy-800 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
          >
            {t("notifications.row.open")}
            <span className="sr-only">{t("notifications.row.openSr", { title: notification.title })}</span>
          </Link>
        </div>
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
  const t = useT();

  if (isNotificationNotFound(error)) {
    return (
      <ErrorState
        inline
        severity="info"
        title={t("notifications.markReadRefusal.notFound.title")}
        message={t("notifications.markReadRefusal.notFound.message")}
      />
    );
  }

  return (
    <ErrorState
      inline
      severity="warning"
      title={t("notifications.markReadRefusal.generic.title")}
      message={t("notifications.markReadRefusal.generic.message")}
    />
  );
}
