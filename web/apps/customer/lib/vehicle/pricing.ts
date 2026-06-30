import { RIDE_TYPES, TRANSPORT_VEHICLE_TYPES } from "./constants";

export function estimateDistanceKm(pickup: string, drop: string): number {
  const combined = `${pickup}|${drop}`;
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    hash = (hash * 31 + combined.charCodeAt(i)) % 1000;
  }
  return Math.round((5 + (hash % 18)) * 10) / 10;
}

export function estimateRideFare(rideTypeId: string, distanceKm: number): number {
  const type = RIDE_TYPES.find((t) => t.id === rideTypeId) ?? RIDE_TYPES[1];
  return type.basePaise + Math.round(distanceKm * type.perKmPaise);
}

export function estimateTransportFare(vehicleTypeId: string, distanceKm: number): number {
  const type =
    TRANSPORT_VEHICLE_TYPES.find((t) => t.id === vehicleTypeId) ?? TRANSPORT_VEHICLE_TYPES[0];
  return type.basePaise + Math.round(distanceKm * type.perKmPaise);
}

export function computeRentalDurationDays(
  pickupDate: string,
  pickupTime: string,
  returnDate: string,
  returnTime: string
): number {
  const start = new Date(`${pickupDate}T${pickupTime || "10:00"}`);
  const end = new Date(`${returnDate}T${returnTime || "10:00"}`);
  const diffMs = end.getTime() - start.getTime();
  const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(1, days);
}

export function computeRentalTotal(pricePerDayPaise: number, durationDays: number, depositPaise: number) {
  const rentalPaise = pricePerDayPaise * durationDays;
  return { rentalPaise, depositPaise, totalPaise: rentalPaise + depositPaise };
}
