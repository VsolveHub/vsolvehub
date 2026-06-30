import { Suspense } from "react";
import { LoadingState } from "@/components/ui/LoadingState";
import { PropertyListingView } from "@/components/customer/accommodation/PropertyListingView";

export default function AccommodationPage() {
  return (
    <div className="page-content">
      <h1 className="page-title">Find your stay</h1>
      <p className="page-subtitle">Rooms, PG, hostels, apartments and more in Hyderabad.</p>
      <Suspense fallback={<LoadingState label="Loading accommodation…" />}>
        <PropertyListingView />
      </Suspense>
    </div>
  );
}
