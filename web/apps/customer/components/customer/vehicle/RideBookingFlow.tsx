"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatPrice } from "@/lib/format";

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
  const [paymentMethod, setPaymentMethod] = useState<"upi" | "card" | "wallet" | "cod">("cod");
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
      
      {/* SCREEN 1: Where are you going? */}
      {step === "destination-search" && (
        <div className="flex flex-col flex-grow relative h-full">
          {/* Top Bar */}
          <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-10 select-none">
            <button type="button" onClick={() => router.back()} className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-md text-purple-900 font-extrabold cursor-pointer border border-gray-100">
              ←
            </button>
            <div className="w-9 h-9 rounded-full overflow-hidden border-2 border-white shadow-md">
              <img src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80" alt="avatar" className="w-full h-full object-cover" />
            </div>
          </div>

          {/* Map canvas */}
          <div className="flex-grow h-[60vh] bg-slate-50 relative overflow-hidden select-none">
            <svg className="absolute inset-0 w-full h-full text-slate-200" xmlns="http://www.w3.org/2000/svg">
              <line x1="0" y1="120" x2="500" y2="120" stroke="currentColor" strokeWidth="8" />
              <line x1="0" y1="280" x2="500" y2="280" stroke="currentColor" strokeWidth="8" />
              <line x1="160" y1="0" x2="160" y2="600" stroke="currentColor" strokeWidth="8" />
              <line x1="320" y1="0" x2="320" y2="600" stroke="currentColor" strokeWidth="8" />
            </svg>

            {/* Centered Pickup Marker */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1.5 z-10">
              <div className="bg-slate-900 text-white text-[10px] font-bold px-2.5 py-1 rounded-lg shadow-md whitespace-nowrap">
                Pickup point
              </div>
              <div className="w-6 h-6 rounded-full bg-emerald-500 border-4 border-white flex items-center justify-center shadow-md animate-pulse">
                <span className="w-2.5 h-2.5 rounded-full bg-white inline-block" />
              </div>
            </div>

            {/* GPS Target Overlay Button */}
            <button type="button" className="absolute bottom-4 right-4 w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-lg border border-gray-150 text-slate-700 font-bold cursor-pointer">
              🎯
            </button>
          </div>

          {/* Bottom Sheet */}
          <div className="bg-white rounded-t-[32px] p-5 shadow-2xl flex flex-col gap-4 border-t border-purple-50 z-20">
            <h2 className="text-lg font-black text-slate-900 m-0">Where are you going?</h2>
            
            {/* Search Drop Box */}
            <div 
              onClick={() => setStep("search-ride")} 
              className="w-full bg-purple-50/50 border border-purple-100 rounded-2xl p-3 flex items-center gap-2.5 text-slate-400 text-xs font-semibold cursor-pointer hover:bg-purple-50 transition-all select-none"
            >
              <span className="text-base text-purple-600">🔍</span>
              <span>Search drop location</span>
            </div>

            {/* Quick Pills */}
            <div className="flex gap-2.5 select-none">
              <button type="button" onClick={() => { setDrop("Home (Gurgaon)"); setStep("search-ride"); }} className="flex-1 py-2 bg-slate-50 hover:bg-slate-100 border border-gray-200/60 rounded-xl text-[11px] font-extrabold text-slate-700 transition-all cursor-pointer">
                🏠 Home
              </button>
              <button type="button" onClick={() => { setDrop("Work (HITEC City)"); setStep("search-ride"); }} className="flex-1 py-2 bg-slate-50 hover:bg-slate-100 border border-gray-200/60 rounded-xl text-[11px] font-extrabold text-slate-700 transition-all cursor-pointer">
                💼 Work
              </button>
              <button type="button" className="flex-1 py-2 bg-slate-50 hover:bg-slate-100 border border-gray-200/60 rounded-xl text-[11px] font-extrabold text-slate-700 transition-all cursor-pointer">
                📍 Add Place
              </button>
            </div>

            {/* Recent Destinations */}
            <div className="flex flex-col gap-2.5 pt-2">
              <div className="flex justify-between items-center select-none">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Recent Destinations</span>
                <button type="button" className="text-[10px] font-extrabold text-purple-700 hover:text-purple-900 underline cursor-pointer">Clear</button>
              </div>

              <div 
                onClick={() => { setDrop("HITEC City, Hyderabad"); setStep("search-ride"); }}
                className="flex items-center gap-3.5 p-2 rounded-xl hover:bg-purple-50/40 cursor-pointer transition-all"
              >
                <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-sm select-none">
                  🕒
                </div>
                <div>
                  <h4 className="font-extrabold text-xs text-slate-800 m-0">HITEC City</h4>
                  <p className="text-[10px] text-gray-400 font-semibold mt-0.5 m-0">Hyderabad, Telangana, India</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SCREEN 2: Search Ride input Suggestions */}
      {step === "search-ride" && (
        <div className="flex flex-col flex-grow bg-white h-full relative">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 text-slate-900 select-none">
            <button type="button" onClick={() => setStep("destination-search")} className="text-xl leading-none text-slate-600 hover:text-slate-900 cursor-pointer border-none bg-transparent">
              ←
            </button>
            <span className="font-extrabold text-sm">Search Ride</span>
          </div>

          <div className="p-4 flex flex-col gap-3.5">
            {/* Input boxes */}
            <div className="flex flex-col gap-2 bg-slate-50/50 border border-gray-150 rounded-2xl p-3">
              {/* Pickup input */}
              <div className="flex items-center gap-2.5 pb-2 border-b border-gray-200/60">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 flex-shrink-0" />
                <div className="flex-grow">
                  <span className="text-[8px] font-extrabold text-gray-400 uppercase tracking-wider block">Pickup</span>
                  <input 
                    type="text" 
                    value={pickup} 
                    onChange={(e) => setPickup(e.target.value)} 
                    className="w-full bg-transparent border-none focus:outline-none text-xs font-bold text-slate-800 p-0 mt-0.5" 
                  />
                </div>
              </div>

              {/* Drop-off input */}
              <div className="flex items-center gap-2.5 pt-1">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 flex-shrink-0" />
                <div className="flex-grow">
                  <span className="text-[8px] font-extrabold text-purple-700 uppercase tracking-wider block">Drop-Off</span>
                  <input 
                    type="text" 
                    placeholder="Where are you going?" 
                    value={drop} 
                    onChange={(e) => setDrop(e.target.value)} 
                    className="w-full bg-transparent border-none focus:outline-none text-xs font-bold text-slate-900 p-0 mt-0.5" 
                  />
                </div>
                {drop && (
                  <button type="button" onClick={() => setDrop("")} className="text-gray-400 text-xs font-bold bg-transparent border-none cursor-pointer">
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Current location shortcut */}
            <button type="button" className="flex items-center gap-2 text-purple-800 text-xs font-extrabold hover:text-purple-950 bg-transparent border-none cursor-pointer self-start pl-1 select-none">
              🧭 Use current location
            </button>

            {/* Suggestions List */}
            <div className="flex flex-col gap-1 border-t border-gray-100 pt-3">
              {[
                { title: "Inorbit Mall", sub: "Cyberabad, Madhapur, Hyderabad • 1.2 km", icon: "📍" },
                { title: "Cyber Towers", sub: "Hitech City Main Rd, Patrika Nagar • 0.8 km", icon: "📍" },
                { title: "Hitech City Metro Station", sub: "Blue Line, Kukatpally Housing Board • 2.1 km", icon: "🚇" },
                { title: "Mindspace Madhapur", sub: "Titus Towers, HITEC City, Hyderabad • 1.5 km", icon: "📍" }
              ].map((item) => (
                <div 
                  key={item.title}
                  onClick={() => { setDrop(item.title + ", Hyderabad"); setStep("set-pickup"); }}
                  className="flex items-center justify-between p-3 rounded-2xl hover:bg-purple-50/50 cursor-pointer transition-all border-b border-gray-50 last:border-b-0"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-base select-none">{item.icon}</span>
                    <div>
                      <h4 className="font-extrabold text-xs text-slate-800 m-0">{item.title}</h4>
                      <p className="text-[10px] text-gray-400 font-semibold mt-0.5 m-0">{item.sub}</p>
                    </div>
                  </div>
                </div>
              ))}

              <div onClick={() => setStep("set-pickup")} className="flex items-center justify-between p-3 rounded-2xl hover:bg-purple-50/50 cursor-pointer transition-all">
                <div className="flex items-center gap-3">
                  <span className="text-base select-none">🗺️</span>
                  <div>
                    <h4 className="font-extrabold text-xs text-slate-800 m-0">Set on Map</h4>
                    <p className="text-[10px] text-gray-400 font-semibold mt-0.5 m-0">Drag pin to select exact location</p>
                  </div>
                </div>
                <span className="text-gray-400 font-bold select-none">›</span>
              </div>
            </div>
          </div>

          {/* Sticky Bottom Actions */}
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-100 flex flex-col z-30 select-none">
            <button 
              type="button" 
              onClick={() => setStep("set-pickup")} 
              className="w-full py-3 bg-purple-900 hover:bg-purple-955 text-white text-xs font-black rounded-xl shadow-md cursor-pointer transition-all text-center"
            >
              Confirm Drop-off
            </button>
          </div>
        </div>
      )}

      {/* SCREEN 3: Set pickup point on Map */}
      {step === "set-pickup" && (
        <div className="flex flex-col flex-grow relative h-full">
          {/* Header */}
          <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-10 select-none">
            <button type="button" onClick={() => setStep("search-ride")} className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-md text-purple-900 font-extrabold cursor-pointer border border-gray-100">
              ←
            </button>
            <span className="font-black text-sm text-purple-955 bg-white/90 px-3 py-1 rounded-full shadow-sm">VSolveHub</span>
            <div className="w-9 h-9 rounded-full overflow-hidden border-2 border-white shadow-md">
              <img src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80" alt="avatar" className="w-full h-full object-cover" />
            </div>
          </div>

          {/* Dark purple theme map canvas */}
          <div className="flex-grow h-[55vh] bg-purple-950 relative overflow-hidden select-none">
            {/* Dark grid street map */}
            <svg className="absolute inset-0 w-full h-full text-purple-900/60 opacity-30" xmlns="http://www.w3.org/2000/svg">
              <line x1="0" y1="80" x2="500" y2="80" stroke="currentColor" strokeWidth="6" />
              <line x1="0" y1="200" x2="500" y2="200" stroke="currentColor" strokeWidth="6" />
              <line x1="0" y1="380" x2="500" y2="380" stroke="currentColor" strokeWidth="6" />
              <line x1="120" y1="0" x2="120" y2="600" stroke="currentColor" strokeWidth="6" />
              <line x1="280" y1="0" x2="280" y2="600" stroke="currentColor" strokeWidth="6" />
              {/* Route path line */}
              <path d="M 120,380 L 200,380 L 200,200 L 280,200" fill="none" stroke="#a78bfa" strokeWidth="5" strokeLinecap="round" className="opacity-70" />
            </svg>

            {/* Destination Red Pin (Top of map) */}
            <div className="absolute top-[80px] left-[280px] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1">
              <div className="bg-white text-[8px] font-bold px-2 py-0.5 rounded shadow-md border border-gray-100">
                Destination
              </div>
              <span className="text-xl">📍</span>
            </div>

            {/* Centered Yellow Ring Marker */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-2">
              <div className="bg-purple-900 text-white text-[10px] font-extrabold px-3 py-1 rounded-full shadow-lg border border-purple-800 flex items-center gap-1 cursor-pointer whitespace-nowrap">
                Set your pickup point ✎
              </div>
              <div className="w-8 h-8 rounded-full border-4 border-amber-400 bg-white flex items-center justify-center shadow-lg">
                <span className="w-3 h-3 rounded-full bg-amber-500 inline-block animate-ping" />
              </div>
            </div>
          </div>

          {/* Bottom Sheet */}
          <div className="bg-white rounded-t-[32px] p-5 shadow-2xl flex flex-col gap-4 border-t border-purple-50 z-20">
            {/* Pickup location block */}
            <div className="flex justify-between items-start border-b border-gray-100 pb-3">
              <div>
                <span className="text-[9px] font-black text-amber-600 uppercase tracking-wider block">★ Pickup Location</span>
                <h3 className="font-extrabold text-sm text-purple-955 mt-1 m-0">Gachibowli Rd, near DLF</h3>
                <p className="text-[10px] text-gray-400 font-semibold mt-0.5 m-0">Cyber City, Hyderabad, 500032</p>
              </div>
              <button type="button" onClick={() => setStep("search-ride")} className="text-xs font-black text-purple-800 hover:text-purple-955 underline cursor-pointer">
                Change
              </button>
            </div>

            {/* Quick Pills */}
            <div className="flex gap-2.5 select-none">
              <button type="button" className="flex-grow py-2 bg-slate-50 hover:bg-slate-100 border border-gray-200/60 rounded-xl text-[11px] font-extrabold text-slate-700 transition-all cursor-pointer">
                🏠 Home
              </button>
              <button type="button" className="flex-grow py-2 bg-slate-50 hover:bg-slate-100 border border-gray-200/60 rounded-xl text-[11px] font-extrabold text-slate-700 transition-all cursor-pointer">
                💼 Work
              </button>
              <button type="button" className="flex-grow py-2 bg-slate-50 hover:bg-slate-100 border border-gray-200/60 rounded-xl text-[11px] font-extrabold text-slate-700 transition-all cursor-pointer">
                ⏰ Schedule
              </button>
            </div>

            <button 
              type="button" 
              onClick={() => setStep("select-vehicle")} 
              className="w-full py-3 bg-purple-700 hover:bg-purple-850 text-white text-xs font-black rounded-xl shadow-md cursor-pointer transition-all text-center mt-1"
            >
              Confirm pickup
            </button>
          </div>
        </div>
      )}

      {/* SCREEN 4: Choose Ride Type */}
      {step === "select-vehicle" && (
        <div className="flex flex-col flex-grow relative h-full">
          {/* Header */}
          <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-10 select-none">
            <button type="button" onClick={() => setStep("set-pickup")} className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-md text-purple-900 font-extrabold cursor-pointer border border-gray-100">
              ←
            </button>
            <span className="font-black text-sm text-purple-955 bg-white/90 px-3 py-1 rounded-full shadow-sm">VSolveHub</span>
            <div className="w-9 h-9 rounded-full overflow-hidden border-2 border-white shadow-md">
              <img src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80" alt="avatar" className="w-full h-full object-cover" />
            </div>
          </div>

          {/* Map showing route path */}
          <div className="flex-grow h-[42vh] bg-slate-100 relative overflow-hidden select-none">
            <svg className="absolute inset-0 w-full h-full text-slate-300" xmlns="http://www.w3.org/2000/svg">
              <line x1="0" y1="100" x2="500" y2="100" stroke="currentColor" strokeWidth="6" />
              <line x1="0" y1="240" x2="500" y2="240" stroke="currentColor" strokeWidth="6" />
              <line x1="180" y1="0" x2="180" y2="500" stroke="currentColor" strokeWidth="6" />
              {/* Purple route connecting line */}
              <path d="M 180,240 L 260,240 L 260,100" fill="none" stroke="#7c3aed" strokeWidth="5" strokeLinecap="round" className="animate-[dash_2s_linear_infinite]" />
            </svg>
            
            {/* Pins */}
            <div className="absolute top-[230px] left-[180px] -translate-x-1/2 -translate-y-1/2 text-lg">🟢</div>
            <div className="absolute top-[90px] left-[260px] -translate-x-1/2 -translate-y-1/2 text-lg">📍</div>
          </div>

          {/* Bottom Sheet Selector */}
          <div className="bg-white rounded-t-[32px] p-5 shadow-2xl flex flex-col gap-3.5 border-t border-purple-50 z-20">
            <div className="flex justify-between items-center select-none pb-1">
              <h2 className="text-sm font-black text-purple-955 uppercase tracking-wide m-0">Choose your ride</h2>
              <span className="text-[10px] text-gray-400 font-bold">Distance: ~4.8 km</span>
            </div>

            {/* Vehicles list */}
            <div className="flex flex-col gap-2 max-h-56 overflow-y-auto pr-1">
              {[
                { id: "auto", label: "Auto", desc: "Popular, open air wind", icon: "🛺" },
                { id: "bike", label: "Bike", desc: "Fastest travel, eco", icon: "🏍️" },
                { id: "taxi", label: "Cab/Taxi", desc: "Comfortable sedans, AC", icon: "🚗" },
                { id: "premium", label: "Premium", desc: "Luxury ride, top captains", icon: "✨" }
              ].map((vehicle) => {
                const isSelected = rideType === vehicle.id;
                const fare = fares[vehicle.id];

                return (
                  <div
                    key={vehicle.id}
                    onClick={() => setRideType(vehicle.id as any)}
                    className={`p-3 rounded-2xl border transition-all flex items-center justify-between cursor-pointer ${
                      isSelected 
                        ? "border-purple-600 bg-purple-50/40 shadow-sm" 
                        : "border-gray-150 hover:bg-gray-50 bg-white"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl select-none">{vehicle.icon}</span>
                      <div>
                        <h4 className="font-extrabold text-xs text-slate-800 m-0">
                          {vehicle.label}
                        </h4>
                        <p className="text-[10px] text-gray-400 font-semibold mt-0.5 m-0">
                          {vehicle.desc}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-xs text-purple-955 m-0">₹{fare}</p>
                      <p className="text-[8px] text-gray-400 font-bold m-0 mt-0.5">Fixed Fare</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Payment quick info */}
            <div className="flex justify-between items-center bg-slate-50 border border-gray-150 rounded-2xl p-3 select-none text-xs">
              <span className="font-bold text-slate-500">💵 Payment Mode</span>
              <span className="font-extrabold text-purple-900 bg-purple-100/60 px-2.5 py-1 rounded-lg border border-purple-200/50">
                Cash / Pay after ride
              </span>
            </div>

            {error && <div className="alert alert-error text-center py-2 text-[11px]">{error}</div>}

            {/* Directly book ride on click */}
            <button
              type="button"
              onClick={handleBookRide}
              disabled={loading}
              className="w-full py-3.5 bg-purple-900 hover:bg-purple-955 text-white text-xs font-black rounded-xl shadow-md cursor-pointer transition-all text-center flex items-center justify-center gap-1.5"
            >
              {loading ? "Processing..." : `Book ${getVehicleLabel(rideType)}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
