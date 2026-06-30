import type { Metadata } from "next";
import { Mail } from "lucide-react";
import { PlaceholderPage } from "@/components/placeholder-page";

export const dynamic = "force-static";
export const metadata: Metadata = { title: "Contact" };

export default function ContactPage() {
  return (
    <PlaceholderPage
      icon={Mail}
      tone="amber"
      title="Contact us"
      body="Sales and partner support contact options are coming soon. We'd love to hear from you."
    />
  );
}
