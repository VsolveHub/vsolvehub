"use client";

import { Button, EmptyState, ErrorState, cn } from "@vsolve/ui";
import { BellOff, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo } from "react";

import { AsyncSection, asyncStateFrom } from "@/components/async-section";
import { Sheet } from "@/features/shell/view/sheet";
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
 * The notification centre, in a bottom sheet.
 *
 * ## Why a sheet and not a popover under the bell
 *
 * Three questions settle at once rather than one:
 *
 *  - **Reach.** This app is used one-handed on a phone. A panel anchored to a
 *    control in the top bar puts its rows at the far end of the thumb's arc; a
 *    bottom sheet puts them under it.
 *  - **Z-index.** A modal `<dialog>` renders in the top layer, above every
 *    stacking context in the app by definition. A hand-rolled popover would
 *    have to pick a number in the app's z-ladder and be re-picked every time
 *    that ladder changed.
 *  - **Dismissal and focus.** Escape closes it, focus is trapped inside it and
 *    the page behind goes inert — all from the platform, none re-implemented.
 *
 * ## What the redesign changed: two groups, not one list
 *
 * Every notice used to render identically in one flat, reverse-chronological
 * list. That is a message log, not a centre: "a customer answered your quote"
 * and "your weekly payout was sent" are different kinds of thing, and only one
 * of them is a task. On a working account the second kind vastly outnumbers the
 * first, so the notice that needed a Partner sat buried among receipts.
 *
 * `Needs you` holds unread notices that lead somewhere — something happened and
 * there is a screen to go to. `Earlier` holds the rest. The split is by whose
 * move it is, exactly like the work stack's, and for the same reason: a Partner
 * opening this is asking "is there anything for me", not "what has happened".
 *
 * ## What it deliberately did *not* change
 *
 * `title` and `body` are rendered by Django from `templates_registry`. Nothing
 * here rewords them, infers a severity from the purpose string, or picks an
 * icon by matching a code prefix. The grouping above reads only `read_at` and
 * whether `targetHref` resolved — two facts, neither of them a guess about what
 * the notice means. A notice whose copy changes on the server changes here on
 * the next read.
 *
 * ## Seven states, borrowed rather than re-derived
 *
 * Loading, offline, forbidden and server-error come from `AsyncSection`, the one
 * place this app decides what a failed read looks like. Empty and truncated are
 * this panel's own, because only it knows what an empty feed means; pending
 * belongs to the two controls that cause it.
 */

export interface NotificationPanelProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /**
   * The M2 workspace keys Django granted this Partner.
   *
   * Passed to `targetHref`, which no longer routes on them — `/work/jobs/[id]`
   * resolves both engagement kinds itself. Kept on the contract because the
   * next target kind may need it; see that function's own note.
   */
  readonly workspaceKeys: readonly string[];
  /**
   * The badge's number, or `null` where it is unknown.
   *
   * Only decides whether **Mark all read** is offered. It is the count read
   * rather than the loaded rows because "all" genuinely means all — including
   * notices older than the one page this panel holds.
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
   * otherwise still be on screen when the bell is next opened — an error about
   * a tap from an hour ago, above a list refetched since. Reset on the way out
   * rather than on the way in, so the message stays for as long as the sheet
   * that produced it is open.
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
      onClose={() => onOpenChange(false)}
      title="Notifications"
      description={
        hasUnread
          ? `${unreadCount} ${unreadCount === 1 ? "notice needs" : "notices need"} a look`
          : "Everything here is read"
      }
      footer={
        hasUnread ? (
          <Button
            variant="outline"
            block
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
            <Feed
              page={page}
              workspaceKeys={workspaceKeys}
              onOpened={() => onOpenChange(false)}
              onMarkRead={(id) => markRead.mutate({ notificationId: id })}
            />
          )}
        </AsyncSection>
      </div>
    </Sheet>
  );
}

function Feed({
  page,
  workspaceKeys,
  onOpened,
  onMarkRead,
}: {
  page: NotificationPage;
  workspaceKeys: readonly string[];
  onOpened: () => void;
  onMarkRead: (id: string) => void;
}) {
  /*
    Two buckets, one pass, order preserved inside each.

    "Needs you" is unread **and** leads somewhere. Both halves matter: an unread
    notice with nowhere to go is news, not a task, and a read notice is already
    handled however interesting it was. The server's own ordering — newest
    first — carries through untouched; this only draws a line through it.
  */
  const { needsYou, earlier } = useMemo(() => {
    const needs: Notification[] = [];
    const rest: Notification[] = [];
    for (const notification of page.results) {
      const actionable =
        isUnread(notification) && targetHref(notification.target, workspaceKeys) !== null;
      (actionable ? needs : rest).push(notification);
    }
    return { needsYou: needs, earlier: rest };
  }, [page.results, workspaceKeys]);

  return (
    <div className="flex flex-col gap-4">
      <Group
        title="Needs you"
        items={needsYou}
        workspaceKeys={workspaceKeys}
        onOpened={onOpened}
        onMarkRead={onMarkRead}
      />
      <Group
        title={needsYou.length === 0 ? "Recent" : "Earlier"}
        items={earlier}
        workspaceKeys={workspaceKeys}
        onOpened={onOpened}
        onMarkRead={onMarkRead}
      />

      {/* Truncation, said rather than hidden. The newest are first, so nothing
          waiting on the Partner is behind this line — but a capped list that
          reads as a complete history is a quiet lie. */}
      {page.next === null ? null : (
        <p className="text-caption leading-relaxed text-text-muted">
          Only your most recent notices are shown here. Older ones stay on the job
          they belong to.
        </p>
      )}
    </div>
  );
}

