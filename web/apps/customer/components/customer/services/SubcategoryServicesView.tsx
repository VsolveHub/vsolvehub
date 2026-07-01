"use client";

import { ElectricianBookingFlow } from "@/components/customer/booking/ElectricianBookingFlow";
import type { BookingServiceInfo } from "@/lib/bookings/types";

type Props = {
  categorySlug: string;
  categoryName: string;
  subCategoryName: string;
  subCategoryIcon: string;
  services: any[];
};

export function SubcategoryServicesView({
  categorySlug,
  categoryName,
  subCategoryName,
  subCategoryIcon,
  services,
}: Props) {
  // Directly render the unified booking component starting at the select-service step
  return (
    <ElectricianBookingFlow
      initialStep="select-service"
      services={services}
      categorySlug={categorySlug}
      categoryName={categoryName}
      subCategoryName={subCategoryName}
    />
  );
}
