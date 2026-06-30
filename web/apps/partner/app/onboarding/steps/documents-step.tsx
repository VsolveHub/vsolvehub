"use client";

import { useActionState } from "react";
import { FileDrop, StepActions } from "@/components/forms";
import { saveDocuments, type StepState } from "../actions";

export function DocumentsStep() {
  const [state, action] = useActionState<StepState, FormData>(saveDocuments, {});

  return (
    <form action={action} className="space-y-5">
      <FileDrop name="aadhaarDoc" label="Aadhaar card (front & back)" />
      <FileDrop name="dlDoc" label="Driving licence" />
      {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}
      <StepActions submitLabel="Submit Application" />
    </form>
  );
}
