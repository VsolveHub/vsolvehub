"use client";

import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/format";
import { LoadingState } from "@/components/ui/LoadingState";
import {
  useVehicleBookingQuery,
  useCancelVehicleBookingMutation,
  useSimulateVehicleStatusMutation,
  useResetVehicleSimulationMutation,
} from "@/lib/query/hooks";
import { RideRequestedScreen } from "./RideRequestedScreen";
import { RideAssignedScreen } from "./RideAssignedScreen";
import { RidePaymentScreen } from "./RidePaymentScreen";
import { RidePaidScreen } from "./RidePaidScreen";
import { GenericVehicleTracker } from "./GenericVehicleTracker";

export function VehicleTracker({ bookingRef }: { bookingRef: string }) {
  const { data, error, isLoading } = useVehicleBookingQuery(bookingRef, {
    refetchInterval: 4000,
  });

  const cancelMutation = useCancelVehicleBookingMutation(bookingRef);
  const simulateMutation = useSimulateVehicleStatusMutation(bookingRef);
  const resetMutation = useResetVehicleSimulationMutation(bookingRef);

  const cancelling = cancelMutation.isPending;
  const loading = simulateMutation.isPending || resetMutation.isPending;

  // Payment states for completed rides
  const [paid, setPaid] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"upi" | "card" | "wallet" | "cod">("cod");
  const [showBreakup, setShowBreakup] = useState(true);

  // Keep paid state in sync with status
  const status = data ? data.status : "";
  useEffect(() => {
    if (status !== "COMPLETED") {
      setPaid(false);
    }
  }, [status]);

  function cancelBooking() {
    if (!confirm("Cancel this booking?")) return;
    cancelMutation.mutate();
  }

  function simulateNextStatus() {
    simulateMutation.mutate();
  }

  function resetSimulation() {
    setPaid(false);
    resetMutation.mutate();
  }

  if (error) return <div className="rounded-xl px-4 py-3 text-sm bg-red-50 text-[var(--color-danger)]">Booking not found</div>;
  if (isLoading || !data) return <LoadingState label="Loading booking status…" variant="inline" />;

  const canCancel = !["COMPLETED", "CANCELLED"].includes(data.status);

  // Custom Book a Ride Tracker views matching Screen 5 & Screen 6
  if (data.flowType === "ride") {
    const isRequested = data.status === "REQUESTED";
    const isAssigned = ["DRIVER_ASSIGNED", "DRIVER_ARRIVING", "ON_TRIP"].includes(data.status);
    const isCompleted = data.status === "COMPLETED";

    const pickupAddress = data.details?.pickupAddress || "Gachibowli, Hyderabad";
    const dropAddress = data.details?.dropAddress || "HITEC City, Hyderabad";
    const priceVal = formatPrice(data.quotedAmount);
    const categoryVal = data.details?.rideType || "auto";

    // Driver details fallback
    const driverName = data.driver?.name || "Ramesh Kumar";
    const driverRating = data.driver?.rating || 4.9;
    const vehicleNumber = data.driver?.vehicleNumber || "TS09 AB 1234";
    const driverPhone = data.driver?.phone || "9876543210";
    const vehicleName = categoryVal === "auto" ? "Yellow Auto" : categoryVal === "bike" ? "Sporty Bike" : "Premium Cab";

    return (
      <div className="w-full min-h-screen bg-gray-50 flex flex-col relative pb-28 overflow-hidden font-sans">

        {/* Style Overrides for progress animation */}
        <style dangerouslySetInnerHTML={{__html: `
          @keyframes progressAnimation {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(300%); }
          }
          .custom-progress-bar {
            animation: progressAnimation 1.6s infinite linear;
          }
        `}} />

        {/* SCREEN 5: Finding Captain status */}
        {isRequested && (
          <RideRequestedScreen
            pickupAddress={pickupAddress}
            dropAddress={dropAddress}
            priceVal={priceVal}
            categoryVal={categoryVal}
            loading={loading}
            cancelling={cancelling}
            onSimulateNext={simulateNextStatus}
            onCancel={cancelBooking}
          />
        )}

        {/* SCREEN 6: Captain Accepted status */}
        {isAssigned && (
          <RideAssignedScreen
            driverName={driverName}
            driverRating={driverRating}
            vehicleNumber={vehicleNumber}
            driverPhone={driverPhone}
            vehicleName={vehicleName}
            priceVal={priceVal}
            loading={loading}
            onSimulateNext={simulateNextStatus}
            onCancel={cancelBooking}
          />
        )}

        {/* SCREEN 7: Ride Completed - Payment screen shown after ride completes */}
        {isCompleted && !paid && (
          <RidePaymentScreen
            priceVal={priceVal}
            categoryVal={categoryVal}
            pickupAddress={pickupAddress}
            dropAddress={dropAddress}
            paymentMethod={paymentMethod}
            setPaymentMethod={setPaymentMethod}
            showBreakup={showBreakup}
            setShowBreakup={setShowBreakup}
            onPay={() => setPaid(true)}
          />
        )}

        {/* Final completed check view (after payment is complete) */}
        {isCompleted && paid && (
          <RidePaidScreen
            bookingRef={bookingRef}
            driverName={driverName}
            priceVal={priceVal}
            paymentMethod={paymentMethod}
            loading={loading}
            onReset={resetSimulation}
          />
        )}
      </div>
    );
  }

  // Standard generic vehicle tracker (Rental, Transport, Repair)
  return (
    <GenericVehicleTracker
      data={data}
      canCancel={canCancel}
      cancelling={cancelling}
      loading={loading}
      onCancel={cancelBooking}
      onSimulateNext={simulateNextStatus}
      onReset={resetSimulation}
    />
  );
}
