"use client";

import { Suspense } from "react";

import { WorkforceWorkspace } from "@/features/workforce/view/workforce-workspace";

/** Crew & projects. Kept at `/operations/requests` so request pages and old links still land here. */
export default function RequestsPage() {
  return (
    <Suspense fallback={null}>
      <WorkforceWorkspace />
    </Suspense>
  );
}
