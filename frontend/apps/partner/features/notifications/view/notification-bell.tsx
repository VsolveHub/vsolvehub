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

/**
 * Bottom-nav bell — same panel as `NotificationBell`, styled as a tab item.
 */
/**
 * `appearance` is presentation only — same panel, same query, same behaviour.
 *
 * `"dock"` is the default and is byte-for-byte the styling this component has
 * always rendered, so the phone tab bar is untouched. `"bar"` exists because the
 * desktop header (`DesktopPrimaryNav`) lays its items out in a 40px-tall row,
 * and the dock variant is a 56px stacked icon-over-label built for a thumb — it
 * was being clipped. Adding the variant here was preferred to wrapping this in a
 * scaling hack at the call site, which would have distorted the unread badge.
 */
export type NotificationNavTabAppearance = "dock" | "bar";

export function NotificationNavTab({
  workspaceKeys,
  label,
  isActive = false,
  appearance = "dock",
}: {
  workspaceKeys: readonly string[];
  label: string;
  isActive?: boolean;
  appearance?: NotificationNavTabAppearance;
}) {
  const [open, setOpen] = useState(false);
  const count = useUnreadNotificationCount();

  const unread = count.isSuccess && count.data !== undefined ? count.data.unread : null;
  const badge = unreadBadgeDisplay(unread);
  const active = isActive || open;
  const isBar = appearance === "bar";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={unreadBadgeLabel(unread)}
        className={cn(
          "relative flex items-center transition-all",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action",
          isBar
            ? cn(
                "h-10 gap-2 whitespace-nowrap rounded-full px-4 text-sm font-semibold",
                active
                  ? "bg-surface-sunken text-navy-900"
                  : "text-text-secondary hover:bg-surface-sunken/70 hover:text-navy-900",
              )
            : cn(
                "min-h-[3.5rem] w-full flex-col justify-center gap-1 px-1 text-[0.625rem] font-semibold leading-none tracking-wide",
                active ? "text-white font-bold" : "text-white/45 hover:text-white/70",
              ),
        )}
      >
        {active && !isBar ? (
          <span
            aria-hidden
            className="absolute -top-1 h-0.5 w-6 rounded-full bg-signal-500 shadow-[0_0_8px_rgba(249,115,22,0.8)]"
          />
        ) : null}
        <span className="relative flex items-center justify-center">
          <Bell
            size={isBar ? 17 : 22}
            strokeWidth={active ? (isBar ? 2.4 : 2.5) : isBar ? 2 : 1.8}
            aria-hidden
          />
          {badge === null ? null : (
            <span
              aria-hidden
              className="absolute -right-2 -top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-signal-500 px-1 text-[0.5625rem] font-bold leading-3.5 text-white shadow-xs"
            >
              {badge}
            </span>
          )}
        </span>
        <span>{label}</span>
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
