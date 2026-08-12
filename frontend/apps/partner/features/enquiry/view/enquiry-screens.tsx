"use client";

import { WorkspaceRoute } from "@/features/workspace/view/workspace-route";
import { PROJECT_WORKSPACE, WORKFORCE_WORKSPACE } from "@/features/workspace/registry";

import { EnquiryDetail } from "./enquiry-detail";
import { EnquiryList } from "./enquiry-list";

/**
 * The client half of every enquiry route.
 *
 * Same split, and the same two reasons, as `workspace-screens.tsx`:
 * `WorkspaceRoute` takes a render function, which cannot cross the
 * server-to-client boundary — and a `"use client"` route file silently loses
 * `export const dynamic` and `metadata`, which is how these pages would end up
 * prerendered as static, indexable HTML. Props stay serializable, the route
 * files stay server components, and the boundary lands where Next expects it.
 *
 * ## Why the enquiry copy lives here and not in the registry
 *
 * `registry.ts` is frozen in shape — extend it only through its typed entries —
 * and a per-destination noun is not one of them. Labels, icons and routes are
 * the frontend's to own, so this is the same kind of decision made in the same
 * layer, one file closer to the screen that uses it.
 */

interface WorkspaceCopy {
  /** What a customer is asking for, in the vendor's words. Used in the empty state. */
  readonly workLabel: string;
}

const COPY: Record<string, WorkspaceCopy> = {
  [WORKFORCE_WORKSPACE]: { workLabel: "people by the day" },
  [PROJECT_WORKSPACE]: { workLabel: "a project quoted end to end" },
};

/** The tail every enquiry route shares, appended to the workspace's own home. */
const ENQUIRIES_SEGMENT = "enquiries";

export interface EnquiryListScreenProps {
  readonly workspaceKey: string;
}

export function EnquiryListScreen({ workspaceKey }: EnquiryListScreenProps) {
  return (
    <WorkspaceRoute workspaceKey={workspaceKey} actions={["enquiry.view"]}>
      {(workspace) => (
        <>
          <h1 className="text-xl font-semibold text-text">Enquiries</h1>
          <EnquiryList
            // The grant's own key, not the route's. They are the same value
            // today; reading it off the resolved workspace means a route
            // mounted under the wrong key renders nothing rather than another
            // lifecycle's enquiries.
            archetype={workspace.key}
            basePath={`${workspace.home}/${ENQUIRIES_SEGMENT}`}
            workLabel={COPY[workspace.key]?.workLabel ?? "this kind of work"}
          />
        </>
      )}
    </WorkspaceRoute>
  );
}

export interface EnquiryDetailScreenProps {
  readonly workspaceKey: string;
  readonly invitationId: string;
}

export function EnquiryDetailScreen({ workspaceKey, invitationId }: EnquiryDetailScreenProps) {
  return (
    <WorkspaceRoute workspaceKey={workspaceKey} actions={["enquiry.view"]}>
      {(workspace) => (
        <EnquiryDetail
          invitationId={invitationId}
          basePath={`${workspace.home}/${ENQUIRIES_SEGMENT}`}
          backLabel="All enquiries"
        />
      )}
    </WorkspaceRoute>
  );
}
