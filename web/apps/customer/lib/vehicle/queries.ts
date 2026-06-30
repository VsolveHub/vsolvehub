import { prisma } from "@/lib/db/client";
import { generateBookingRef } from "@/lib/format";
import {
  getStatusFlow,
  VEHICLE_STATUS_MESSAGES,
  type VehicleFlowType,
} from "./constants";
import type { VehicleBookingDetails } from "./types";

const STATUS_INTERVAL_MS = 12_000;
const REF_PREFIX: Record<VehicleFlowType, string> = {
  ride: "VSH-RIDE-",
  rental: "VSH-RENT-",
  repair: "VSH-REPAIR-",
  transport: "VSH-HAUL-",
};

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function parseVehicleDetails(raw: string): VehicleBookingDetails {
  return parseJson(raw, {} as VehicleBookingDetails);
}

export function generateVehicleBookingRef(flowType: VehicleFlowType): string {
  return generateBookingRef().replace("VSH-", REF_PREFIX[flowType]);
}

export async function listRentalAssets(rentalType?: string) {
  return prisma.vehicleRentalAsset.findMany({
    where: { isAvailable: true, ...(rentalType ? { rentalType } : {}) },
    orderBy: [{ pricePerDayPaise: "asc" }],
  });
}

const DRIVER_CATEGORY_MAP: Record<string, string> = {
  pickup: "tata_ace",
  house_shifting: "truck",
};

export async function listDrivers(category?: string) {
  const mapped = category ? (DRIVER_CATEGORY_MAP[category] ?? category) : undefined;
  let drivers = await prisma.vehicleDriver.findMany({
    where: { isAvailable: true, ...(mapped ? { vehicleCategory: mapped } : {}) },
    orderBy: [{ rating: "desc" }],
    take: 10,
  });
  if (mapped && drivers.length === 0) {
    drivers = await prisma.vehicleDriver.findMany({
      where: { isAvailable: true },
      orderBy: [{ rating: "desc" }],
      take: 10,
    });
  }
  return drivers;
}

export async function createVehicleBooking(input: {
  userId: string;
  flowType: VehicleFlowType;
  serviceSlug: string;
  quotedAmount: number;
  depositPaise?: number;
  driverId?: string;
  rentalAssetId?: string;
  vendorId?: string;
  details: VehicleBookingDetails;
  paymentStatus: string;
  paymentMethod: string;
}) {
  const initialStatus =
    input.flowType === "rental"
      ? "PENDING"
      : input.flowType === "repair" && input.vendorId
        ? "ACCEPTED"
        : input.flowType === "ride"
          ? "REQUESTED"
          : input.driverId
            ? "DRIVER_ASSIGNED"
            : "REQUESTED";

  const booking = await prisma.vehicleBooking.create({
    data: {
      bookingRef: generateVehicleBookingRef(input.flowType),
      userId: input.userId,
      flowType: input.flowType,
      serviceSlug: input.serviceSlug,
      quotedAmount: input.quotedAmount,
      depositPaise: input.depositPaise ?? 0,
      driverId: input.driverId,
      rentalAssetId: input.rentalAssetId,
      vendorId: input.vendorId,
      detailsJson: JSON.stringify(input.details),
      paymentStatus: input.paymentStatus,
      paymentMethod: input.paymentMethod,
      status: initialStatus,
      statusLogs: { create: { status: initialStatus } },
    },
    include: {
      driver: true,
      rentalAsset: true,
      vendor: true,
      statusLogs: { orderBy: { createdAt: "asc" } },
    },
  });

  return booking;
}

export async function getVehicleBookingByRef(ref: string, userId?: string) {
  return prisma.vehicleBooking.findFirst({
    where: { bookingRef: ref, ...(userId ? { userId } : {}) },
    include: {
      driver: true,
      rentalAsset: true,
      vendor: true,
      statusLogs: { orderBy: { createdAt: "asc" } },
    },
  });
}

export async function getUserVehicleBookings(userId: string) {
  return prisma.vehicleBooking.findMany({
    where: { userId },
    include: {
      driver: true,
      rentalAsset: true,
      vendor: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

export function getSimulatedVehicleStatus(
  createdAt: Date,
  currentStatus: string,
  flowType: VehicleFlowType
): string {
  if (currentStatus === "COMPLETED" || currentStatus === "CANCELLED") {
    return currentStatus;
  }

  if (flowType === "ride") {
    return currentStatus;
  }

  const flow = getStatusFlow(flowType).filter((s) => s !== "CANCELLED");
  const idx = Math.max(flow.indexOf(currentStatus), 0);
  const elapsed = Date.now() - createdAt.getTime();
  const steps = Math.floor(elapsed / STATUS_INTERVAL_MS);
  const target = Math.min(idx + steps, flow.length - 1);
  return flow[target];
}

export async function syncVehicleBookingStatus(
  bookingId: string,
  createdAt: Date,
  currentStatus: string,
  flowType: VehicleFlowType
) {
  const simulated = getSimulatedVehicleStatus(createdAt, currentStatus, flowType);
  if (simulated === currentStatus) return simulated;

  await prisma.vehicleBooking.update({
    where: { id: bookingId },
    data: { status: simulated },
  });

  const lastLog = await prisma.vehicleBookingStatusLog.findFirst({
    where: { bookingId },
    orderBy: { createdAt: "desc" },
  });

  if (!lastLog || lastLog.status !== simulated) {
    await prisma.vehicleBookingStatusLog.create({
      data: { bookingId, status: simulated },
    });
  }

  return simulated;
}

export async function cancelVehicleBooking(ref: string, userId: string) {
  const booking = await prisma.vehicleBooking.findFirst({
    where: { bookingRef: ref, userId },
  });
  if (!booking) return null;
  if (booking.status === "COMPLETED" || booking.status === "CANCELLED") {
    return { error: "Booking cannot be cancelled" as const };
  }

  await prisma.vehicleBooking.update({
    where: { id: booking.id },
    data: { status: "CANCELLED" },
  });
  await prisma.vehicleBookingStatusLog.create({
    data: { bookingId: booking.id, status: "CANCELLED" },
  });
  return { success: true as const };
}

export function getVehicleStatusMessage(status: string) {
  return VEHICLE_STATUS_MESSAGES[status] ?? "Tracking your vehicle booking.";
}

export function serializeVehicleBooking(booking: {
  bookingRef: string;
  flowType: string;
  serviceSlug: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string | null;
  quotedAmount: number;
  depositPaise: number;
  detailsJson: string;
  createdAt: Date;
  driver: { name: string; phone: string; rating: number; vehicleNumber: string } | null;
  rentalAsset: { name: string; brand: string; model: string } | null;
  vendor: { name: string; phone: string; rating: number } | null;
  statusLogs: { status: string; createdAt: Date }[];
}) {
  const details = parseVehicleDetails(booking.detailsJson);
  return {
    bookingRef: booking.bookingRef,
    flowType: booking.flowType,
    serviceSlug: booking.serviceSlug,
    status: booking.status,
    message: getVehicleStatusMessage(booking.status),
    paymentStatus: booking.paymentStatus,
    paymentMethod: booking.paymentMethod,
    quotedAmount: booking.quotedAmount,
    depositPaise: booking.depositPaise,
    details,
    driver: booking.driver,
    rentalAsset: booking.rentalAsset,
    vendor: booking.vendor,
    statusLogs: booking.statusLogs,
    createdAt: booking.createdAt.toISOString(),
  };
}
