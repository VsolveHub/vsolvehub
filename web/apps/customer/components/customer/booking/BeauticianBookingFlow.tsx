"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import type { BookingServiceInfo, PaymentMethodType } from "@/lib/bookings/types";

type Address = {
  id: string;
  label: string;
  fullAddress: string;
  isDefault: boolean;
};

type BeauticianOption = {
  id: string;
  name: string;
  rating: number;
  reviewsCount: number;
  yearsExp: number;
  distance: string;
  price: number;
};

type Props = {
  service: BookingServiceInfo;
  addresses: Address[];
  onAddressSaved: (addr: Address) => void;
};

type Step = "details" | "address" | "schedule" | "beautician" | "summary" | "payment";

export function BeauticianBookingFlow({ service, addresses: initialAddresses, onAddressSaved }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("details");
  const [addresses, setAddresses] = useState<Address[]>(initialAddresses);

  // Form states
  const [photos, setPhotos] = useState<string[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState(addresses.find((a) => a.isDefault)?.id ?? addresses[0]?.id ?? "");
  const [selectedDate, setSelectedDate] = useState("Today, 20 May");
  const [selectedTimeSlot, setSelectedTimeSlot] = useState("2 PM - 4 PM");
  const [selectedBeauticianId, setSelectedBeauticianId] = useState("auto-assign");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodType | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Address add form states
  const [showAddAddress, setShowAddAddress] = useState(false);
  const [newLabel, setNewLabel] = useState("Home");
  const [newAddressText, setNewAddressText] = useState("");

  const selectedAddress = addresses.find((a) => a.id === selectedAddressId);

  // Beautician options from the mockup
  const beauticians: BeauticianOption[] = [
    { id: "priya-beauty-expert", name: "Priya Beauty Expert", rating: 4.9, reviewsCount: 152, yearsExp: 5, distance: "2.1 km away", price: 999 },
    { id: "swathi-makeup-artist", name: "Swathi Makeup Artist", rating: 4.8, reviewsCount: 98, yearsExp: 7, distance: "3.4 km away", price: 1099 },
    { id: "anu-beauty-specialist", name: "Anu Beauty Specialist", rating: 4.7, reviewsCount: 76, yearsExp: 4, distance: "2.8 km away", price: 999 },
    { id: "kavya-skin-expert", name: "Kavya Skin Expert", rating: 4.9, reviewsCount: 120, yearsExp: 6, distance: "3.0 km away", price: 1199 },
  ];

  const selectedBeautician = beauticians.find((b) => b.id === selectedBeauticianId);

  // Price calculation
  const serviceCharge = selectedBeautician ? selectedBeautician.price : 999;
  const platformFee = 49;
  const gst = 18;
  const totalAmount = serviceCharge + platformFee + gst;

  async function handleAddAddress() {
    if (!newAddressText || newAddressText.length < 10) {
      setError("Please enter a valid full address");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/profile/addresses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: newLabel,
        fullAddress: newAddressText,
        isDefault: addresses.length === 0,
      }),
    });
    setLoading(false);
    if (res.ok) {
      const { address } = await res.json();
      setAddresses((prev) => [...prev, address]);
      setSelectedAddressId(address.id);
      onAddressSaved(address);
      setShowAddAddress(false);
      setNewAddressText("");
    }
  }

  async function handleSubmit() {
    if (!paymentMethod) {
      setError("Please select a payment method");
      return;
    }
    setLoading(true);
    setError("");

    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serviceId: service.id,
        addressId: selectedAddressId,
        slot: new Date(Date.now() + 86400000).toISOString(),
        issueDescription: "At-home Beautician booking",
        mediaUrls: photos,
        scheduleType: "scheduled",
        paymentMethod: paymentMethod,
        vendorAssignmentMode: selectedBeauticianId === "auto-assign" ? "auto" : "manual",
        vendorId: selectedBeauticianId === "auto-assign" ? undefined : "seed-vendor-beautician",
      }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Booking creation failed");
      return;
    }

    router.push(`/booking/confirm?ref=${data.bookingRef}`);
  }

  // Handle back navigation
  function handleBack() {
    if (step === "details") {
      router.push(`/services/${service.category.slug}`);
    } else if (step === "address") {
      setStep("details");
    } else if (step === "schedule") {
      setStep("address");
    } else if (step === "beautician") {
      setStep("schedule");
    } else if (step === "summary") {
      setStep("beautician");
    } else if (step === "payment") {
      setStep("summary");
    }
  }

  // Resolve step badges & titles
  function getStepInfo(): { badge: number; title: string } {
    switch (step) {
      case "details":
        return { badge: 4, title: "Service Details" };
      case "address":
        return { badge: 5, title: "Select Address" };
      case "schedule":
        return { badge: 6, title: "Select Date & Time" };
      case "beautician":
        return { badge: 7, title: "Choose Beautician" };
      case "summary":
        return { badge: 8, title: "Booking Summary" };
      case "payment":
        return { badge: 9, title: "Payment" };
    }
  }

  const { badge, title } = getStepInfo();

  return (
    <div className="vsh-simulator-frame">
      {/* Status Bar */}
      <div className="vsh-status-bar">
        <span>9:41</span>
        <div className="vsh-status-bar-icons">
          <span>📶</span>
          <span>📶</span>
          <span>🔋 100%</span>
        </div>
      </div>

      {/* Navbar Header */}
      <div className="vsh-navbar">
        <button type="button" className="vsh-nav-back" onClick={handleBack}>
          ←
        </button>
        <span className="vsh-nav-title">{service.name}</span>
      </div>

      {/* Progress Circle Header */}
      <div className="vsh-step-header">
        <span className="vsh-step-badge">{badge}</span>
        <span className="vsh-step-title">{title}</span>
      </div>

      {/* Scrollable Simulator Content */}
      <div className="vsh-content">
        {step === "details" && (
          <div className="stack" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div className="vsh-card" style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
              <img src="https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=300" alt="Facial" style={{ width: "96px", height: "96px", borderRadius: "14px", objectFit: "cover" }} />
              <div>
                <h3 style={{ margin: 0, fontWeight: 700, fontSize: "1.05rem" }}>{service.name}</h3>
                <p style={{ margin: "0.25rem 0", color: "#666", fontSize: "0.85rem" }}>Duration: 60 mins</p>
                <p style={{ margin: 0, fontWeight: 800, color: "var(--color-brand)", fontSize: "1.1rem" }}>₹999</p>
              </div>
            </div>

            <div className="vsh-card stack" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <p style={{ fontWeight: 700, fontSize: "0.9rem", margin: 0 }}>About Service</p>
              <p style={{ fontSize: "0.8rem", color: "#555", margin: 0, lineHeight: 1.4 }}>
                Gold Facial helps in glow, removes tan and gives youthful radiance. Includes deep cleansing, gold scrub, face massage, and moisturizing.
              </p>
            </div>

            <div className="vsh-card stack">
              <p className="text-sm font-semibold" style={{ margin: "0 0 0.5rem 0" }}>Upload Photos (Optional)</p>
              <div className="booking-media-grid" style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ width: "72px", height: "72px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.5rem", borderRadius: "12px", border: "1px dashed #d4d4d8" }}
                  onClick={() => setPhotos([...photos, "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=150"])}
                >
                  +
                </button>
                {photos.map((p, idx) => (
                  <img key={idx} src={p} alt="skin" className="booking-media-thumb" style={{ width: "72px", height: "72px", borderRadius: "12px", objectFit: "cover" }} />
                ))}
              </div>
            </div>
          </div>
        )}

        {step === "address" && (
          <div className="stack" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div className="vsh-card stack" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <p style={{ fontWeight: 700, margin: "0 0 0.25rem 0", fontSize: "0.95rem" }}>Select Address</p>
              {addresses.map((addr) => (
                <button
                  key={addr.id}
                  type="button"
                  className={`card address-card ${selectedAddressId === addr.id ? "selected" : ""}`}
                  style={{ width: "100%", padding: "1rem", textAlign: "left", display: "flex", gap: "0.75rem", alignItems: "center", borderRadius: "12px", border: "1px solid #f1f0f5" }}
                  onClick={() => setSelectedAddressId(addr.id)}
                >
                  <input type="radio" checked={selectedAddressId === addr.id} readOnly />
                  <div>
                    <p style={{ fontWeight: 600, margin: 0, fontSize: "0.9rem" }}>{addr.label}</p>
                    <p style={{ fontSize: "0.8rem", color: "#666", margin: 0, lineHeight: 1.3 }}>{addr.fullAddress}</p>
                  </div>
                </button>
              ))}
            </div>

            {!showAddAddress ? (
              <Button variant="secondary" onClick={() => setShowAddAddress(true)} style={{ borderRadius: "12px" }}>
                + Add New Address
              </Button>
            ) : (
              <div className="vsh-card stack" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <p style={{ fontWeight: 700, margin: 0 }}>New Address</p>
                <Input label="Label" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Home, Office..." />
                <Textarea label="Full Address" value={newAddressText} onChange={(e) => setNewAddressText(e.target.value)} placeholder="House/Flat No, Landmark, Pincode" />
                {error && <div className="alert alert-error">{error}</div>}
                <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
                  <Button variant="secondary" onClick={() => setShowAddAddress(false)} style={{ flex: 1 }}>Cancel</Button>
                  <Button onClick={handleAddAddress} style={{ flex: 1 }} loading={loading}>Save</Button>
                </div>
              </div>
            )}
          </div>
        )}

        {step === "schedule" && (
          <div className="vsh-card stack">
            <p className="vsh-card-title">Select Date</p>
            <div className="slot-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.5rem" }}>
              {["Today, 20 May", "Tue, 21 May", "Wed, 22 May", "Thu, 23 May"].map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`slot-option ${selectedDate === d ? "selected" : ""}`}
                  style={{ borderRadius: "10px", padding: "0.5rem 0.25rem" }}
                  onClick={() => setSelectedDate(d)}
                >
                  <span style={{ fontSize: "0.7rem", opacity: 0.8, display: "block" }}>{d.split(", ")[0]}</span>
                  <span style={{ fontSize: "0.85rem", fontWeight: 700 }}>{d.split(", ")[1]}</span>
                </button>
              ))}
            </div>

            <p className="vsh-card-title" style={{ marginTop: "1.5rem" }}>Select Time Slot</p>
            <div className="slot-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "0.5rem" }}>
              {["9 AM - 11 AM", "11 AM - 1 PM", "2 PM - 4 PM", "4 PM - 6 PM", "6 PM - 8 PM", "8 PM - 10 PM"].map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`slot-option ${selectedTimeSlot === t ? "selected" : ""}`}
                  style={{ borderRadius: "10px", padding: "0.75rem" }}
                  onClick={() => setSelectedTimeSlot(t)}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === "beautician" && (
          <div className="stack" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <button
              type="button"
              className={`card vendor-card ${selectedBeauticianId === "auto-assign" ? "selected" : ""}`}
              style={{ width: "100%", padding: "1.25rem", textAlign: "left", display: "flex", alignItems: "center", gap: "0.75rem", borderRadius: "16px", border: "1px solid #f1f0f5" }}
              onClick={() => setSelectedBeauticianId("auto-assign")}
            >
              <input type="radio" checked={selectedBeauticianId === "auto-assign"} readOnly />
              <div>
                <p style={{ fontWeight: 700, margin: 0, fontSize: "0.95rem" }}>Auto Assign (Recommended)</p>
                <p style={{ fontSize: "0.8rem", color: "#666", margin: 0, marginTop: "0.125rem" }}>We will match you with the best nearby beautician</p>
              </div>
            </button>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {beauticians.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className={`card vendor-card ${selectedBeauticianId === b.id ? "selected" : ""}`}
                  style={{ width: "100%", padding: "1.1rem", textAlign: "left", display: "flex", alignItems: "center", gap: "0.75rem", borderRadius: "14px", border: "1px solid #f1f0f5" }}
                  onClick={() => setSelectedBeauticianId(b.id)}
                >
                  <input type="radio" checked={selectedBeauticianId === b.id} readOnly />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <p style={{ fontWeight: 700, margin: 0, fontSize: "0.9rem" }}>{b.name}</p>
                      <p style={{ fontWeight: 800, color: "var(--color-brand)", margin: 0, fontSize: "0.95rem" }}>₹{b.price}</p>
                    </div>
                    <p style={{ fontSize: "0.75rem", color: "#666", margin: 0, marginTop: "0.125rem" }}>
                      ★ {b.rating.toFixed(1)} ({b.reviewsCount} reviews) · {b.yearsExp} Yrs Exp · {b.distance}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === "summary" && (
          <div className="vsh-card stack" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div style={{ borderBottom: "1px solid #f3f4f6", paddingBottom: "0.75rem" }}>
              <p style={{ fontSize: "0.8rem", color: "#71717a", margin: 0 }}>Service</p>
              <p style={{ fontWeight: 700, margin: 0, fontSize: "0.95rem" }}>{service.name}</p>
            </div>
            <div style={{ borderBottom: "1px solid #f3f4f6", paddingBottom: "0.75rem" }}>
              <p style={{ fontSize: "0.8rem", color: "#71717a", margin: 0 }}>Duration</p>
              <p style={{ margin: 0, fontSize: "0.9rem" }}>60 mins</p>
            </div>
            <div style={{ borderBottom: "1px solid #f3f4f6", paddingBottom: "0.75rem" }}>
              <p style={{ fontSize: "0.8rem", color: "#71717a", margin: 0 }}>Address</p>
              <p style={{ margin: 0, fontSize: "0.9rem", lineHeight: 1.3 }}>{selectedAddress?.fullAddress}</p>
            </div>
            <div style={{ borderBottom: "1px solid #f3f4f6", paddingBottom: "0.75rem" }}>
              <p style={{ fontSize: "0.8rem", color: "#71717a", margin: 0 }}>Date & Time</p>
              <p style={{ margin: 0, fontSize: "0.9rem" }}>{selectedDate} · {selectedTimeSlot}</p>
            </div>
            <div>
              <p style={{ fontSize: "0.8rem", color: "#71717a", margin: 0 }}>Beautician</p>
              <p style={{ fontWeight: 700, margin: 0, fontSize: "0.95rem" }}>
                {selectedBeauticianId === "auto-assign" ? "Auto Assign Beautician" : `${selectedBeautician?.name} (★ ${selectedBeautician?.rating.toFixed(1)})`}
              </p>
            </div>

            {/* Price details */}
            <div style={{ borderTop: "1px dashed #e4e4e7", paddingTop: "1rem", marginTop: "0.5rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", color: "#71717a" }}>
                <span>Service Charge</span>
                <span>₹{serviceCharge}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", color: "#71717a", marginTop: "0.375rem" }}>
                <span>Platform Fee</span>
                <span>₹{platformFee}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", color: "#71717a", marginTop: "0.375rem" }}>
                <span>GST (18%)</span>
                <span>₹{gst}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "1.05rem", fontWeight: 800, color: "#18181b", marginTop: "0.75rem", borderTop: "1px solid #e4e4e7", paddingTop: "0.75rem" }}>
                <span>Total Amount</span>
                <span>₹{totalAmount}</span>
              </div>
            </div>
          </div>
        )}

        {step === "payment" && (
          <div className="stack" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div className="vsh-card" style={{ background: "linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)", color: "white", padding: "1.25rem", borderRadius: "18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <p style={{ fontSize: "0.8rem", opacity: 0.85, margin: 0 }}>Total Amount to Pay</p>
                <p style={{ fontSize: "1.4rem", fontWeight: 800, margin: 0, marginTop: "0.125rem" }}>₹{totalAmount}</p>
              </div>
              <span style={{ fontSize: "2rem" }}>💄</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {(["upi", "card", "wallet", "cod"] as const).map((methodType) => {
                const label = methodType === "upi" ? "UPI (Paytm, GPay, PhonePe)" : methodType === "card" ? "Credit / Debit Card" : methodType === "wallet" ? "Wallets" : "Cash on Service";
                const detail = methodType === "upi" ? "Pay using any UPI app" : methodType === "card" ? "Visa, MasterCard, Rupay" : methodType === "wallet" ? "Pay from wallet" : "Pay after service completion";
                return (
                  <button
                    key={methodType}
                    type="button"
                    className={`card address-card ${paymentMethod === methodType ? "selected" : ""}`}
                    style={{ width: "100%", padding: "1rem", textAlign: "left", display: "flex", alignItems: "center", gap: "0.75rem", borderRadius: "14px", border: "1px solid #f1f0f5" }}
                    onClick={() => setPaymentMethod(methodType)}
                  >
                    <input type="radio" checked={paymentMethod === methodType} readOnly />
                    <div>
                      <p style={{ fontWeight: 700, margin: 0, fontSize: "0.9rem" }}>{label}</p>
                      <p style={{ fontSize: "0.75rem", color: "#666", margin: 0, marginTop: "0.125rem" }}>{detail}</p>
                    </div>
                  </button>
                );
              })}
            </div>
            {error && <div className="alert alert-error">{error}</div>}
          </div>
        )}
      </div>

      {/* Sticky Bottom Actions */}
      <div className="vsh-footer-actions">
        {step === "details" && (
          <Button onClick={() => setStep("address")} block style={{ borderRadius: "14px", height: "46px", fontWeight: 700 }}>
            Next
          </Button>
        )}
        {step === "address" && (
          <Button onClick={() => setStep("schedule")} block style={{ borderRadius: "14px", height: "46px", fontWeight: 700 }} disabled={!selectedAddressId}>
            Next
          </Button>
        )}
        {step === "schedule" && (
          <Button onClick={() => setStep("beautician")} block style={{ borderRadius: "14px", height: "46px", fontWeight: 700 }}>
            Next
          </Button>
        )}
        {step === "beautician" && (
          <Button onClick={() => setStep("summary")} block style={{ borderRadius: "14px", height: "46px", fontWeight: 700 }}>
            Next
          </Button>
        )}
        {step === "summary" && (
          <Button onClick={() => setStep("payment")} block style={{ borderRadius: "14px", height: "46px", fontWeight: 700 }}>
            Proceed to Payment
          </Button>
        )}
        {step === "payment" && (
          <Button onClick={handleSubmit} style={{ borderRadius: "14px", height: "46px", fontWeight: 700 }} loading={loading} disabled={!paymentMethod} block>
            Pay ₹{totalAmount}
          </Button>
        )}
      </div>
    </div>
  );
}
