import { AreasStep } from "@/features/application/view/areas-step";
import { ApplicationEditor } from "@/features/application/view/application-editor";

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
