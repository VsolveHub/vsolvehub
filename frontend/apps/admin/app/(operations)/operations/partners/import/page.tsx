import { Metadata } from "next";
import { ImportView } from "@/features/partners/view/import-view";

export const metadata: Metadata = {
  title: "Import Partners",
};

export default function ImportPage() {
  return <ImportView />;
}
