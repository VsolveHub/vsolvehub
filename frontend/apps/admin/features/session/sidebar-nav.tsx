"use client";

import {
  Home,
  ClipboardCheck,
  Briefcase,
  BriefcaseBusiness,
  Inbox,
  IndianRupee,
  Wallet,
  RotateCcw,
  Truck,
  Tag,
  ShoppingCart,
  Sliders,
  Calendar,
  ToggleLeft,
  Users,
  FileCheck2,
  MessageSquareHeart,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { SidebarLink } from "./sidebar-link";
import { useCaseQueueSummary } from "../cases/queries";

const WORK_LINKS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/operations/requests", label: "Requests", icon: Inbox, badgeKey: "requests_open" },
  { href: "/operations/cases", label: "Cases", icon: Briefcase, badgeKey: "mine_open" },
  { href: "/operations/listings", label: "Job Listings", icon: BriefcaseBusiness },
  { href: "/operations/dispatch", label: "Dispatch", icon: Truck },
  { href: "/operations/manual-offers", label: "Manual offers", icon: Tag },
  { href: "/operations/assisted-checkouts", label: "Assisted checkout", icon: ShoppingCart },
];

const PEOPLE_LINKS = [
  { href: "/operations/partners", label: "Partners", icon: Users },
  { href: "/operations/crew-documents", label: "Crew documents", icon: FileCheck2 },
  { href: "/operations/feedback", label: "Service feedback", icon: MessageSquareHeart },
  { href: "/reviews", label: "Partner reviews", icon: ClipboardCheck },
  { href: "/operations/partner-availability", label: "Availability", icon: Calendar },
];

const MONEY_LINKS = [
  { href: "/operations/rate-cards", label: "Rate cards", icon: IndianRupee },
  { href: "/operations/payouts", label: "Payouts", icon: Wallet },
  { href: "/finance", label: "Refunds", icon: RotateCcw },
];

const SYSTEM_LINKS = [
  { href: "/operations/compatibility-rules", label: "Compatibility rules", icon: Sliders },
  { href: "/operations/kill-switches", label: "Kill switches", icon: ToggleLeft },
];

const GROUPS = [
  { label: "Work", links: WORK_LINKS },
  { label: "People", links: PEOPLE_LINKS },
  { label: "Money", links: MONEY_LINKS },
  { label: "System", links: SYSTEM_LINKS },
];

export function SidebarNavContent({ isCollapsed, onToggle }: { isCollapsed?: boolean; onToggle?: () => void }) {
  const { data: counts } = useCaseQueueSummary();

  return (
    <div className="flex flex-col h-full">
      <nav aria-label="Operations workspaces" className="flex-1 flex flex-col gap-4 p-2 overflow-y-auto">
        {GROUPS.map((group) => (
          <div key={group.label} className="flex flex-col gap-1">
            {!isCollapsed && (
              <h3 className="px-3 text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">
                {group.label}
              </h3>
            )}
            <ul className="flex flex-col gap-0.5 list-none p-0 m-0">
              {group.links.map((entry) => {
                let badgeCount = 0;
                const e = entry as Record<string, unknown>;
                if (counts && e.badgeKey) {
                  badgeCount = Number((counts as Record<string, unknown>)[e.badgeKey as string]) || 0;
                }
                return (
                  <li key={entry.href}>
                    <SidebarLink 
                      href={entry.href} 
                      label={entry.label} 
                      icon={entry.icon} 
                      isCollapsed={isCollapsed}
                      badgeCount={badgeCount}
                    />
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      {onToggle && (
        <div className="p-2 border-t border-line mt-auto shrink-0">
          <button
            onClick={onToggle}
            className="flex w-full items-center justify-center gap-2 px-2.5 py-2 rounded-lg text-sm font-medium text-text-secondary hover:bg-surface-hover hover:text-text transition-colors"
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? (
              <>
                <PanelLeftOpen className="h-4 w-4" />
                <span className="sr-only">Expand sidebar</span>
              </>
            ) : (
              <>
                <PanelLeftClose className="h-4 w-4" />
                <span>Collapse</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
