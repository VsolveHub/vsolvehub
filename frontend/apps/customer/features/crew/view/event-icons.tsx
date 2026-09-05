/**
 * The pictures beside an occasion and a role.
 *
 * Keyed by the catalogue's option and question codes, the same way
 * `WorkTypeIcon` is keyed by `work_type` option codes, with a neutral fallback
 * so an option this build has no picture for still renders as a tile rather
 * than a hole. Line icons in the crew flow's own weight, so a wedding and a
 * demolition sit in the same visual family.
 */

const common = {
  viewBox: "0 0 32 32",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function EventTypeIcon({ code, className = "size-7" }: { code: string; className?: string }) {
  switch (code) {
    case "wedding":
      // Two rings.
      return <svg {...common} className={className}><circle cx="12" cy="18" r="7" /><circle cx="20" cy="18" r="7" /><path d="m12 11 2-4h4l2 4" /></svg>;
    case "corporate":
      // An office block with a door.
      return <svg {...common} className={className}><path d="M7 27V7h18v20M7 27h18M11 11h3M18 11h3M11 15h3M18 15h3M11 19h3M18 19h3M14 27v-5h4v5" /></svg>;
    case "birthday":
      // A cake with one candle.
      return <svg {...common} className={className}><path d="M6 27h20M8 27v-9h16v9M8 22c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2M16 18v-5M16 9v2M15 7a1.2 1.2 0 1 0 2 0c0-1-1-2-1-2s-1 1-1 2Z" /></svg>;
    case "house-function":
      // A diya.
      return <svg {...common} className={className}><path d="M6 20h20c0 4-4 7-10 7S6 24 6 20ZM16 16c-2-2-2-5 0-7 2 2 2 5 0 7ZM10 20c1-2 3-3 6-3s5 1 6 3" /></svg>;
    default:
      // A pen on a line: "tell us".
      return <svg {...common} className={className}><path d="M6 26h20M9 21l12-12 3 3-12 12H9v-3Z" /></svg>;
  }
}

export function RoleIcon({ code, className = "size-6" }: { code: string; className?: string }) {
  switch (code) {
    case "waiter_count":
      // A cloche on a tray.
      return <svg {...common} className={className}><path d="M5 22h22M7 22a9 9 0 0 1 18 0M16 11v2M15 10h2" /></svg>;
    case "bar_staff_count":
      // A tall glass with a straw.
      return <svg {...common} className={className}><path d="M11 8h10l-1.5 17h-7L11 8ZM12 14h8M17 8l3-4" /></svg>;
    case "hostess_count":
      // A hand with a welcome mark.
      return <svg {...common} className={className}><path d="M16 27c-5 0-8-3-8-8v-6l4 2v-4l4 2V9l4 2v8" /><path d="M20 19c2-1 4 0 4 2 0 3-3 6-8 6" /></svg>;
    case "kitchen_helper_count":
      // A pan.
      return <svg {...common} className={className}><path d="M6 18h14a6 6 0 0 1-12 0M20 18h6M10 12c0-2 2-2 2-4M14 12c0-2 2-2 2-4" /></svg>;
    case "cleanup_count":
      // A broom.
      return <svg {...common} className={className}><path d="M20 5 12 17M12 17l-5 3 2 6 6-2 2-5-5-2Z" /></svg>;
    case "setup_count":
      // A stacked chair and a box.
      return <svg {...common} className={className}><path d="M6 27V17h10v10M6 21h10M18 27V13h8v14M18 18h8" /></svg>;
    default:
      return <svg {...common} className={className}><path d="M16 15a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM8 27v-2a6 6 0 0 1 16 0v2" /></svg>;
  }
}
