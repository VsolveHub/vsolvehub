import { Text } from "@vsolve/mobile-ui";
import { View } from "react-native";

import type { Visit } from "../queries";
import { VISIT_STATUS_DESCRIPTIONS } from "./visit-status";

/**
 * The one line that says what is happening, in the professional's name when we have it.
 * It reads the visit's own status, the same field the stepper below reads, so the headline, the
 * badge and the stepper can never disagree.
 */
function headline(visit: Visit): string {
  const name = visit.partner_display_name?.trim() || "Your professional";
  switch (visit.status) {
    case "CONFIRMED":
      return `${name} is booked for you`;
    case "EN_ROUTE":
      return `${name} is on the way`;
    case "ARRIVED":
      return `${name} has arrived`;
    case "IN_PROGRESS":
      return "Work is in progress";
    case "COMPLETION_SUBMITTED":
      return "Please confirm the work";
    case "COMPLETED":
      return "All done";
    default:
      return "Your visit";
  }
}

export function VisitHero({ visit }: { visit: Visit }) {
  return (
    <View accessibilityLiveRegion="polite">
      <Text className="text-xl font-extrabold leading-tight text-text">{headline(visit)}</Text>
      <Text className="mt-1 text-sm leading-6 text-text-secondary">{VISIT_STATUS_DESCRIPTIONS[visit.status]}</Text>
    </View>
  );
}
