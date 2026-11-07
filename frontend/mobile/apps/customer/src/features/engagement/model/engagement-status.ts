// Labels from frontend/apps/customer/features/engagement/view/engagement-status.tsx
import type { Schemas } from "@vsolve/api-client";

type EngagementStatus = Schemas["EngagementStatusEnum"];

export const ENGAGEMENT_STATUS: Record<EngagementStatus, { label: string }> = {
  PENDING_START: { label: "Not started" },
  ACTIVE: { label: "In progress" },
  COMPLETING: { label: "Waiting for you to confirm" },
  COMPLETED: { label: "Finished" },
  WARRANTY: { label: "Finished — warranty running" },
  CLOSED: { label: "Closed" },
  DISPUTED: { label: "A problem is being looked at" },
  CANCELLED: { label: "Cancelled" },
};
