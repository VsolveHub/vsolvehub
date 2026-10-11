"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { SidebarLink } from "./sidebar-link";
import { usePathname } from "next/navigation";

import { NAV_GROUPS, isNavLinkActive } from "./nav-groups";
import { useCaseQueueSummary } from "../cases/queries";

export function SidebarNavContent({
  isCollapsed,
  onToggle,
  onLinkClick,
}: {
  isCollapsed?: boolean;
  onToggle?: () => void;
  /** Called after every nav link click — use to close a mobile drawer. */
  onLinkClick?: () => void;
}) {
  const { data: counts } = useCaseQueueSummary();
  const pathname = usePathname();

  return (
    <div className="flex flex-col h-full">
      <nav aria-label="Operations workspaces" className="flex-1 flex flex-col gap-4 p-2 overflow-y-auto">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="flex flex-col gap-1">
            {!isCollapsed && (
              <h3 className="px-3 text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">
                {group.label}
              </h3>
            )}
            <ul className="flex flex-col gap-0.5 list-none p-0 m-0">
              {group.links.map((entry) => {
                const badgeCount =
                  counts && entry.badgeKey
                    ? Number((counts as Record<string, unknown>)[entry.badgeKey]) || 0
                    : 0;
                return (
                  <li key={entry.href}>
                    <SidebarLink
                      href={entry.href}
                      label={entry.label}
                      icon={entry.icon}
                      isCollapsed={isCollapsed}
                      badgeCount={badgeCount}
                      active={isNavLinkActive(entry, pathname)}
                      onClick={onLinkClick}
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
