"use client";

import { cn } from "@vsolve/ui";
import { Home, UserRound, Wallet, Wrench } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useWorkStack } from "@/features/work-stack/queries";

/**
 * The four destinations, and the badge that makes one of them worth glancing at.
 *
 * ## What changed from the bar this replaces
 *
 * 1. **It clears the home indicator.** The old bar was `fixed inset-x-0
 *    bottom-0` with no `env(safe-area-inset-bottom)` allowance, so on every
 *    iPhone since the X the tab labels sat underneath the gesture bar — and the
 *    scroll container's matching `pb-20` was a fixed 80px guess against a 56px
 *    bar, so it was simultaneously wrong in the other direction. Both numbers
 *    now come from `--spacing-tabbar` and `--safe-bottom`, defined once in
 *    `app/partner-ui.css`.
 *
 * 2. **The labels are readable.** They were `text-[0.625rem]` — 10px. This
 *    product is used outdoors, at arm's length, on inexpensive screens, by
 *    people who are not all under thirty. 11px with tabular weight is the floor
 *    and this uses it.
 *
 * 3. **It is a flex child of the shell's column, not `fixed` to the viewport.**
 *    The old bar was `fixed inset-x-0` with an `mx-auto max-w-md` list inside
 *    it, so on anything wider than a phone the bar's background ran edge to
 *    edge while the app it belonged to was a 448px strip in the middle. As the
 *    last child of the column — with the scrolling body as a `min-h-0 flex-1`
 *    sibling above it — the bar is exactly as wide as the app and always at the
 *    bottom of it, with no positioning at all.
 *
 * 4. **Work carries a count.** The number of things whose move it is. That is
 *    the single fact a Partner opens this app to learn, and every comparable
 *    product puts it here.
 *
 * ## The badge's cost, stated
 *
 * `useWorkStack` composes six queries by key, all of which TanStack dedupes —
 * mounting it here does not add a request to any screen that already reads it
 * (Home and Work). It does mean the A3 crew-offer poll runs while the Partner
 * is on Money or Me. That is the behaviour you want in a dispatch product: an
 * offer arriving while someone checks their earnings should light the tab, not
 * wait for them to navigate. The A1 offer poll already ran app-wide regardless,
 * because `LiveOfferSheet` mounts at the shell.
 */

export interface TabItem {
  readonly href: string;
  readonly label: string;
  readonly icon: typeof Home;
  /** The path prefix this tab owns, where it is wider than its own `href`. */
  readonly activePrefix?: string;
}

/**
 * Four tabs, unconditionally, for every signed-in Partner.
 *
 * Icons chosen so no two read alike at 22px on a cheap screen. `Wrench` for
 * Work rather than the `Users` glyph it replaces: the old set had `Users` for
 * Work and `UserCircle2` for Me — two person glyphs side by side, distinguished
 * only by a circle. A Partner scanning a tab bar with their thumb over half of
 * it could not tell them apart, and the labels were 10px.
 */
export const PARTNER_TABS: readonly TabItem[] = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/work/all", label: "Work", icon: Wrench, activePrefix: "/work" },
  { href: "/money", label: "Money", icon: Wallet },
  { href: "/me", label: "Me", icon: UserRound, activePrefix: "/me" },
];

export function TabBar() {
  const pathname = usePathname();
  const stack = useWorkStack();

  /*
    Longest owned prefix wins, so `/me/language` lights Me rather than nothing,
    and `/work/jobs/{id}` lights Work. A tab bar with nothing lit tells a
    Partner they are nowhere.
  */
  const currentHref = PARTNER_TABS.reduce<{ href: string; owned: string } | null>((best, tab) => {
    const owned = tab.activePrefix ?? tab.href;
    const matches = pathname === owned || pathname.startsWith(`${owned}/`);
    if (!matches) return best;
    return best === null || owned.length > best.owned.length ? { href: tab.href, owned } : best;
  }, null)?.href ?? null;

  // Only what is genuinely the Partner's move. A badge that counted settled
  // jobs and sent quotes would show a permanent double-digit number on any
  // working account, which is a badge nobody looks at twice.
  const needsYou = stack.isPending
    ? 0
    : stack.items.filter(
        (item) =>
          item.urgency === "live" ||
          item.urgency === "needs_price" ||
          item.urgency === "doing",
      ).length;

  return (
    <nav
      aria-label="Partner navigation"
      className="z-30 shrink-0 border-t border-line bg-surface"
      style={{ paddingBottom: "var(--safe-bottom)" }}
    >
      <ul className="flex h-tabbar list-none items-stretch justify-around p-0">
        {PARTNER_TABS.map((tab) => {
          const isCurrent = tab.href === currentHref;
          const Icon = tab.icon;
          const badge = tab.href === "/work/all" ? needsYou : 0;

          return (
            <li key={tab.href} className="flex flex-1">
              <Link
                href={tab.href}
                aria-current={isCurrent ? "page" : undefined}
                className={cn(
                  "pv-tap group flex flex-1 flex-col items-center justify-center gap-1 px-1",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-focus-ring",
                  isCurrent ? "text-action-secondary" : "text-text-muted",
                )}
              >
                <span
                  className={cn(
                    "relative grid h-7 w-[3.25rem] place-items-center rounded-pill",
                    "transition-colors duration-fast ease-out",
                    isCurrent ? "bg-selected-surface" : "bg-transparent",
                  )}
                >
                  <Icon size={21} strokeWidth={isCurrent ? 2.4 : 1.9} aria-hidden />

                  {badge > 0 ? (
                    <span
                      /* The count is already in the accessible name below, so
                         the visual badge is decoration and must not be read a
                         second time. */
                      aria-hidden
                      className="pv-num absolute -right-0.5 -top-1 grid h-[1.0625rem] min-w-[1.0625rem] place-items-center rounded-pill border-2 border-surface bg-action px-1 text-[0.625rem] font-extrabold leading-none text-action-text"
                    >
                      {badge > 9 ? "9+" : badge}
                    </span>
                  ) : null}
                </span>

                <span className={cn("text-micro tracking-normal", isCurrent && "text-action-secondary")}>
                  {tab.label}
                </span>

                {badge > 0 ? (
                  <span className="sr-only">
                    {badge} {badge === 1 ? "item needs" : "items need"} you
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
