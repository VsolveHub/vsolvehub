import { AboutStep } from "@/features/application/view/about-step";
import { ApplicationEditor } from "@/features/application/view/application-editor";
import { EmployerAboutRedirect } from "@/features/application/view/employer-guard";

export default function AboutPage() {
  return (
    <EmployerAboutRedirect>
      <ApplicationEditor
        title="Personal Information"
        description="Enter your basic profile details for your partner account."
      >
        <AboutStep />
      </ApplicationEditor>
    </EmployerAboutRedirect>
  );
}
