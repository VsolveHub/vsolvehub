"use client";

import { useQuery } from "@tanstack/react-query";
import { request } from "@vsolve/api-client";
import { Field, Input, Textarea } from "@vsolve/ui";
import { useEffect } from "react";

import { getApiClient } from "@/lib/api/browser";

import { useApplicationEditor, useProceedDisabled } from "./application-editor";

export function AboutStep() {
  const { draft, update, isReadOnly, application } = useApplicationEditor();
  const isStayHost = application?.track === "STAY_HOST";

  // The name given at sign-up. Offered as the starting value so nobody types it twice.
  const profile = useQuery({
    queryKey: ["auth", "profile"],
    queryFn: () => request(() => getApiClient().GET("/api/v1/auth/profile/")),
    staleTime: 5 * 60 * 1000,
  });
  const signUpName = (profile.data?.full_name ?? "").trim();
  useEffect(() => {
    if (!isReadOnly && signUpName && !draft.displayName.trim()) {
      update({ displayName: signUpName });
    }
    // Only when the sign-up name arrives; never overwrite what the partner typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signUpName]);

  const isNameInvalid =
    draft.displayName.trim().length > 0 && draft.displayName.trim().length < 2;
  // Years of experience is for people who travel to do work; a host lists a property.
  const isExperienceMissing = !isStayHost && draft.experienceYears <= 0;

  useProceedDisabled(draft.displayName.trim().length < 2 || isExperienceMissing);

  return (
    <div className="flex flex-col gap-5">
      {/* Two-column on desktop for short fields */}
      <div className="grid gap-5 sm:grid-cols-2">
        {/* Full Name */}
        <Field
          required
          label="Full Name"
          error={isNameInvalid ? "Enter at least 2 characters." : undefined}
        >
          <Input
            name="display_name"
            autoComplete="name"
            maxLength={120}
            placeholder="e.g. Ramesh Kumar"
            value={draft.displayName}
            disabled={isReadOnly}
            onChange={(event) => update({ displayName: event.target.value })}
          />
        </Field>

        {isStayHost ? null : (
          <Field required label="Years of Experience">
            <Input
              name="experience_years"
              type="number"
              inputMode="numeric"
              min={1}
              max={80}
              placeholder="e.g. 5"
              value={draft.experienceYears === 0 ? "" : String(draft.experienceYears)}
              disabled={isReadOnly}
              onChange={(event) => {
                const parsed = Number.parseInt(event.target.value, 10);
                update({
                  experienceYears: Number.isNaN(parsed) ? 0 : Math.min(80, Math.max(0, parsed)),
                });
              }}
            />
          </Field>
        )}
      </div>

      {/* Bio / About Your Work */}
      <Field label={isStayHost ? "About you (optional)" : "About Your Work (Bio)"}>
        <Textarea
          name="biography"
          maxLength={2000}
          rows={4}
          placeholder={
            isStayHost
              ? "A line guests will see, e.g. Running this PG for working women since 2018."
              : "Briefly describe your skills, specialities, or certifications (e.g. Certified electrician specializing in home wiring and switchboard repair)."
          }
          value={draft.biography}
          disabled={isReadOnly}
          onChange={(event) => update({ biography: event.target.value })}
        />
        <div className="flex justify-end text-[11px] text-text-muted mt-1">
          <span>{draft.biography.length} / 2000</span>
        </div>
      </Field>
    </div>
  );
}
