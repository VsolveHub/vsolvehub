import { Slot } from "expo-router";

import { useDutyReconcile } from "@/features/rides/use-duty-reconcile";

/** Every Rides tab: whenever the app opens or comes to the front, the phone matches the server. */
export default function RidesTabsLayout() {
  useDutyReconcile();
  return <Slot />;
}
