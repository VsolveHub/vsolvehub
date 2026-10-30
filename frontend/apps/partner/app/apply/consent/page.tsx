import type { Metadata } from "next";

import { ApplicationEditor } from "@/features/application/view/application-editor";
import { ConsentStep } from "@/features/application/view/consent-step";

export const metadata: Metadata = { title: "Agreements" };

export default function ConsentPage() {
  return (
    <ApplicationEditor
      title="apply.consent.pageTitle"
      description="apply.consent.pageDescription"
      saveLabel="apply.consent.saveLabel"
    >
      <ConsentStep />
    </ApplicationEditor>
  );
}
