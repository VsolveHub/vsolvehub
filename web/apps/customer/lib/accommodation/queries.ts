import { prisma } from "@/lib/db/client";
import { generateBookingRef } from "@/lib/format";
import {
  ACCOMMODATION_STATUS_MESSAGES,
  type AccommodationStatus,
} from "./constants";
import { computeAccommodationPayment } from "./pricing";
import type { AccommodationFilters } from "./types";

const HYDERABAD_LAT = 17.4435;
const HYDERABAD_LNG = 78.3772;

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
}

function parseJsonArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function serializeProperty(
  property: {
    id: string;
    propertyType: string;
    title: string;
    location: string;
    area: string;
    city: string;
    lat: number;
    lng: number;
    pricePaise: number;
    priceUnit: string;
    depositPaise: number;
    rating: number;
    roomType: string;
    isAvailable: boolean;
    images: string;
    amenities: string;
    rules: string;
    hasAc: boolean;
    isFurnished: boolean;
    sharingType: string;
    foodIncluded: boolean;
    genderPreference: string;
    owner: { id: string; name: string; phone: string; rating: number };
  },
  customerLat = HYDERABAD_LAT,
  customerLng = HYDERABAD_LNG
) {
  const images = parseJsonArray(property.images);
  return {
    id: property.id,
    propertyType: property.propertyType,
    title: property.title,
    location: property.location,
    area: property.area,
    city: property.city,
    pricePaise: property.pricePaise,
    priceUnit: property.priceUnit,
    depositPaise: property.depositPaise,
    distanceKm: haversineKm(customerLat, customerLng, property.lat, property.lng),
    rating: property.rating,
    roomType: property.roomType,
    isAvailable: property.isAvailable,
    imageUrl: images[0] ?? "",
    images,
    amenities: parseJsonArray(property.amenities),
    rules: parseJsonArray(property.rules),
    hasAc: property.hasAc,
    isFurnished: property.isFurnished,
    sharingType: property.sharingType,
    foodIncluded: property.foodIncluded,
    genderPreference: property.genderPreference,
    owner: property.owner,
  };
}

export async function listProperties(filters: AccommodationFilters = {}) {
  const where: Record<string, unknown> = { isAvailable: true };

  if (filters.type) where.propertyType = filters.type;
  const priceFilter: { gte?: number; lte?: number } = {};
  if (filters.budgetMin != null) priceFilter.gte = filters.budgetMin;
  if (filters.budgetMax != null) priceFilter.lte = filters.budgetMax;
  if (Object.keys(priceFilter).length) where.pricePaise = priceFilter;
  if (filters.ac === "ac") where.hasAc = true;
  if (filters.ac === "non-ac") where.hasAc = false;
  if (filters.furnished === "furnished") where.isFurnished = true;
  if (filters.furnished === "unfurnished") where.isFurnished = false;
  if (filters.sharing) where.sharingType = filters.sharing;
  if (filters.foodIncluded) where.foodIncluded = true;
  if (filters.gender && filters.gender !== "any") {
    where.OR = [{ genderPreference: filters.gender }, { genderPreference: "any" }];
  }

  const properties = await prisma.accommodationProperty.findMany({
    where,
    include: { owner: true },
    orderBy: [{ rating: "desc" }, { pricePaise: "asc" }],
  });

  return properties.map((p) => serializeProperty(p));
}

export async function getPropertyById(id: string) {
  const property = await prisma.accommodationProperty.findUnique({
    where: { id },
    include: { owner: true },
  });
  if (!property) return null;
  return serializeProperty(property);
}

