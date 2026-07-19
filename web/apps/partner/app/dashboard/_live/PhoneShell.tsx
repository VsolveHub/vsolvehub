import { BottomNav } from "./BottomNav";
import type { Tab } from "./types";

/* ------------------------------------------------------------------ *
 * Phone shell — device frame, status bar, scrollable screen, tab bar.
 * ------------------------------------------------------------------ */
export function PhoneShell({
  online,
  tab,
  setTab,
  nav,
  overlay,
  children,
}: {
  now: Date;
  online: boolean;
  session: number;
  tab: Tab;
  setTab: (t: Tab) => void;
  nav: boolean;
  overlay?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="w-full shrink-0 lg:max-w-[400px]">
      <div className="relative mx-auto bg-ink-900 lg:rounded-[2.8rem] lg:border lg:border-white/15 lg:p-3 lg:shadow-[0_40px_80px_-20px_rgba(0,0,0,0.7)]">
        {/* Notch — desktop frame only */}
        <div className="pointer-events-none absolute left-1/2 top-3 z-20 hidden h-6 w-32 -translate-x-1/2 rounded-b-2xl bg-ink-900 lg:block" />
        <div className="relative flex h-[100dvh] flex-col overflow-hidden bg-surface-muted lg:h-[760px] lg:max-h-none lg:rounded-[2.3rem]">
          {/* Online indicator only — no fake device status bar (the phone has its own). */}
          {online ? (
            <div className="flex items-center justify-end px-5 pt-3">
              <span className="flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" /> Online
              </span>
            </div>
          ) : null}
          {/* Screen scroll area */}
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 pb-6 pt-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {children}
          </div>
          {/* Tab bar */}
          {nav && <BottomNav tab={tab} setTab={setTab} online={online} />}
          {/* Overlays (e.g. withdraw sheet) — sibling of scroll area so it isn't clipped */}
          {overlay}
        </div>
      </div>
    </div>
  );
}
