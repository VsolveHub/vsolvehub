"use client";

import { FileDrop, StepActions, UploadForm } from "@/components/forms";
import { saveDocuments } from "../actions";

export function DocumentsStep() {
  return (
    <UploadForm action={saveDocuments} className="space-y-5">
      <FileDrop
        name="dlDoc"
        docType="DRIVING_LICENCE"
        label="Driving licence"
        required
        hint="Valid driving licence — JPG, PNG or PDF up to 5MB."
      />
      <StepActions submitLabel="Submit Application" requireTerms />
    </UploadForm>
  );
}
