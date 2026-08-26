"use client";

import { describeError } from "@vsolve/query";
import { Button, ErrorState, Spinner, cn } from "@vsolve/ui";
import { MapPin, Power } from "lucide-react";
import { useState } from "react";

import { useDuty } from "@/features/presence/duty-context";
import type { PresenceStatus } from "@/features/presence/model/presence";

import { Sheet } from "./sheet";

/**
 * Duty, made visible everywhere and changeable in two taps.
 *
 * ## The one control this app is organised around
 *
 * Off duty, a Partner receives nothing: no dispatch, no offers, no money. It is
 * the highest-consequence switch in the product and it used to be a card you
 * scrolled to on `/home`. `DutyPill` puts the *state* in the app bar on every
 * screen, and `DutySheet` puts the *control* one tap behind it — the same split
 * every driver-side app converges on, for the same reason: the state is checked
 * constantly and the control is used twice a day.
 *
 * ## The pill never overstates
 *
 * `PresenceStatus` has seven values and this renders all seven distinctly. Only
 * `online` gets the green fill and the sweeping beacon, because only `online`
 * means Django confirmed a session and acknowledged a recent heartbeat.
 * `stale` — a session exists but the beat is overdue — is amber and says
 * "Check signal", not "Online". That distinction is the entire reason
 * `model/presence.ts` exists, and a compact indicator is precisely where it
 * would be tempting to round it off to a green dot.
 */

const PILL: Record<PresenceStatus, { label: string; skin: string; dot: string; beacon: boolean }> = {
  online: {
    label: "On duty",
    skin: "border-success-line bg-success-surface text-success-text",
    dot: "bg-success-text",
    beacon: true,
  },
  connecting: {
    label: "Starting",
    skin: "border-line bg-surface-sunken text-text-secondary",
    dot: "bg-text-muted",
    beacon: false,
  },
  checking: {
    label: "Checking",
    skin: "border-line bg-surface-sunken text-text-secondary",
    dot: "bg-text-muted",
    beacon: false,
  },
  offline: {
    label: "Off duty",
    skin: "border-line-strong bg-surface text-text-secondary",
    dot: "bg-warm-400",
    beacon: false,
  },
  stale: {
    label: "Check signal",
    skin: "border-warning-line bg-warning-surface text-warning-text",
    dot: "bg-warning-text",
    beacon: false,
  },
  location_denied: {
    label: "Location off",
    skin: "border-danger-line bg-danger-surface text-danger-text",
    dot: "bg-danger-text",
    beacon: false,
  },
  unknown: {
    label: "Not sure",
    skin: "border-warning-line bg-warning-surface text-warning-text",
    dot: "bg-warning-text",
    beacon: false,
  },
};

/**
 * The app-bar indicator. Tapping it opens the sheet.
 *
 * Renders nothing outside `DutyProvider` — the marketing tree and `/login`
 * mount shared chrome without one, and a duty chip on a page with no session
 * would be asserting something about a person who is not signed in.
 */
export function DutyPill() {
  const duty = useDuty();
  const [open, setOpen] = useState(false);

  if (duty === null) return null;

  const skin = PILL[duty.status];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        /* The accessible name carries the full sentence, not just the chip
           text: "On duty" alone does not say what it controls, and this is the
           first interactive element in the app bar. */
        aria-label={`${duty.copy.label}. ${duty.copy.detail} Change your availability.`}
        className={cn(
          "pv-tap pv-press inline-flex h-9 items-center gap-2 rounded-pill border pr-3 pl-2.5",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
          skin.skin,
        )}
      >
        <span className={cn("relative grid h-2.5 w-2.5 place-items-center rounded-pill", skin.dot)}>
          {skin.beacon ? <span className="pv-beacon absolute inset-0 rounded-pill" /> : null}
        </span>
        <span className="text-caption font-extrabold">{skin.label}</span>
      </button>

      <DutySheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/**
 * The full control: where you are working, and the one big button.
 *
 * Everything `PresencePanel` used to render, minus the parts a sheet makes
 * unnecessary. The location-retention sentence stays — it is the disclosure
 * that makes the geolocation prompt legitimate, and burying it would be a
 * regression in something other than layout.
 */
export function DutySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const duty = useDuty();
  if (duty === null) return null;

  const goingOn = duty.hasSession;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={goingOn ? "You are working" : "Go on duty"}
      description={duty.copy.detail}
    >
      <div className="flex flex-col gap-4">
        <StatusRow duty={duty} />

        {duty.consentVersion === null && !goingOn ? (
          <p className="rounded-card border border-warning-line bg-warning-surface p-3.5 text-caption leading-relaxed text-warning-text">
            Accept the Partner agreements before going on duty — we record which
            version you agreed to alongside your location.
          </p>
        ) : null}

        {duty.areasFailed ? (
          <ErrorState
            inline
            title="We could not load your areas"
            message="You are not on duty. Check your connection and try again."
            actionLabel="Try again"
            onAction={duty.retryAreas}
          />
        ) : null}

        {/*
          Django refuses `presence/online` with a specific, actionable sentence
          — "Your required identity documents are not approved" is one a Partner
          can act on. Folding that into the status turned it into "Not sure",
          which is the copy for *doubt*: the server was not doubtful, it had
          decided and said why.
        */}
        {duty.goOnlineError ? <GoOnlineFailure error={duty.goOnlineError} /> : null}

        {!duty.isReady ? (
          <p className="flex items-center gap-2 py-2 text-body text-text-secondary">
            <Spinner size="sm" />
            Checking your last session…
          </p>
        ) : goingOn ? (
          <>
            {duty.activeAreaName === null ? null : (
              <div className="flex items-center gap-2.5 rounded-card border border-line bg-surface-sunken px-3.5 py-3">
                <MapPin size={18} className="shrink-0 text-text-muted" aria-hidden />
                <span className="text-body text-text-secondary">
                  Working in <span className="font-bold text-text">{duty.activeAreaName}</span>
                </span>
              </div>
            )}
            <Button
              variant="outline"
              block
              icon={<Power size={18} />}
              onClick={() => void duty.goOffline().then(onClose)}
              loading={duty.isGoingOffline}
              loadingLabel="Going off duty"
            >
              Go off duty
            </Button>
          </>
        ) : (
          <>
            <AreaPicker duty={duty} />
            <Button
              block
              onClick={() => void duty.goOnline()}
              disabled={!duty.canGoOnline}
              loading={duty.isGoingOnline}
              loadingLabel="Going on duty"
            >
              Go on duty
            </Button>
          </>
        )}

        <p className="text-caption leading-relaxed text-text-muted">
          While you are on duty we keep a coarse location so we can offer you
          nearby work. It stops the moment you go off duty.
        </p>
      </div>
    </Sheet>
  );
}

