"use client";

import { Button, Card, ErrorState, Skeleton , formatDate} from "@vsolve/ui";
import { friendlyErrorMessage } from "@vsolve/query";
import Link from "next/link";

import { Pictogram, type PictogramName } from "@/components/pictogram";
import { useState, type ReactNode } from "react";

import { isNoProfileYet, usePartnerProfile, type PartnerProfile } from "../queries";
import { EditLocationDialog } from "./edit-location-dialog";
import { EditNameDialog } from "./edit-name-dialog";

/**
 * Who the Partner is.
 *
 * Built for someone who may not read comfortably. Every fact is an icon, a
 * short label and a value; nothing important is carried by a sentence alone,
 * and nothing here is a paragraph the reader has to parse to find out whether
 * they can work today.
 *
 * ## Approval is the headline, not a footnote
 *
 * Whether a Partner can be offered work is the single most consequential thing
 * on this screen, so it is a full-width band with a colour and an icon rather
 * than a line of text. A Partner should never have to infer their standing from
 * an empty offer list.
 *
 * ## What this screen does not do
 *
 * It does not edit. Skills and areas are set through the application and
 * reviewed by Operations, so an editable field here would either lie about what
 * a Partner can change or silently reopen a reviewed decision.
 */

const APPROVAL_COPY: Record<string, { title: string; body: string; tone: "good" | "wait" | "stop" }> =
  {
    APPROVED: {
      title: "You can take jobs",
      body: "Your account is approved. Go online to start getting offers.",
      tone: "good",
    },
    SUBMITTED: {
      title: "We are checking your details",
      body: "Nothing to do right now. We will tell you as soon as this is done.",
      tone: "wait",
    },
    UNDER_REVIEW: {
      title: "We are checking your details",
      body: "Nothing to do right now. We will tell you as soon as this is done.",
      tone: "wait",
    },
    CHANGES_REQUIRED: {
      title: "We need something from you",
      body: "Open your application to see what to fix. You cannot get jobs until this is done.",
      tone: "stop",
    },
    DRAFT: {
      title: "Your application is not finished",
      body: "Finish it to start getting jobs.",
      tone: "stop",
    },
    REJECTED: {
      title: "This account cannot take jobs",
      body: "Contact support if you think this is wrong.",
      tone: "stop",
    },
  };

const TONE_STYLES: Record<"good" | "wait" | "stop", string> = {
  good: "border-success-line bg-success-surface text-success-text",
  wait: "border-warning-line bg-warning-surface text-warning-text",
  stop: "border-critical-200 bg-critical-50 text-critical",
};

/**
 * The page container.
 *
 * `PartnerShell` deliberately provides no width and no `<main>` — "each page owns
 * that landmark" — so a screen that forgets one renders edge-to-edge across a
 * desktop viewport. `max-w-2xl` matches the signed-in home; this is a phone-first
 * app and a 1900px-wide profile row is unreadable.
 */
function Page({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6">
      <div className="flex flex-col gap-4">{children}</div>
    </main>
  );
}

