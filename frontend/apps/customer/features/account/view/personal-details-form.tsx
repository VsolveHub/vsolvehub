"use client";

import { describeError } from "@vsolve/query";
import { Button, ErrorState, Field, Input } from "@vsolve/ui";
import { useState, type FormEvent } from "react";

import type { CustomerProfile, CustomerProfileUpdate } from "../queries";

interface PersonalDetailsFormProps {
  profile: CustomerProfile;
  onSave: (update: CustomerProfileUpdate) => void;
  isSaving: boolean;
  error: unknown;
}

export function PersonalDetailsForm({
  profile,
  onSave,
  isSaving,
  error,
}: PersonalDetailsFormProps) {
  const [fullName, setFullName] = useState(profile.full_name);
  const [displayName, setDisplayName] = useState(profile.display_name);
  const [email, setEmail] = useState(profile.email);
  const [nameError, setNameError] = useState<string | undefined>();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanName = fullName.trim().replace(/\s+/g, " ");
    if (cleanName.length < 2) {
      setNameError("Enter the name you want printed on your receipts.");
      return;
    }
    setNameError(undefined);
    onSave({
      full_name: cleanName,
      display_name: displayName.trim().replace(/\s+/g, " "),
      email: email.trim(),
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Full name"
          description="Printed on bookings and receipts."
          required
          error={nameError}
          className="sm:col-span-2"
        >
          <Input
            value={fullName}
            autoComplete="name"
            maxLength={150}
            autoFocus
            onChange={(event) => setFullName(event.target.value)}
          />
        </Field>
        <Field label="Preferred name" description="Used when we address you in V Solve Hub.">
          <Input
            value={displayName}
            autoComplete="nickname"
            maxLength={100}
            onChange={(event) => setDisplayName(event.target.value)}
          />
        </Field>
        <Field label="Email" description="For receipts and important booking updates.">
          <Input
            type="email"
            value={email}
            autoComplete="email"
            maxLength={254}
            inputMode="email"
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>
      </div>

      <div className="mt-5 flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-medium text-text-secondary">
          {profile.phone_number} remains your verified sign-in number.
        </p>
        <Button type="submit" loading={isSaving} loadingLabel="Saving your profile">
          Save profile
        </Button>
      </div>

      {error !== null && error !== undefined ? (
        <div className="mt-4">
          <ErrorState
            title="We could not save your profile"
            message={describeError(error, "mutation").message}
            inline
          />
        </div>
      ) : null}
    </form>
  );
}
