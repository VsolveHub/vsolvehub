import { PrismaClient } from "@prisma/client";
import { OWNERS, PROPERTY_SEED_TEMPLATES, propertyImages } from "./seed-lib/property-seed-data";

export async function seedAccommodation(prisma: PrismaClient) {
  await prisma.accommodationBookingStatusLog.deleteMany();
  await prisma.accommodationBooking.deleteMany();
  await prisma.accommodationProperty.deleteMany();
  await prisma.propertyOwner.deleteMany();

  const ownerMap = new Map<string, string>();

  for (const owner of OWNERS) {
    const row = await prisma.propertyOwner.create({
      data: { name: owner.name, phone: owner.phone, rating: owner.rating },
    });
    ownerMap.set(owner.phone, row.id);
  }

  for (const template of PROPERTY_SEED_TEMPLATES) {
    const ownerId = ownerMap.get(template.ownerPhone);
    if (!ownerId) continue;

    await prisma.accommodationProperty.create({
      data: {
        ownerId,
        propertyType: template.propertyType,
        serviceSlug: template.serviceSlug,
        title: template.title,
        location: template.location,
        area: template.area,
        lat: template.lat,
        lng: template.lng,
        pricePaise: template.pricePaise,
        priceUnit: template.priceUnit,
        depositPaise: template.depositPaise,
        rating: template.rating,
        roomType: template.roomType,
        hasAc: template.hasAc,
        isFurnished: template.isFurnished,
        sharingType: template.sharingType,
        foodIncluded: template.foodIncluded,
        genderPreference: template.genderPreference,
        images: JSON.stringify(propertyImages(template.title)),
        amenities: JSON.stringify(template.amenities),
        rules: JSON.stringify(template.rules),
      },
    });
  }
}
