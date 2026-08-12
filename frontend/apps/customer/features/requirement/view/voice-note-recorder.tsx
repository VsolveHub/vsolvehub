"use client";

import { Button, Field, Select } from "@vsolve/ui";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  DEFAULT_LANGUAGE_TAG,
  REQUIREMENT_LANGUAGES,
  matchKnownLanguage,
} from "../model/language";
import { ACCEPTED_MEDIA_TYPES, normalizeContentType } from "../model/upload";

/**
 * "Record 30 seconds instead of answering questions" — `M2-FE-205`, `FLOW-04`,
 * `GAP-007`.
 *
 * ## It is a fast path, not a fallback
 *
 * This sits at the top of screen 3 as an equal option, not underneath the form
 * as the thing to try when the form defeated you. A Customer describing a
 * leaking pipe in Telugu at 9pm should not have to translate themselves into our
 * question schema first, and thirty seconds of them saying what is wrong is
 * routinely a better brief than four dropdowns.
 *
 * ## The language control is not a preference, it is eligibility
 *
 * `matching._eligible_candidates` compares the requirement's language against
 * each vendor's declared languages and excludes on `LANGUAGE_MISMATCH`. A voice
 * note in a language the invited vendor cannot understand is a **silent**
 * matching failure: the request looks answered, nobody can price it, and nothing
 * on either side says why. So the language is asked for beside the record
 * button rather than inferred from the browser — a phone set to English in a
 * house where the site visit will happen in Telugu is the normal case, not the
 * exception.
 *
 * The browser's own languages seed the control where one of them is offered,
 * because a good guess someone can correct beats an empty control. It is a
 * preselection, never a submission: nothing is recorded until they press.
 *
 * ## What happens when the browser cannot do this
 *
 * `MediaRecorder` and `getUserMedia` both need a secure context, and neither is
 * universal. The recorder says so plainly and points at the file picker and the
 * text box — the two things that do work — rather than rendering a button that
 * fails on press. Microphone permission refused is stated as refused, not as an
 * error on our side.
 */

/** The formats the server accepts for a voice note, in the order to prefer them. */
const PREFERRED_MIME_TYPES = ACCEPTED_MEDIA_TYPES.VOICE_NOTE;

/**
 * The mime type to record in, or null when none of the accepted ones is
 * supported.
 *
 * Chosen from the server's allow-list rather than from what the browser likes
 * best: a recording in a format `ACCEPTED_MEDIA_TYPES` does not list is refused
 * at the presign, after the person has already spoken into their phone.
 */
function supportedMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const type of PREFERRED_MIME_TYPES) {
    // Browsers advertise the codec-qualified string; the base type is what gets
    // declared, because Django compares the normalised form.
    if (MediaRecorder.isTypeSupported(`${type};codecs=opus`)) return type;
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return null;
}

/**
 * A hard stop, well past the thirty seconds asked for.
 *
 * The `VOICE_NOTE` ceiling is 8 MB, and Opus at a phone's default bitrate
 * reaches that in several minutes — but a recorder left running because somebody
 * put their phone down is a file that gets refused after the upload rather than
 * before it. Two minutes is long enough that nobody hits it while describing a
 * job and short enough that an abandoned recorder costs nothing.
 */
const MAXIMUM_SECONDS = 120;
const SUGGESTED_SECONDS = 30;

export interface VoiceNoteRecorderProps {
  /** Hands over the finished recording and the language it is in. */
  onRecorded: (blob: Blob, language: string, fileName: string) => void;
  /** The requirement's current language, when one has been chosen already. */
  language: string | null;
  onLanguageChange: (language: string) => void;
  /** False while there is nowhere to upload to — before the draft exists. */
  enabled: boolean;
}

type RecorderState = "idle" | "recording" | "unsupported" | "denied" | "failed";

