import type { Metadata } from "next";

import { AboutStep } from "@/features/application/view/about-step";
import { ApplicationEditor } from "@/features/application/view/application-editor";

export const metadata: Metadata = { title: "About you" };

export default function AboutPage() {
  return (
    <ApplicationEditor
      title="About you"
      description="This is what a customer sees before they let you into their home."
    >
      <AboutStep />
    </ApplicationEditor>
  );
}