function StatusRow({ duty }: { duty: NonNullable<ReturnType<typeof useDuty>> }) {
  const skin = PILL[duty.status];

  return (
    <div className={cn("flex items-center gap-3 rounded-card border p-3.5", skin.skin)}>
      <span className={cn("relative grid h-3 w-3 shrink-0 place-items-center rounded-pill", skin.dot)}>
        {skin.beacon ? <span className="pv-beacon absolute inset-0 rounded-pill" /> : null}
      </span>
      <p role="status" className="text-body font-bold">
        {duty.copy.label}
      </p>
    </div>
  );
}

/**
 * The service area, as tap targets rather than a `<select>`.
 *
 * A native select on Android opens a full-screen list of tiny rows; these are
 * 52px targets that read at a glance and show the chosen one without opening
 * anything. Where a Partner has many areas the list scrolls inside the sheet,
 * which is the sheet's job.
 */
function AreaPicker({ duty }: { duty: NonNullable<ReturnType<typeof useDuty>> }) {
  if (duty.areasPending) {
    return (
      <div className="flex flex-col gap-2" aria-hidden>
        <span className="h-4 w-28 rounded-control pv-shimmer" />
        <span className="h-13 rounded-card pv-shimmer" />
        <span className="h-13 rounded-card pv-shimmer" />
      </div>
    );
  }

  if (duty.areas.length === 0) {
    return (
      <p className="rounded-card border border-line bg-surface-sunken p-3.5 text-caption text-text-secondary">
        No service areas are available for your account yet. Support can add one.
      </p>
    );
  }

  return (
    <fieldset className="flex flex-col gap-2 border-0 p-0">
      <legend className="pb-2 text-micro uppercase text-text-muted">Where are you working?</legend>
      {duty.areas.map((area) => {
        const selected = area.id === duty.areaId;
        return (
          <label
            key={area.id}
            className={cn(
              "pv-tap flex min-h-13 cursor-pointer items-center gap-3 rounded-card border px-3.5 py-2.5",
              "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus-ring",
              selected
                ? "border-selected bg-selected-surface"
                : "border-line bg-surface hover:bg-surface-hover",
            )}
          >
            <input
              type="radio"
              name="pv-duty-area"
              value={area.id}
              checked={selected}
              onChange={() => duty.setAreaId(area.id)}
              className="sr-only"
            />
            <span
              aria-hidden
              className={cn(
                "grid h-5 w-5 shrink-0 place-items-center rounded-pill border-2",
                selected ? "border-selected" : "border-line-strong",
              )}
            >
              {selected ? <span className="h-2.5 w-2.5 rounded-pill bg-selected" /> : null}
            </span>
            <span className="min-w-0 flex-1 truncate text-body font-semibold text-text">
              {area.name}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

/**
 * The server's own words about why going on duty was refused.
 *
 * `describeError` rather than hand-written copy: the interesting refusals here
 * are eligibility decisions only Django knows about — an unapproved document, a
 * suspended account, an area that stopped accepting Partners. Any message
 * written on this side would be a guess at which one. No retry button either:
 * every refusal this endpoint returns is `retryable: false`, and offering to
 * resend a request the server has already decided against just repeats it.
 */
function GoOnlineFailure({ error }: { error: unknown }) {
  // A non-financial write: duty changes availability, never money, so the
  // reassurance copy must not talk about charges.
  const failure = describeError(error, "mutation");

  return (
    <ErrorState
      inline
      title={failure.title}
      message={failure.message}
      severity={failure.severity}
      reference={failure.reference}
    />
  );
}
