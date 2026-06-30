import type { Metadata } from "next";
import { BookOpen } from "lucide-react";
import { PlaceholderPage } from "@/components/placeholder-page";

export const dynamic = "force-static";
export const metadata: Metadata = { title: "Resources" };

export default function ResourcesPage() {
  return (
    <PlaceholderPage
      icon={BookOpen}
      tone="sky"
      title="Resources"
      body="Guides, success stories, and safety resources for V Solve Hub partners are coming soon."
    />
  );
}
