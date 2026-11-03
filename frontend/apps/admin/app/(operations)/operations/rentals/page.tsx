"use client";

import { Suspense } from "react";

import { RentalsOperationsWorkspace } from "@/features/moderation/rentals-operations-workspace";

export default function OpsRentalsPage() {
  // Suspense: the workspace keeps its tab in the URL (`?tab=`).
  return (
    <Suspense fallback={null}>
      <RentalsOperationsWorkspace />
    </Suspense>
  );
}

