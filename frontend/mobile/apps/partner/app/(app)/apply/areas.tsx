import { AreasStep } from "@/features/application/view/areas-step";
import { ApplicationEditor } from "@/features/application/view/application-editor";

export default function AreasPage() {
  return (
    <ApplicationEditor
      title="Where you work"
      description="Pick the areas you can travel to. You will only get jobs inside them."
    >
      <AreasStep />
    </ApplicationEditor>
  );
}
