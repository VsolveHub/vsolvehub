/** What the rider's ride screen shows for each ride state (brief §5.11, rider items 4–8). */
export type RideStage = "searching" | "no_captain" | "coming" | "arrived" | "in_trip" | "pay" | "cancelled";

export function rideStage(state: string): RideStage {
  switch (state) {
    case "SEARCHING":
      return "searching";
    case "NO_CAPTAIN_FOUND":
      return "no_captain";
    case "CAPTAIN_ASSIGNED":
      return "coming";
    case "CAPTAIN_ARRIVED":
      return "arrived";
    case "IN_TRIP":
      return "in_trip";
    case "COMPLETED":
      return "pay";
    default:
      return "cancelled";
  }
}

/** The rider may cancel until the trip starts; after that only support can (V1 rule). */
export function canRiderCancel(stage: RideStage): boolean {
  return stage === "searching" || stage === "coming" || stage === "arrived";
}

/** The reasons the server accepts for a rider's cancel (agreed on Day 5). */
export const RIDER_CANCEL_REASONS: readonly { code: string; label: string }[] = [
  { code: "CHANGED_MIND", label: "Changed my mind" },
  { code: "CAPTAIN_DELAYED", label: "Captain is late" },
  { code: "WRONG_PICKUP", label: "Wrong pickup" },
  { code: "OTHER", label: "Other" },
];

export function cancelledText(cancelledBy: string): string {
  if (cancelledBy === "RIDER") return "You cancelled this ride.";
  if (cancelledBy === "OPERATIONS") return "VSolve support cancelled this ride.";
  return "This ride was cancelled.";
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** "Arriving in about 4 min", or null when the server doesn't know (never guessed). */
export function etaText(etaSeconds: number | null | undefined): string | null {
  if (etaSeconds == null) return null;
  return `Arriving in about ${Math.max(1, Math.round(etaSeconds / 60))} min`;
}

interface ShareableRide {
  pickup: { address: string };
  drop: { address: string };
  captain: { name: string; vehicle: { registration_number: string; make_model: string; colour: string } } | null;
}

/** What Share trip sends (brief §5.9): captain's first name, vehicle, pickup and drop. */
export function shareTripText(ride: ShareableRide): string {
  const lines = ["I'm on a VSolve ride."];
  if (ride.captain) {
    const { vehicle } = ride.captain;
    lines.push(
      `Captain: ${firstName(ride.captain.name)}`,
      `Vehicle: ${vehicle.registration_number} (${vehicle.make_model}, ${vehicle.colour})`,
    );
  }
  lines.push(`From: ${ride.pickup.address}`, `To: ${ride.drop.address}`);
  return lines.join("\n");
}
