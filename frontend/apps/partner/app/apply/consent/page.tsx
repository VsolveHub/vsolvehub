import type { Metadata } from "next";

import { ApplicationEditor } from "@/features/application/view/application-editor";
import { ConsentStep } from "@/features/application/view/consent-step";

export const metadata: Metadata = { title: "Agreements" };

export default function ConsentPage() {
  return (
    <ApplicationEditor
      title="Agreements"
      description="The terms you are agreeing to as a Partner. We record which version you accepted and when."
      saveLabel="Accept and continue"
    >
      {({ draft, update, isReadOnly }) => (
        <ConsentStep draft={draft} update={update} isReadOnly={isReadOnly} />
      )}
    </ApplicationEditor>
  );
}
