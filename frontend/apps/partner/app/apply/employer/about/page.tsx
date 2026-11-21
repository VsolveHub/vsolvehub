import type { Metadata } from "next";

import { EmployerAboutStep } from "@/features/application/view/employer-about-step";

export const metadata: Metadata = { title: "Your details" };

/** Someone hiring for themselves or their home. */
export default function EmployerAboutPage() {
  return <EmployerAboutStep />;
}
