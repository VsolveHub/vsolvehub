"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ElectricianBookingFlow } from "./ElectricianBookingFlow";
import { BeauticianBookingFlow } from "./BeauticianBookingFlow";
import { ConstructionBookingFlow } from "./ConstructionBookingFlow";
import { LoadingState } from "@/components/ui/LoadingState";
import type { BookingServiceInfo } from "@/lib/bookings/types";

type Address = {
  id: string;
  label: string;
  fullAddress: string;
  isDefault: boolean;
};

type Props = {
  serviceId: string;
};

export function BookingFlow({ serviceId }: Props) {
  const router = useRouter();
  const [service, setService] = useState<BookingServiceInfo | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [catalogRes, addrRes] = await Promise.all([
        fetch("/api/catalog"),
        fetch("/api/profile/addresses"),
      ]);

      if (catalogRes.ok) {
        const { services } = await catalogRes.json();
        const found = services.find((s: BookingServiceInfo) => s.id === serviceId);
        setService(found ?? null);
      }

      if (addrRes.ok) {
        const { addresses: list } = await addrRes.json();
        setAddresses(list);
      } else {
        router.push(`/booking/otp?redirect=${encodeURIComponent(`/booking?serviceId=${serviceId}`)}`);
      }
      setLoading(false);
    }
    load();
  }, [serviceId, router]);

  if (loading) {
    return <LoadingState label="Loading booking details…" variant="inline" />;
  }

  if (!service) {
    return <div className="alert alert-error">Service not found.</div>;
  }

  function handleAddressSaved(newAddr: Address) {
    setAddresses((prev) => [...prev, newAddr]);
  }

  // Route to the appropriate custom flow component based on the category slug
  const categorySlug = service.category.slug;

  if (categorySlug === "construction-services") {
    return (
      <ConstructionBookingFlow
        service={service}
        addresses={addresses}
        onAddressSaved={handleAddressSaved}
      />
    );
  }

  if (categorySlug === "beauty-wellness") {
    return (
      <BeauticianBookingFlow
        service={service}
        addresses={addresses}
        onAddressSaved={handleAddressSaved}
      />
    );
  }

  // Default flow (Electrician/Technician/etc. Archetype A)
  return (
    <ElectricianBookingFlow
      service={service}
      addresses={addresses}
      onAddressSaved={handleAddressSaved}
    />
  );
}
