"use client";

import { Button, type Locale, useT } from "@vsolve/ui";
import { ArrowLeft, Check, Globe } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useLocale } from "@/i18n/provider";

interface LanguageOption {
  code: Locale;
  script: string;
  englishName: string;
  badgeLetter: string;
  region: string;
  fontClass: string;
}

const OPTIONS: readonly LanguageOption[] = [
  {
    code: "en-IN",
    script: "English",
    englishName: "English (India)",
    badgeLetter: "Aa",
    region: "Default system language",
    fontClass: "",
  },
  {
    code: "te-IN",
    script: "తెలుగు",
    englishName: "Telugu",
    badgeLetter: "తె",
    region: "ఆంధ్రప్రదేశ్ & తెలంగాణ (AP & TS)",
    fontClass: "font-[var(--font-telugu)]",
  },
  {
    code: "hi-IN",
    script: "हिन्दी",
    englishName: "Hindi",
    badgeLetter: "अ",
    region: "उत्तर व मध्य भारत (North & Central India)",
    fontClass: "font-[var(--font-devanagari)]",
  },
];

/**
 * `/me/language` — clean, modern language picker.
 *
 * `useLocale` (from `i18n/provider.tsx`) is the live app locale: picking a script
 * here and confirming switches every mounted screen's text in the same render,
 * and writes the cookie that persists the preference.
 */
export function LanguagePicker() {
  const router = useRouter();
  const t = useT();
  const { locale, setLocale } = useLocale();
  const [selected, setSelected] = useState<Locale>(locale);

  const handleSave = () => {
    setLocale(selected);
    router.push("/me");
  };

  return (
    <main className="flex min-h-[calc(100dvh-5rem)] flex-col bg-canvas px-4 py-5 pb-28 sm:px-6 sm:pb-12">
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col">
        {/* Navigation back to Account */}
        <div>
          <Link
            href="/me"
            className="group inline-flex items-center gap-2 text-xs font-semibold text-text-muted hover:text-text transition-colors"
          >
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" aria-hidden />
            {t("me.language.backToAccount")}
          </Link>
        </div>

        {/* Header with icon */}
        <div className="flex items-start gap-3.5 pt-4 pb-6">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-purple-100 bg-purple-50 text-purple-600 shadow-2xs">
            <Globe className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-text">
              {t("me.language.title")}
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-text-muted leading-relaxed">
              {t("me.language.subtitle")}
            </p>
          </div>
        </div>

        {/* Language Selection List */}
        <div
          role="radiogroup"
          aria-label={t("me.language.title")}
          className="flex flex-col gap-3"
        >
          {OPTIONS.map((option) => {
            const isSelected = selected === option.code;
            const isCurrentLocale = locale === option.code;

            return (
              <button
                key={option.code}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => setSelected(option.code)}
                className={`relative flex items-center gap-3.5 rounded-2xl border p-4 text-left transition-all ${
                  isSelected
                    ? "border-action bg-action/5 shadow-xs ring-1 ring-action/25"
                    : "border-line bg-surface hover:border-line-strong hover:bg-surface-hover/60"
                }`}
              >
                {/* Script Badge / Icon */}
                <div
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border text-base font-bold transition-colors ${
                    isSelected
                      ? "border-action/30 bg-action/15 text-action-active"
                      : "border-line bg-canvas text-text-muted"
                  } ${option.fontClass}`}
                  aria-hidden
                >
                  {option.badgeLetter}
                </div>

                {/* Text details */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-lg font-bold text-text ${option.fontClass}`}>
                      {option.script}
                    </span>
                    {isCurrentLocale ? (
                      <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                        {t("me.language.activeBadge")}
                      </span>
                    ) : null}
                  </div>
                  <div className="text-xs font-medium text-text-muted">
                    {option.englishName}
                  </div>
                  <div className="text-[11px] text-text-subtle mt-0.5 truncate">
                    {option.region}
                  </div>
                </div>

                {/* Selection Radio / Check Indicator */}
                <div
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-all ${
                    isSelected
                      ? "bg-action text-action-text shadow-2xs"
                      : "border-2 border-line-strong bg-surface"
                  }`}
                  aria-hidden
                >
                  {isSelected ? <Check className="h-3.5 w-3.5 stroke-[3]" /> : null}
                </div>
              </button>
            );
          })}
        </div>

        {/* Action Button */}
        <div className="mt-8 pt-4">
          <Button
            type="button"
            variant="primary"
            size="lg"
            block
            className="h-12 w-full rounded-xl text-sm sm:text-base font-bold shadow-sm"
            onClick={handleSave}
          >
            <Check className="h-4 w-4 mr-1.5" />
            {t("me.language.confirm")}
          </Button>
        </div>
      </div>
    </main>
  );
}
