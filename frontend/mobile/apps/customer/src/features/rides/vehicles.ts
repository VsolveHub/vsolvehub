import type { Schemas } from "@vsolve/api-client";
import { CarTaxiFront, Motorbike } from "lucide-react-native";
import type { ComponentType } from "react";

import { AutoRickshawIcon } from "./auto-rickshaw-icon";

export type VehicleType = Schemas["FareQuote"]["vehicle_type"];
export type VehicleIcon = ComponentType<{ size?: number; color?: string }>;

/** How each vehicle type is named and drawn, everywhere in Rides. */
export const VEHICLES: Record<VehicleType, { name: string; icon: VehicleIcon }> = {
  BIKE: { name: "Bike", icon: Motorbike },
  AUTO: { name: "Auto", icon: AutoRickshawIcon },
  CAB: { name: "Cab", icon: CarTaxiFront },
};
