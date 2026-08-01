import type { Metadata } from "next";

import { DocumentsStep } from "@/features/application/view/documents-step";

export const metadata: Metadata = { title: "Documents" };

export default function DocumentsPage() {
  return <DocumentsStep />;
}
