import { prisma } from "@/lib/db/client";
import type { AppNotification } from "./types";
import {
  serviceStatusBody,
  serviceStatusTitle,
  statusIcon,
  statusTone,
  stayStatusBody,
  stayStatusTitle,
  vehicleStatusBody,
  vehicleStatusTitle,
} from "./format";

const VEHICLE_FLOW_LABELS: Record<string, string> = {
  ride: "Ride",
  rental: "Vehicle rental",
  repair: "Vehicle repair",
  transport: "Goods transport",
};

export async function getCustomerNotifications(userId: string, limit = 50): Promise<AppNotification[]> {
  const perKind = Math.ceil(limit / 3);

  const [serviceLogs, vehicleLogs, stayLogs] = await Promise.all([
    prisma.bookingStatusLog.findMany({
      where: { booking: { userId } },
      include: {
        booking: {
          include: { service: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: perKind,
    }),
    prisma.vehicleBookingStatusLog.findMany({
      where: { booking: { userId } },
      include: { booking: true },
      orderBy: { createdAt: "desc" },
      take: perKind,
    }),
    prisma.accommodationBookingStatusLog.findMany({
      where: { booking: { userId } },
      include: {
        booking: {
          include: { property: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: perKind,
    }),
  ]);

  const items: AppNotification[] = [
    ...serviceLogs.map((log) => ({
      id: `service-${log.id}`,
      title: serviceStatusTitle(log.status),
      body: serviceStatusBody(log.booking.service.name, log.booking.bookingRef, log.status),
      createdAt: log.createdAt.toISOString(),
      href: `/booking/track/${log.booking.bookingRef}`,
      icon: statusIcon(log.status, "service"),
      tone: statusTone(log.status),
      bookingRef: log.booking.bookingRef,
      status: log.status,
    })),
    ...vehicleLogs.map((log) => {
      const title = VEHICLE_FLOW_LABELS[log.booking.flowType] ?? "Vehicle booking";
      return {
        id: `vehicle-${log.id}`,
        title: vehicleStatusTitle(log.status),
        body: vehicleStatusBody(title, log.booking.bookingRef, log.status),
        createdAt: log.createdAt.toISOString(),
        href: `/vehicle/track/${log.booking.bookingRef}`,
        icon: statusIcon(log.status, "vehicle"),
        tone: statusTone(log.status),
        bookingRef: log.booking.bookingRef,
        status: log.status,
      };
    }),
    ...stayLogs.map((log) => ({
      id: `stay-${log.id}`,
      title: stayStatusTitle(log.status),
      body: stayStatusBody(log.booking.property.title, log.booking.bookingRef, log.status),
      createdAt: log.createdAt.toISOString(),
      href: `/accommodation/track/${log.booking.bookingRef}`,
      icon: statusIcon(log.status, "stay"),
      tone: statusTone(log.status),
      bookingRef: log.booking.bookingRef,
      status: log.status,
    })),
  ];

  return items
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}
