"use client";

import { describeError, useLogout } from "@vsolve/query";
import { Button, ErrorState, buttonStyles } from "@vsolve/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useCustomerSession } from "@/features/session/queries";
import { ProfileMark, profileName } from "@/features/session/view/profile-mark";
import { getApiClient } from "@/lib/api/browser";

import { Moment } from "./chrome";

export function ProfileOverview() {
  const session = useCustomerSession();
  const logout = useLogout(getApiClient());
  const router = useRouter();
  const name = profileName(session);

  return (
    <section
      aria-labelledby="profile-overview-heading"
      className="overflow-hidden rounded-card border border-line bg-surface shadow-card"
    >
      <div className="bg-navy-900 p-5 text-white sm:p-6">
        <div className="flex items-center gap-4">
          <ProfileMark
            identity={session}
            className="size-16 bg-white text-lg text-navy-900 ring-white/30"
          />
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase text-navy-200">Personal profile</p>
            <h2
              id="profile-overview-heading"
              className="mt-1 text-2xl font-extrabold leading-tight"
            >
              {name ?? "Your details"}
            </h2>
            {session.dateJoined !== null ? (
              <p className="mt-1 text-sm font-medium text-navy-100">
                With V Solve Hub since <Moment value={session.dateJoined} dateOnly />
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <dl className="grid sm:grid-cols-2">
        <ProfileField label="Display name" value={session.displayName} icon="person" />
        <ProfileField label="Full name" value={session.fullName} icon="badge" />
        <ProfileField label="Mobile number" value={session.phoneNumber} icon="phone" />
        <ProfileField label="Email" value={session.email} icon="mail" />
      </dl>

      <div className="flex flex-col gap-3 border-t border-line bg-canvas px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <p className="text-sm font-medium text-text-secondary">
          Your mobile number is also your secure sign-in ID.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href="/account/edit" className={buttonStyles({ variant: "outline" })}>
            Edit profile
          </Link>
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
    <div className="flex min-h-20 items-center gap-3 border-b border-line px-4 py-4 odd:sm:border-r sm:px-5">
      <ProfileGlyph kind={icon} />
      <div className="min-w-0">
        <dt className="text-xs font-semibold text-text-muted">{label}</dt>
        <dd className="mt-0.5 break-words text-sm font-extrabold text-text">
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
      className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-sunken text-action-active"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-4"
      >
        <path d={path} />
      </svg>
    </span>
  );
}
