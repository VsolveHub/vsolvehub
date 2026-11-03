import { ApplicationEditor } from "@/features/application/view/application-editor";
import { ConsentStep } from "@/features/application/view/consent-step";

export default function ConsentPage() {
  return (
    <ApplicationEditor saveLabel="Continue">
      <ConsentStep />
    </ApplicationEditor>
  );
}
