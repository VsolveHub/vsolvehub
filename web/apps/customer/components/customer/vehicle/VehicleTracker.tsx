"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatPrice } from "@/lib/format";
import { VEHICLE_STATUS_LABELS } from "@/lib/vehicle/constants";
import { LoadingState } from "@/components/ui/LoadingState";
import {
  useVehicleBookingQuery,
  useCancelVehicleBookingMutation,
  useSimulateVehicleStatusMutation,
  useResetVehicleSimulationMutation,
} from "@/lib/query/hooks";

type TrackingData = {
  bookingRef: string;
  flowType: string;
  status: string;
  message: string;
  quotedAmount: number;
  depositPaise: number;
  details: Record<string, any>;
  driver: { name: string; phone: string; rating: number; vehicleNumber: string } | null;
  rentalAsset: { name: string; brand: string; model: string } | null;
  vendor: { name: string; phone: string; rating: number } | null;
  statusLogs: { status: string }[];
};

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

  if (error) return <div className="alert alert-error">Booking not found</div>;
  if (isLoading || !data) return <LoadingState label="Loading booking status…" variant="inline" />;

  const canCancel = !["COMPLETED", "CANCELLED"].includes(data.status);
  const assignee = data.driver ?? data.vendor;

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
          <div className="flex flex-col flex-grow relative h-full">
            {/* Top status capsule */}
            <div className="absolute top-4 left-0 right-0 flex justify-between items-center px-4 z-10 select-none">
              <Link href="/" className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-md text-purple-900 font-extrabold cursor-pointer border border-gray-100 no-underline">
                ←
              </Link>
              <div className="bg-white/95 px-4 py-1.5 rounded-full shadow-md border border-purple-100/50 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block animate-ping" />
                <span className="text-[10px] font-black text-slate-800 tracking-wide uppercase">Finding Captain</span>
              </div>
              <div className="w-9 h-9 rounded-full overflow-hidden border-2 border-white shadow-md">
                <img src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80" alt="avatar" className="w-full h-full object-cover" />
              </div>
            </div>

            {/* Radar Map view */}
            <div className="flex-grow h-[55vh] bg-slate-100 relative overflow-hidden select-none">
              <svg className="absolute inset-0 w-full h-full text-slate-300" xmlns="http://www.w3.org/2000/svg">
                <line x1="0" y1="120" x2="500" y2="120" stroke="currentColor" strokeWidth="6" />
                <line x1="0" y1="280" x2="500" y2="280" stroke="currentColor" strokeWidth="6" />
                <line x1="160" y1="0" x2="160" y2="600" stroke="currentColor" strokeWidth="6" />
              </svg>

              {/* Radar pulse circles */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center z-0">
                <div className="relative w-48 h-48 flex items-center justify-center">
                  <div className="absolute w-48 h-48 rounded-full bg-purple-500/10 border border-purple-500/20 radar-pulse-ring" style={{ animationDelay: "0s" }} />
                  <div className="absolute w-48 h-48 rounded-full bg-purple-500/10 border border-purple-500/20 radar-pulse-ring" style={{ animationDelay: "1s" }} />
                  
                  {/* Outer static ring */}
                  <div className="w-28 h-28 rounded-full border border-purple-500/35 bg-purple-500/5 flex items-center justify-center shadow-inner">
                    {/* Pulsating center */}
                    <div className="w-12 h-12 rounded-full bg-purple-600 border-2 border-white shadow-lg flex items-center justify-center text-xl font-bold text-white relative">
                      <span className="absolute inset-0 rounded-full border border-white animate-ping opacity-60" />
                      {categoryVal === "bike" ? "🏍️" : categoryVal === "taxi" || categoryVal === "premium" ? "🚗" : "🛺"}
                    </div>
                  </div>
                </div>
              </div>

              {/* Autos nearby */}
              <div className="absolute top-1/3 left-1/4 text-2xl animate-pulse">🛺</div>
              <div className="absolute bottom-1/3 right-1/4 text-2xl animate-bounce">🛺</div>
            </div>

            {/* Bottom Sheet */}
            <div className="bg-white rounded-t-[32px] p-5 shadow-2xl flex flex-col gap-4 border-t border-purple-50 z-20">
              <div className="flex flex-col items-center gap-3 pt-2 text-center select-none">
                {/* Circular spin spinner */}
                <div className="relative w-20 h-20 flex items-center justify-center select-none">
                  {/* Spinning outer circle */}
                  <div className="absolute inset-0 rounded-full border-4 border-purple-100 border-t-purple-650 animate-spin" />
                  {/* Centered static icon */}
                  <div className="w-12 h-12 rounded-full bg-purple-50 flex items-center justify-center text-2xl shadow-inner border border-purple-100/40">
                    {categoryVal === "bike" ? "🏍️" : categoryVal === "taxi" || categoryVal === "premium" ? "🚗" : "🛺"}
                  </div>
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-800 m-0">Looking for nearby captains...</h3>
                  <p className="text-[10px] text-gray-500 font-semibold mt-1 m-0">Connecting you to the fastest available ride</p>
                </div>
              </div>

              {/* Progress loader bar */}
              <div className="w-full h-1.5 bg-purple-100 rounded-full overflow-hidden relative">
                <div className="w-1/3 bg-purple-650 h-full rounded-full custom-progress-bar" />
              </div>

              {/* Trip summary details */}
              <div className="bg-purple-50/40 border border-purple-100/60 rounded-2xl p-3.5 flex justify-between items-center select-none">
                <div>
                  <h4 className="font-extrabold text-xs text-slate-800 m-0">{pickupAddress.split(",")[0]} → {dropAddress.split(",")[0]}</h4>
                  <p className="text-[10px] text-gray-400 font-bold mt-0.5 m-0">🛺 {categoryVal.toUpperCase()}</p>
                </div>
                <div className="text-right">
                  <p className="font-black text-sm text-purple-950 m-0">{priceVal}</p>
                  <p className="text-[8px] text-gray-400 font-bold m-0 mt-0.5">Fixed Fare</p>
                </div>
              </div>

              <button
                type="button"
                onClick={simulateNextStatus}
                disabled={loading}
                className="w-full py-3.5 bg-purple-900 hover:bg-purple-955 text-white font-black rounded-xl text-xs transition-all text-center cursor-pointer mb-2"
              >
                {loading ? "Matching..." : "Simulate Captain Acceptance (Demo)"}
              </button>

              <button 
                type="button" 
                onClick={cancelBooking}
                disabled={cancelling}
                className="w-full py-3 border border-red-500 text-red-500 hover:bg-red-55 text-red-650 font-black rounded-xl text-xs transition-all text-center cursor-pointer"
              >
                {cancelling ? "Cancelling..." : "✕ Cancel Ride"}
              </button>
            </div>
          </div>
        )}

        {/* SCREEN 6: Captain Accepted status */}
        {isAssigned && (
          <div className="flex flex-col flex-grow relative h-full">
            {/* Top green toast status */}
            <div className="absolute top-4 left-0 right-0 flex justify-between items-center px-4 z-10 select-none">
              <Link href="/" className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-md text-purple-900 font-extrabold cursor-pointer border border-gray-100 no-underline">
                ←
              </Link>
              <div className="bg-emerald-600 text-white px-4 py-1.5 rounded-full shadow-md border border-emerald-500 flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-full bg-white text-emerald-600 flex items-center justify-center text-[10px] font-bold">✓</span>
                <span className="text-[9px] font-black tracking-wide uppercase">Captain accepted your ride!</span>
              </div>
              <button type="button" className="w-9 h-9 rounded-full bg-white flex items-center justify-center shadow-md text-purple-900 border border-gray-100 font-bold cursor-pointer">
                🛡️
              </button>
            </div>

            {/* Map perspective view */}
            <div className="flex-grow h-[45vh] bg-slate-100 relative overflow-hidden select-none">
              <img src="https://images.unsplash.com/photo-1524661135-423995f22d0b?w=450" alt="map" className="w-full h-full object-cover opacity-80 filter brightness-95" />
              
              {/* Tooltip arriving info overlay */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1">
                <div className="bg-purple-950 text-white text-[10px] font-black px-3 py-1 rounded-full shadow-lg border border-purple-900">
                  Arriving in 4 min
                </div>
                <div className="w-7 h-7 rounded-full border-4 border-white bg-purple-600 flex items-center justify-center text-xs shadow-md">
                  🛺
                </div>
              </div>

              {/* Marker pin target */}
              <div className="absolute bottom-16 right-20 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white shadow animate-pulse" />
            </div>

            {/* Bottom Sheet Details */}
            <div className="bg-white rounded-t-[32px] p-5 shadow-2xl flex flex-col gap-3.5 border-t border-purple-50 z-20">
              {/* Driver profile card */}
              <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                <div className="flex items-center gap-3">
                  <img src="https://images.unsplash.com/photo-1540569014015-19a7be504e3a?w=100" alt="driver" className="w-11 h-11 rounded-full object-cover border border-purple-100" />
                  <div>
                    <h3 className="font-extrabold text-sm text-slate-800 m-0">{driverName}</h3>
                    <p className="text-[10px] text-gray-400 font-bold mt-0.5 m-0">★ {driverRating} (1,240 trips)</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-black text-xs text-purple-900 m-0 tracking-wide">{vehicleNumber}</p>
                  <p className="text-[9px] text-gray-400 font-bold m-0 mt-0.5">{vehicleName}</p>
                </div>
              </div>

              {/* Call/Message buttons */}
              <div className="flex gap-3 select-none">
                <a href={`tel:${driverPhone}`} className="flex-grow py-2.5 bg-purple-900 hover:bg-purple-955 text-white rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer no-underline shadow">
                  📞 Call {driverName.split(" ")[0]}
                </a>
                <button type="button" className="w-11 h-11 rounded-2xl border border-gray-250 text-slate-600 hover:bg-gray-50 flex items-center justify-center text-sm cursor-pointer transition-all">
                  💬
                </button>
              </div>

              {/* Simulation control button inside sheet */}
              <button
                type="button"
                onClick={simulateNextStatus}
                disabled={loading}
                className="w-full py-2.5 bg-purple-900 hover:bg-purple-955 text-white text-xs font-bold rounded-xl shadow-sm text-center cursor-pointer transition-all mt-1"
              >
                {loading ? "Simulating..." : "Simulate Next Step (Demo)"}
              </button>

              {/* OTP block */}
              <div className="bg-purple-100/30 border border-dashed border-purple-300 rounded-2xl p-4 flex flex-col items-center gap-2 select-none">
                <p className="text-[10px] font-black text-purple-955 uppercase tracking-wide m-0">OTP TO START RIDE</p>
                <div className="flex gap-2.5 my-1">
                  {["4", "8", "2", "1"].map((char, index) => (
                    <div
                      key={index}
                      className="w-8 h-10 bg-white border border-gray-250 rounded-xl flex items-center justify-center font-extrabold text-sm text-purple-955 shadow-sm"
                    >
                      {char}
                    </div>
                  ))}
                </div>
                <p className="text-[9px] text-gray-400 font-semibold m-0">Share with your captain to start</p>
              </div>

              {/* Payment selector block */}
              <div className="flex justify-between items-center bg-slate-50 border border-gray-150 rounded-xl p-2.5 text-xs select-none">
                <span className="font-bold text-slate-500">💵 Payment: Cash</span>
                <span className="font-black text-purple-955">{priceVal} ›</span>
              </div>

              {/* Footnotes links */}
              <div className="flex justify-between items-center px-1 text-[10px] font-bold select-none pt-1">
                <button type="button" className="text-purple-800 hover:text-purple-955 bg-transparent border-none cursor-pointer">
                  🔗 Share trip
                </button>
                <button type="button" onClick={cancelBooking} className="text-red-500 hover:text-red-750 bg-transparent border-none cursor-pointer">
                  ✕ Cancel ride
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SCREEN 7: Ride Completed - Payment screen shown after ride completes */}
        {isCompleted && !paid && (
          <div className="flex flex-col flex-grow bg-white h-full relative">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 text-slate-900 select-none">
              <span className="font-extrabold text-sm">Payment</span>
              <div className="w-8 h-8 rounded-full overflow-hidden border border-purple-100 shadow-sm">
                <img src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80" alt="avatar" className="w-full h-full object-cover" />
              </div>
            </div>

            {/* Payment Content */}
            <div className="p-4 flex flex-col gap-4 overflow-y-auto pb-28">
              {/* Amount Box Card */}
              <div className="bg-purple-900 text-white rounded-3xl p-5 shadow-lg flex flex-col gap-3.5 select-none relative overflow-hidden">
                <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-25 text-5xl">
                  🖐️
                </div>
                <div>
                  <span className="text-[10px] font-bold text-purple-200 uppercase tracking-wider block">Total amount to pay</span>
                  <p className="font-black text-3xl m-0 mt-0.5">{priceVal}</p>
                </div>
                <div className="bg-purple-950/60 rounded-xl p-2.5 text-[10px] font-bold border border-purple-850/40">
                  {categoryVal.toUpperCase()} Ride · 4.8 km · 12 min <br />
                  <span className="text-purple-300 font-semibold">{pickupAddress.split(",")[0]} → {dropAddress.split(",")[0]}</span>
                </div>
              </div>

              {/* Select Payment Method */}
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 px-1 select-none">Select Payment Method</p>
                <div className="flex flex-col gap-3">
                  {/* UPI */}
                  <div 
                    onClick={() => setPaymentMethod("upi")}
                    className={`p-4 rounded-2xl border transition-all flex items-center justify-between cursor-pointer ${
                      paymentMethod === "upi" ? "border-purple-600 bg-purple-50/40" : "border-gray-150 bg-white"
                    }`}
                  >
                    <div className="flex items-center gap-3.5">
                      <span className="text-xl select-none">🏦</span>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-extrabold text-xs text-slate-800 m-0">UPI (GPay / PhonePe / Paytm)</h4>
                          <span className="bg-amber-400 text-purple-955 text-[7px] font-black px-1.5 py-0.5 rounded uppercase">
                            Recommended
                          </span>
                        </div>
                        <p className="text-[9px] text-gray-400 font-semibold mt-0.5 m-0">Instant & secure digital payment</p>
                      </div>
                    </div>
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      paymentMethod === "upi" ? "border-purple-900 bg-purple-900" : "border-gray-300 bg-white"
                    }`}>
                      {paymentMethod === "upi" && <span className="w-1.5 h-1.5 bg-white rounded-full" />}
                    </div>
                  </div>

                  {/* Wallet */}
                  <div 
                    onClick={() => setPaymentMethod("wallet")}
                    className={`p-4 rounded-2xl border transition-all flex items-center justify-between cursor-pointer ${
                      paymentMethod === "wallet" ? "border-purple-650 bg-purple-50/40" : "border-gray-150 bg-white"
                    }`}
                  >
                    <div className="flex items-center gap-3.5">
                      <span className="text-xl select-none">💳</span>
                      <div>
                        <h4 className="font-extrabold text-xs text-slate-800 m-0">VSolve Wallet</h4>
                        <p className="text-[9px] text-gray-400 font-semibold mt-0.5 m-0">Balance: ₹1,250</p>
                      </div>
                    </div>
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      paymentMethod === "wallet" ? "border-purple-900 bg-purple-900" : "border-gray-300 bg-white"
                    }`}>
                      {paymentMethod === "wallet" && <span className="w-1.5 h-1.5 bg-white rounded-full" />}
                    </div>
                  </div>

                  {/* Cards */}
                  <div 
                    onClick={() => setPaymentMethod("card")}
                    className={`p-4 rounded-2xl border transition-all flex items-center justify-between cursor-pointer ${
                      paymentMethod === "card" ? "border-purple-650 bg-purple-50/40" : "border-gray-150 bg-white"
                    }`}
                  >
                    <div className="flex items-center gap-3.5">
                      <span className="text-xl select-none">💳</span>
                      <div>
                        <h4 className="font-extrabold text-xs text-slate-800 m-0">Credit / Debit Card</h4>
                        <p className="text-[9px] text-gray-400 font-semibold mt-0.5 m-0">Visa, Mastercard, RuPay</p>
                      </div>
                    </div>
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      paymentMethod === "card" ? "border-purple-900 bg-purple-900" : "border-gray-300 bg-white"
                    }`}>
                      {paymentMethod === "card" && <span className="w-1.5 h-1.5 bg-white rounded-full" />}
                    </div>
                  </div>

                  {/* Cash to Captain */}
                  <div 
                    onClick={() => setPaymentMethod("cod")}
                    className={`p-4 rounded-2xl border transition-all flex items-center justify-between cursor-pointer ${
                      paymentMethod === "cod" ? "border-purple-650 bg-purple-50/40" : "border-gray-150 bg-white"
                    }`}
                  >
                    <div className="flex items-center gap-3.5">
                      <span className="text-xl select-none">💵</span>
                      <div>
                        <h4 className="font-extrabold text-xs text-slate-800 m-0">Cash to Captain</h4>
                        <p className="text-[9px] text-gray-400 font-semibold mt-0.5 m-0">Pay after the ride ends</p>
                      </div>
                    </div>
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      paymentMethod === "cod" ? "border-purple-900 bg-purple-900" : "border-gray-300 bg-white"
                    }`}>
                      {paymentMethod === "cod" && <span className="w-1.5 h-1.5 bg-white rounded-full" />}
                    </div>
                  </div>
                </div>
              </div>

              {/* Collapse Fare Breakup details */}
              <div className="bg-slate-50 border border-gray-150 rounded-2xl p-4 flex flex-col gap-3 select-none">
                <div 
                  onClick={() => setShowBreakup(!showBreakup)}
                  className="flex justify-between items-center cursor-pointer"
                >
                  <span className="font-black text-purple-955 text-xs">View Fare Breakup</span>
                  <span className="font-extrabold text-purple-700 text-xs">{showBreakup ? "▼" : "▶"}</span>
                </div>

                {showBreakup && (
                  <div className="flex flex-col gap-2.5 pt-1 text-[11px] text-slate-600 border-t border-gray-200/50">
                    <div className="flex justify-between">
                      <span>Base Fare (First 2 km)</span>
                      <span className="font-bold text-slate-800">₹40</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Distance (Additional km)</span>
                      <span className="font-bold text-slate-800">₹96</span>
                    </div>
                    <div className="flex justify-between font-bold text-emerald-600 text-xs pt-1 border-t border-dashed border-gray-200">
                      <span>🛡️ Secure Transaction</span>
                      <span>{priceVal}</span>
                    </div>
                  </div>
                )}
              </div>

              <p className="text-[9px] text-center text-gray-400 font-semibold select-none m-0 uppercase tracking-wide">
                🔒 End-to-end encrypted
              </p>
            </div>

            {/* Sticky Bottom Actions */}
            <div className="absolute bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-100 flex flex-col z-30 select-none">
              <button 
                type="button" 
                onClick={() => setPaid(true)} 
                className="w-full py-3.5 bg-purple-700 hover:bg-purple-850 text-white text-xs font-black rounded-xl shadow-md cursor-pointer transition-all text-center flex items-center justify-center gap-1.5"
              >
                Pay {priceVal} →
              </button>
            </div>
          </div>
        )}

        {/* Final completed check view (after payment is complete) */}
        {isCompleted && paid && (
          <div className="flex flex-col flex-grow p-4 gap-4 justify-center items-center h-full">
            <div className="bg-white border border-purple-100 rounded-3xl p-6 shadow-xl w-full text-center flex flex-col items-center gap-4 select-none animate-[slideUp_0.2s_ease-out]">
              <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-2xl shadow-inner">
                ✓
              </div>
              <div>
                <h2 className="font-black text-slate-900 text-base m-0">Ride Completed!</h2>
                <p className="text-[10px] text-gray-500 mt-1 m-0">Ref: #{bookingRef}</p>
              </div>

              <div className="w-full flex flex-col gap-3.5 border-t border-b border-gray-100 py-4 my-1 text-xs text-left">
                <div className="flex justify-between">
                  <span className="font-bold text-gray-400">Driver Captain:</span>
                  <span className="font-extrabold text-slate-800">{driverName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-bold text-gray-400">Total Amount Paid:</span>
                  <span className="font-black text-purple-950">{priceVal}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-bold text-gray-400">Payment status:</span>
                  <span className="font-bold text-emerald-600">PAID via {paymentMethod.toUpperCase()}</span>
                </div>
              </div>

              <Link href="/" className="w-full py-3 bg-purple-900 hover:bg-purple-955 text-white text-xs font-black rounded-xl shadow-md text-center no-underline transition-all">
                Back to Home
              </Link>
              {/* Reset simulator control button inside success card */}
              <button
                type="button"
                onClick={resetSimulation}
                disabled={loading}
                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl shadow-sm text-center cursor-pointer mt-1"
              >
                {loading ? "Resetting..." : "Reset Simulation (Demo)"}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Standard generic vehicle tracker (Rental, Transport, Repair)
  return (
    <div className="stack-lg">
      <div className="card">
        <div className="flex-between">
          <div>
            <p className="text-sm text-muted">Booking reference</p>
            <p className="card-title">{data.bookingRef}</p>
          </div>
          <Badge status={data.status}>
            {VEHICLE_STATUS_LABELS[data.status] ?? data.status}
          </Badge>
        </div>
        <p className="alert alert-info mt-2">{data.message}</p>
      </div>

      <div className="card">
        <h2 className="section-title">Status timeline</h2>
        <div className="stack">
          {data.statusLogs.map((log: any, i: number) => (
            <div key={i} className="flex-between text-sm">
              <span>{VEHICLE_STATUS_LABELS[log.status] ?? log.status}</span>
              {log.status === data.status && <span className="text-muted">Current</span>}
            </div>
          ))}
        </div>
      </div>

      {data.rentalAsset && (
        <div className="card">
          <h2 className="section-title">Vehicle</h2>
          <p className="card-title">{data.rentalAsset.name}</p>
          <p className="text-sm text-muted">
            {data.rentalAsset.brand} {data.rentalAsset.model}
          </p>
        </div>
      )}

      {assignee && (
        <div className="card">
          <h2 className="section-title">{data.driver ? "Driver" : "Mechanic"}</h2>
          <p className="card-title">{assignee.name}</p>
          <p className="text-sm text-muted">
            ★ {assignee.rating.toFixed(1)}
            {data.driver ? ` · ${data.driver.vehicleNumber}` : ""}
          </p>
          {assignee.phone ? (
            <a href={`tel:${assignee.phone}`} className="btn btn-secondary btn-sm mt-2">
              Call
            </a>
          ) : null}
        </div>
      )}

      <div className="card">
        <div className="flex-between">
          <span>Amount</span>
          <span className="card-title">{formatPrice(data.quotedAmount)}</span>
        </div>
        {data.depositPaise > 0 && (
          <p className="text-sm text-muted mt-1">
            Includes {formatPrice(data.depositPaise)} security deposit
          </p>
        )}
      </div>

      <div className="booking-action-row">
        {canCancel && (
          <Button variant="secondary" onClick={cancelBooking} disabled={cancelling}>
            {cancelling ? "Cancelling…" : "Cancel booking"}
          </Button>
        )}
        <Link href="/services?category=vehicle-services" className="btn btn-primary">
          Book another
        </Link>
      </div>

      {/* Floating Demo Simulation Controls for Rentals/Repair/Transport */}
      <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto p-4 bg-white border-t border-gray-100 shadow-lg flex gap-3 z-50">
        {data.status !== "COMPLETED" ? (
          <button
            type="button"
            onClick={simulateNextStatus}
            disabled={loading}
            className="w-full py-3 bg-purple-900 hover:bg-purple-955 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer transition-all text-center animate-pulse"
          >
            {loading ? "Simulating..." : "Simulate Next Step (Demo)"}
          </button>
        ) : (
          <button
            type="button"
            onClick={resetSimulation}
            disabled={loading}
            className="w-full py-3 bg-purple-800 hover:bg-purple-900 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer transition-all text-center"
          >
            Reset Simulation (Demo)
          </button>
        )}
      </div>
    </div>
  );
}
