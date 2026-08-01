import type { Metadata } from "next";
import { IndianRupee } from "lucide-react";
import { PlaceholderPage } from "@/components/placeholder-page";

export const dynamic = "force-static";
export const metadata: Metadata = { title: "Pricing" };

export default function PricingPage() {
  return (
    <PlaceholderPage
      icon={IndianRupee}
      tone="green"
      title="Pricing"
      body="Transparent, partner-first pricing details are on the way. No middlemen, no hidden cuts."
    />
  );
}
