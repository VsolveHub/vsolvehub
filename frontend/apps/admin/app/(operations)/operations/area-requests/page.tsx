import type { Metadata } from "next";
import { Suspense } from "react";
import { AreaRequestsPage } from "@/features/area-requests/view/area-requests-page";

export const metadata: Metadata = { title: "Area Requests · Operations" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <AreaRequestsPage />
    </Suspense>
  );
}
