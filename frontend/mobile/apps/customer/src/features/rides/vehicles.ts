import type { Schemas } from "@vsolve/api-client";
import type { ComponentType } from "react";

import { AutoIcon, BikeIcon, CabIcon, SuvIcon, VanIcon } from "./vehicle-icons";

export type VehicleType = Schemas["FareQuote"]["vehicle_type"];
export type VehicleIcon = ComponentType<{ size?: number }>;

/** How each vehicle type is named and drawn, everywhere in Rides. */
export const VEHICLES: Record<VehicleType, { name: string; icon: VehicleIcon }> = {
  BIKE: { name: "Bike", icon: BikeIcon },
  AUTO: { name: "Auto", icon: AutoIcon },
  CAB: { name: "Cab", icon: CabIcon },
  // Taxi brief §5: EV Cab and Premium use the Cab icon, SUV and Innova the SUV, Tempo the van.
  EV_CAB: { name: "EV Cab", icon: CabIcon },
  PREMIUM: { name: "Premium", icon: CabIcon },
  SUV: { name: "SUV", icon: SuvIcon },
  INNOVA: { name: "Innova", icon: SuvIcon },
  TEMPO: { name: "Tempo Traveller", icon: VanIcon },
};
