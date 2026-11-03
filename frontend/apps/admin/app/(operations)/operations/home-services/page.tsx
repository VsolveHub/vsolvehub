"use client";

import { Suspense } from "react";

import { HomeServicesWorkspace } from "@/features/home-services/view/home-services-workspace";

export default function HomeServicesPage() {
  // Suspense: the workspace keeps its tab in the URL (`?tab=`).
  return (
    <Suspense fallback={null}>
      <HomeServicesWorkspace />
    </Suspense>
  );
}
