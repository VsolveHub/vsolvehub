"use client";

import { cn } from "@vsolve/ui";
import { useState } from "react";

import { unreadBadgeDisplay, unreadBadgeLabel } from "../model/feed";
import { useUnreadNotificationCount } from "../queries";
import { NotificationPanel } from "./notification-panel";

/**
 * The bell — `M2-FE-720`.
 *
 * ## Mounting is the session gate
 *
 * This component asks no question about who is signed in. `site-header.tsx`
 * renders it inside the authenticated cluster and nowhere else, so its being on
 * screen at all is the answer, and the polled count starts and stops with it.
 * Putting an `isAuthenticated` check in here as well would be a second copy of a
 * rule the header already owns — and the copy that matters is the header's,
 * because it is the one that also decides not to render while the session is
 * still resolving.
 *
 * ## What the badge is allowed to say
 *
 * Nothing, until the server has answered. There are three states here and they
 * are deliberately not two: a known count, a known *zero*, and **not yet
 * known** — the read is pending, or it failed. Only the first draws a badge.
 *
 * A count that failed to load renders as a plain bell, not as a zero. That is
 * the honest reading: we do not know, so we claim nothing. A zero drawn over a
 * failed read would be the most damaging fake count available, because it is
 * the one that tells somebody to stop looking. The accessible name says
 * "Notifications" flat in that case, and the panel behind the bell is what
 * reports the failure properly — with a reason and a retry — once opened.
 *
 * ## Why the icon is hand-drawn
 *
 * This app ships no icon library and is not getting one for a single glyph. The
 * SVG is `aria-hidden`, so the button's whole accessible name comes from the
 * `sr-only` span — which is why the count lives in that string rather than only
 * in the visual badge. A badge nobody can hear is a badge half the readers do
 * not have.
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const count = useUnreadNotificationCount();

  // `undefined` while pending and on failure alike — both are "not known", and
  // neither may be rendered as a number. `data` is only ever the server's own.
  const unread = count.data?.unread ?? null;
  const badge = unreadBadgeDisplay(unread);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          // 44px target, as everywhere else a glyph is the only content.
          "relative inline-flex h-11 w-11 shrink-0 items-center justify-center",
          "rounded-control text-text-secondary",
          "hover:bg-surface-hover hover:text-text",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action",
        )}
      >
        <span className="sr-only">{unreadBadgeLabel(unread)}</span>

        <svg
          aria-hidden
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5"
        >
          <path d="M18 8a6 6 0 1 0-12 0c0 3.6-.75 5.4-1.5 6.3a.75.75 0 0 0 .55 1.2h13.9a.75.75 0 0 0 .55-1.2C18.75 13.4 18 11.6 18 8Z" />
          <path d="M10 19a2 2 0 0 0 4 0" />
        </svg>

        {/* Drawn only when the server has given us a number greater than zero.
            `aria-hidden` because the same count is already in the button's
            accessible name above, and announcing it twice reads as two
            different pieces of information. */}
        {badge !== null ? (
          <span
            aria-hidden
            data-numeric
            className={cn(
              "absolute right-1 top-1 inline-flex min-w-5 items-center justify-center",
              "rounded-full bg-action px-1 py-0.5",
              "text-xs font-bold leading-none text-action-text",
            )}
          >
            {badge}
          </span>
        ) : null}
      </button>

      <NotificationPanel open={open} onOpenChange={setOpen} />
    </>
  );
}
