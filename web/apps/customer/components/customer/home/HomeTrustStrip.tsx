const TRUST_ITEMS = [
  { icon: "✓", label: "Verified pros", sub: "Background-checked" },
  { icon: "⚡", label: "Same-day service", sub: "Book in minutes" },
  { icon: "🔒", label: "Secure payments", sub: "Pay after checks" },
  { icon: "★", label: "4.8 average", sub: "Across 50k+ jobs" },
] as const;

/**
 * Compact reassurance bar shown high on the home page — the four reasons a
 * first-time visitor should trust the platform, stated plainly.
 */
export function HomeTrustStrip() {
  return (
    <ul
      className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4"
      aria-label="Why trust V Solve Hub"
    >
      {TRUST_ITEMS.map((item) => (
        <li
          key={item.label}
          className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white px-4 py-3 shadow-sm"
        >
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--color-brand-light)] text-base font-black text-[var(--color-brand)]"
            aria-hidden
          >
            {item.icon}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-[13px] font-black text-gray-900">
              {item.label}
            </span>
            <span className="truncate text-[11px] font-medium text-gray-400">
              {item.sub}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
