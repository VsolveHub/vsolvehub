"use client";

import { ServiceBookingFlow, type FlowService } from "@/components/customer/booking/ServiceBookingFlow";

type Props = {
  categorySlug: string;
  categoryName: string;
  subCategoryName: string;
  subCategoryIcon: string;
  services: FlowService[];
};

export function SubcategoryServicesView({ categorySlug, categoryName, services }: Props) {
  // The unified, config-driven flow. Starts at the service-picker because a
  // sub-category (e.g. Electrician) lists several bookable services.
  return (
    <ServiceBookingFlow services={services} categorySlug={categorySlug} categoryName={categoryName} />
  );
}
