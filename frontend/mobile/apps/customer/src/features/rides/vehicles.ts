import type { Schemas } from "@vsolve/api-client";
import type { ComponentType } from "react";

import { AutoIcon, BikeIcon, CabIcon } from "./vehicle-icons";

export type VehicleType = Schemas["FareQuote"]["vehicle_type"];
export type VehicleIcon = ComponentType<{ size?: number }>;

/** How each vehicle type is named and drawn, everywhere in Rides. */
export const VEHICLES: Record<VehicleType, { name: string; icon: VehicleIcon }> = {
  BIKE: { name: "Bike", icon: BikeIcon },
  AUTO: { name: "Auto", icon: AutoIcon },
  CAB: { name: "Cab", icon: CabIcon },
};
