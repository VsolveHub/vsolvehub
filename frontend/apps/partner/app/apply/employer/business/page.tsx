import type { Metadata } from "next";

import { EmployerBusinessStep } from "@/features/application/view/employer-business-step";

export const metadata: Metadata = { title: "Your business" };

/** Someone hiring for a business. */
export default function EmployerBusinessPage() {
  return <EmployerBusinessStep />;
}
