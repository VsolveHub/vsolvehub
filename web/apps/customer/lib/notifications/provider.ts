import { prisma } from "@/lib/db/client";
import { formatPrice } from "@/lib/format";
import { getPendingOffers } from "@/lib/provider/queries";
import type { AppNotification } from "./types";
import { providerStatusBody, providerStatusTitle, statusIcon, statusTone } from "./format";

export async function getProviderNotifications(providerId: string, limit = 50): Promise<AppNotification[]> {
  const [pendingOffers, assignments, statusLogs] = await Promise.all([
    getPendingOffers(providerId),
    prisma.jobAssignment.findMany({
      where: {
        providerId,
        status: { in: ["ACCEPTED", "DECLINED", "EXPIRED"] },
      },
      include: {
        booking: {
          include: {
            service: true,
            address: true,
          },
        },
      },
      orderBy: { offeredAt: "desc" },
      take: limit,
    }),
    prisma.bookingStatusLog.findMany({
      where: {
        booking: { assignedProviderId: providerId },
        status: {
          in: [
            "ASSIGNED",
            "PROVIDER_ARRIVING",
            "STARTED",
            "COMPLETED",
            "CANCELLED",
            "NO_WORKER_FOUND",
          ],
        },
      },
      include: {
        booking: {
          include: { service: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
  ]);

  const items: AppNotification[] = [];

  for (const offer of pendingOffers) {
    const b = offer.booking;
    items.push({
      id: `offer-${offer.id}`,
      title: "New job offer",
      body: `${b.service.name} · ${b.address.fullAddress} · ${formatPrice(b.quotedAmount)}`,
      createdAt: offer.offeredAt.toISOString(),
      href: "/partner/leads",
      icon: "bell",
      tone: "alert",
      bookingRef: b.bookingRef,
      status: "OFFER_PENDING",
    });
  }

  for (const assignment of assignments) {
    const b = assignment.booking;
    const at = (assignment.respondedAt ?? assignment.offeredAt).toISOString();

    if (assignment.status === "ACCEPTED") {
      items.push({
        id: `assign-accepted-${assignment.id}`,
        title: "You accepted a job",
        body: `${b.service.name} · ${b.bookingRef} · ${b.address.fullAddress}`,
        createdAt: at,
        href: `/partner/work/${b.id}`,
        icon: "clipboard-check",
        tone: "success",
        bookingRef: b.bookingRef,
        status: "ACCEPTED",
      });
    } else if (assignment.status === "EXPIRED") {
      items.push({
        id: `assign-expired-${assignment.id}`,
        title: "Offer expired",
        body: `${b.service.name} · ${b.bookingRef} — you did not respond in time.`,
        createdAt: at,
        href: "/partner/leads",
        icon: "cross-circle",
        tone: "warning",
        bookingRef: b.bookingRef,
        status: "EXPIRED",
      });
    } else if (assignment.status === "DECLINED") {
      items.push({
        id: `assign-declined-${assignment.id}`,
        title: "Offer declined",
        body: `${b.service.name} · ${b.bookingRef}`,
        createdAt: at,
        href: "/partner/leads",
        icon: "cross-circle",
        tone: "info",
        bookingRef: b.bookingRef,
        status: "DECLINED",
      });
    }
  }

  for (const log of statusLogs) {
    items.push({
      id: `job-status-${log.id}`,
      title: providerStatusTitle(log.status),
      body: providerStatusBody(log.booking.service.name, log.booking.bookingRef, log.status),
      createdAt: log.createdAt.toISOString(),
      href: `/partner/work/${log.booking.id}`,
      icon: statusIcon(log.status, "service"),
      tone: statusTone(log.status),
      bookingRef: log.booking.bookingRef,
      status: log.status,
    });
  }

  const seen = new Set<string>();
  return items
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .slice(0, limit);
}
