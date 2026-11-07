import type { Metadata } from "next";

import { ApplicationEditor } from "@/features/application/view/application-editor";
import { AreasStep } from "@/features/application/view/areas-step";
import { ListingStepGuard } from "@/features/application/view/listing-step-guard";

export const metadata: Metadata = { title: "Where you work" };

/**
 * The areas a services partner travels to. A step of its own: under the trades list it sat
 * below a long scroll and was missed. If a chosen job type is not open in a chosen area, the
 * server's refusal lands here, next to the choice it is about.
 */
export default function AreasPage() {
  return (
    <ListingStepGuard redirectTo="/apply/about">
      <ApplicationEditor title="apply.areas.pageTitle" description="apply.areas.pageDescription">
        <AreasStep />
      </ApplicationEditor>
    </ListingStepGuard>
  );
}