/**
 * One bucket. Renders nothing when it is empty, so the panel never shows a
 * heading over a gap.
 *
 * Takes the notices rather than pre-rendered children: wrapping each row in its
 * own `<li>` is this component's job — a screen reader should hear "list, 3
 * items" per group — and a `children` prop makes that a runtime guess about
 * whether it was handed one element or an array.
 */
function Group({
  title,
  items,
  workspaceKeys,
  onOpened,
  onMarkRead,
}: {
  title: string;
  items: readonly Notification[];
  workspaceKeys: readonly string[];
  onOpened: () => void;
  onMarkRead: (id: string) => void;
}) {
  if (items.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      <h3 className="flex items-center gap-2 text-micro uppercase text-text-muted">
        {title}
        <span className="pv-num grid h-[1.125rem] min-w-[1.125rem] place-items-center rounded-pill bg-surface-sunken px-1 text-[0.625rem] font-extrabold text-text-secondary">
          {items.length}
        </span>
      </h3>
      <ul className="flex list-none flex-col gap-2 p-0">
        {items.map((notification) => (
          <li key={notification.id}>
            <NotificationRow
              notification={notification}
              workspaceKeys={workspaceKeys}
              onOpened={onOpened}
              onMarkRead={() => onMarkRead(notification.id)}
            />
          </li>
        ))}
      </ul>
    </section>
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
 * ## Exactly one control per row, and only where one is useful
 *
 * A linked notice gets **Open**; an unread notice with nowhere to go gets **Mark
 * read**; a read notice with nowhere to go gets neither, because there is
 * nothing left to do with it.
 *
 * The whole row is deliberately **not** a single link, and this is a
 * considered call rather than an oversight — the pattern used on work cards,
 * where the accessible name is a composed sentence, does not transfer here.
 * A notice's `body` is a full sentence written server-side and can run to two
 * lines; folding title, body and timestamp into one `aria-label` produces a
 * control whose name is a paragraph, and it nests the unread marker inside a
 * control where a screen reader announces it as part of that name. The row
 * stays a region; the action inside it is what is operable.
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
        "flex flex-col gap-2 rounded-card border p-3.5",
        unread ? "border-selected-line bg-surface" : "border-line bg-surface-sunken",
      )}
    >
      <div className="flex items-start gap-2.5">
        {/* Shape as well as colour, and a word for anyone reading neither. */}
        <span
          aria-hidden
          className={cn(
            "mt-1.5 h-2 w-2 shrink-0 rounded-pill",
            unread ? "bg-action" : "bg-transparent",
          )}
        />
        <div className="min-w-0 flex-1">
          <p className="text-body font-bold text-text">
            {unread ? <span className="sr-only">Unread. </span> : null}
            {notification.title}
          </p>
          <p className="mt-1 text-caption leading-relaxed text-text-secondary">
            {notification.body}
          </p>
          <time
            className="mt-1.5 block text-micro tracking-normal text-text-muted"
            dateTime={notification.created_at}
          >
            {timeAgo(notification.created_at)}
          </time>
        </div>
      </div>

      {href === null ? (
        unread ? (
          <button
            type="button"
            onClick={onMarkRead}
            className="pv-tap inline-flex min-h-11 w-fit items-center rounded-control px-2.5 text-caption font-bold text-action-secondary hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
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
          className="pv-tap pv-press inline-flex h-11 items-center justify-center gap-1 rounded-control bg-action-secondary px-4 text-caption font-bold text-action-secondary-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          Open
          <span className="sr-only">: {notification.title}</span>
          <ChevronRight size={16} aria-hidden />
        </Link>
      )}
    </article>
  );
}

/**
 * A refused mark-read.
 *
 * `notification_not_found` is the one worth its own sentence, and it must not
 * read as an account problem: the row on screen is stale — read on another
 * device, or removed — and re-opening the panel is the entire fix. Everything
 * else is a generic failure that changed nothing, which is the important half:
 * the notice is still there and still unread.
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
