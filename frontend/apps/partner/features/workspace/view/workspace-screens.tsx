"use client";

import { WorkspaceHome } from "./workspace-home";
import { WorkspacePending } from "./workspace-pending";
import { WorkspaceRoute } from "./workspace-route";

/**
 * The client half of every M2 workspace route.
 *
 * ## Why the routes do not render `WorkspaceRoute` themselves
 *
 * Two reasons, and the second is the load-bearing one.
 *
 * `WorkspaceRoute` takes a render function so its children can be given the
 * resolved workspace, and a function cannot cross the server-to-client boundary.
 * A route file that passed one would have to be a client component itself.
 *
 * And a client route file cannot carry route segment config: `export const
 * dynamic` and `metadata` are Server Component exports, and Next ignores them in
 * a `"use client"` module. Losing them is not cosmetic here — every authenticated
 * Partner page in this app is `force-dynamic` and `robots: noindex`, and these
 * screens were being prerendered as static, indexable HTML until this split.
 *
 * So the props below are all serializable, the route files stay server
 * components, and the boundary lands exactly where Next expects it.
 */

export interface WorkspaceHomeScreenProps {
  readonly workspaceKey: string;
}

export function WorkspaceHomeScreen({ workspaceKey }: WorkspaceHomeScreenProps) {
  return (
    <WorkspaceRoute workspaceKey={workspaceKey}>
      {(workspace) => <WorkspaceHome workspace={workspace} />}
    </WorkspaceRoute>
  );
}

export interface WorkspacePendingScreenProps {
  readonly workspaceKey: string;
  /** The action this destination was built against, so a reduced grant is reported. */
  readonly actions: readonly string[];
  /** The destination's own noun — "Enquiries", "Shifts", "Stages", "Your crew". */
  readonly what: string;
}

export function WorkspacePendingScreen({
  workspaceKey,
  actions,
  what,
}: WorkspacePendingScreenProps) {
  return (
    <WorkspaceRoute workspaceKey={workspaceKey} actions={actions}>
      {(workspace) => (
        <WorkspacePending what={what} backHref={workspace.home} backLabel={workspace.label} />
      )}
    </WorkspaceRoute>
  );
}
