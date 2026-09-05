"use client";

import { PROJECT_BUCKETS, WORKFORCE_BUCKETS, projectBucketFor, workforceBucketFor } from "@vsolve/query";

import { WorkspaceRoute } from "@/features/workspace/view/workspace-route";
import { PROJECT_WORKSPACE, WORKFORCE_WORKSPACE } from "@/features/workspace/registry";

import { PROJECT_WORDING, WORKFORCE_WORDING } from "../model/engagement-copy";
import { EngagementDetail } from "./engagement-detail";
import { EngagementList } from "./engagement-list";

/**
 * The client half of every engagement route.
 *
 * Same split, and the same two reasons, as `workspace-screens.tsx`:
 * `WorkspaceRoute` takes a render function, which cannot cross the
 * server-to-client boundary — and a `"use client"` route file silently loses
 * `export const dynamic` and `metadata`, which is how these pages end up
 * prerendered as static, indexable HTML. Props stay serializable, the route files
 * stay server components, and the boundary lands where Next expects it.
 *
 * ## The two workspaces are two mounts of one component
 *
 * The engagement spine is shared, so the list and the detail are shared. What the
 * mount supplies is the bucket vocabulary, the noun and which `commercial_mode`
 * belongs in this workspace — three server-derived values, never a lifecycle
 * inferred from a route name.
 *
 * ## The action these routes are gated on
 *
 * `stage.submit_evidence`, which is the grant the registry already gates
 * `/projects/stages` on, and `attendance.confirm` for `/workforce/shifts`. Both
 * are the actions those tabs were authorized under in Wave B1; no new action is
 * invented here, because inventing one would be this client authorising itself.
 */

const ENQUIRY_LABELS = {
  workforce: "people by the day",
  project: "a project quoted end to end",
} as const;

export interface WorkforceEngagementsScreenProps {
  readonly heading: string;
}

export function WorkforceEngagementsScreen({ heading }: WorkforceEngagementsScreenProps) {
  return (
    <WorkspaceRoute workspaceKey={WORKFORCE_WORKSPACE} actions={["attendance.confirm"]}>
      {() => (
        <>
          <h1 className="text-xl font-semibold text-text">{heading}</h1>
          <EngagementList
            buckets={WORKFORCE_BUCKETS}
            bucketFor={workforceBucketFor}
            commercialMode="LEAD_ONLY"
            wording={WORKFORCE_WORDING}
            workLabel={ENQUIRY_LABELS.workforce}
          />
        </>
      )}
    </WorkspaceRoute>
  );
}

export interface ProjectEngagementsScreenProps {
  readonly heading: string;
}

export function ProjectEngagementsScreen({ heading }: ProjectEngagementsScreenProps) {
  return (
    <WorkspaceRoute workspaceKey={PROJECT_WORKSPACE} actions={["stage.submit_evidence"]}>
      {() => (
        <>
          <h1 className="text-xl font-semibold text-text">{heading}</h1>
          <EngagementList
            buckets={PROJECT_BUCKETS}
            bucketFor={projectBucketFor}
            commercialMode="MANAGED_PAYMENT_REQUIRED"
            wording={PROJECT_WORDING}
            workLabel={ENQUIRY_LABELS.project}
          />
        </>
      )}
    </WorkspaceRoute>
  );
}

export interface EngagementDetailScreenProps {
  readonly engagementId: string;
  readonly stageId?: string;
}

export function WorkforceEngagementScreen({ engagementId }: EngagementDetailScreenProps) {
  return (
    <WorkspaceRoute workspaceKey={WORKFORCE_WORKSPACE} actions={["attendance.confirm"]}>
      {() => (
        <EngagementDetail
          engagementId={engagementId}
          wording={WORKFORCE_WORDING}
          workspace="workforce"
        />
      )}
    </WorkspaceRoute>
  );
}

export function ProjectEngagementScreen({
  engagementId,
  stageId,
}: EngagementDetailScreenProps) {
  return (
    <WorkspaceRoute workspaceKey={PROJECT_WORKSPACE} actions={["stage.submit_evidence"]}>
      {() => (
        <EngagementDetail
          engagementId={engagementId}
          wording={PROJECT_WORDING}
          workspace="project"
          focusStageId={stageId}
        />
      )}
    </WorkspaceRoute>
  );
}
