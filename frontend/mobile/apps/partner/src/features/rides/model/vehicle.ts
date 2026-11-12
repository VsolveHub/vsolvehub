export type VehicleType = "BIKE" | "AUTO" | "CAB";

export interface VehicleDraft {
  vehicle_type: VehicleType | "";
  registration_number: string;
  make_model: string;
  colour: string;
}

export const EMPTY_VEHICLE: VehicleDraft = {
  vehicle_type: "",
  registration_number: "",
  make_model: "",
  colour: "",
};

export const VEHICLE_TYPES: readonly { type: VehicleType; label: string }[] = [
  { type: "BIKE", label: "Bike" },
  { type: "AUTO", label: "Auto" },
  { type: "CAB", label: "Cab" },
];

/**
 * The vehicle can change only while the application is a draft or sent back for changes: once
 * sent, the reviewer is checking documents for that vehicle (the server enforces the same).
 */
export function canEditVehicle(approval: string | null | undefined): boolean {
  return approval === "DRAFT" || approval === "CHANGES_REQUIRED";
}

/** What must be fixed before saving, per field. Empty when the draft can be sent. */
export function vehicleProblems(draft: VehicleDraft): Partial<Record<keyof VehicleDraft, string>> {
  const problems: Partial<Record<keyof VehicleDraft, string>> = {};
  if (draft.vehicle_type === "") problems.vehicle_type = "Choose your vehicle type.";
  const plate = draft.registration_number.replace(/\s+/g, "");
  if (plate === "") problems.registration_number = "Enter the registration number.";
  else if (plate.length > 16) problems.registration_number = "That registration number is too long.";
  if (draft.make_model.trim() === "") problems.make_model = "Enter the make and model.";
  else if (draft.make_model.trim().length > 120) problems.make_model = "Keep it under 120 characters.";
  if (draft.colour.trim() === "") problems.colour = "Enter the colour.";
  else if (draft.colour.trim().length > 40) problems.colour = "Keep it under 40 characters.";
  return problems;
}
