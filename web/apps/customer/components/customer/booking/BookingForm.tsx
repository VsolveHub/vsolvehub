"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { formatPrice } from "@/lib/format";
import { FlaticonIcon } from "@/components/ui/FlaticonIcon";
import { LoadingState } from "@/components/ui/LoadingState";
import {
  useCatalogQuery,
  useAddressesQuery,
  useAddAddressMutation,
  useCreateBookingMutation,
} from "@/lib/query/hooks";

type Address = {
  id: string;
  label: string;
  fullAddress: string;
  isDefault: boolean;
};

type Service = {
  id: string;
  name: string;
  pricePaise: number;
  unit?: string;
  category: { icon: string };
};

function generateSlots() {
  const slots: { label: string; value: string }[] = [];
  const now = new Date();
  for (let day = 0; day < 3; day++) {
    for (const hour of [9, 11, 14, 16, 18]) {
      const d = new Date(now);
      d.setDate(d.getDate() + day);
      d.setHours(hour, 0, 0, 0);
      if (d <= now) continue;
      slots.push({
        label: d.toLocaleString("en-IN", {
          weekday: "short",
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        }),
        value: d.toISOString(),
      });
    }
  }
  return slots.slice(0, 12);
}

type BookingFormProps = {
  serviceId: string;
};

