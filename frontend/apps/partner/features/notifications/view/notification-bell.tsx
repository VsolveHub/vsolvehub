"use client";

import { cn } from "@vsolve/ui";
import { Bell } from "lucide-react";
import { useState } from "react";

import { unreadBadgeDisplay, unreadBadgeLabel } from "../model/feed";
import { useUnreadNotificationCount } from "../queries";
import { NotificationPanel } from "./notification-panel";

/**
 * The bell in the top bar, and the panel it opens.
 *
 * ## The count is never invented
 *
 * `data` is read through `isSuccess` rather than `data !== undefined`, for the
 * reason `asyncStateFrom` states: a refetch that fails leaves the last good answer
 * in `data` while the status goes to error. Anything that is not a successful read
 * is `null`, and `null` draws **no badge at all** — not a zero. A zero is a claim
 * about somebody's inbox, and a zero drawn because a request is in flight or has
 * failed is a claim nothing checked. The bell still works; there is simply nothing
 * beside it until the server has said something.
 *
 * ## Why the count is polled and not streamed
 *
 * There is one `EventSource` per Partner tab already, held by the A1 offer inbox,
 * and each SSE stream pins a WSGI worker thread for up to five minutes. A second
 * connection to make a badge a minute fresher is not a trade this earns — see
 * `queries.ts`, which also names the honest future path.
 *
 * ## Why this is not a tab
 *
 * `MAX_TAB_ITEMS` is six and the A3 workspace already saturates it. A seventh item
 * does not appear; it *evicts* — `navigationFor` takes the budget out of the
 * workspace's own destinations from the tail, so adding Notifications as a tab
 * would have silently dropped Crew from a workforce Partner's navigation. A bell
 * is the right shape for this anyway: notifications are an interruption, not a
 * destination.
 */

export interface NotificationBellProps {
  /**
   * The M2 workspace keys Django granted, from the shell's own resolved list.
   *
   * Decides where an `ENGAGEMENT` notice can safely link — `targetHref` argues
   * that in full. Empty is a normal value: an M1-only Partner still receives
   * notices, they simply have no M2 engagement screens to be sent to.
   */
  readonly workspaceKeys: readonly string[];
  readonly className?: string;
}

export function NotificationBell({ workspaceKeys, className }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const count = useUnreadNotificationCount();

  const unread = count.isSuccess && count.data !== undefined ? count.data.unread : null;
  const badge = unreadBadgeDisplay(unread);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        // The whole name, count included. A digit beside a bell glyph is not a
        // sentence, so the count lives in the control's own name where it is read
        // on focus and re-read when it changes — rather than in a live region that
        // would announce arrivals to somebody in the middle of another task.
        aria-label={unreadBadgeLabel(unread)}
        className={cn(
          "relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-control",
          "text-text-secondary hover:bg-surface-hover hover:text-text",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action",
          className,
        )}
      >
        <Bell size={20} aria-hidden />
        {badge === null ? null : (
          <span
            // Hidden from the accessibility tree: the button's own name already
            // carries the number, and exposing it here reads it twice.
            aria-hidden
            className="absolute right-1 top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-action px-1 text-[0.625rem] font-bold leading-4 text-action-text"
          >
            {badge}
          </span>
        )}
      </button>

      <NotificationPanel
        open={open}
        onOpenChange={setOpen}
        workspaceKeys={workspaceKeys}
        unreadCount={unread}
      />
    </>
  );
}
