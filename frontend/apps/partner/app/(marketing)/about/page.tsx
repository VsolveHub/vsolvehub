import type { Metadata } from "next";
import { Building2 } from "lucide-react";
import { PlaceholderPage } from "@/components/placeholder-page";

export const dynamic = "force-static";
export const metadata: Metadata = { title: "About" };

export default function AboutPage() {
  return (
    <PlaceholderPage
      icon={Building2}
      tone="violet"
      title="About V Solve Hub"
      body="Empowering local service providers across India with modern tools and massive customer reach."
    />
  );
}
