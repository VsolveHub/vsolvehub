import { Suspense } from "react";
import { LoadingState } from "@/components/ui/LoadingState";
import { PropertyListingView } from "@/components/customer/accommodation/PropertyListingView";

export default function AccommodationPage() {
  return (
    <div className="mx-auto w-full max-w-[1280px] p-4">
      <h1 className="text-2xl font-bold tracking-tight text-gray-900">Find your stay</h1>
      <p className="mt-1 mb-5 text-[15px] text-gray-500">Rooms, PG, hostels, apartments and more in Hyderabad.</p>
      <Suspense fallback={<LoadingState label="Loading accommodation…" />}>
        <PropertyListingView />
      </Suspense>
    </div>
  );
}
