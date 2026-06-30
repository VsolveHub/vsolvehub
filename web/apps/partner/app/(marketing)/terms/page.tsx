import type { Metadata } from "next";
import { FileText } from "lucide-react";
import { PlaceholderPage } from "@/components/placeholder-page";

export const dynamic = "force-static";
export const metadata: Metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <PlaceholderPage
      icon={FileText}
      tone="slate"
      title="Terms of Service"
      body="Our full terms of service are being finalized and will be available here soon."
    />
  );
}
