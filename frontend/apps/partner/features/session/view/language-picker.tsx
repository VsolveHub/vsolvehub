"use client";

import { DEFAULT_LOCALE, type Locale } from "@vsolve/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Pictogram } from "@/components/pictogram";

const LOCALE_STORAGE_KEY = "vsh-partner-locale";

const OPTIONS: readonly { code: Locale; script: string; fontClass: string }[] = [
  { code: "te-IN", script: "తెలుగు", fontClass: "font-[var(--font-telugu)]" },
  { code: "hi-IN", script: "हिन्दी", fontClass: "font-[var(--font-devanagari)]" },
  { code: "en-IN", script: "English", fontClass: "" },
];

/**
 * `/me/language` — three full-width script buttons, ported from the design
 * canvas (`Language.dc.html`, artboard "1 · Pick a language").
 *
 * No translated catalogue exists yet (spec Non-goal): picking Telugu or Hindi
 * here only writes the stored locale preference for when catalogues land —
 * the app keeps rendering English strings everywhere else in the meantime.
 * `Locale`/`DEFAULT_LOCALE` come straight from `@vsolve/ui`'s `i18n.tsx` seam
 * rather than a local re-declaration, so this screen and the eventual
 * `I18nProvider` wiring can never drift apart on what a valid locale is.
 */
export function LanguagePicker() {
  const router = useRouter();
  const [selected, setSelected] = useState<Locale>(DEFAULT_LOCALE);

  return (
    <main className="flex min-h-screen flex-col bg-[linear-gradient(170deg,var(--color-navy-700)_0%,var(--color-navy-900)_60%,var(--color-navy-900)_100%)] px-5">
      <div className="flex flex-col items-center gap-4.5 pt-16 pb-11">
        <div className="grid h-19 w-19 place-items-center rounded-[22px] bg-action shadow-raised">
          <Pictogram name="home" className="h-11 w-11 text-text" />
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3.5">
        {OPTIONS.map((option) => (
          <button
            key={option.code}
            type="button"
            onClick={() => setSelected(option.code)}
            className={
              selected === option.code
                ? "flex items-center gap-4.5 rounded-[22px] bg-action px-5.5 py-5.5 shadow-[0_4px_0_var(--color-action-active)]"
                : "flex items-center gap-4.5 rounded-[22px] bg-surface px-5.5 py-5.5 shadow-[0_4px_0_var(--color-warm-300)]"
            }
          >
            <span className={`flex-1 text-left text-[2.75rem] font-bold leading-tight ${option.fontClass}`}>
              {option.script}
            </span>
          </button>
        ))}
      </div>

      <div className="pb-8.5 pt-7">
        <button
          type="button"
          onClick={() => {
            window.localStorage.setItem(LOCALE_STORAGE_KEY, selected);
            router.back();
          }}
          className="flex h-22 w-full items-center justify-center rounded-[22px] bg-success-text shadow-[0_4px_0_var(--color-success-active)]"
        >
          <Pictogram name="go" className="h-11.5 w-11.5 text-surface" />
        </button>
      </div>
    </main>
  );
}
