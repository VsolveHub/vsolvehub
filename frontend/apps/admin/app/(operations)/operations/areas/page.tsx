import type { Metadata } from "next";
import { Suspense } from "react";
import { AreasPage } from "@/features/areas/view/areas-page";

export const metadata: Metadata = { title: "Service Areas · Operations" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <AreasPage />
    </Suspense>
  );
}
