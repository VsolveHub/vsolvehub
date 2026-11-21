import type { Metadata } from "next";

import { AboutStep } from "@/features/application/view/about-step";
import { ApplicationEditor } from "@/features/application/view/application-editor";
import { EmployerAboutRedirect } from "@/features/application/view/employer-guard";

export const metadata: Metadata = { title: "Personal Information" };

export default function AboutPage() {
  return (
    <EmployerAboutRedirect>
      <ApplicationEditor
        title="apply.about.pageTitle"
        description="apply.about.pageDescription"
      >
        <AboutStep />
      </ApplicationEditor>
    </EmployerAboutRedirect>
  );
}
