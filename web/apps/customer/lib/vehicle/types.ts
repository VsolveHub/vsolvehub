import type { VehicleFlowType } from "./constants";

export type RideDetails = {
  pickupAddress: string;
  dropAddress: string;
  rideType: string;
  distanceKm: number;
  estimatedFarePaise: number;
};

export type RentalDetails = {
  rentalType: string;
  pickupDate: string;
  pickupTime: string;
  returnDate: string;
  returnTime: string;
  durationDays: number;
  licenseUrls: string[];
};

export type RepairDetails = {
  issue: string;
  vehicleType: string;
  brand: string;
  model: string;
  year: string;
  pickupOption: "garage" | "doorstep";
  serviceAddress: string;
  scheduleDate: string;
  scheduleTime: string;
  mediaUrls: string[];
};

export type TransportDetails = {
  pickupAddress: string;
  dropAddress: string;
  goodsType: string;
  weightKg: number;
  sizeDescription: string;
  vehicleType: string;
  distanceKm: number;
  estimatedFarePaise: number;
  mediaUrls: string[];
};

export type VehicleBookingDetails =
  | RideDetails
  | RentalDetails
  | RepairDetails
  | TransportDetails;

export type VehicleBookingDraft = {
  flowType: VehicleFlowType;
  serviceSlug: string;
  details: Partial<VehicleBookingDetails>;
  driverId?: string;
  rentalAssetId?: string;
  vendorId?: string;
  paymentMethod: "upi" | "card" | "wallet" | "cod" | null;
};
