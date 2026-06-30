export const VEHICLE_FLOW_TYPES = ["ride", "rental", "repair", "transport"] as const;
export type VehicleFlowType = (typeof VEHICLE_FLOW_TYPES)[number];

export const SERVICE_SLUG_TO_FLOW: Record<string, VehicleFlowType> = {
  "ride-booking": "ride",
  "taxi-services": "ride",
  "vehicle-repair": "repair",
  "goods-transport": "transport",
  "vehicle-rental": "rental",
};

export function getVehicleFlowHref(serviceSlug: string, subSlug?: string): string | null {
  const slug = subSlug ?? serviceSlug;
  const flow = SERVICE_SLUG_TO_FLOW[slug];
  return flow ? `/vehicle/${flow}` : null;
}

export const RIDE_TYPES = [
  { id: "bike", label: "Bike", icon: "bike", basePaise: 2500, perKmPaise: 800 },
  { id: "auto", label: "Auto", icon: "auto", basePaise: 4000, perKmPaise: 1200 },
  { id: "taxi", label: "Taxi", icon: "taxi", basePaise: 6000, perKmPaise: 1800 },
  { id: "premium", label: "Premium Cab", icon: "premium", basePaise: 10000, perKmPaise: 2800 },
] as const;

export const RENTAL_TYPES = [
  { id: "bike_rental", label: "Bike rental" },
  { id: "car_rental", label: "Car rental" },
  { id: "luxury_car", label: "Luxury car" },
  { id: "bus_rental", label: "Bus rental" },
] as const;

export const TRANSPORT_VEHICLE_TYPES = [
  { id: "tata_ace", label: "Tata Ace", icon: "tata_ace", basePaise: 80000, perKmPaise: 2500 },
  { id: "pickup", label: "Pickup", icon: "pickup", basePaise: 120000, perKmPaise: 3200 },
  { id: "mini_truck", label: "Mini Truck", icon: "mini_truck", basePaise: 180000, perKmPaise: 4500 },
  { id: "truck", label: "Truck", icon: "truck", basePaise: 350000, perKmPaise: 7000 },
  { id: "house_shifting", label: "House shifting", icon: "house_shifting", basePaise: 500000, perKmPaise: 9000 },
] as const;

export const REPAIR_ISSUES = [
  "Engine / starting trouble",
  "Brake or clutch issue",
  "Battery / electrical",
  "Tyre puncture or replacement",
  "AC / cooling",
  "Denting & painting",
  "General service",
  "Other",
] as const;

export const RIDE_STATUSES = [
  "REQUESTED",
  "DRIVER_ASSIGNED",
  "DRIVER_ARRIVING",
  "ON_TRIP",
  "COMPLETED",
  "CANCELLED",
] as const;

export const RENTAL_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "PICKED_UP",
  "RETURNED",
  "COMPLETED",
  "CANCELLED",
] as const;

export const REPAIR_STATUSES = [
  "REQUESTED",
  "ACCEPTED",
  "ON_THE_WAY",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
] as const;

export const TRANSPORT_STATUSES = [
  "REQUESTED",
  "DRIVER_ASSIGNED",
  "LOADING",
  "ON_THE_WAY",
  "DELIVERED",
  "COMPLETED",
  "CANCELLED",
] as const;

export type RideStatus = (typeof RIDE_STATUSES)[number];
export type RentalStatus = (typeof RENTAL_STATUSES)[number];
export type RepairStatus = (typeof REPAIR_STATUSES)[number];
export type TransportStatus = (typeof TRANSPORT_STATUSES)[number];

export const VEHICLE_STATUS_LABELS: Record<string, string> = {
  REQUESTED: "Requested",
  DRIVER_ASSIGNED: "Driver assigned",
  DRIVER_ARRIVING: "Driver arriving",
  ON_TRIP: "On trip",
  ON_THE_WAY: "On the way",
  LOADING: "Loading goods",
  DELIVERED: "Delivered",
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  PICKED_UP: "Picked up",
  RETURNED: "Returned",
  ACCEPTED: "Accepted",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export const VEHICLE_STATUS_MESSAGES: Record<string, string> = {
  REQUESTED: "We're finding the best match for you.",
  DRIVER_ASSIGNED: "Your driver has been assigned.",
  DRIVER_ARRIVING: "Driver is on the way to pickup.",
  ON_TRIP: "Enjoy your ride!",
  ON_THE_WAY: "Vehicle is en route to destination.",
  LOADING: "Goods are being loaded.",
  DELIVERED: "Goods delivered successfully.",
  PENDING: "Your rental request is being processed.",
  CONFIRMED: "Rental confirmed. Pick up at scheduled time.",
  PICKED_UP: "Vehicle picked up. Drive safe!",
  RETURNED: "Vehicle returned. Deposit will be refunded.",
  ACCEPTED: "Mechanic has accepted your request.",
  IN_PROGRESS: "Repair work is in progress.",
  COMPLETED: "Service completed. Thank you!",
  CANCELLED: "This booking was cancelled.",
};

export function getStatusFlow(flowType: VehicleFlowType): readonly string[] {
  switch (flowType) {
    case "ride":
      return RIDE_STATUSES;
    case "rental":
      return RENTAL_STATUSES;
    case "repair":
      return REPAIR_STATUSES;
    case "transport":
      return TRANSPORT_STATUSES;
  }
}
