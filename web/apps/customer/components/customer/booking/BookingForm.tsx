"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { formatPrice } from "@/lib/format";
import { FlaticonIcon } from "@/components/ui/FlaticonIcon";
import { LoadingState } from "@/components/ui/LoadingState";

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
  const [service, setService] = useState<Service | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddress, setSelectedAddress] = useState("");
  const [selectedSlot, setSelectedSlot] = useState("");
  const [showNewAddress, setShowNewAddress] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      const [catalogRes, addrRes] = await Promise.all([
        fetch("/api/catalog"),
        fetch("/api/profile/addresses"),
      ]);

      if (catalogRes.ok) {
        const { services } = await catalogRes.json();
        const found = services.find((s: Service) => s.id === serviceId);
        setService(found ?? null);
      }

      if (addrRes.ok) {
        const { addresses: list } = await addrRes.json();
        setAddresses(list);
        const defaultAddr = list.find((a: Address) => a.isDefault) ?? list[0];
        if (defaultAddr) setSelectedAddress(defaultAddr.id);
      } else {
        router.push(`/booking/otp?redirect=${encodeURIComponent(`/booking?serviceId=${serviceId}`)}`);
      }
    }
    load();
  }, [serviceId, router]);

  async function addAddress() {
    const res = await fetch("/api/profile/addresses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: newLabel, fullAddress: newAddress, isDefault: addresses.length === 0 }),
    });
    if (res.ok) {
      const { address } = await res.json();
      setAddresses((prev) => [...prev, address]);
      setSelectedAddress(address.id);
      setShowNewAddress(false);
      setNewLabel("");
      setNewAddress("");
    }
  }

  async function confirmBooking() {
    if (!selectedSlot || !selectedAddress) {
      setError("Please select a time slot and address");
      return;
    }
    setLoading(true);
    setError("");
    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serviceId, addressId: selectedAddress, slot: selectedSlot }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error?.fieldErrors ? "Please fill all required fields" : data.error ?? "Booking failed");
      setLoading(false);
      return;
    }
    router.push(`/booking/confirm?ref=${data.bookingRef}`);
  }

  if (!service) {
    return <LoadingState label="Loading service details…" variant="inline" />;
  }

  return (
    <div className="stack-lg">
      <div className="card">
        <div className="service-card-header">
          <span className="service-card-icon">
            <FlaticonIcon name={service.category.icon} size={28} color="var(--color-brand)" />
          </span>
          <div>
            <h2 className="card-title">{service.name}</h2>
            <p className="card-price">{formatPrice(service.pricePaise)}{service.unit === "day" ? "/day" : ""}</p>
          </div>
        </div>
      </div>

      <div className="card stack">
        <h2 className="section-title">Select time slot</h2>
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

      <div className="card stack">
        <div className="flex-between">
          <h2 className="section-title" style={{ margin: 0 }}>
            Delivery address
          </h2>
          <Button variant="secondary" size="sm" onClick={() => setShowNewAddress(!showNewAddress)}>
            {showNewAddress ? "Cancel" : "Add new"}
          </Button>
        </div>

        {addresses.map((addr) => (
          <button
            key={addr.id}
            type="button"
            className={`card address-card ${selectedAddress === addr.id ? "selected" : ""}`}
            onClick={() => setSelectedAddress(addr.id)}
          >
            <p className="address-label">
              {addr.label} {addr.isDefault && <span className="text-sm text-muted">(Default)</span>}
            </p>
            <p className="address-text">{addr.fullAddress}</p>
          </button>
        ))}

        {showNewAddress && (
          <div className="stack">
            <Input label="Label" placeholder="Home, Work…" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
            <Textarea label="Full address" placeholder="Street, area, city, pincode" value={newAddress} onChange={(e) => setNewAddress(e.target.value)} />
            <Button onClick={addAddress} disabled={!newLabel || newAddress.length < 10}>
              Save address
            </Button>
          </div>
        )}
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <Button onClick={confirmBooking} loading={loading} disabled={loading} block>
        Confirm booking
      </Button>
    </div>
  );
}
