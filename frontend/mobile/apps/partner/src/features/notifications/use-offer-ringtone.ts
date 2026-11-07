import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import { useCallback, useEffect, useState } from "react";
import { Platform, Vibration } from "react-native";

/** The same alert the push plays once, looped here while the offer is open. */
const RING_SOURCE = require("../../../assets/sounds/booking_alert.wav") as number;

/** Buzz 0.5 s, rest 0.4 s, repeating until cancelled. */
const BUZZ_PATTERN = [0, 500, 400];

/**
 * Whether an offer should be ringing: it is still pending and the server's clock says time is left.
 * The caller passes the server-clock seconds, so a wrong phone clock can never ring past the end.
 */
export function shouldRing(status: string, secondsRemaining: number): boolean {
  return status === "PENDING" && secondsRemaining > 0;
}

/**
 * Rings (sound and vibration, looped) while `active`, until it turns false or the screen goes.
 *
 * Owner decision, 5 November 2026: a job offer keeps ringing until the Partner answers it or its
 * time runs out. A push sound plays once; this is the in-app half. `silence()` stops the ring but
 * leaves the offer open.
 */
export function useOfferRingtone(active: boolean): { readonly silenced: boolean; readonly silence: () => void } {
  const [silenced, setSilenced] = useState(false);
  const ringing = active && !silenced;

  useEffect(() => {
    if (!ringing || Platform.OS === "web") return undefined;
    let player: AudioPlayer | null = null;
    let cancelled = false;

    void (async () => {
      try {
        await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false });
        if (cancelled) return;
        player = createAudioPlayer(RING_SOURCE);
        player.loop = true;
        player.play();
      } catch {
        // No sound is not worth failing the offer screen over; the vibration below still runs.
      }
    })();
    Vibration.vibrate(BUZZ_PATTERN, true);

    return () => {
      cancelled = true;
      Vibration.cancel();
      try {
        player?.pause();
        player?.remove();
      } catch {
        // The player may already be gone with the screen.
      }
    };
  }, [ringing]);

  const silence = useCallback(() => setSilenced(true), []);
  return { silenced, silence };
}
