import { Home, LayoutGrid, Wallet, Bell, User, type LucideIcon } from "lucide-react";
import { cn } from "@vsolve/ui";
import type { Tab } from "./types";

/* ------------------------------------------------------------------ *
 * Bottom tab bar — sits inside the phone screen.
 * ------------------------------------------------------------------ */
export function BottomNav({ tab, setTab, online }: { tab: Tab; setTab: (t: Tab) => void; online: boolean }) {
  const items: { id: Tab; icon: LucideIcon; label: string }[] = [
    { id: "home", icon: Home, label: "Home" },
    { id: "jobs", icon: LayoutGrid, label: "Jobs" },
    { id: "earnings", icon: Wallet, label: "Earnings" },
    { id: "alerts", icon: Bell, label: "Alerts" },
    { id: "profile", icon: User, label: "Profile" },
  ];
  return (
    <nav className="z-30 flex shrink-0 items-center justify-around border-t border-border bg-white/95 px-2 pb-3 pt-2 backdrop-blur">
      {items.map((it) => {
        const active = tab === it.id;
        return (
          <button
            key={it.id}
            onClick={() => setTab(it.id)}
            className={cn(
              "relative flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[10px] font-semibold transition",
              active ? "text-brand-700" : "text-gray-400",
            )}
          >
            <span className={cn("grid h-8 w-8 place-items-center rounded-xl transition", active && "bg-brand-50")}>
              <it.icon className="h-5 w-5" />
            </span>
            {it.label}
            {it.id === "home" && online && (
              <span className="absolute right-3 top-1 h-2 w-2 rounded-full bg-green-500 ring-2 ring-white" />
            )}
          </button>
        );
      })}
    </nav>
  );
}