export async function createAccommodationBooking(input: {
  userId: string;
  propertyId: string;
  bookingType: string;
  moveInDate?: string;
  visitDate?: string;
  durationMonths?: number;
  numberOfPeople: number;
  occupation: string;
  specialRequirements: string;
  idProofUrls: string[];
  tokenAdvancePaise: number;
  bookingFeePaise: number;
  firstMonthRentPaise: number;
  totalPaidPaise: number;
  paymentStatus: string;
  paymentMethod: string;
}) {
  const property = await prisma.accommodationProperty.findUnique({
    where: { id: input.propertyId },
    include: { owner: true },
  });
  if (!property) return null;

  const bookingRef = generateBookingRef().replace("VSH-", "VSH-STAY-");
  const initialStatus =
    input.bookingType === "visit" ? "VISIT_SCHEDULED" : "PENDING";

  const booking = await prisma.accommodationBooking.create({
    data: {
      bookingRef,
      userId: input.userId,
      propertyId: property.id,
      ownerId: property.ownerId,
      bookingType: input.bookingType,
      moveInDate: input.moveInDate,
      visitDate: input.visitDate,
      durationMonths: input.durationMonths,
      numberOfPeople: input.numberOfPeople,
      occupation: input.occupation,
      specialRequirements: input.specialRequirements,
      idProofUrls: JSON.stringify(input.idProofUrls),
      tokenAdvancePaise: input.tokenAdvancePaise,
      bookingFeePaise: input.bookingFeePaise,
      firstMonthRentPaise: input.firstMonthRentPaise,
      totalPaidPaise: input.totalPaidPaise,
      paymentStatus: input.paymentStatus,
      paymentMethod: input.paymentMethod,
      status: initialStatus,
      statusLogs: { create: { status: initialStatus } },
    },
    include: {
      property: { include: { owner: true } },
      owner: true,
    },
  });

  return booking;
}

export async function getAccommodationBookingByRef(ref: string, userId?: string) {
  return prisma.accommodationBooking.findFirst({
    where: {
      bookingRef: ref,
      ...(userId ? { userId } : {}),
    },
    include: {
      property: { include: { owner: true } },
      owner: true,
      statusLogs: { orderBy: { createdAt: "asc" } },
    },
  });
}

export async function getUserAccommodationBookings(userId: string) {
  return prisma.accommodationBooking.findMany({
    where: { userId },
    include: { property: true, owner: true },
    orderBy: { createdAt: "desc" },
  });
}

const STATUS_INTERVAL_MS = 20_000;

export function getSimulatedAccommodationStatus(
  createdAt: Date,
  currentStatus: string,
  bookingType: string
): AccommodationStatus {
  if (currentStatus === "CHECKED_IN" || currentStatus === "CANCELLED") {
    return currentStatus as AccommodationStatus;
  }

  const flow: readonly string[] =
    bookingType === "visit"
      ? ["PENDING", "VISIT_SCHEDULED", "CONFIRMED", "CHECKED_IN"]
      : ["PENDING", "CONFIRMED", "CHECKED_IN"];

  const idx = Math.max(flow.indexOf(currentStatus), 0);
  const elapsed = Date.now() - createdAt.getTime();
  const steps = Math.floor(elapsed / STATUS_INTERVAL_MS);
  const target = Math.min(idx + steps, flow.length - 1);
  return flow[target] as AccommodationStatus;
}

export async function syncAccommodationBookingStatus(
  bookingId: string,
  createdAt: Date,
  currentStatus: string,
  bookingType: string
) {
  const simulated = getSimulatedAccommodationStatus(createdAt, currentStatus, bookingType);
  if (simulated === currentStatus) return simulated;

  await prisma.accommodationBooking.update({
    where: { id: bookingId },
    data: { status: simulated },
  });

  const lastLog = await prisma.accommodationBookingStatusLog.findFirst({
    where: { bookingId },
    orderBy: { createdAt: "desc" },
  });

  if (!lastLog || lastLog.status !== simulated) {
    await prisma.accommodationBookingStatusLog.create({
      data: { bookingId, status: simulated },
    });
  }

  return simulated;
}

export async function cancelAccommodationBooking(ref: string, userId: string) {
  const booking = await prisma.accommodationBooking.findFirst({
    where: { bookingRef: ref, userId },
  });
  if (!booking) return null;
  if (booking.status === "CHECKED_IN" || booking.status === "CANCELLED") {
    return { error: "Booking cannot be cancelled" as const };
  }

  await prisma.accommodationBooking.update({
    where: { id: booking.id },
    data: { status: "CANCELLED" },
  });
  await prisma.accommodationBookingStatusLog.create({
    data: { bookingId: booking.id, status: "CANCELLED" },
  });
  return { success: true as const };
}

export function getAccommodationStatusMessage(status: string) {
  return (
    ACCOMMODATION_STATUS_MESSAGES[status as AccommodationStatus] ??
    "Tracking your accommodation booking."
  );
}

export function parseIdProofUrls(raw: string) {
  return parseJsonArray(raw);
}

export { computeAccommodationPayment } from "./pricing";