export function BookingForm({ serviceId }: BookingFormProps) {
  const router = useRouter();
  const slots = useMemo(() => generateSlots(), []);

  const { data: catalogData, isLoading: catalogLoading } = useCatalogQuery();
  const { data: addressesData, isLoading: addressesLoading, isError: addressesError } = useAddressesQuery();

  const service = useMemo(() => {
    return catalogData?.services.find((s) => s.id === serviceId) || null;
  }, [catalogData, serviceId]);

  const addresses = addressesData?.addresses || [];

  const [selectedAddress, setSelectedAddress] = useState("");
  const [selectedSlot, setSelectedSlot] = useState("");
  const [showNewAddress, setShowNewAddress] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [error, setError] = useState("");
  const [formStep, setFormStep] = useState<1 | 2 | 3>(1);

  const addAddressMutation = useAddAddressMutation();
  const createBookingMutation = useCreateBookingMutation();

  const loading = createBookingMutation.isPending || addAddressMutation.isPending;

  useEffect(() => {
    if (addressesError) {
      router.push(`/booking/otp?redirect=${encodeURIComponent(`/booking?serviceId=${serviceId}`)}`);
    }
  }, [addressesError, serviceId, router]);

  useEffect(() => {
    if (addresses.length > 0 && !selectedAddress) {
      const defaultAddr = addresses.find((a: Address) => a.isDefault) ?? addresses[0];
      if (defaultAddr) setSelectedAddress(defaultAddr.id);
    }
  }, [addresses, selectedAddress]);

  function addAddress() {
    addAddressMutation.mutate({
      label: newLabel,
      fullAddress: newAddress,
      isDefault: addresses.length === 0,
    }, {
      onSuccess: (data) => {
        setSelectedAddress(data.address.id);
        setShowNewAddress(false);
        setNewLabel("");
        setNewAddress("");
      },
      onError: (err: any) => {
        setError(err.message || "Failed to add address");
      }
    });
  }

  function confirmBooking() {
    if (!selectedSlot || !selectedAddress) {
      setError("Please select a time slot and address");
      return;
    }
    setError("");
    createBookingMutation.mutate({
      serviceId,
      addressId: selectedAddress,
      slot: selectedSlot,
    }, {
      onSuccess: (data) => {
        router.push(`/booking/confirm?ref=${data.bookingRef}`);
      },
      onError: (err: any) => {
        setError(err.message || "Booking failed");
      }
    });
  }

  const selectedAddrObj = useMemo(() => addresses.find((a: Address) => a.id === selectedAddress), [addresses, selectedAddress]);
  const selectedSlotObj = useMemo(() => slots.find((s) => s.value === selectedSlot), [slots, selectedSlot]);

  if (catalogLoading || addressesLoading) {
    return <LoadingState label="Loading service details…" variant="inline" />;
  }

  if (!service) {
    return <div style={{ padding: "2rem", textAlign: "center" }}>Service not found.</div>;
  }

  // Cost calculation details
  const basePrice = service.pricePaise;
  const platformFee = 2000; // ₹20.00
  const gstTax = Math.round(basePrice * 0.18); // 18% GST
  const totalAmount = basePrice + platformFee + gstTax;

  return (
    <div className="booking-wizard">
      {/* Top Stepper Indicator */}
      <div className="wizard-stepper">
        <div className={`step-node ${formStep >= 1 ? "active" : ""}`}>
          <span className="step-num">{formStep > 1 ? "✓" : "1"}</span>
          <span className="step-label">Location</span>
        </div>
        <div className="step-divider" />
        <div className={`step-node ${formStep >= 2 ? "active" : ""}`}>
          <span className="step-num">{formStep > 2 ? "✓" : "2"}</span>
          <span className="step-label">Slot</span>
        </div>
        <div className="step-divider" />
        <div className={`step-node ${formStep === 3 ? "active" : ""}`}>
          <span className="step-num">3</span>
          <span className="step-label">Confirm</span>
        </div>
      </div>

      <div className="wizard-layout-grid">
        <div className="wizard-main-col">
          {/* STEP 1: Address selection */}
          {formStep === 1 && (
            <div className="flex flex-col gap-6">
              <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="service-card-header">
                  <span className="service-card-icon">
                    <FlaticonIcon name={service.category.icon} size={24} color="var(--color-brand)" />
                  </span>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-purple-600">Selected service</span>
                    <h2 className="mb-1 text-[15px] font-semibold text-gray-900 text-sm">{service.name}</h2>
                    <p className="card-price text-xs font-bold text-gray-800">{formatPrice(service.pricePaise)}{service.unit === "day" ? "/day" : ""}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm flex flex-col gap-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="mb-4 text-lg font-semibold text-gray-900 text-xs font-bold" style={{ margin: 0 }}>
                    Select delivery address
                  </h2>
                  <Button variant="secondary" size="sm" onClick={() => setShowNewAddress(!showNewAddress)}>
                    {showNewAddress ? "Cancel" : "Add new"}
                  </Button>
                </div>

                <div className="address-options-list">
                  {addresses.map((addr: Address) => (
                    <button
                      key={addr.id}
                      type="button"
                      className={`card address-card ${selectedAddress === addr.id ? "selected" : ""}`}
                      onClick={() => setSelectedAddress(addr.id)}
                    >
                      <p className="address-label font-bold text-xs">
                        {addr.label} {addr.isDefault && <span className="text-[10px] text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">(Default)</span>}
                      </p>
                      <p className="address-text text-[11px] text-gray-500 mt-1">{addr.fullAddress}</p>
                    </button>
                  ))}
                </div>

                {showNewAddress && (
                  <div className="flex flex-col gap-4 border-t border-gray-100 pt-3 mt-1">
                    <Input label="Address tag label" placeholder="e.g. Home, Office, Rent Room" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
                    <Textarea label="Full address details" placeholder="Flat number, building, landmark, area, city, pincode" value={newAddress} onChange={(e) => setNewAddress(e.target.value)} />
                    <Button onClick={addAddress} disabled={!newLabel || newAddress.length < 10}>
                      Save Address
                    </Button>
                  </div>
                )}
              </div>

              <Button
                disabled={!selectedAddress}
                onClick={() => setFormStep(2)}
                block
              >
                Continue to select slot →
              </Button>
            </div>
          )}

          {/* STEP 2: Slot Selection */}
          {formStep === 2 && (
            <div className="flex flex-col gap-6">
              <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm flex flex-col gap-4">
                <h2 className="mb-4 text-lg font-semibold text-gray-900 text-xs font-bold">Select time slot</h2>
                <div className="slot-grid">
                  {slots.map((slot) => (
                    <button
                      key={slot.value}
                      type="button"
                      className={`slot-option ${selectedSlot === slot.value ? "selected" : ""}`}
                      onClick={() => setSelectedSlot(slot.value)}
                    >
                      {slot.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="wizard-actions-row">
                <Button variant="secondary" onClick={() => setFormStep(1)}>
                  Back
                </Button>
                <Button
                  disabled={!selectedSlot}
                  onClick={() => setFormStep(3)}
                  style={{ flexGrow: 1 }}
                >
                  Review details →
                </Button>
              </div>
            </div>
          )}

          {/* STEP 3: Review & Summary */}
          {formStep === 3 && (
            <div className="flex flex-col gap-6">
              {/* Details Summary */}
              <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm flex flex-col gap-4 gap-sm">
                <h2 className="mb-4 text-lg font-semibold text-gray-900 text-xs font-bold m-0 border-b border-gray-100 pb-2">Booking details</h2>
                
                <div className="flex items-center justify-between py-1">
                  <span className="text-sm text-gray-500">Service</span>
                  <span className="text-sm font-semibold text-gray-900 font-bold">{service.name}</span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-sm text-gray-500">Time slot</span>
                  <span className="text-sm font-semibold text-gray-900 font-bold text-purple-700">{selectedSlotObj?.label}</span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-sm text-gray-500">Address</span>
                  <span className="text-sm font-semibold text-gray-900 text-gray-600">{selectedAddrObj?.fullAddress}</span>
                </div>
              </div>

              {/* Price breakdown card */}
              <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm flex flex-col gap-4 gap-sm bg-purple-50/40 border border-purple-100 md:hidden">
                <h2 className="mb-4 text-lg font-semibold text-gray-900 text-xs font-bold m-0 border-b border-purple-100/60 pb-2">Pricing breakdown</h2>
                
                <div className="flex items-center justify-between py-1 text-xs">
                  <span className="text-sm text-gray-500 text-gray-500">Service cost</span>
                  <span className="text-sm font-semibold text-gray-900">{formatPrice(basePrice)}</span>
                </div>
                <div className="flex items-center justify-between py-1 text-xs">
                  <span className="text-sm text-gray-500 text-gray-500">Platform fee</span>
                  <span className="text-sm font-semibold text-gray-900">{formatPrice(platformFee)}</span>
                </div>
                <div className="flex items-center justify-between py-1 text-xs">
                  <span className="text-sm text-gray-500 text-gray-500">GST &amp; Taxes (18%)</span>
                  <span className="text-sm font-semibold text-gray-900">{formatPrice(gstTax)}</span>
                </div>
                <div className="flex items-center justify-between py-1 border-t border-purple-100 pt-2 font-bold text-sm text-purple-950">
                  <span className="text-sm text-gray-500">Total payable</span>
                  <span className="text-sm font-semibold text-gray-900">{formatPrice(totalAmount)}</span>
                </div>
              </div>

              {error && <div className="rounded-xl px-4 py-3 text-sm bg-red-50 text-[var(--color-danger)]">{error}</div>}

              <div className="wizard-actions-row">
                <Button variant="secondary" onClick={() => setFormStep(2)} disabled={loading}>
                  Back
                </Button>
                <Button onClick={confirmBooking} loading={loading} disabled={loading} style={{ flexGrow: 1 }}>
                  Confirm booking
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Persistent Summary Sidebar for Desktop */}
        <aside className="wizard-sidebar-col">
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm flex flex-col gap-4 gap-sm sticky-sidebar-card">
            <h3 className="text-xs font-black uppercase tracking-wider text-purple-900 border-b border-gray-150 pb-2 m-0">
              Booking Summary
            </h3>
            
            <div className="flex items-center justify-between py-1">
              <span className="text-sm text-gray-500">Service</span>
              <span className="text-sm font-semibold text-gray-900 font-bold text-gray-900">{service.name}</span>
            </div>

            {selectedAddrObj && (
              <div className="flex items-center justify-between py-1">
                <span className="text-sm text-gray-500">Location</span>
                <span className="text-sm font-semibold text-gray-900 truncate text-gray-600">{selectedAddrObj.label}</span>
              </div>
            )}

            {selectedSlotObj && (
              <div className="flex items-center justify-between py-1">
                <span className="text-sm text-gray-500">Time slot</span>
                <span className="text-sm font-semibold text-gray-900 text-purple-700 font-bold">{selectedSlotObj.label}</span>
              </div>
            )}

            <div className="border-t border-dashed border-gray-200 pt-3 mt-1 flex flex-col gap-4 gap-xs">
              <div className="flex items-center justify-between gap-2 text-xs text-gray-500">
                <span>Base price</span>
                <span>{formatPrice(basePrice)}</span>
              </div>
              <div className="flex items-center justify-between gap-2 text-xs text-gray-500">
                <span>Platform fee</span>
                <span>{formatPrice(platformFee)}</span>
              </div>
              <div className="flex items-center justify-between gap-2 text-xs text-gray-500">
                <span>Taxes &amp; GST (18%)</span>
                <span>{formatPrice(gstTax)}</span>
              </div>
              <div className="flex items-center justify-between gap-2 font-extrabold text-sm text-purple-950 border-t border-gray-200 pt-2 mt-1">
                <span>Total amount</span>
                <span>{formatPrice(totalAmount)}</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
