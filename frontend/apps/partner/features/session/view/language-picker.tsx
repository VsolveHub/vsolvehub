"use client";

import { type Locale, useT } from "@vsolve/ui";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Pictogram } from "@/components/pictogram";
import { useLocale } from "@/i18n/provider";

const OPTIONS: readonly { code: Locale; script: string; fontClass: string }[] = [
  { code: "te-IN", script: "తెలుగు", fontClass: "font-[var(--font-telugu)]" },
  { code: "hi-IN", script: "हिन्दी", fontClass: "font-[var(--font-devanagari)]" },
  { code: "en-IN", script: "English", fontClass: "" },
];

/**
 * `/me/language` — three full-width script buttons, ported from the design
 * canvas (`Language.dc.html`, artboard "1 · Pick a language").
 *
 * `useLocale` (from `i18n/provider.tsx`) is the live app locale now, not a
 * stored preference the rest of the app ignores: picking a script here and
 * confirming switches every mounted screen's text in the same render, and
 * writes the cookie that keeps the choice through the next refresh.
 *
 * `min-h-[calc(100dvh-9rem)]` rather than `min-h-screen`: `app/me/language/page.tsx`
 * renders this inside `PartnerShell`, which already owns a sticky top bar and
 * a fixed bottom tab bar, so a full-viewport main inside it overshoots the
 * real available space by that chrome's height — same issue and same fix as
 * `features/work-stack/view/work-home.tsx`'s `WorkStack`, another
 * `PartnerShell` child. 9rem is that allowance.
 */
export function LanguagePicker() {
  const router = useRouter();
  const t = useT();
  const { locale, setLocale } = useLocale();
  const [selected, setSelected] = useState<Locale>(locale);

  return (
    <main className="flex min-h-[calc(100dvh-9rem)] flex-col bg-[linear-gradient(170deg,var(--color-navy-700)_0%,var(--color-navy-900)_60%,var(--color-navy-900)_100%)] px-5">
      <div className="pt-4">
        <Link
          href="/me"
          className="inline-flex min-h-11 items-center gap-1.5 text-xs font-semibold text-white/70 hover:text-white transition-colors"
        >
          <ArrowLeft size={16} aria-hidden />
          {t("me.language.backToAccount")}
        </Link>
      </div>
      <div className="flex flex-col items-center gap-4.5 pt-8 pb-11">
        <div className="grid h-19 w-19 place-items-center rounded-[22px] bg-action shadow-raised">
          <Pictogram name="home" size="xl" className="text-text" />
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3.5">
        {OPTIONS.map((option) => (
          <button
            key={option.code}
            type="button"
            aria-pressed={selected === option.code}
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
          aria-label={t("me.language.confirm")}
          onClick={() => {
            setLocale(selected);
            router.back();
          }}
          className="flex h-22 w-full items-center justify-center rounded-[22px] bg-success-text shadow-[0_4px_0_var(--color-success-active)]"
        >
          <Pictogram name="go" size="xl" className="text-surface" />
        </button>
      </div>
    </main>
  );
}
