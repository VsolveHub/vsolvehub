import { notFound } from "next/navigation";
import Link from "next/link";
import { getServerSession } from "@/lib/auth/session";
import { formatPrice, formatDate } from "@/lib/format";
import { getVehicleBookingByRef, parseVehicleDetails } from "@/lib/vehicle/queries";
import { VEHICLE_STATUS_MESSAGES, RIDE_TYPES, TRANSPORT_VEHICLE_TYPES, RENTAL_TYPES } from "@/lib/vehicle/constants";
import { BookingConfirmSlip } from "@/components/customer/booking/BookingConfirmSlip";
import type { RideDetails, RentalDetails, RepairDetails, TransportDetails } from "@/lib/vehicle/types";

const FLOW_TITLES: Record<string, { title: string; subtitle: string }> = {
  ride: { title: "Ride confirmed!", subtitle: "Your driver is on the way." },
  rental: { title: "Rental confirmed!", subtitle: "Pick up your vehicle at the scheduled time." },
  repair: { title: "Repair booked!", subtitle: "Your mechanic has been assigned." },
  transport: { title: "Transport booked!", subtitle: "Driver will arrive for pickup shortly." },
};

type PageProps = { searchParams: Promise<{ ref?: string; flow?: string }> };

export default async function VehicleConfirmPage({ searchParams }: PageProps) {
  const { ref, flow } = await searchParams;
  if (!ref) notFound();

  const session = await getServerSession();
  const booking = await getVehicleBookingByRef(ref, session?.id);
  if (!booking) notFound();

  const details = parseVehicleDetails(booking.detailsJson);
  const flowType = flow ?? booking.flowType;
  const meta = FLOW_TITLES[flowType] ?? FLOW_TITLES.ride;
  const status = booking.status;

  // Custom high-fidelity confirmation slip for Ride Bookings (matching Image 1)
  if (flowType === "ride") {
    const d = details as RideDetails;
    const rideLabel = RIDE_TYPES.find((t) => t.id === d.rideType)?.label ?? d.rideType;
    const driverName = booking.driver?.name || "Ravi Kumar";
    const vehicleNo = booking.driver?.vehicleNumber || "TS09 AB 1234";
    const totalAmount = formatPrice(booking.quotedAmount);
    
    return (
      <div className="w-full min-h-screen bg-gray-50 flex flex-col relative pb-28 overflow-hidden font-sans">
        {/* Header Bar */}
        <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-100 text-purple-900 select-none">
          <Link href="/" className="text-xl leading-none text-purple-800 hover:text-purple-955 cursor-pointer no-underline">
            ←
          </Link>
          <span className="font-extrabold text-sm truncate">Booking Confirmed</span>
        </div>

        {/* Success header section */}
        <div className="flex flex-col items-center text-center gap-3 mt-6 select-none">
          <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-3xl shadow-sm">
            ✓
          </div>
          <h1 className="text-xl font-black text-slate-900 m-0">Ride confirmed!</h1>
          <p className="text-xs text-gray-500 font-semibold leading-relaxed m-0">
            Your driver is on the way.
          </p>
        </div>

        {/* Receipt Container */}
        <div className="p-4 flex-grow">
          <div className="bg-white border border-gray-150 rounded-[28px] p-5 shadow-md flex flex-col gap-4 relative overflow-hidden">
            {/* Notch details for receipt styling */}
            <div className="absolute top-[80px] -left-2 w-4 h-4 rounded-full bg-gray-50 border-r border-gray-150" />
            <div className="absolute top-[80px] -right-2 w-4 h-4 rounded-full bg-gray-50 border-l border-gray-150" />

            <header className="flex justify-between items-center border-b border-gray-100 pb-3 select-none">
              <div className="flex items-center gap-1.5 font-bold text-purple-900 text-xs">
                <span className="w-5 h-5 flex items-center justify-center bg-purple-700 text-white rounded-md text-[11px]">V</span>
                <span>V Solve Hub</span>
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black bg-purple-100 text-purple-700 uppercase tracking-wider">
                Driver Assigned
              </span>
            </header>

            <div className="flex justify-between items-center py-1 mt-1 select-none">
              <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Booking reference</span>
              <span className="font-mono font-bold text-xs text-purple-900 bg-purple-50 px-2.5 py-0.5 rounded-lg border border-purple-150/40">
                {booking.bookingRef}
              </span>
            </div>

            {/* Dotted Perforation Line */}
            <div className="flex justify-between items-center gap-1 my-1 overflow-hidden select-none">
              {Array.from({ length: 24 }).map((_, i) => (
                <span key={i} className="w-1.5 h-1.5 rounded-full bg-purple-50 flex-shrink-0" />
              ))}
            </div>

            {/* Rows list */}
            <div className="flex flex-col gap-3.5 text-xs">
              <div className="flex justify-between items-center">
                <span className="font-bold text-gray-400 uppercase tracking-wider text-[9px]">Ride Type</span>
                <span className="font-black text-purple-900">{rideLabel}</span>
              </div>
              <div className="flex justify-between items-start gap-4">
                <span className="font-bold text-gray-400 uppercase tracking-wider text-[9px] flex-shrink-0">Pickup</span>
                <span className="font-semibold text-gray-800 text-right">{d.pickupAddress}</span>
              </div>
              <div className="flex justify-between items-start gap-4">
                <span className="font-bold text-gray-400 uppercase tracking-wider text-[9px] flex-shrink-0">Drop</span>
                <span className="font-semibold text-gray-800 text-right">{d.dropAddress}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-bold text-gray-400 uppercase tracking-wider text-[9px]">Distance</span>
                <span className="font-bold text-gray-800">~{d.distanceKm || 4.8} km</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-bold text-gray-400 uppercase tracking-wider text-[9px]">Driver</span>
                <span className="font-extrabold text-slate-800">{driverName} · {vehicleNo}</span>
              </div>
            </div>

            {/* Total Row */}
            <div className="flex justify-between items-center font-bold text-sm text-slate-800 pt-3 border-t border-gray-100 mt-1">
              <span>Total</span>
              <span className="text-purple-700 text-base font-black">{totalAmount}</span>
            </div>

            {/* Payment Method bar */}
            <div className="flex items-center gap-2 bg-slate-50 border border-gray-150 rounded-xl p-2.5 text-[10px] text-slate-700 font-bold select-none mt-1">
              <span className="text-xs">💳</span>
              <span>Payment: {booking.paymentMethod?.toUpperCase()} · {booking.paymentMethod?.toUpperCase()}</span>
            </div>

            {/* Subtext info */}
            <footer className="border-t border-gray-100 pt-3 text-center select-none">
              <p className="text-[10px] text-gray-400 font-semibold m-0">Your driver has been assigned.</p>
            </footer>
          </div>
        </div>

        {/* Sticky Actions */}
        <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto p-4 bg-white border-t border-gray-100 shadow-lg flex gap-3 z-50">
          <Link href={`/vehicle/track/${booking.bookingRef}`} className="block w-full py-3 bg-purple-900 hover:bg-purple-955 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer transition-all text-center no-underline">
            Track Ride
          </Link>
        </div>
      </div>
    );
  }

  const rows: { label: string; value: string; highlight?: boolean }[] = [];

  if (flowType === "rental") {
    const d = details as RentalDetails;
    const typeLabel = RENTAL_TYPES.find((t) => t.id === d.rentalType)?.label ?? d.rentalType;
    rows.push(
      { label: "Rental type", value: typeLabel, highlight: true },
      ...(booking.rentalAsset ? [{ label: "Vehicle", value: booking.rentalAsset.name }] : []),
      { label: "Pickup", value: `${formatDate(d.pickupDate)} ${d.pickupTime}` },
      { label: "Return", value: `${formatDate(d.returnDate)} ${d.returnTime}` },
      { label: "Duration", value: `${d.durationDays} day(s)` },
      ...(booking.depositPaise ? [{ label: "Deposit", value: formatPrice(booking.depositPaise) }] : [])
    );
  } else if (flowType === "repair") {
    const d = details as RepairDetails;
    rows.push(
      { label: "Issue", value: d.issue, highlight: true },
      { label: "Vehicle", value: `${d.brand} ${d.model} (${d.year})` },
      { label: "Service", value: d.pickupOption === "garage" ? "At garage" : "Doorstep" },
      { label: "Address", value: d.serviceAddress },
      { label: "Schedule", value: `${formatDate(d.scheduleDate)} ${d.scheduleTime}` },
      ...(booking.vendor ? [{ label: "Mechanic", value: `${booking.vendor.name} · ★ ${booking.vendor.rating.toFixed(1)}` }] : [])
    );
  } else if (flowType === "transport") {
    const d = details as TransportDetails;
    const vLabel = TRANSPORT_VEHICLE_TYPES.find((t) => t.id === d.vehicleType)?.label ?? d.vehicleType;
    rows.push(
      { label: "Vehicle", value: vLabel, highlight: true },
      { label: "Pickup", value: d.pickupAddress },
      { label: "Drop", value: d.dropAddress },
      { label: "Goods", value: `${d.goodsType} · ${d.weightKg} kg` },
      { label: "Distance", value: `~${d.distanceKm} km` },
      ...(booking.driver ? [{ label: "Driver", value: booking.driver.name }] : [])
    );
  }

  return (
    <div className="w-full min-h-screen bg-gray-50 flex flex-col justify-center items-center">
      <BookingConfirmSlip
        title={meta.title}
        subtitle={meta.subtitle}
        bookingRef={booking.bookingRef}
        status={status}
        statusMessage={VEHICLE_STATUS_MESSAGES[status] ?? "Tracking your booking."}
        rows={rows}
        totalLabel="Total"
        totalValue={formatPrice(booking.quotedAmount)}
        paymentMethod={booking.paymentMethod}
        paymentStatus={booking.paymentStatus}
        trackHref={`/vehicle/track/${booking.bookingRef}`}
        trackLabel="Track booking"
        secondaryHref="/services?category=vehicle-services"
        secondaryLabel="More vehicle services"
      />
    </div>
  );
}
