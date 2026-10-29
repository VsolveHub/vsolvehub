"use client";

import { Suspense } from "react";

import { StaysOperationsWorkspace } from "@/features/moderation/stays-operations-workspace";

export default function OpsStaysPage() {
  // Suspense: the workspace keeps its tab in the URL (`?tab=`).
  return (
    <Suspense fallback={null}>
      <StaysOperationsWorkspace />
    </Suspense>
  );
}

