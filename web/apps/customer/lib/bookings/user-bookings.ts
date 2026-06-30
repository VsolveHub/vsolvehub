import { prisma } from "@/lib/db/client";
import { getUserAccommodationBookings } from "@/lib/accommodation/queries";
import { getUserVehicleBookings, parseVehicleDetails } from "@/lib/vehicle/queries";
import { formatDate } from "@/lib/format";
import type { RentalDetails, RepairDetails, RideDetails, TransportDetails } from "@/lib/vehicle/types";
import { getUserBookings } from "./queries";

export type UserBookingKind = "service" | "vehicle" | "accommodation";

export type UserBookingListItem = {
  id: string;
  kind: UserBookingKind;
  bookingRef: string;
  title: string;
  categoryLabel: string;
  status: string;
  amountPaise: number;
  dateLabel: string;
  trackHref: string;
  createdAt: Date;
  assignedPartnerName?: string | null;
};

const VEHICLE_FLOW_LABELS: Record<string, string> = {
  ride: "Ride",
  rental: "Vehicle rental",
  repair: "Vehicle repair",
  transport: "Goods transport",
};

function vehicleListMeta(flowType: string, details: ReturnType<typeof parseVehicleDetails>) {
  const title = VEHICLE_FLOW_LABELS[flowType] ?? "Vehicle booking";

  if (flowType === "ride") {
    const d = details as RideDetails;
    return {
      title,
      categoryLabel: d.dropAddress ? `${d.pickupAddress} → ${d.dropAddress}` : "Ride booking",
      dateLabel: "On demand",
    };
  }

  if (flowType === "rental") {
    const d = details as RentalDetails;
    return {
      title,
      categoryLabel: d.rentalType.replace(/_/g, " "),
      dateLabel: d.pickupDate
        ? `${formatDate(d.pickupDate)}${d.pickupTime ? ` · ${d.pickupTime}` : ""}`
        : "Scheduled",
    };
  }

  if (flowType === "repair") {
    const d = details as RepairDetails;
    return {
      title,
      categoryLabel: d.issue ?? "Vehicle repair",
      dateLabel: d.scheduleDate
        ? `${formatDate(d.scheduleDate)}${d.scheduleTime ? ` · ${d.scheduleTime}` : ""}`
        : "Scheduled",
    };
  }

  if (flowType === "transport") {
    const d = details as TransportDetails;
    return {
      title,
      categoryLabel: d.goodsType ?? "Goods transport",
      dateLabel: "Scheduled pickup",
    };
  }

  return { title, categoryLabel: title, dateLabel: "Scheduled" };
}

export async function getAllUserBookings(userId: string): Promise<UserBookingListItem[]> {
  const [serviceBookings, vehicleBookings, accommodationBookings] = await Promise.all([
    getUserBookings(userId),
    getUserVehicleBookings(userId),
    getUserAccommodationBookings(userId),
  ]);

  const items: UserBookingListItem[] = [
    ...serviceBookings.map((b) => {
      let partnerName = null;
      if (b.assignedProvider) {
        partnerName = b.assignedProvider.worker?.displayName ?? b.assignedProvider.user.name ?? "Partner";
      } else if (b.vendor) {
        partnerName = b.vendor.name;
      }
      return {
        id: b.id,
        kind: "service" as const,
        bookingRef: b.bookingRef,
        title: b.service.name,
        categoryLabel: b.service.category.name,
        status: b.status,
        amountPaise: b.quotedAmount,
        dateLabel: formatDate(b.slot),
        trackHref: `/booking/track/${b.bookingRef}`,
        createdAt: b.createdAt,
        assignedPartnerName: partnerName,
      };
    }),
    ...vehicleBookings.map((b) => {
      const meta = vehicleListMeta(b.flowType, parseVehicleDetails(b.detailsJson));
      return {
        id: b.id,
        kind: "vehicle" as const,
        bookingRef: b.bookingRef,
        title: meta.title,
        categoryLabel: meta.categoryLabel,
        status: b.status,
        amountPaise: b.quotedAmount,
        dateLabel: meta.dateLabel,
        trackHref: `/vehicle/track/${b.bookingRef}`,
        createdAt: b.createdAt,
      };
    }),
    ...accommodationBookings.map((b) => ({
      id: b.id,
      kind: "accommodation" as const,
      bookingRef: b.bookingRef,
      title: b.property.title,
      categoryLabel: b.bookingType === "visit" ? "Property visit" : "Move-in booking",
      status: b.status,
      amountPaise: b.totalPaidPaise,
      dateLabel: formatDate(b.visitDate ?? b.moveInDate ?? b.createdAt),
      trackHref: `/accommodation/track/${b.bookingRef}`,
      createdAt: b.createdAt,
    })),
  ];

  return items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function getUserBookingCount(userId: string): Promise<number> {
  const [service, vehicle, accommodation] = await Promise.all([
    prisma.booking.count({ where: { userId } }),
    prisma.vehicleBooking.count({ where: { userId } }),
    prisma.accommodationBooking.count({ where: { userId } }),
  ]);
  return service + vehicle + accommodation;
}
