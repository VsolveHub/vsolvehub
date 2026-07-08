"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Field, SelectField, FileDrop, StepActions, UploadForm } from "@/components/forms";
import { saveIdentity } from "../actions";

export function IdentityStep({
  fullName,
  gender,
}: {
  fullName: string | null;
  gender: string | null;
}) {
  const [note, setNote] = useState(false);

  return (
    <UploadForm action={saveIdentity} className="space-y-5">
      <Field
        label="Full Name"
        name="fullName"
        required
        defaultValue={fullName ?? ""}
        placeholder="Enter your full name as per ID"
        hint="Must match your official documents."
      />

      <SelectField
        label="Gender"
        name="gender"
        required
        defaultValue={gender ?? ""}
        options={[
          { value: "FEMALE", label: "Female" },
          { value: "MALE", label: "Male" },
          { value: "OTHER", label: "Other" },
        ]}
      />

      <div className="flex flex-col items-start justify-between gap-3 rounded-xl border border-border bg-surface-muted p-4 sm:flex-row sm:items-center">
        <div>
          <p className="font-semibold text-ink-900">Instant Verification</p>
          <p className="text-sm text-gray-500">Speed up onboarding securely via DigiLocker.</p>
          {note ? (
            <p className="mt-1 text-xs text-amber-700">DigiLocker integration is coming soon — continue manually below.</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setNote(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-accent-500 px-4 py-2.5 text-sm font-semibold text-ink-900 hover:bg-accent-600"
        >
          <ShieldCheck className="h-4 w-4" /> Verify with DigiLocker
        </button>
      </div>

      <Field
        label="Aadhaar Number (optional)"
        name="aadhaar"
        inputMode="numeric"
        maxLength={14}
        placeholder="1234 5678 9012"
        hint="12 digits. Optional — encrypted at rest, only the last 4 are ever shown. You can add it later."
      />

      <FileDrop
        name="profilePhoto"
        docType="SELFIE"
        label="Profile Photo"
        required
        accept="image/png,image/jpeg"
        hint="A clear face photo — JPG or PNG up to 5MB."
      />

      <StepActions />
    </UploadForm>
  );
}
