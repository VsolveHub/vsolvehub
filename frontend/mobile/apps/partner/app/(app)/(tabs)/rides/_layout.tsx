import { Slot } from "expo-router";

import { useDutyReconcile } from "@/features/rides/use-duty-reconcile";
import { useOfferWatch } from "@/features/rides/use-offer-watch";

/**
 * Every Rides tab: whenever the app opens or comes to the front, the phone matches the server;
 * while on duty, a new ride request opens full screen.
 */
export default function RidesTabsLayout() {
  useDutyReconcile();
  useOfferWatch();
  return <Slot />;
}
