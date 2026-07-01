"use client";

import { useActionState, useState } from "react";
import { Check } from "lucide-react";
import { FileDrop, StepActions } from "@/components/forms";
import { LocationCapture } from "@/components/onboarding/location-capture";
import { saveSkills, type StepState } from "../actions";

export function SkillsStep({
  tradeName,
  skills,
  selectedSkills,
  area,
  cityName,
  pincode,
  lat,
  lng,
}: {
  tradeName: string;
  skills: string[];
  selectedSkills: string[];
  area: string | null;
  cityName: string | null;
  pincode: string | null;
  lat: number | null;
  lng: number | null;
}) {
  const [state, action] = useActionState<StepState, FormData>(saveSkills, {});
  const [picked, setPicked] = useState<string[]>(selectedSkills);

  function toggle(skill: string) {
    setPicked((p) => (p.includes(skill) ? p.filter((s) => s !== skill) : [...p, skill]));
  }

  return (
    <form action={action} className="space-y-6">
      <div>
        <p className="text-sm font-medium text-ink-900">Your {tradeName} skills</p>
        <p className="mb-3 text-xs text-gray-500">
          Tap the services you can confidently handle.{" "}
          {picked.length > 0 ? `${picked.length} selected.` : "Pick at least one."}
        </p>
        <div className="flex flex-wrap gap-2">
          {skills.map((skill) => {
            const active = picked.includes(skill);
            return (
              <button
                key={skill}
                type="button"
                onClick={() => toggle(skill)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                  active
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-border bg-white text-gray-600 hover:border-brand-300"
                }`}
              >
                {active ? <Check className="h-3.5 w-3.5" /> : null}
                {skill}
              </button>
            );
          })}
        </div>
        {picked.map((s) => (
          <input key={s} type="hidden" name="skills" value={s} />
        ))}
      </div>

      <LocationCapture
        defaultArea={area}
        defaultCity={cityName}
        defaultPincode={pincode}
        defaultLat={lat}
        defaultLng={lng}
      />

      <FileDrop name="tradeCert" label="Trade certificate / proof of skill (optional)" hint="JPG, PNG or PDF up to 5MB" />

      {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}
      <StepActions submitLabel="Submit Application" requireTerms />
    </form>
  );
}
