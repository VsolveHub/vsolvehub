import { PrismaClient } from "@prisma/client";
import { buildCatalogServices, SERVICE_CATALOG, slugify } from "./seed-lib/service-catalog";
import { VENDOR_SEED_DATA } from "./seed-lib/vendor-seed-data";
import { seedAccommodation } from "./seed-accommodation";
import { seedVehicle } from "./seed-vehicle";

export async function seedCustomerMarketplace(prisma: PrismaClient) {
  console.log("Seeding customer marketplace...");

  await prisma.bookingStatusLog.deleteMany();
  await prisma.jobAssignment.deleteMany();
  await prisma.jobEarning.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.savedService.deleteMany();
  await prisma.vendor.deleteMany();
  await prisma.service.deleteMany();
  await prisma.serviceSubCategory.deleteMany();
  await prisma.serviceCategory.deleteMany();

  const categoryMap = new Map<string, string>();
  const subCategoryMap = new Map<string, string>();

  for (const cat of SERVICE_CATALOG) {
    const row = await prisma.serviceCategory.create({
      data: {
        slug: cat.slug,
        name: cat.name,
        tagline: cat.tagline,
        icon: cat.icon,
        sortOrder: cat.sortOrder,
      },
    });
    categoryMap.set(cat.slug, row.id);

    for (const [index, sub] of cat.subCategories.entries()) {
      const subRow = await prisma.serviceSubCategory.create({
        data: {
          slug: sub.slug,
          name: sub.name,
          sortOrder: index + 1,
          categoryId: row.id,
        },
      });
      subCategoryMap.set(`${cat.slug}:${sub.slug}`, subRow.id);
    }
  }

  const serviceRows = buildCatalogServices();
  let count = 0;

  for (const svc of serviceRows) {
    const categoryId = categoryMap.get(svc.categorySlug)!;
    const subCategoryId = subCategoryMap.get(`${svc.categorySlug}:${svc.subCategorySlug}`)!;

    await prisma.service.create({
      data: {
        slug: svc.slug,
        name: svc.name,
        description: svc.description,
        pricePaise: svc.pricePaise,
        duration: svc.durationMinutes,
        archetype: svc.archetype,
        unit: svc.unit,
        tags: JSON.stringify(svc.tags),
        categoryId,
        subCategoryId,
      },
    });
    count++;
  }

  const customer = await prisma.user.upsert({
    where: { phone: "9876543210" },
    update: {},
    create: { phone: "9876543210", name: "Demo Customer" },
  });

  await prisma.address.upsert({
    where: { id: "seed-addr-home" },
    update: {},
    create: {
      id: "seed-addr-home",
      userId: customer.id,
      label: "Home",
      fullAddress: "Flat 204, Gachibowli, Hyderabad — 500032",
      houseNumber: "Flat 204",
      area: "Gachibowli",
      city: "Hyderabad",
      pincode: "500032",
      lat: 17.4401,
      lng: 78.3489,
      isDefault: true,
    },
  });

  for (const vendor of VENDOR_SEED_DATA) {
    await prisma.vendor.create({ data: { ...vendor } });
  }

  const sampleService = await prisma.service.findFirst({
    where: { slug: "switch-socket-repair" },
  });

  const sampleVendor = await prisma.vendor.findFirst({
    where: { categorySlug: "home-services" },
  });

  if (sampleService && sampleVendor) {
    const booking = await prisma.booking.create({
      data: {
        bookingRef: "VSH-DEMO-001",
        userId: customer.id,
        serviceId: sampleService.id,
        addressId: "seed-addr-home",
        vendorId: sampleVendor.id,
        slot: new Date(Date.now() + 86400000).toISOString(),
        scheduleType: "scheduled",
        status: "ACCEPTED",
        paymentStatus: "PAID",
        paymentMethod: "upi",
        issueDescription: "Power socket sparking in living room",
        mediaUrls: "[]",
        vendorAssignmentMode: "auto",
        baseChargePaise: sampleService.pricePaise,
        quotedAmount: sampleService.pricePaise,
        archetype: "A",
      },
    });
    await prisma.bookingStatusLog.create({
      data: { bookingId: booking.id, status: "ACCEPTED" },
    });

    const dispatchBooking = await prisma.booking.create({
      data: {
        bookingRef: "VSH-DISPATCH-001",
        userId: customer.id,
        serviceId: sampleService.id,
        addressId: "seed-addr-home",
        slot: new Date(Date.now() + 3600000).toISOString(),
        scheduleType: "scheduled",
        status: "REQUESTED",
        paymentStatus: "PAID",
        paymentMethod: "upi",
        issueDescription: "Need electrician for ceiling fan install",
        mediaUrls: "[]",
        vendorAssignmentMode: "auto",
        baseChargePaise: sampleService.pricePaise,
        quotedAmount: sampleService.pricePaise,
        archetype: "A",
      },
    });
    await prisma.bookingStatusLog.create({
      data: { bookingId: dispatchBooking.id, status: "REQUESTED" },
    });
  }

  const subCount = SERVICE_CATALOG.reduce((n, c) => n + c.subCategories.length, 0);
  await seedAccommodation(prisma);
  await seedVehicle(prisma);
  console.log(
    `Customer seed complete — ${count} services across ${SERVICE_CATALOG.length} categories (${subCount} sub-services)`,
  );
}
