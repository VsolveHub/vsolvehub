"use client";

import { useCallback, useState } from "react";

import { useReverseGeocode, type ResolvedLocation } from "./queries";

/**
 * Device fix → server-resolved address text.
 *
 * The browser answers with a coordinate; Django answers with the fields an
 * address is made of. Both halves are needed and both fail in ways a customer
 * has to be told apart, which is the whole reason this is a hook rather than two
 * lines inlined at each call site:
 *
 *   denied      — the permission prompt was refused. Retrying does nothing until
 *                 the customer changes a browser setting, so the copy says so.
 *   unavailable — the device has no fix. Moving near a window genuinely helps.
 *   timeout     — the fix took too long. Worth trying again.
 *   unsupported — no geolocation API at all, e.g. an insecure origin.
 *   lookup      — we got a coordinate but Django could not resolve it.
 *
 * Collapsing these into "could not get your location" is how someone sits in a
 * basement pressing a button that was never going to work.
 *
 * ## Privacy
 *
 * The coordinate is passed straight to the server and kept only in React state
 * for the life of the dialog. It is never stored, never logged, and never put in
 * a URL — the same rule the resolved address text lives under. See the note in
 * `queries.ts`.
 */

export type PinFailure =
  | "denied"
  | "unavailable"
  | "timeout"
  | "unsupported"
  | "lookup";

export const PIN_FAILURE_MESSAGE: Record<PinFailure, string> = {
  denied:
    "Location permission is off for this site. Turn it on in your browser settings, or type the address in yourself.",
  unavailable:
    "Your device could not get a location fix. Move near a window or try again in a moment.",
  timeout: "Finding your location took too long. Try again.",
  unsupported:
    "This browser cannot share a location. Type the address in yourself instead.",
  lookup:
    "We found your location but could not turn it into an address. Type it in yourself instead.",
};

function currentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("unsupported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      maximumAge: 30_000,
      timeout: 12_000,
    });
  });
}

function classify(error: unknown): PinFailure {
  if (error instanceof Error && error.message === "unsupported") return "unsupported";

  // `GeolocationPositionError` is not a constructor that can be relied on across
  // browsers, so the numeric codes are read structurally.
  if (typeof error === "object" && error !== null && "code" in error) {
    switch ((error as GeolocationPositionError).code) {
      case 1:
        return "denied";
      case 2:
        return "unavailable";
      case 3:
        return "timeout";
    }
  }
  return "unavailable";
}

export interface PinLocation {
  pin: () => Promise<ResolvedLocation | null>;
  isPinning: boolean;
  failure: PinFailure | null;
  failureMessage: string | null;
  reset: () => void;
}

export function usePinLocation(): PinLocation {
  const reverseGeocode = useReverseGeocode();
  const [failure, setFailure] = useState<PinFailure | null>(null);
  // Covers the permission prompt and the fix, which is the slow half and the
  // part the mutation's own `isPending` cannot see. Without it the button looks
  // idle for the ten seconds someone is deciding whether to allow the prompt.
  const [isLocating, setIsLocating] = useState(false);

  const pin = useCallback(async (): Promise<ResolvedLocation | null> => {
    setFailure(null);
    setIsLocating(true);

    let position: GeolocationPosition;
    try {
      position = await currentPosition();
    } catch (error) {
      setFailure(classify(error));
      return null;
    } finally {
      setIsLocating(false);
    }

    try {
      return await reverseGeocode.mutateAsync({
        // Six decimal places is roughly a tenth of a metre and matches the
        // contract's `^-?\d{0,3}(?:\.\d{0,6})?$`. Sending the raw float would be
        // rejected, and sending more precision than a doorway needs is data we
        // have no reason to hold.
        latitude: position.coords.latitude.toFixed(6),
        longitude: position.coords.longitude.toFixed(6),
      });
    } catch {
      // The thrown error is deliberately not surfaced or logged: it can carry
      // the coordinate in its request context.
      setFailure("lookup");
      return null;
    }
  }, [reverseGeocode]);

  return {
    pin,
    isPinning: isLocating || reverseGeocode.isPending,
    failure,
    failureMessage: failure ? PIN_FAILURE_MESSAGE[failure] : null,
    reset: () => setFailure(null),
  };
}
