import { AboutStep } from "@/features/application/view/about-step";
import { ApplicationEditor } from "@/features/application/view/application-editor";

export default function AboutPage() {
  return (
    <ApplicationEditor
      title="Personal Information"
      description="Enter your basic profile details for your partner account."
    >
      <AboutStep />
    </ApplicationEditor>
  );
}
