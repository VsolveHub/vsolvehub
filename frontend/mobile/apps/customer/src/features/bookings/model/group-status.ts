// Labels from frontend/apps/customer/features/bookings/view/group-status.tsx
import type { Schemas } from "@vsolve/api-client";

type GroupStatus = Schemas["BookingGroupStatusEnum"];

export const GROUP_STATUS_LABELS: Record<GroupStatus, string> = {
  CONFIRMED: "Confirmed",
  MATCHING: "Finding professionals",
  PARTIALLY_HELD: "Still finding professionals",
  ALL_UNITS_HELD: "All professionals held",
  PAYMENT_PENDING: "Ready for payment",
  BOOKED: "Booked",
  COMPLETED: "Completed",
  REPLAN_REQUIRED: "Needs a new time",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
  FAILED: "Could not be completed",
};
