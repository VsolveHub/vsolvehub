import { z } from "zod";
import { isValidIndianPhone, normalizePhone } from "./phone";

export const phoneSchema = z.preprocess(
  normalizePhone,
  z
    .string()
    .length(10, "Enter a valid 10-digit phone number")
    .refine(isValidIndianPhone, "Enter a valid Indian mobile number")
);

export const otpSendSchema = z.object({
  phone: phoneSchema,
});

export const otpVerifySchema = z.object({
  phone: phoneSchema,
  otp: z.string().trim().min(4, "OTP is required"),
});

const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

export const addressSchema = z
  .object({
    label: z.string().trim().min(1, "Label is required").max(40),
    fullAddress: z.preprocess(emptyToUndefined, z.string().trim().max(300).optional()),
    houseNumber: z.preprocess(emptyToUndefined, z.string().trim().max(40).optional()),
    landmark: z.preprocess(emptyToUndefined, z.string().trim().max(80).optional()),
    area: z.preprocess(emptyToUndefined, z.string().trim().max(80).optional()),
    city: z.preprocess(emptyToUndefined, z.string().trim().max(60).optional()),
    pincode: z.preprocess(
      emptyToUndefined,
      z.string().trim().regex(/^\d{6}$/, "Enter a valid 6-digit pincode").optional()
    ),
    isDefault: z.boolean().optional(),
    lat: z.number().optional(),
    lng: z.number().optional(),
  })
  .refine(
    (data) =>
      (data.fullAddress && data.fullAddress.length >= 6) ||
      (data.area && data.city) ||
      (data.lat != null && data.lng != null),
    { message: "Enter an area and city, or use your current location", path: ["area"] }
  );

export function buildFullAddress(data: z.infer<typeof addressSchema>) {
  if (data.fullAddress && data.fullAddress.length >= 6) {
    return data.fullAddress;
  }
  const cityLine = [data.city, data.pincode].filter(Boolean).join(" — ");
  const parts = [data.houseNumber, data.landmark, data.area, cityLine].filter(Boolean);
  return parts.join(", ");
}

export const bookingSchema = z.object({
  serviceId: z.string().min(1, "Service is required"),
  addressId: z.string().min(1, "Address is required"),
  slot: z.string().min(1, "Time slot is required"),
  vendorId: z.string().min(1, "Professional is required").optional(),
  issueDescription: z.string().trim().max(1000).optional(),
  mediaUrls: z.array(z.string().min(1)).max(5).optional(),
  scheduleType: z.enum(["instant", "scheduled"]),
  paymentMethod: z.enum(["upi", "card", "wallet", "cod"]).optional(),
  vendorAssignmentMode: z.enum(["auto", "manual"]).optional(),
  bookingType: z.string().optional(),
  archetypeDetails: z.record(z.any()).optional(),
});

export const bookingReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  review: z.string().trim().max(500).optional(),
});

export const accommodationBookingSchema = z.object({
  propertyId: z.string().min(1),
  bookingType: z.enum(["move_in", "visit"]),
  moveInDate: z.string().optional(),
  visitDate: z.string().optional(),
  durationMonths: z.number().int().min(1).max(24).optional(),
  numberOfPeople: z.number().int().min(1).max(10),
  occupation: z.string().trim().max(100),
  specialRequirements: z.string().trim().max(500).optional(),
  idProofUrls: z.array(z.string().min(1)).max(3).optional(),
  includeFirstMonthRent: z.boolean().optional(),
  paymentMethod: z.enum(["upi", "card", "wallet", "cod"]),
});

export const savedServiceSchema = z.object({
  serviceId: z.string().min(1),
});

const crewRolesSchema = z
  .array(z.object({ roleId: z.string().min(1), count: z.number().int().min(0).max(50) }))
  .min(1, "Select at least one worker type")
  .max(15);

export const crewQuoteSchema = z.object({
  serviceSlug: z.string().min(1).optional(),
  tradeSlug: z.string().min(1).optional(),
  startDate: z.string().min(1).optional(),
  roles: crewRolesSchema,
  durationDays: z.number().int().min(1).max(120),
});

export const crewBookingSchema = z
  .object({
    serviceId: z.string().min(1),
    addressId: z.string().min(1),
    assignmentMode: z.enum(["auto", "quotes"]),
    crewId: z.string().min(1).optional(),
    startDate: z.string().min(1),
    durationDays: z.number().int().min(1).max(120),
    roles: crewRolesSchema,
    issueDescription: z.string().trim().max(1000).optional(),
    mediaUrls: z.array(z.string().min(1)).max(5).optional(),
    siteLocation: z.string().trim().max(300).optional(),
    tradeSlug: z.string().min(1).optional(),
  })
  .refine((d) => d.assignmentMode !== "quotes" || !!d.crewId, {
    message: "Select a crew to continue",
    path: ["crewId"],
  });

const locationSchema = z.string().trim().min(5, "Enter a valid address").max(300);

export const vehicleRideBookingSchema = z.object({
  flowType: z.literal("ride"),
  serviceSlug: z.string().min(1),
  pickupAddress: locationSchema,
  dropAddress: locationSchema,
  rideType: z.enum(["bike", "auto", "taxi", "premium"]),
  driverId: z.string().min(1),
  paymentMethod: z.enum(["upi", "card", "wallet", "cod"]),
});

export const vehicleRentalBookingSchema = z.object({
  flowType: z.literal("rental"),
  serviceSlug: z.string().min(1),
  rentalAssetId: z.string().min(1),
  pickupDate: z.string().min(1),
  pickupTime: z.string().min(1),
  returnDate: z.string().min(1),
  returnTime: z.string().min(1),
  licenseUrls: z.array(z.string().min(1)).min(1).max(2),
  paymentMethod: z.enum(["upi", "card", "wallet", "cod"]),
});

export const vehicleRepairBookingSchema = z.object({
  flowType: z.literal("repair"),
  serviceSlug: z.string().min(1),
  issue: z.string().trim().min(3).max(200),
  vehicleType: z.string().trim().min(2).max(40),
  brand: z.string().trim().min(2).max(40),
  model: z.string().trim().min(1).max(40),
  year: z.string().trim().min(4).max(4),
  pickupOption: z.enum(["garage", "doorstep"]),
  serviceAddress: locationSchema,
  scheduleDate: z.string().min(1),
  scheduleTime: z.string().min(1),
  mediaUrls: z.array(z.string().min(1)).max(5).optional(),
  vendorId: z.string().min(1),
  paymentMethod: z.enum(["upi", "card", "wallet", "cod"]),
});

export const vehicleTransportBookingSchema = z.object({
  flowType: z.literal("transport"),
  serviceSlug: z.string().min(1),
  pickupAddress: locationSchema,
  dropAddress: locationSchema,
  goodsType: z.string().trim().min(2).max(100),
  weightKg: z.number().min(1).max(10000),
  sizeDescription: z.string().trim().max(200).optional(),
  vehicleType: z.enum(["tata_ace", "pickup", "mini_truck", "truck", "house_shifting"]),
  mediaUrls: z.array(z.string().min(1)).max(5).optional(),
  driverId: z.string().min(1),
  paymentMethod: z.enum(["upi", "card", "wallet", "cod"]),
});

export const vehicleBookingSchema = z.discriminatedUnion("flowType", [
  vehicleRideBookingSchema,
  vehicleRentalBookingSchema,
  vehicleRepairBookingSchema,
  vehicleTransportBookingSchema,
]);
