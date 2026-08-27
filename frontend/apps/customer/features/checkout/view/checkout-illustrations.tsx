/** Decorative illustration beside the confirm booking panel. */
export function ConfirmBookingIllustration({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 160 120"
      fill="none"
      className={className ?? "hidden w-[9.5rem] shrink-0 sm:block"}
    >
      <rect x="52" y="18" width="56" height="72" rx="6" fill="#F4F1EC" stroke="#D9D2C8" />
      <rect x="58" y="28" width="44" height="6" rx="3" fill="#E7E0D6" />
      <rect x="58" y="40" width="32" height="4" rx="2" fill="#E7E0D6" />
      <rect x="58" y="48" width="36" height="4" rx="2" fill="#E7E0D6" />
      <rect x="58" y="56" width="28" height="4" rx="2" fill="#E7E0D6" />
      <circle cx="72" cy="72" r="8" fill="#EA580C" fillOpacity="0.18" stroke="#EA580C" strokeWidth="1.5" />
      <path d="m69 72 2.5 2.5L75 69" stroke="#EA580C" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="18" y="34" width="28" height="28" rx="8" fill="#FFF7F0" stroke="#FDE6D5" />
      <circle cx="32" cy="48" r="9" stroke="#00112E" strokeWidth="1.5" />
      <path d="M32 42v6l4 2" stroke="#00112E" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="114" y="34" width="28" height="28" rx="8" fill="#EFF6FF" stroke="#BFDBFE" />
      <rect x="120" y="40" width="16" height="14" rx="2" stroke="#2563EB" strokeWidth="1.5" />
      <path d="M120 44h16M124 40v4" stroke="#2563EB" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/** Small illustration for the pricing note card in the order summary. */
export function PricingInfoIllustration({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 48 48"
      fill="none"
      className={className ?? "size-11 shrink-0"}
    >
      <circle cx="24" cy="24" r="22" fill="#EFF6FF" />
      <circle cx="24" cy="18" r="7" fill="#BFDBFE" />
      <path
        d="M12 38c2.5-6 7.5-9 12-9s9.5 3 12 9"
        stroke="#2563EB"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <rect x="30" y="28" width="10" height="8" rx="2" fill="#2563EB" fillOpacity="0.15" />
    </svg>
  );
}

export function ShoppingBagIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      fill="none"
      className={className ?? "size-5 text-action"}
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path
        d="M6 7V5.5A4 4 0 0 1 14 5.5V7M4 7h12l-1 10H5L4 7Z"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      fill="none"
      className={className ?? "size-5"}
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <rect x="3" y="4.5" width="14" height="12.5" rx="2" />
      <path d="M3 8.5h14M7 3v3M13 3v3" strokeLinecap="round" />
    </svg>
  );
}
