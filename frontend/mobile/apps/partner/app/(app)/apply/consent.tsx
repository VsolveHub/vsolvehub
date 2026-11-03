import { ApplicationEditor } from "@/features/application/view/application-editor";
import { ConsentStep } from "@/features/application/view/consent-step";

export default function ConsentPage() {
  return (
    <ApplicationEditor
      title="Agreements"
      description="The terms you are agreeing to as a Partner. We record which version you accepted and when."
      saveLabel="Accept and continue"
    >
      <ConsentStep />
    </ApplicationEditor>
  );
}
