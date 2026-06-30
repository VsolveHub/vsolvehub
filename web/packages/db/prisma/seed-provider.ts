import type { PrismaClient } from "@prisma/client";

const PARTNER_DEMO_ACCOUNTS = [
  { providerType: "CAPTAIN", phone: "9876543211", name: "Demo Captain", label: "Captain" },
  { providerType: "PROFESSIONAL", phone: "9876543212", name: "Demo Professional", label: "Professional" },
  { providerType: "RENTAL_VENDOR", phone: "9876543213", name: "Demo Rental Vendor", label: "Rental vendor" },
  { providerType: "PROPERTY_HOST", phone: "9876543214", name: "Demo Property Host", label: "Property host" },
  { providerType: "EVENT_VENDOR", phone: "9876543215", name: "Demo Event Studio", label: "Event studio" },
] as const;

export async function seedProvider(prisma: PrismaClient) {
  for (const account of PARTNER_DEMO_ACCOUNTS) {
    const user = await prisma.user.upsert({
      where: { phone: account.phone },
      update: { name: account.name },
      create: { phone: account.phone, name: account.name },
    });

    const isCaptain = account.providerType === "CAPTAIN";

    await prisma.provider.upsert({
      where: { userId: user.id },
      update: {
        providerType: account.providerType,
        status: "ACTIVE",
        onboardingCompleted: true,
      },
      create: {
        userId: user.id,
        providerType: account.providerType,
        status: "ACTIVE",
        onboardingCompleted: true,
        ...(isCaptain
          ? {
              worker: {
                create: {
                  displayName: account.name,
                  phone: user.phone,
                  isOnline: true,
                  rating: 4.9,
                  completedJobs: 24,
                  acceptanceRate: 94,
                },
              },
              kycDocuments: {
                create: [
                  { docType: "aadhaar", status: "VERIFIED", lastFour: "4321", url: "mock://aadhaar" },
                  { docType: "selfie", status: "VERIFIED", url: "mock://selfie" },
                ],
              },
            }
          : {
              kycDocuments: {
                create: [{ docType: "aadhaar", status: "VERIFIED", lastFour: "1234", url: "mock://aadhaar" }],
              },
            }),
      },
    });
  }

  const captain = PARTNER_DEMO_ACCOUNTS.find((a) => a.providerType === "CAPTAIN");
  if (captain) {
    const captainUser = await prisma.user.findUnique({ where: { phone: captain.phone } });
    if (captainUser) {
      const provider = await prisma.provider.findUnique({ where: { userId: captainUser.id } });
      if (provider) {
        await prisma.worker.updateMany({
          where: { providerId: provider.id },
          data: { isOnline: true },
        });
      }
    }
  }

  console.log("Provider seed — demo logins (OTP 1234):");
  for (const account of PARTNER_DEMO_ACCOUNTS) {
    console.log(`  ${account.label}: ${account.phone}`);
  }
}
