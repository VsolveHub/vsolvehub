"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { Tooltip } from "@vsolve/ui";

interface SidebarLinkProps {
  href: string;
  label: string;
  icon: LucideIcon;
  isCollapsed?: boolean;
  badgeCount?: number;
  /** Decided by the nav, which knows the sibling links; falls back to a prefix match. */
  active?: boolean;
  /** Called when the link is clicked — e.g. to close a mobile drawer. */
  onClick?: () => void;
}

export function SidebarLink({
  href,
  label,
  icon: Icon,
  isCollapsed,
  badgeCount,
  active: activeProp,
  onClick,
}: SidebarLinkProps) {
  const pathname = usePathname();

  const active =
    activeProp ??
    (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));

  const link = (
    <Link
      href={href}
      title={isCollapsed ? label : undefined}
      aria-current={active ? "page" : undefined}
      onClick={onClick}
      className={[
        "relative flex items-center gap-3 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors",
        active
          ? "bg-selected-surface text-text-link font-semibold"
          : "text-text-secondary hover:bg-surface-hover hover:text-text",
        isCollapsed ? "justify-center" : ""
      ].join(" ")}
    >
      <Icon
        className={["h-4 w-4 shrink-0", active ? "text-text-link" : "text-text-muted"].join(" ")}
      />
      {!isCollapsed && <span className="flex-1 truncate">{label}</span>}
      {!isCollapsed && badgeCount !== undefined && badgeCount > 0 && (
        <span className="bg-action text-white text-xs px-1.5 py-0.5 rounded-full font-bold">
          {badgeCount > 99 ? '99+' : badgeCount}
        </span>
      )}
      {isCollapsed && badgeCount !== undefined && badgeCount > 0 && (
        <span className="absolute top-1 right-1 w-2 h-2 bg-action rounded-full" />
      )}
    </Link>
  );

  if (isCollapsed) {
    return (
      <Tooltip content={label} position="right">
        {link}
      </Tooltip>
    );
  }

  return link;
}
