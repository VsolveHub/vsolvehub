"use client";

import { useState } from "react";
import { describeError, useLogout } from "@vsolve/query";
import { Button, ErrorState, Dialog, Skeleton } from "@vsolve/ui";
import { useRouter } from "next/navigation";

import { useCustomerSession } from "@/features/session/queries";
import { ProfileMark, profileName } from "@/features/session/view/profile-mark";
import { getApiClient } from "@/lib/api/browser";

import { useCustomerProfile, useUpdateCustomerProfile } from "../queries";
import { PersonalDetailsForm } from "./personal-details-form";
import { Moment } from "./chrome";

export function ProfileOverview() {
  const session = useCustomerSession();
  const logout = useLogout(getApiClient());
  const router = useRouter();
  const name = profileName(session);
  const [isEditing, setIsEditing] = useState(false);

  return (
    <>
      <section
        aria-labelledby="profile-overview-heading"
        className="overflow-hidden rounded-[1.25rem] border border-[#e7e2da]/60 bg-white shadow-sm md:rounded-[1rem] md:border-line"
      >
        <div className="relative overflow-hidden bg-[#041227] p-6 sm:p-10">
          <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:20px_20px]" />
          <div className="relative z-10 flex flex-col items-center gap-4 text-center sm:flex-row sm:items-center sm:gap-6 sm:text-left">
            <ProfileMark
              identity={session}
              className="size-20 shrink-0 bg-white text-3xl text-navy-900 shadow-lg ring-0 sm:size-[5.5rem] sm:text-[2rem]"
            />
            <div className="min-w-0">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.15em] text-[#8EA2C6] sm:text-xs sm:font-medium">
                Personal profile
              </p>
              <h2
                id="profile-overview-heading"
                className="mb-1 text-xl font-bold leading-tight text-white sm:mb-2 sm:text-[2rem]"
              >
                {name ?? "Your details"}
              </h2>
              {session.dateJoined !== null ? (
                <p className="text-xs text-[#A9B9D1] sm:text-sm">
                  With V Solve Hub since <Moment value={session.dateJoined} dateOnly />
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <dl className="flex flex-col gap-3 p-4 sm:grid sm:grid-cols-2 sm:gap-0 sm:p-0">
          <ProfileField label="Display name" value={session.displayName} icon="person" />
          <ProfileField label="Full name" value={session.fullName} icon="badge" />
          <ProfileField label="Mobile number" value={session.phoneNumber} icon="phone" />
          <ProfileField label="Email" value={session.email} icon="mail" />
        </dl>

        <div className="flex flex-col gap-4 border-t border-line bg-[#FAF9F7] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-5">
          <div className="flex items-start gap-2 sm:items-center">
            <svg className="mt-0.5 size-[1.125rem] shrink-0 text-navy-900 sm:mt-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <p className="text-[0.8125rem] leading-relaxed text-text-secondary sm:text-[0.875rem]">
              Your mobile number is also your secure sign-in ID.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-line bg-white px-5 text-[0.875rem] font-semibold text-navy-900 hover:bg-surface-hover cursor-pointer sm:h-10 sm:w-auto sm:rounded-[0.5rem] sm:bg-transparent"
            >
              Edit profile
            </button>
            <Button
              variant="ghost"
              onClick={() =>
                logout.mutate(undefined, {
                  onSuccess: () => {
                    router.replace("/login");
                    router.refresh();
                  },
                })
              }
              loading={logout.isPending}
              loadingLabel="Signing out"
              className="h-11 w-full justify-center text-[#D32F2F] font-medium hover:bg-transparent sm:h-auto sm:w-auto sm:px-3"
            >
              Sign out
            </Button>
          </div>
        </div>

        {logout.isError ? (
          <div className="border-t border-line p-4">
            <ErrorState
              title="We could not sign you out"
              message={describeError(logout.error, "mutation").message}
              inline
            />
          </div>
        ) : null}
      </section>

      <Dialog
        open={isEditing}
        onOpenChange={setIsEditing}
        title="Edit profile"
        description="Update the details attached to your bookings."
      >
        {isEditing && <ProfileEditDialogBody onClose={() => setIsEditing(false)} />}
      </Dialog>
    </>
  );
}

function ProfileEditDialogBody({ onClose }: { onClose: () => void }) {
  const session = useCustomerSession();
  const profile = useCustomerProfile(session.isAuthenticated);
  const update = useUpdateCustomerProfile();

  if (profile.isPending) {
    return (
      <div className="flex flex-col gap-3 py-4" aria-busy="true">
        <span className="sr-only">Loading your personal details</span>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (profile.isError || profile.data === undefined) {
    return (
      <div className="py-4">
        <ErrorState
          title="We could not load your profile"
          message="Your details are still safe. Try loading them again."
          actionLabel="Try again"
          onAction={() => void profile.refetch()}
        />
      </div>
    );
  }

  return (
    <div className="py-2">
      <PersonalDetailsForm
        key={`${profile.data.full_name}:${profile.data.display_name}:${profile.data.email}`}
        profile={profile.data}
        onSave={(input) =>
          update.mutate(input, {
            onSuccess: () => {
              onClose();
            },
          })
        }
        isSaving={update.isPending}
        error={update.error}
      />
    </div>
  );
}

function ProfileField({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | null;
  icon: "person" | "badge" | "phone" | "mail";
}) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-[#e7e2da]/60 bg-[#FAF9F7] px-4 py-4 sm:min-h-[6.5rem] sm:gap-5 sm:rounded-none sm:border-0 sm:border-b sm:border-line sm:bg-transparent sm:px-6 sm:py-5 odd:sm:border-r">
      <ProfileGlyph kind={icon} />
      <div className="min-w-0">
        <dt className="mb-0.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-text-secondary sm:text-[0.75rem] sm:normal-case sm:tracking-normal sm:font-normal">
          {label}
        </dt>
        <dd className="break-words text-base font-bold text-navy-900 sm:text-[1.05rem]">
          {value ?? "Not added"}
        </dd>
      </div>
    </div>
  );
}

function ProfileGlyph({ kind }: { kind: "person" | "badge" | "phone" | "mail" }) {
  const path = {
    person: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0",
    badge: "M8 4h8l3 4-7 12L5 8l3-4Zm-3 4h14M9 4l3 4 3-4",
    phone:
      "M6 4h3l2 5-2 1.5a14 14 0 0 0 4.5 4.5L15 13l5 2v3a2 2 0 0 1-2 2C10.27 20 4 13.73 4 6a2 2 0 0 1 2-2Z",
    mail: "M3 6h18v12H3V6Zm0 1 9 7 9-7",
  }[kind];

  return (
    <span
      aria-hidden
      className="grid size-11 shrink-0 place-items-center rounded-full bg-[#FCEFDF] text-[#D85C3A]"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-5"
      >
        <path d={path} />
      </svg>
    </span>
  );
}
