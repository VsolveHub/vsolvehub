import type { Metadata } from "next";

import { EmployerStep } from "@/features/application/view/employer-step";

export const metadata: Metadata = { title: "Business details" };

/** The employer's "Business details" step ("I want to hire staff"). */
export default function EmployerPage() {
  return <EmployerStep />;
}
