"use client";

import { buttonStyles } from "@vsolve/ui";
import { BellRing } from "lucide-react";
import Link from "next/link";

import { PROJECT_WORKSPACE, type ResolvedWorkspace } from "@/features/workspace/registry";

import { isUnread, targetHref } from "../model/feed";
import { useNotificationFeed } from "../queries";

/**
 * A project enquiry interrupt for the workspace home.
 *
 * The bell remains the full inbox. This is deliberately narrower: when a Partner
 * lands on Projects and a fresh customer enquiry is waiting, the screen should
 * behave like the A1 offer banner and make the next action obvious.
 */
export function ProjectInvitationBanner({ workspace }: { readonly workspace: ResolvedWorkspace }) {
  const canReadEnquiries =
    workspace.key === PROJECT_WORKSPACE && workspace.grant.actions.includes("enquiry.view");
  const feed = useNotificationFeed(canReadEnquiries);
  const waiting = (feed.data?.results ?? []).filter(
    (notification) =>
      notification.purpose === "m2.invitation.received" &&
      isUnread(notification) &&
      notification.target?.kind === "PROJECT_INVITATION",
  );

  if (!canReadEnquiries || waiting.length === 0) return null;

  const firstHref = targetHref(waiting[0]?.target ?? null, [workspace.key]);
  const href = firstHref ?? "/projects/enquiries";

  return (
    <div className="flex items-center gap-4 rounded-card border border-action bg-signal-50 p-4">
      <BellRing aria-hidden className="size-6 shrink-0 text-text" />
      <div className="min-w-0 flex-1">
        <p className="font-bold text-text">
          {waiting.length} new project {waiting.length === 1 ? "enquiry" : "enquiries"} for you
        </p>
        <p className="text-sm text-text-secondary">
          Open it now before the quote slot moves to another professional.
        </p>
      </div>
      <Link href={href} className={buttonStyles({ size: "sm" })}>
        Open
      </Link>
    </div>
  );
}
