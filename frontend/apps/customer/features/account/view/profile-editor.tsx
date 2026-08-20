"use client";

import { ErrorState, Skeleton } from "@vsolve/ui";

import { useCustomerSession } from "@/features/session/queries";

import { useCustomerProfile, useUpdateCustomerProfile } from "../queries";
import { PersonalDetailsForm } from "./personal-details-form";

export function ProfileEditor() {
  const session = useCustomerSession();
  const profile = useCustomerProfile(session.isAuthenticated);
  const update = useUpdateCustomerProfile();

  if (profile.isPending) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        <span className="sr-only">Loading your personal details</span>
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (profile.isError || profile.data === undefined) {
    return (
      <ErrorState
        title="We could not load your profile"
        message="Your details are still safe. Try loading them again."
        actionLabel="Try again"
        onAction={() => void profile.refetch()}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <section aria-labelledby="name-usage-heading" className="bg-navy-900 px-5 py-5 text-white sm:px-6">
        <p className="text-xs font-bold uppercase text-navy-200">Your identity</p>
        <h2 id="name-usage-heading" className="mt-1 text-xl font-extrabold">
          One name, carried through the job
        </h2>
        <div className="mt-4 grid grid-cols-3 gap-2" aria-label="Where your name is used">
          {[
            ["brief", "Bookings"],
            ["receipt", "Receipts"],
            ["support", "Support"],
          ].map(([icon, label]) => (
            <div key={label} className="flex min-h-16 flex-col items-center justify-center border-t border-navy-600 px-1 pt-3 text-center">
              <ProfileUseIcon kind={icon} />
              <span className="mt-1 text-xs font-bold text-navy-100">{label}</span>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="edit-details-heading" className="rounded-card border border-line bg-surface p-5 shadow-card sm:p-6">
        <h2 id="edit-details-heading" className="text-lg font-extrabold text-text">
          Personal details
        </h2>
        <p className="mt-1 text-sm text-text-secondary">
          Keep the details attached to your bookings accurate.
        </p>
        <div className="mt-5">
          <PersonalDetailsForm
            key={`${profile.data.full_name}:${profile.data.display_name}:${profile.data.email}`}
            profile={profile.data}
            onSave={(input) => update.mutate(input)}
            isSaving={update.isPending}
            error={update.error}
          />
        </div>
      </section>
    </div>
  );
}

function ProfileUseIcon({ kind }: { kind: string }) {
  const path =
    kind === "receipt"
      ? "M7 3h10v18l-2-1-3 1-3-1-2 1V3Zm3 6h4m-4 4h4"
      : kind === "support"
        ? "M5 13a7 7 0 0 1 14 0v5h-3v-5m-8 5H5v-5m3 6c1 2 5 2 7 0"
        : "M6 7h12v13H6V7Zm3 0V5h6v2m-6 5h6";
  return (
    <svg viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="size-5 text-action">
      <path d={path} />
    </svg>
  );
}
