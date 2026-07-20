import { z } from "zod";
import { isValidIndianPhone, normalizePhone } from "./phone";

/**
 * Customers may only book inside a 7-day window. Keeping the horizon short means
 * a payment authorization taken at checkout is still valid when the job runs,
 * which removes a whole class of re-authorization edge cases.
 */
export const BOOKING_WINDOW_DAYS = 7;
export const BOOKING_WINDOW_MS = BOOKING_WINDOW_DAYS * 24 * 60 * 60 * 1000;

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

// Structured intake produced by ServiceBookingFlow (config-driven detail fields).
// Typed instead of `z.record(z.any())` so malformed partner-facing data can't be
// persisted. `.passthrough()` keeps it forward-compatible with future archetypes.
export const archetypeDetailsSchema = z
  .object({
    bookingType: z.string().max(50).optional(),
    scheduleType: z.enum(["instant", "scheduled"]).optional(),
    // Arrays carry multi-select add-on choices.
    fieldValues: z
      .record(z.union([z.string(), z.number(), z.array(z.string()).max(20)]))
      .optional(),
    details: z
      .array(
        z.object({
          label: z.string().trim().min(1).max(120),
          value: z.string().trim().max(500),
        }),
      )
      .max(40)
      .optional(),
  })
  .passthrough();

export const bookingSchema = z.object({
  serviceId: z.string().min(1, "Service is required"),
  addressId: z.string().min(1, "Address is required"),
  // ISO-8601 datetime (e.g. from `new Date(...).toISOString()`), not an arbitrary string.
  // Bookings are limited to a 7-day window; the same rule is enforced by a DB
  // check constraint so a direct write cannot bypass it.
  slot: z
    .string()
    .datetime({ message: "A valid time slot is required" })
    .refine((v) => new Date(v).getTime() <= Date.now() + BOOKING_WINDOW_MS, {
      message: "Bookings can only be made up to 7 days ahead",
    }),
  // Raw requirement selections. The server recomputes the price from these; any
  // price sent by the client is ignored.
  selections: z
    .record(z.union([z.string(), z.number(), z.array(z.string()).max(20)]))
    .optional(),
  // The professional the customer picked on the choose step. Optional: absent
  // means "auto-assign". Tried first at assignment; if taken by then, the engine
  // silently falls back to the next best (see assignBestPartner).
  preferredPartnerId: z.string().min(1).optional(),
  vendorId: z.string().min(1, "Professional is required").optional(),
  issueDescription: z.string().trim().max(1000).optional(),
  mediaUrls: z.array(z.string().min(1)).max(5).optional(),
  scheduleType: z.enum(["instant", "scheduled"]),
  paymentMethod: z.enum(["upi", "card", "wallet", "cod"]).optional(),
  vendorAssignmentMode: z.enum(["auto", "manual"]).optional(),
  bookingType: z.string().optional(),
  archetypeDetails: archetypeDetailsSchema.optional(),
});

// A cart item is a DRAFT booking. Same shape as bookingSchema minus the
// checkout-time fields (preferred partner, payment method) — those belong to the
// cart's single checkout, not the individual item.
export const cartAddSchema = z.object({
  serviceId: z.string().min(1, "Service is required"),
  addressId: z.string().optional(),
  slot: z
    .string()
    .datetime({ message: "A valid time slot is required" })
    .refine((v) => new Date(v).getTime() <= Date.now() + BOOKING_WINDOW_MS, {
      message: "Bookings can only be made up to 7 days ahead",
    })
    .optional(),
  scheduleType: z.enum(["instant", "scheduled"]).optional(),
  selections: z
    .record(z.union([z.string(), z.number(), z.array(z.string()).max(20)]))
    .optional(),
  archetypeDetails: archetypeDetailsSchema.optional(),
  note: z.string().trim().max(250).optional(),
  mediaUrls: z.array(z.string().min(1)).max(5).optional(),
});

export const cartPatchSchema = z.object({
  slot: z
    .string()
    .datetime()
    .refine((v) => new Date(v).getTime() <= Date.now() + BOOKING_WINDOW_MS, {
      message: "Bookings can only be made up to 7 days ahead",
    })
    .optional(),
  scheduleType: z.enum(["instant", "scheduled"]).optional(),
  addressId: z.string().min(1).optional(),
  selections: z
    .record(z.union([z.string(), z.number(), z.array(z.string()).max(20)]))
    .optional(),
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