export function ProfilePanel() {
  const profileQuery = usePartnerProfile();
  const [isEditingName, setIsEditingName] = useState(false);
  const [isEditingLocation, setIsEditingLocation] = useState(false);

  if (profileQuery.isPending) {
    return (
      <Page>
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </Page>
    );
  }

  if (profileQuery.isError) {
    return (
      <Page>
        {isNoProfileYet(profileQuery.error) ? (
          <ErrorState
            severity="warning"
            title="You do not have a Partner profile yet"
            message="Finish your application and we will set one up."
            actionLabel="Open my application"
            onAction={() => {
              window.location.href = "/apply";
            }}
          />
        ) : (
          <ErrorState
            title="We could not load your profile"
            message={friendlyErrorMessage(profileQuery.error)}
            actionLabel="Try again"
            onAction={() => void profileQuery.refetch()}
          />
        )}
      </Page>
    );
  }

  const profile = profileQuery.data;
  const approval = profile.approval_status;
  const status = approval === null ? null : (APPROVAL_COPY[approval] ?? null);

  return (
    <Page>
      {/*
        The same navy identity band `/me` opens with, so the hop between the two
        does not read as a hop between two different apps.

        `size="sm"` is gone from Edit: `@vsolve/ui`'s button compiles it to
        `h-9` — 36px, under the 44px tap floor this app sets everywhere else.
      */}
      <Card className="flex items-center gap-4 bg-[linear-gradient(160deg,var(--color-navy-700)_0%,var(--color-navy-900)_100%)] p-5">
        <span
          aria-hidden
          className="flex size-16 shrink-0 items-center justify-center rounded-[20px] bg-[linear-gradient(150deg,var(--color-navy-300)_0%,var(--color-navy-500)_100%)] text-2xl font-bold text-surface"
        >
          {initialOf(profile)}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold text-surface">{profile.display_name}</h1>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-navy-200">
            <Pictogram name="call" size="sm" className="shrink-0" />
            {profile.phone_number}
          </p>
        </div>
        <Button variant="outline" onClick={() => setIsEditingName(true)}>
          Edit
        </Button>
      </Card>

      {/* The number is deliberately not editable here. It is the login
          credential, so moving it moves who can sign in — that belongs behind an
          OTP challenge on the new number, not a field on a profile form. Saying
          so beats a disabled input with no explanation. */}
      <p className="-mt-1 px-1 text-xs text-text-secondary">
        To change your phone number, contact support — it is how you sign in, so we
        verify it before moving it.
      </p>

      <EditNameDialog
        open={isEditingName}
        currentName={profile.display_name}
        onClose={() => setIsEditingName(false)}
      />
      <EditLocationDialog
        open={isEditingLocation}
        currentLocation={profile.default_location_text ?? ""}
        onClose={() => setIsEditingLocation(false)}
      />

      {/* The most consequential fact on the screen, so it gets a band rather
          than a line: whether this person can be offered work at all. */}
      {status === null ? null : (
        <div className={`rounded-card border p-5 ${TONE_STYLES[status.tone]}`}>
          <p className="flex items-center gap-2 text-base font-bold">
            <Pictogram
              name={
                status.tone === "good" ? "warranty" : status.tone === "wait" ? "later" : "papers"
              }
              size="md"
              className="shrink-0"
            />
            {status.title}
          </p>
          <p className="mt-1 text-sm">{status.body}</p>
        </div>
      )}

      <Card className="p-5">
        <Fact icon="distance" label="Default pickup location">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <span>
              {profile.default_location_text?.trim()
                ? profile.default_location_text
                : <span className="text-text-secondary">Not set yet — used to prefill rental ads</span>}
            </span>
            <Button
              variant="outline"
              className="shrink-0 self-start"
              onClick={() => setIsEditingLocation(true)}
            >
              {profile.default_location_text?.trim() ? "Edit" : "Add"}
            </Button>
          </div>
        </Fact>

        <Fact icon="all-work" label="What you do">
          {profile.skills.length === 0 ? (
            <span className="text-text-secondary">Not set yet</span>
          ) : (
            <ChipList items={profile.skills} />
          )}
        </Fact>

        <Fact icon="distance" label="Where you work">
          {profile.service_areas.length === 0 ? (
            <span className="text-text-secondary">Not set yet</span>
          ) : (
            <ChipList items={profile.service_areas} />
          )}
        </Fact>

        <Fact icon="date" label="With us since">
          {formatDate(profile.member_since)}
          {profile.experience_years > 0 ? (
            <span className="block text-text-secondary">
              {profile.experience_years} {profile.experience_years === 1 ? "year" : "years"} of
              experience
            </span>
          ) : null}
        </Fact>

        <Fact icon="money" label="Getting paid">
          {profile.has_payout_account ? (
            <span className="flex items-center gap-1.5 font-medium text-success">
              <Pictogram name="done" size="sm" className="shrink-0" />
              Your bank account is ready
            </span>
          ) : (
            <span className="text-critical">
              No bank account yet — we cannot pay you until this is added.
            </span>
          )}
        </Fact>
      </Card>

      <Card className="p-5">
        <h2 className="text-base font-bold text-text">Manage</h2>
        <div className="mt-3 flex flex-col gap-2">
          <Link href="/work/all" className="w-full">
            <Button variant="outline" className="w-full justify-start">
              My bookings
            </Button>
          </Link>
          <Link href="/apply" className="w-full">
            <Button variant="outline" className="w-full justify-start">
              My application and documents
            </Button>
          </Link>
          <Link href="/money" className="w-full">
            <Button variant="outline" className="w-full justify-start">
              My money
            </Button>
          </Link>
        </div>
      </Card>
    </Page>
  );
}

function initialOf(profile: PartnerProfile): string {
  return profile.display_name.trim().charAt(0).toUpperCase() || "?";
}

function Fact({
  icon,
  label,
  children,
}: {
  icon: PictogramName;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-4 border-b border-line py-4 last:border-b-0 last:pb-0 first:pt-0">
      <Pictogram name={icon} size="md" className="mt-0.5 shrink-0 text-action-secondary" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-text">{label}</p>
        <div className="mt-1 text-sm text-text">{children}</div>
      </div>
    </div>
  );
}

/** Chips rather than a comma list: each item is its own object to scan. */
function ChipList({ items }: { items: readonly string[] }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((item) => (
        <li
          key={item}
          className="rounded-full border border-line bg-surface-sunken px-3 py-1 text-sm text-text"
        >
          {item}
        </li>
      ))}
    </ul>
  );
}
