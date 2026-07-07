"use client";

import { useQuery } from "@tanstack/react-query";
import { ServiceBookingFlow } from "./ServiceBookingFlow";
import { LoadingState } from "@/components/ui/LoadingState";
import { api } from "@/lib/query/api";
import { qk } from "@/lib/query/keys";

type Props = {
  serviceId: string;
};

/**
 * Entry point for /booking?serviceId=… — resolves the service from the cached
 * catalog, then renders the unified, config-driven ServiceBookingFlow. Crew
 * (construction) bookings use their own dedicated flow and never route here.
 */
export function BookingFlow({ serviceId }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: qk.catalog(),
    queryFn: api.catalog,
    staleTime: 5 * 60_000,
  });

  const service = data?.services?.find((s) => s.id === serviceId) ?? null;

  if (isLoading) {
    return <LoadingState label="Loading booking details…" variant="inline" />;
  }
  if (!service) {
    return <div className="alert alert-error">Service not found.</div>;
  }

  return (
    <ServiceBookingFlow
      services={[service]}
      categorySlug={service.category.slug}
      categoryName={service.category.name}
      initialServiceId={service.id}
    />
  );
}
