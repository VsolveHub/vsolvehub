import type { Metadata } from "next";
import { Suspense } from "react";
import { CoveragePage } from "@/features/coverage/view/coverage-page";

export const metadata: Metadata = { title: "Coverage · Operations" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <CoveragePage />
    </Suspense>
  );
}
