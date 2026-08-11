"use client";

import { Card } from "@vsolve/ui";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

/**
 * A destination the navigation offers and this release does not carry yet.
 *
 * ## Why the route exists at all
 *
 * The registry renders a tab for every destination the Partner's grant
 * authorizes, and Django authorizes `enquiry.view` and `attendance.confirm`
 * before the screens behind them are built. Without a route, the tab a Partner
 * taps 404s inside their own workspace — a dead end that reads as the app being
 * broken. This says the true thing instead, which is that the screen is not
 * written yet.
 *
 * ## Why this is not a placeholder
 *
 * It holds no data, real or invented. It makes no promise about when, and no
 * claim that nothing is waiting for the Partner — an enquiry may well be, and
 * saying otherwise to keep the copy tidy would be the exact kind of comfortable
 * lie the no-fixtures rule exists to prevent. It states what is true: this
 * screen is not here yet, and committed work is unaffected.
 *
 * Each screen replaces this file's route as its wave lands. Nothing has to be
 * removed from the registry for that to happen.
 */

export interface WorkspacePendingProps {
  /**
   * What belongs on this screen, in the workspace's own noun: "Shifts",
   * "Enquiries", "Your crew". Never a generic "work items" — a destination that
   * loses its noun while waiting to be built comes back having lost it.
   */
  readonly what: string;
  /** Where back goes — the workspace this destination belongs to. */
  readonly backHref: string;
  readonly backLabel: string;
}

export function WorkspacePending({ what, backHref, backLabel }: WorkspacePendingProps) {
  return (
    <Card className="flex flex-col gap-3 p-5">
      <h1 className="text-base font-semibold text-text">This screen is not built yet</h1>
      <p className="text-sm leading-6 text-text-secondary">
        {what} will appear here. This part of your workspace is still being built, and anything you
        have already committed to is unaffected.
      </p>
      <Link
        href={backHref}
        className="inline-flex min-h-11 w-fit items-center gap-2 rounded-control text-sm font-semibold text-action focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
      >
        <ArrowLeft size={16} aria-hidden />
        {backLabel}
      </Link>
    </Card>
  );
}
