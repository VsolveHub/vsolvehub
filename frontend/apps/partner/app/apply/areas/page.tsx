import type { Metadata } from "next";

import { ApplicationEditor } from "@/features/application/view/application-editor";
import { AreasStep } from "@/features/application/view/areas-step";

export const metadata: Metadata = { title: "Where you work" };

export default function AreasPage() {
  return (
    <ApplicationEditor
      title="Where you work"
      description="Pick the areas you are willing to travel to. You will only be offered jobs inside them."
    >
      <AreasStep />
    </ApplicationEditor>
  );
}
