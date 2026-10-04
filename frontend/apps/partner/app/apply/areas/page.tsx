import type { Metadata } from "next";

import { ListingStepGuard } from "@/features/application/view/listing-step-guard";
import { ApplicationEditor } from "@/features/application/view/application-editor";
import { AreasStep } from "@/features/application/view/areas-step";

export const metadata: Metadata = { title: "Where you work" };

export default function AreasPage() {
  return (
    <ListingStepGuard redirectTo="/apply/consent">
    <ApplicationEditor
      title="Where you work"
      description="Pick the areas you are willing to travel to. You will only be offered jobs inside them."
    >
      <AreasStep />
    </ApplicationEditor>
    </ListingStepGuard>
  );
}
