"use client";

import { describeError } from "@vsolve/query";
import { Badge, EmptyState, ErrorState, Skeleton } from "@vsolve/ui";
import { useState } from "react";

import {
  useCommunicationPreferences,
  useSetCommunicationPreference,
  type CommunicationPreference,
  type PreferenceChannel,
} from "../queries";
import { AccountNote, Moment } from "./chrome";

/**
 * Which messages go to which channel.
 *
 * ## Why this renders the server's rows and invents none of its own
 *
 * `purpose` is a free `SlugField` on Django's side. There is no endpoint that
 * publishes the set of purposes a customer can control, and nothing seeds a row
 * when an account is created — `set_communication_preference` is an
 * `update_or_create` that only ever runs because somebody called `PUT`.
 *
 * The tempting fix is to hard-code a list here: "Booking updates", "Offers",
 * "Reminders", each with a slug this file made up. That would be worse than an
 * empty screen. A slug minted in the browser creates a row under a name the
 * sending code does not look for, so the customer would turn something off, see
 * it saved, and keep receiving it — a switch that lies. It also quietly moves
 * ownership of a consent taxonomy out of the backend and into a React component.
 *
 * So this screen shows exactly what Django holds, and says plainly when that is
 * nothing. Closing the gap is a backend change: publish the purposes, and seed
 * or default them.
 */

/**
 * Presentation for purposes we have seen, with a readable fallback.
 *
 * A lookup, not a source of truth: an unknown slug is rendered from the slug
 * itself rather than hidden, because a preference the customer holds and this
 * client does not recognise is still theirs to control.
 */
const PURPOSE_COPY: Record<string, { label: string; description: string }> = {
  "booking-updates": {
    label: "Booking updates",
    description: "Confirmations, technician assignment and arrival messages.",
  },
  "assisted-booking": {
    label: "Assisted booking",
    description: "Messages about bookings an agent makes with you on a call.",
  },
  marketing: {
    label: "Offers and promotions",
    description: "Discounts and new services. Never about a booking in progress.",
  },
  reminders: {
    label: "Reminders",
    description: "Nudges before a visit and when a service is due again.",
  },
};

function humanise(slug: string): string {
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((word, index) => (index === 0 ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}

const CHANNEL_LABEL: Record<PreferenceChannel, string> = {
  SMS: "SMS",
  EMAIL: "Email",
};

function PreferenceRow({
  preference,
  onToggle,
  isSaving,
  error,
}: {
  preference: CommunicationPreference;
  onToggle: (next: boolean) => void;
  isSaving: boolean;
  error: unknown;
}) {
  const copy = PURPOSE_COPY[preference.purpose];
  const label = copy?.label ?? humanise(preference.purpose);
  const isEnabled = preference.is_enabled ?? false;

  return (
    <li className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 border-b border-line py-4 last:border-b-0">
      <div className="min-w-0 max-w-prose">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-text">{label}</h3>
          <Badge tone="neutral">{CHANNEL_LABEL[preference.channel] ?? preference.channel}</Badge>
        </div>
        {copy ? (
          <p className="mt-0.5 text-sm text-text-secondary">{copy.description}</p>
        ) : null}
        <p className="mt-1 text-xs text-text-muted">
          Last changed <Moment value={preference.updated_at} />
        </p>
        {error ? (
          <p role="alert" className="mt-1.5 text-sm font-medium text-danger-text">
            {describeError(error, "mutation").message}
          </p>
        ) : null}
      </div>

      {/* A checkbox, styled as a switch, rather than a div with a role. The
          native control brings keyboard behaviour, form semantics and the
          platform's own focus ring, none of which get rebuilt correctly by
          hand. */}
      <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm">
        <span className="text-text-secondary">{isEnabled ? "On" : "Off"}</span>
        <input
          type="checkbox"
          checked={isEnabled}
          disabled={isSaving}
          onChange={(event) => onToggle(event.target.checked)}
          aria-label={`${label} by ${CHANNEL_LABEL[preference.channel] ?? preference.channel}`}
          className="h-6 w-6 cursor-pointer rounded-sm border border-line-strong accent-action disabled:cursor-wait"
        />
      </label>
    </li>
  );
}

export function CommunicationPreferences() {
  const preferencesQuery = useCommunicationPreferences();
  const setPreference = useSetCommunicationPreference();
  /**
   * Which row is in flight.
   *
   * The mutation is shared, so without this every switch on the screen would
   * show a pending state when one of them was pressed.
   */
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  function keyOf(preference: Pick<CommunicationPreference, "channel" | "purpose">) {
    return `${preference.channel}:${preference.purpose}`;
  }

  if (preferencesQuery.isPending) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (preferencesQuery.isError) {
    return (
      <ErrorState
        title="We could not load your message settings"
        message={describeError(preferencesQuery.error, "read").message}
        actionLabel="Try again"
        onAction={() => void preferencesQuery.refetch()}
        reference={describeError(preferencesQuery.error, "read").reference}
      />
    );
  }

  const preferences = preferencesQuery.data ?? [];

  if (preferences.length === 0) {
    return (
      <EmptyState
        title="No message settings yet"
        description="Nothing has been set for this account. Messages about a booking in progress — confirmation, who is coming, when they arrive — are part of the service and are always sent."
      />
    );
  }

  return (
    <div>
      <ul className="flex flex-col">
        {preferences.map((preference) => {
          const key = keyOf(preference);
          return (
            <PreferenceRow
              key={key}
              preference={preference}
              isSaving={pendingKey === key && setPreference.isPending}
              error={
                pendingKey === key && setPreference.isError ? setPreference.error : null
              }
              onToggle={(next) => {
                setPendingKey(key);
                // Not optimistic. The switch is a promise about what reaches
                // someone's phone, and showing "Off" before Django has stored it
                // turns a failed request into a promise we did not keep.
                setPreference.mutate({
                  channel: preference.channel,
                  purpose: preference.purpose,
                  isEnabled: next,
                });
              }}
            />
          );
        })}
      </ul>

      <div className="mt-5">
        <AccountNote>
          Messages about a booking in progress are part of the service and are
          always sent, whatever is set here.
        </AccountNote>
      </div>
    </div>
  );
}
