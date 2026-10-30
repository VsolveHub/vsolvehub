"use client";

import { Card, buttonStyles, cn, useT } from "@vsolve/ui";
import { AlertTriangle } from "lucide-react";
import Link from "next/link";

import type { WorkspaceRecovery } from "../model/session-guard";

/**
 * What a Partner is told when their access changes while they are using it.
 *
 * Closes the presentation half of `M2-FE-113`.
 *
 * ## The situation this is for
 *
 * A supervisor has `/workforce/shifts` open on a site. Operations suspends the
 * capability. Grants are `SESSION_STATE`, so the refetch on focus brings the new
 * shape back on its own — and without this, the only thing that changes on
 * screen is that buttons start being refused. From where they are standing, that
 * is an app that broke.
 *
 * ## Recovery is never `/jobs`
 *
 * `session-guard.ts` decides the destination and it is `/dashboard`. Sending a
 * workforce agency to `/jobs` after a suspension would tell them their shifts
 * became jobs — false, and the record-erasure `M2-FE-111` forbids. This
 * component renders whatever the guard decided and has no fallback of its own,
 * so there is nowhere for a `/jobs` default to creep back in.
 *
 * ## The page underneath stays
 *
 * This is a banner, not a takeover. A Partner who lost a capability still has
 * records they are responsible for — who is on Thursday's shift, what was
 * agreed — and replacing the screen would take that away at the moment it
 * matters most. Only an unknown key moves someone off a route, because there is
 * no screen behind it to keep.
 */

export interface CapabilityNoticeProps {
  /** Null when nothing changed. The component renders nothing. */
  readonly recovery: WorkspaceRecovery | null;
  /** Re-reads the grants. Offered only when the guard says a retry could help. */
  readonly onRetry?: () => void;
  readonly className?: string;
}

export function CapabilityNotice({ recovery, onRetry, className }: CapabilityNoticeProps) {
  const t = useT();
  if (recovery === null) return null;

  return (
    <Card
      role="alert"
      className={cn("border-warning-line bg-warning-surface p-4", className)}
    >
      <div className="flex gap-3">
        <AlertTriangle size={18} aria-hidden className="mt-0.5 shrink-0 text-warning-text" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-warning-text">{t(recovery.headline)}</h2>
          <p className="mt-1 text-sm leading-6 text-text-secondary">{t(recovery.detail)}</p>

          <div className="mt-3 flex flex-wrap gap-2">
            {recovery.href && recovery.actionLabel ? (
              <Link href={recovery.href} className={buttonStyles({ size: "sm" })}>
                {t(recovery.actionLabel)}
              </Link>
            ) : null}

            {recovery.isRetryable && onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className={buttonStyles({ variant: "secondary", size: "sm" })}
              >
                {t("workspaces.notice.checkAgain")}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </Card>
  );
}
