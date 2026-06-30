import { prisma } from "@/lib/db/client";
import { OFFER_TTL_SECONDS } from "./constants";

export async function getProviderByUserId(userId: string) {
  return prisma.provider.findUnique({
    where: { userId },
    include: { worker: true, user: true },
  });
}

export async function expireStaleOffers() {
  const now = new Date();
  await prisma.jobAssignment.updateMany({
    where: { status: "PENDING", expiresAt: { lt: now } },
    data: { status: "EXPIRED", respondedAt: now },
  });
}

export async function getPendingOffers(providerId: string) {
  await expireStaleOffers();
  const now = new Date();
  return prisma.jobAssignment.findMany({
    where: {
      providerId,
      status: "PENDING",
      expiresAt: { gt: now },
    },
    include: {
      booking: {
        include: {
          service: { include: { category: true } },
          address: true,
          user: true,
        },
      },
    },
    orderBy: { offeredAt: "desc" },
  });
}

export async function getCaptainDashboardStats(providerId: string) {
  await expireStaleOffers();
  const worker = await prisma.worker.findUnique({ where: { providerId } });
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);

  const [pendingOffers, activeJobs, completedJobs, todayEarnings, weeklyEarnings] =
    await Promise.all([
      prisma.jobAssignment.count({
        where: { providerId, status: "PENDING", expiresAt: { gt: now } },
      }),
      prisma.booking.count({
        where: {
          assignedProviderId: providerId,
          status: {
            in: [
              "ASSIGNED",
              "ACCEPTED",
              "ARRIVED",
              "PROVIDER_ARRIVING",
              "ON_THE_WAY",
              "STARTED",
            ],
          },
        },
      }),
      prisma.booking.count({
        where: { assignedProviderId: providerId, status: "COMPLETED" },
      }),
      prisma.jobEarning.aggregate({
        where: { providerId, earnedAt: { gte: startOfDay } },
        _sum: { amountPaise: true },
      }),
      prisma.jobEarning.aggregate({
        where: { providerId, earnedAt: { gte: startOfWeek } },
        _sum: { amountPaise: true },
      }),
    ]);

  return {
    isOnline: worker?.isOnline ?? false,
    pendingOffers,
    activeJobs,
    completedJobs,
    todayEarningsPaise: todayEarnings._sum.amountPaise ?? 0,
    weeklyEarningsPaise: weeklyEarnings._sum.amountPaise ?? 0,
    rating: worker?.rating ?? 0,
    acceptanceRate: worker?.acceptanceRate ?? 0,
  };
}

export async function getActiveWork(providerId: string) {
  return prisma.booking.findMany({
    where: {
      assignedProviderId: providerId,
      status: {
        in: [
          "ASSIGNED",
          "ACCEPTED",
          "ARRIVED",
          "PROVIDER_ARRIVING",
          "ON_THE_WAY",
          "STARTED",
        ],
      },
    },
    include: {
      service: { include: { category: true } },
      address: true,
      user: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getWorkById(providerId: string, bookingId: string) {
  return prisma.booking.findFirst({
    where: { id: bookingId, assignedProviderId: providerId },
    include: {
      service: { include: { category: true } },
      address: true,
      user: true,
      statusLogs: { orderBy: { createdAt: "asc" } },
    },
  });
}

export async function getProviderEarnings(providerId: string) {
  const earnings = await prisma.jobEarning.findMany({
    where: { providerId },
    orderBy: { earnedAt: "desc" },
    take: 50,
  });

  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [daily, weekly, monthly] = await Promise.all([
    prisma.jobEarning.aggregate({
      where: { providerId, earnedAt: { gte: startOfDay } },
      _sum: { amountPaise: true, commissionPaise: true },
    }),
    prisma.jobEarning.aggregate({
      where: { providerId, earnedAt: { gte: startOfWeek } },
      _sum: { amountPaise: true, commissionPaise: true },
    }),
    prisma.jobEarning.aggregate({
      where: { providerId, earnedAt: { gte: startOfMonth } },
      _sum: { amountPaise: true, commissionPaise: true },
    }),
  ]);

  return {
    earnings,
    summary: {
      dailyPaise: daily._sum.amountPaise ?? 0,
      weeklyPaise: weekly._sum.amountPaise ?? 0,
      monthlyPaise: monthly._sum.amountPaise ?? 0,
      dailyCommissionPaise: daily._sum.commissionPaise ?? 0,
      weeklyCommissionPaise: weekly._sum.commissionPaise ?? 0,
      monthlyCommissionPaise: monthly._sum.commissionPaise ?? 0,
    },
  };
}

export function offerExpiresAt(from = new Date()) {
  return new Date(from.getTime() + OFFER_TTL_SECONDS * 1000);
}
