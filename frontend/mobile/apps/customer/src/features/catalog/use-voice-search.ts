// Voice search: turns speech into text for the home screen's service search.
// Uses expo-speech-recognition (Android/iOS native recognisers, Web Speech API on web).
// The native module is missing in Expo Go and older dev builds, so it is loaded lazily and
// the mic button reports "unavailable" there instead of crashing the screen.
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "react-native";

type SpeechModule = typeof import("expo-speech-recognition");

let speech: SpeechModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  speech = require("expo-speech-recognition") as SpeechModule;
  if (!speech.ExpoSpeechRecognitionModule) speech = null;
} catch {
  speech = null;
}

function isAvailable(): boolean {
  try {
    return !!speech && speech.ExpoSpeechRecognitionModule.isRecognitionAvailable();
  } catch {
    return false;
  }
}

interface Options {
  /** Live text while the user speaks. */
  onPartial: (text: string) => void;
  /** Called once with the final transcript. */
  onFinal: (text: string) => void;
  /** Called instead of listening when this build has no speech recogniser (e.g. Expo Go). */
  onUnavailable?: () => void;
}

export function useVoiceSearch({ onPartial, onFinal, onUnavailable }: Options) {
  const [listening, setListening] = useState(false);
  const handlers = useRef({ onPartial, onFinal });
  useEffect(() => {
    handlers.current = { onPartial, onFinal };
  }, [onPartial, onFinal]);
  const finalSent = useRef(false);
  const lastText = useRef("");

  useEffect(() => {
    if (!speech) return;
    const mod = speech.ExpoSpeechRecognitionModule;
    const subs = [
      mod.addListener("result", (event) => {
        const text = event.results[0]?.transcript?.trim() ?? "";
        if (!text) return;
        lastText.current = text;
        if (event.isFinal) {
          finalSent.current = true;
          handlers.current.onFinal(text);
        } else {
          handlers.current.onPartial(text);
        }
      }),
      mod.addListener("end", () => {
        setListening(false);
        // Some recognisers end without a final result; use the last partial.
        if (!finalSent.current && lastText.current) {
          finalSent.current = true;
          handlers.current.onFinal(lastText.current);
        }
      }),
      mod.addListener("error", (event) => {
        setListening(false);
        if (event.error === "no-speech" || event.error === "aborted" || event.error === "speech-timeout") return;
        if (event.error === "not-allowed") {
          Alert.alert("Microphone blocked", "Allow microphone access in your settings to search by voice.");
          return;
        }
        Alert.alert("Voice search", "We couldn't hear that. Please try again.");
      }),
    ];
    return () => {
      subs.forEach((sub) => sub.remove());
      try {
        mod.abort();
      } catch {
        // not running
      }
    };
  }, []);

  const start = useCallback(async () => {
    if (!speech || !isAvailable()) {
      if (onUnavailable) {
        onUnavailable();
        return;
      }
      Alert.alert("Voice search unavailable", "Speech recognition isn't supported on this device or browser.");
      return;
    }
    const mod = speech.ExpoSpeechRecognitionModule;
    const permission = await mod.requestPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Microphone permission needed", "Allow microphone access to search by voice.");
      return;
    }
    finalSent.current = false;
    lastText.current = "";
    setListening(true);
    try {
      mod.start({ lang: "en-IN", interimResults: true, continuous: false, maxAlternatives: 1 });
    } catch {
      setListening(false);
      Alert.alert("Voice search", "Couldn't start listening. Please try again.");
    }
  }, [onUnavailable]);

  const stop = useCallback(() => {
    try {
      speech?.ExpoSpeechRecognitionModule.stop();
    } catch {
      setListening(false);
    }
  }, []);

  const toggle = useCallback(() => (listening ? stop() : void start()), [listening, start, stop]);

  return { listening, toggle };
}
