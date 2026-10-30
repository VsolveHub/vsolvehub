import type { Metadata } from "next";
import { Suspense } from "react";

import { VisitLookup } from "@/features/visits/view/visit-lookup";

export const metadata: Metadata = {
  title: "Visit lookup",
  robots: { index: false, follow: false },
};

export default function VisitsPage() {
  return (
    <Suspense fallback={null}>
      <VisitLookup />
    </Suspense>
  );
}
