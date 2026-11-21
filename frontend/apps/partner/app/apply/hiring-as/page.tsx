import type { Metadata } from "next";

import { HiringAsStep } from "@/features/application/view/hiring-as-step";

export const metadata: Metadata = { title: "Who is hiring?" };

/** An employer says whether they hire for themselves or for a business. */
export default function HiringAsPage() {
  return <HiringAsStep />;
}
