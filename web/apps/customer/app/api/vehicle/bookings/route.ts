import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { createVehicleBooking, listDrivers, listRentalAssets } from "@/lib/vehicle/queries";
import {
  computeRentalDurationDays,
  computeRentalTotal,
  estimateDistanceKm,
  estimateRideFare,
  estimateTransportFare,
} from "@/lib/vehicle/pricing";
import { vehicleBookingSchema } from "@/lib/validation/schemas";
import { WALLET_BALANCE_PAISE } from "@/lib/profile/section-data";
import { prisma } from "@/lib/db/client";

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get("type");
  const category = req.nextUrl.searchParams.get("category");

  if (type === "rental") {
    const assets = await listRentalAssets(category ?? undefined);
    return NextResponse.json({ assets });
  }
  if (type === "drivers") {
    const drivers = await listDrivers(category ?? undefined);
    return NextResponse.json({ drivers });
  }
  return NextResponse.json({ error: "Invalid type" }, { status: 400 });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = vehicleBookingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  let quotedAmount = 0;
  let depositPaise = 0;
  let details: Record<string, unknown> = {};
  let driverId: string | undefined;
  let rentalAssetId: string | undefined;
  let vendorId: string | undefined;

  if (data.flowType === "ride") {
    const distanceKm = estimateDistanceKm(data.pickupAddress, data.dropAddress);
    quotedAmount = estimateRideFare(data.rideType, distanceKm);
    driverId = data.driverId;
    details = {
      pickupAddress: data.pickupAddress,
      dropAddress: data.dropAddress,
      rideType: data.rideType,
      distanceKm,
      estimatedFarePaise: quotedAmount,
    };
  } else if (data.flowType === "rental") {
    const asset = await prisma.vehicleRentalAsset.findUnique({
      where: { id: data.rentalAssetId },
    });
    if (!asset) {
      return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
    }
    const durationDays = computeRentalDurationDays(
      data.pickupDate,
      data.pickupTime,
      data.returnDate,
      data.returnTime
    );
    const totals = computeRentalTotal(asset.pricePerDayPaise, durationDays, asset.depositPaise);
    quotedAmount = totals.totalPaise;
    depositPaise = totals.depositPaise;
    rentalAssetId = asset.id;
    details = {
      rentalType: asset.rentalType,
      pickupDate: data.pickupDate,
      pickupTime: data.pickupTime,
      returnDate: data.returnDate,
      returnTime: data.returnTime,
      durationDays,
      licenseUrls: data.licenseUrls,
    };
  } else if (data.flowType === "repair") {
    const vendor = await prisma.vendor.findUnique({ where: { id: data.vendorId } });
    if (!vendor) {
      return NextResponse.json({ error: "Mechanic not found" }, { status: 404 });
    }
    const service = await prisma.service.findFirst({ where: { slug: "vehicle-repair" } });
    quotedAmount = service?.pricePaise ?? 49900;
    vendorId = vendor.id;
    details = {
      issue: data.issue,
      vehicleType: data.vehicleType,
      brand: data.brand,
      model: data.model,
      year: data.year,
      pickupOption: data.pickupOption,
      serviceAddress: data.serviceAddress,
      scheduleDate: data.scheduleDate,
      scheduleTime: data.scheduleTime,
      mediaUrls: data.mediaUrls ?? [],
    };
  } else if (data.flowType === "transport") {
    const distanceKm = estimateDistanceKm(data.pickupAddress, data.dropAddress);
    quotedAmount = estimateTransportFare(data.vehicleType, distanceKm);
    driverId = data.driverId;
    details = {
      pickupAddress: data.pickupAddress,
      dropAddress: data.dropAddress,
      goodsType: data.goodsType,
      weightKg: data.weightKg,
      sizeDescription: data.sizeDescription ?? "",
      vehicleType: data.vehicleType,
      distanceKm,
      estimatedFarePaise: quotedAmount,
      mediaUrls: data.mediaUrls ?? [],
    };
  }

  if (data.paymentMethod === "wallet" && quotedAmount > WALLET_BALANCE_PAISE) {
    return NextResponse.json({ error: "Insufficient wallet balance" }, { status: 400 });
  }

  const booking = await createVehicleBooking({
    userId: session.id,
    flowType: data.flowType,
    serviceSlug: data.serviceSlug,
    quotedAmount,
    depositPaise,
    driverId,
    rentalAssetId,
    vendorId,
    details: details as never,
    paymentStatus: data.paymentMethod === "cod" ? "COD" : "PAID",
    paymentMethod: data.paymentMethod,
  });

  return NextResponse.json({
    bookingRef: booking.bookingRef,
    status: booking.status,
    quotedAmount: booking.quotedAmount,
    flowType: booking.flowType,
  });
}
