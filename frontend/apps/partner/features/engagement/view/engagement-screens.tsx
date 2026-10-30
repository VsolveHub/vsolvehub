"use client";

import { PROJECT_BUCKETS, WORKFORCE_BUCKETS, projectBucketFor, workforceBucketFor } from "@vsolve/query";
import { useT } from "@vsolve/ui";

import { WorkspaceRoute } from "@/features/workspace/view/workspace-route";
import { PROJECT_WORKSPACE, WORKFORCE_WORKSPACE } from "@/features/workspace/registry";

import { getProjectWording, getWorkforceWording } from "../model/engagement-copy";
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

export interface WorkforceEngagementsScreenProps {
  readonly heading: string;
}

export function WorkforceEngagementsScreen({ heading }: WorkforceEngagementsScreenProps) {
  const t = useT();
  return (
    <WorkspaceRoute workspaceKey={WORKFORCE_WORKSPACE} actions={["attendance.confirm"]}>
      {() => (
        <>
          <h1 className="text-xl font-semibold text-text">{heading}</h1>
          <EngagementList
            buckets={WORKFORCE_BUCKETS}
            bucketFor={workforceBucketFor}
            commercialMode="LEAD_ONLY"
            wording={getWorkforceWording(t)}
            workLabel={t("work.engagementScreens.enquiryLabel.workforce")}
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
  const t = useT();
  return (
    <WorkspaceRoute workspaceKey={PROJECT_WORKSPACE} actions={["stage.submit_evidence"]}>
      {() => (
        <>
          <h1 className="text-xl font-semibold text-text">{heading}</h1>
          <EngagementList
            buckets={PROJECT_BUCKETS}
            bucketFor={projectBucketFor}
            commercialMode="MANAGED_PAYMENT_REQUIRED"
            wording={getProjectWording(t)}
            workLabel={t("work.engagementScreens.enquiryLabel.project")}
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
  const t = useT();
  return (
    <WorkspaceRoute workspaceKey={WORKFORCE_WORKSPACE} actions={["attendance.confirm"]}>
      {() => (
        <EngagementDetail
          engagementId={engagementId}
          wording={getWorkforceWording(t)}
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
  const t = useT();
  return (
    <WorkspaceRoute workspaceKey={PROJECT_WORKSPACE} actions={["stage.submit_evidence"]}>
      {() => (
        <EngagementDetail
          engagementId={engagementId}
          wording={getProjectWording(t)}
          workspace="project"
          focusStageId={stageId}
        />
      )}
    </WorkspaceRoute>
  );
}