export function VoiceNoteRecorder({
  onRecorded,
  language,
  onLanguageChange,
  enabled,
}: VoiceNoteRecorderProps) {
  const [state, setState] = useState<RecorderState>("idle");
  const [seconds, setSeconds] = useState(0);

  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);

  // The browser's guess, applied once. A later render must not overwrite a
  // choice the Customer made.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || language !== null) return;
    seeded.current = true;
    const guess = matchKnownLanguage(
      typeof navigator === "undefined" ? [] : [...(navigator.languages ?? [navigator.language])],
    );
    onLanguageChange(guess ?? DEFAULT_LANGUAGE_TAG);
  }, [language, onLanguageChange]);

  const stopTicker = useCallback(() => {
    if (ticker.current !== null) {
      clearInterval(ticker.current);
      ticker.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    stopTicker();
    // `stop()` fires `dataavailable` and then `stop`, where the blob is
    // assembled. Tracks are released there so a refused or aborted recording
    // cannot leave the microphone indicator on.
    recorder.current?.stop();
  }, [stopTicker]);

  useEffect(
    () => () => {
      stopTicker();
      recorder.current?.stream.getTracks().forEach((track) => track.stop());
    },
    [stopTicker],
  );

  const start = useCallback(async () => {
    const mimeType = supportedMimeType();
    if (mimeType === null || typeof navigator === "undefined" || !navigator.mediaDevices) {
      setState("unsupported");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      // Refused, or no microphone. Both read to the Customer as "we did not get
      // permission", which is true and is the only one they can act on.
      setState("denied");
      return;
    }

    try {
      const instance = new MediaRecorder(stream, { mimeType });
      chunks.current = [];
      instance.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.current.push(event.data);
      };
      instance.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunks.current, { type: normalizeContentType(mimeType) });
        chunks.current = [];
        recorder.current = null;
        setState("idle");
        setSeconds(0);
        if (blob.size > 0) {
          const extension = normalizeContentType(mimeType).split("/")[1] ?? "webm";
          onRecorded(blob, language ?? DEFAULT_LANGUAGE_TAG, `Voice note.${extension}`);
        }
      };

      recorder.current = instance;
      instance.start();
      setSeconds(0);
      setState("recording");
      ticker.current = setInterval(() => {
        setSeconds((elapsed) => {
          const next = elapsed + 1;
          if (next >= MAXIMUM_SECONDS) stop();
          return next;
        });
      }, 1000);
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      setState("failed");
    }
  }, [language, onRecorded, stop]);

  const isRecording = state === "recording";

  return (
    <div className="rounded-card border border-action-line bg-action-surface p-4">
      <p className="font-semibold text-text">Rather just talk?</p>
      <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
        Record about {SUGGESTED_SECONDS} seconds describing what you need, instead
        of answering more questions. Use whichever language you are comfortable
        with — we send your request to professionals who speak it.
      </p>

      <div className="mt-3 max-w-xs">
        <Field
          label="Language you will speak"
          description="This decides which professionals your request goes to, so it is worth getting right."
        >
          <Select
            value={language ?? DEFAULT_LANGUAGE_TAG}
            onChange={(event) => onLanguageChange(event.target.value)}
            disabled={isRecording}
          >
            {REQUIREMENT_LANGUAGES.map((option) => (
              <option key={option.tag} value={option.tag}>
                {option.label} · {option.nativeLabel}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <Button
          onClick={isRecording ? stop : () => void start()}
          aria-pressed={isRecording}
          disabled={!enabled}
          variant={isRecording ? "secondary" : "primary"}
        >
          {isRecording ? "Stop and attach" : "Record a voice note"}
        </Button>
        {isRecording ? (
          <p role="status" className="text-sm tabular-nums text-text">
            Recording {seconds}s
            <span className="text-text-secondary"> / {MAXIMUM_SECONDS}s</span>
          </p>
        ) : null}
      </div>

      {!enabled ? (
        <p className="mt-2 max-w-prose text-sm text-text-secondary">
          Answer the first question and we will save your request — then you can
          record.
        </p>
      ) : null}

      {state === "unsupported" ? (
        <p className="mt-2 max-w-prose text-sm text-text-secondary">
          This browser cannot record audio. You can attach an existing recording
          as a file, or type what you need in the box below — both reach the same
          professionals.
        </p>
      ) : null}

      {state === "denied" ? (
        <p className="mt-2 max-w-prose text-sm text-text-secondary">
          We did not get permission to use your microphone. Allow it in your
          browser settings and press record again, or type what you need below.
        </p>
      ) : null}

      {state === "failed" ? (
        <p className="mt-2 max-w-prose text-sm text-text-secondary">
          The recording could not start. Nothing was captured — try again, or type
          what you need below.
        </p>
      ) : null}
    </div>
  );
}
