import { PrismaClient } from "@prisma/client";
import { VEHICLE_DRIVER_SEED, VEHICLE_RENTAL_SEED } from "./seed-lib/vehicle-seed-data";

export async function seedVehicle(prisma: PrismaClient) {
  await prisma.vehicleBookingStatusLog.deleteMany();
  await prisma.vehicleBooking.deleteMany();
  await prisma.vehicleRentalAsset.deleteMany();
  await prisma.vehicleDriver.deleteMany();

  for (const d of VEHICLE_DRIVER_SEED) {
    await prisma.vehicleDriver.create({ data: { ...d } });
  }

  for (const a of VEHICLE_RENTAL_SEED) {
    await prisma.vehicleRentalAsset.create({ data: { ...a } });
  }

  console.log(`Seeded ${VEHICLE_DRIVER_SEED.length} drivers and ${VEHICLE_RENTAL_SEED.length} rental vehicles`);
}
