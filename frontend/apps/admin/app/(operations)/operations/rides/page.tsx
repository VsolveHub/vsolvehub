"use client";

import { Suspense } from "react";

import { RidesWorkspace } from "@/features/rides/view/rides-workspace";

export default function OpsRidesPage() {
  // Suspense: the workspace keeps its tab in the URL (`?tab=`).
  return (
    <Suspense fallback={null}>
      <RidesWorkspace />
    </Suspense>
  );
}
