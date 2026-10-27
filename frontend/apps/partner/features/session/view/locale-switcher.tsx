"use client";

import { cn, type Locale, useT } from "@vsolve/ui";

import { useLocale } from "@/i18n/provider";

const OPTIONS: readonly { code: Locale; label: string; fullLabel: string }[] = [
  { code: "en-IN", label: "EN", fullLabel: "English" },
  { code: "te-IN", label: "తె", fullLabel: "తెలుగు" },
  { code: "hi-IN", label: "हि", fullLabel: "हिन्दी" },
];

/**
 * The language toggle. Three one-tap pills rather than a dropdown — the
 * whole point is that switching is instant and visible, not a menu to open
 * first. `useLocale().setLocale` updates every mounted screen's text in the
 * same render and writes the cookie that makes the choice stick across a
 * refresh (`i18n/locale-cookie.ts`).
 */
export function LocaleSwitcher({ className }: { className?: string }) {
  const { locale, setLocale } = useLocale();
  const t = useT();

  return (
    <div
      role="group"
      aria-label={t("shell.localeSwitcher.ariaLabel")}
      className={cn("inline-flex items-center gap-0.5 rounded-full bg-surface-sunken p-0.5", className)}
    >
      {OPTIONS.map((option) => {
        const isActive = option.code === locale;
        return (
          <button
            key={option.code}
            type="button"
            aria-pressed={isActive}
            aria-label={option.fullLabel}
            onClick={() => setLocale(option.code)}
            className={cn(
              "min-h-8 min-w-8 rounded-full px-2 text-xs font-bold transition-colors",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action",
              isActive
                ? "bg-action text-action-text"
                : "text-text-secondary hover:bg-surface-hover hover:text-text",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
