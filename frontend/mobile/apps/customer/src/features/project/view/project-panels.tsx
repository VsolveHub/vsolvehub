// Ported from frontend/apps/customer/features/project/view/project-panels.tsx
import { isNotAProject } from "@vsolve/query/native";
import { Skeleton, Text } from "@vsolve/mobile-ui";
import { View } from "react-native";

import type { ProjectView } from "../adapters";
import { DelayClaimPanel } from "./delay-claim-panel";
import { HandoverPanel } from "./handover-panel";
import { VendorTransferPanel } from "./vendor-transfer-panel";
import { WarrantyPanel } from "./warranty-panel";

export interface ProjectSlotProps {
  engagementId: string;
  project: ProjectView | null;
  isPending: boolean;
  error: unknown;
  /** "project" — the noun this agreement uses. */
  engagementNoun: string;
  /** "stage" / "stages". */
  stageNoun: string;
  stagesNoun: string;
  onDone: () => void;
}

export interface ProjectDecisionsProps extends ProjectSlotProps {
  showRecoveryRoute: boolean;
}

export function ProjectDecisions({
  engagementId,
  project,
  isPending,
  error,
  engagementNoun,
  stageNoun,
  stagesNoun,
  onDone,
  showRecoveryRoute,
}: ProjectDecisionsProps) {
  if (isPending) {
    return (
      <View className="mt-8">
        <Text className="sr-only">Loading this {engagementNoun}&apos;s detail</Text>
        <Skeleton className="h-24 w-full" />
      </View>
    );
  }

  if (project === null) {
    if (isNotAProject(error)) return null;
    return (
      <Text className="mt-8 text-sm leading-6 text-text-secondary">
        We could not read the delivery and milestone detail for this{" "}
        {engagementNoun} just now, so we are not going to show you a version of
        it we cannot vouch for. Everything above comes from the agreement itself
        and is unaffected. Reload the page to try again.
      </Text>
    );
  }

  return (
    <>
      <DelayClaimPanel
        engagementId={engagementId}
        claims={project.delayClaims}
        engagementNoun={engagementNoun}
        stageNoun={stageNoun}
        stagesNoun={stagesNoun}
        onDone={onDone}
      />

      {project.transfer !== null ? (
        <VendorTransferPanel
          engagementId={engagementId}
          transfer={project.transfer}
          leftWithVendor={project.leftWithVendor}
          engagementNoun={engagementNoun}
          stageNoun={stageNoun}
          stagesNoun={stagesNoun}
          onDone={onDone}
        />
      ) : showRecoveryRoute ? (
        <RecoveryRoute engagementNoun={engagementNoun} stageNoun={stageNoun} />
      ) : null}

      <HandoverPanel
        engagementId={engagementId}
        handover={project.handover}
        engagementNoun={engagementNoun}
        onDone={onDone}
      />
    </>
  );
}

export function ProjectWarranty({
  project,
  isPending,
  engagementNoun,
}: Pick<ProjectSlotProps, "project" | "isPending" | "engagementNoun">) {
  if (isPending || project === null) return null;
  return <WarrantyPanel retention={project.retention} engagementNoun={engagementNoun} />;
}

function RecoveryRoute({
  engagementNoun,
  stageNoun,
}: {
  engagementNoun: string;
  stageNoun: string;
}) {
  return (
    <View className="mt-8">
      <Text className="text-lg font-semibold text-text">
        If the professional cannot finish
      </Text>
      <Text className="mt-1 text-sm leading-6 text-text-secondary">
        We find somebody else and ask them to price every {stageNoun} that is
        left, one by one. You see both sets of prices side by side and decide —
        nothing moves until you do. Anything you have funded that nobody
        has earned is refunded to you first, and there is no separate charge for
        the change itself; you go on funding the remaining work one piece at a
        time, at the prices you accepted. Contact support about this{" "}
        {engagementNoun} to start that.
      </Text>
    </View>
  );
}
