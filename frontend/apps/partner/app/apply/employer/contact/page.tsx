import type { Metadata } from "next";

import { EmployerContactStep } from "@/features/application/view/employer-contact-step";

export const metadata: Metadata = { title: "You and your role" };

/** Who is posting the jobs for the business. */
export default function EmployerContactPage() {
  return <EmployerContactStep />;
}
