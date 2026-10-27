"use client";

import { Spinner, useT } from "@vsolve/ui";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { usePartnerWorkspaceGrants } from "../queries";
import { RECOVERY_HREF, availabilityOf, mustLeaveRoute, recoveryFor } from "../model/session-guard";
import { WORKSPACE_REGISTRY, resolveWorkspaces, type ResolvedWorkspace } from "../registry";
import { CapabilityNotice } from "./capability-notice";

/**
 * The gate every M2 workspace route sits behind.
 *
 * Where `session-guard.ts` decides, this reacts: it reads the grants, asks the
 * guard what they mean for someone standing on this route, and renders the
 * answer. Closes the mounted half of `M2-FE-113`.
 *
 * ## Why the notice sits above the children rather than replacing them
 *
 * A capability withdrawn mid-session takes the *actions* away, not the records.
 * A supervisor still needs to see who is on Thursday's shift — they are still
 * contractually on it — so the screen stays and the banner says what changed.
 * Blanking it would destroy information the Partner is responsible for, which is
 * a worse failure than a stale button.
 *
 * The exception is a key this build cannot render: there are no screens behind
 * it to keep, so `mustLeaveRoute` sends the Partner to the base app. Never to
 * `/jobs` — that is the A1 task lifecycle, and landing a workforce agency there
 * says their shifts became jobs.
 *
 * ## Why the loading state is a spinner and not the page
 *
 * Rendering children first and correcting afterwards would flash the workspace
 * at somebody who no longer holds it, and any control inside it would be live
 * for that frame. Authorization resolves before the screen it authorizes.
 */

export interface WorkspaceRouteProps {
  /** The registry key this route belongs to. */
  readonly workspaceKey: string;
  /**
   * Actions the screens inside were built against.
   *
   * Passed by the route rather than remembered here, so the guard can report
   * `REDUCED` — the workspace survived, but a control on this page did not.
   */
  readonly actions?: readonly string[];
  readonly children: (workspace: ResolvedWorkspace) => ReactNode;
}

export function WorkspaceRoute({ workspaceKey, actions, children }: WorkspaceRouteProps) {
  const t = useT();
  const router = useRouter();
  // Known keys only. An unknown one never reaches Django — there is nothing this
  // bundle could ask on its behalf.
  const isKnown = workspaceKey in WORKSPACE_REGISTRY;
  const { grants, isPending, refetch } = usePartnerWorkspaceGrants({ enabled: isKnown });

  const availability = availabilityOf({ workspaceKey, grants, renderedActions: actions });
  const mustLeave = mustLeaveRoute(availability);

  useEffect(() => {
    if (mustLeave) router.replace(RECOVERY_HREF);
  }, [mustLeave, router]);

  if (isPending) {
    return (
      <main className="mx-auto flex w-full max-w-2xl items-center gap-2 px-4 py-16 text-text-secondary">
        <Spinner size="sm" />
        {t("workspaces.route.checkingApproval")}
      </main>
    );
  }

  const recovery = recoveryFor(availability);
  const [workspace] = resolveWorkspaces(
    grants?.filter((grant) => grant.workspaceKey === workspaceKey) ?? [],
  );

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-5">
      <CapabilityNotice recovery={recovery} onRetry={recovery?.isRetryable ? refetch : undefined} />
      {/* No grant means no workspace to render — the notice above is the whole
          screen, and it already says which of the four reasons applies. */}
      {workspace ? children(workspace) : null}
    </main>
  );
}
