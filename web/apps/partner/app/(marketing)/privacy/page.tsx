import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { PlaceholderPage } from "@/components/placeholder-page";

export const dynamic = "force-static";
export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <PlaceholderPage
      icon={ShieldCheck}
      tone="brand"
      title="Privacy Policy"
      body="Our full privacy policy is being finalized. Your data is encrypted and never sold."
    />
  );
}
