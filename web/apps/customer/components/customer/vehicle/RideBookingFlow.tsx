"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DestinationSearchScreen } from "./ridebooking/DestinationSearchScreen";
import { SearchRideScreen } from "./ridebooking/SearchRideScreen";
import { SetPickupScreen } from "./ridebooking/SetPickupScreen";
import { SelectVehicleScreen } from "./ridebooking/SelectVehicleScreen";

type Driver = { id: string; name: string; phone: string; rating: number; vehicleNumber: string };

type Step = "destination-search" | "search-ride" | "set-pickup" | "select-vehicle";

export function RideBookingFlow() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("destination-search");
  const [pickup, setPickup] = useState("Gachibowli, Hyderabad");
  const [drop, setDrop] = useState("HITEC City, Hyderabad");
  const [rideType, setRideType] = useState<"bike" | "auto" | "taxi" | "premium">("auto");
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState("");
  const [paymentMethod] = useState<"upi" | "card" | "wallet" | "cod">("cod");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fares: Record<string, number> = { bike: 45, auto: 136, taxi: 210, premium: 320 };

  useEffect(() => {
    // Pre-fetch drivers to auto-assign a real driver from seed if possible
    fetch("/api/vehicle/bookings?type=drivers")
      .then((r) => r.json())
      .then((data) => {
        if (data.drivers && data.drivers.length > 0) {
          setDrivers(data.drivers);
          // Find first driver matching category or take first
          const matched = data.drivers.find(
            (d: any) => d.vehicleCategory === (rideType === "taxi" || rideType === "premium" ? "car" : rideType)
          );
          setSelectedDriverId(matched?.id || data.drivers[0].id);
        } else {
          // Fallback static uuid to satisfy database constraints
          setSelectedDriverId("clw8zoq4j000008jpclwh4e9d");
        }
      })
      .catch(() => {
        setSelectedDriverId("clw8zoq4j000008jpclwh4e9d");
      });
  }, [rideType]);

  async function handleBookRide() {
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/vehicle/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flowType: "ride",
          serviceSlug: "ride-booking",
          pickupAddress: pickup,
          dropAddress: drop || "HITEC City, Hyderabad",
          rideType,
          driverId: selectedDriverId,
          paymentMethod,
        }),
      });

      const data = await res.json();
      setLoading(false);

      if (!res.ok) {
        setError(data.error ?? "Ride booking failed. Please try again.");
        return;
      }

      // Redirect DIRECTLY to the tracker page so they see Screen 5 (Finding Captain) first!
      router.push(`/vehicle/track/${data.bookingRef}`);
    } catch (err) {
      setError("An error occurred. Please try again.");
      setLoading(false);
    }
  }

  function getVehicleLabel(type: string) {
    if (type === "auto") return "Auto";
    if (type === "bike") return "Bike";
    if (type === "taxi") return "Cab/Taxi";
    return "Premium";
  }

  return (
    <div className="w-full min-h-screen bg-purple-50/20 flex flex-col relative overflow-hidden font-sans">
      {step === "destination-search" && (
        <DestinationSearchScreen
          onBack={() => router.back()}
          onSetDrop={setDrop}
          onGoToSearch={() => setStep("search-ride")}
        />
      )}

      {step === "search-ride" && (
        <SearchRideScreen
          pickup={pickup}
          setPickup={setPickup}
          drop={drop}
          setDrop={setDrop}
          onBack={() => setStep("destination-search")}
          onGoToSetPickup={() => setStep("set-pickup")}
        />
      )}

      {step === "set-pickup" && (
        <SetPickupScreen
          onBack={() => setStep("search-ride")}
          onChangePickup={() => setStep("search-ride")}
          onConfirmPickup={() => setStep("select-vehicle")}
        />
      )}

      {step === "select-vehicle" && (
        <SelectVehicleScreen
          rideType={rideType}
          setRideType={setRideType}
          fares={fares}
          loading={loading}
          error={error}
          onBack={() => setStep("set-pickup")}
          onBookRide={handleBookRide}
          getVehicleLabel={getVehicleLabel}
        />
      )}
    </div>
  );
}
