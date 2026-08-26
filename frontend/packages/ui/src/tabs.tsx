"use client";

import { type ReactNode, useRef, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface TabItem {
  /** Display label for the tab */
  label: ReactNode;
  /** Value used for state-based tabs */
  value?: string;
  /** Href used for route-based tabs */
  href?: string;
  /** Optional badge/count to show next to the label */
  badge?: ReactNode;
}

export interface TabsProps {
  /** List of tabs to display */
  items: TabItem[];
  /** Currently active tab value (if state-based) */
  value?: string;
  /** Callback when a tab is clicked (if state-based) */
  onChange?: (value: string) => void;
  /** 
   * If true, uses Next.js `usePathname` and `Link` for routing.
   * `href` must be provided on items.
   */
  routeBased?: boolean;
}

/**
 * A shared Tabs primitive for underline navigation.
 * Handles horizontal overflow scrolling on mobile with optional scroll indicators.
 * Can act as a state-based component (onChange) or a route-based component (href).
 */
export function Tabs({ items, value, onChange, routeBased = false }: TabsProps) {
  const pathname = usePathname();
  const scrollRef = useRef<HTMLDivElement>(null);
  
  // Optional: add visual indicators if the container is scrollable
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(Math.ceil(scrollLeft + clientWidth) < scrollWidth);
    }
  };

  useEffect(() => {
    checkScroll();
    window.addEventListener("resize", checkScroll);
    return () => window.removeEventListener("resize", checkScroll);
  }, [items]);

  return (
    <div className="relative border-b border-line bg-surface">
      <div 
        ref={scrollRef}
        onScroll={checkScroll}
        className="flex items-center gap-6 overflow-x-auto no-scrollbar overscroll-contain px-2 sm:px-0"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {items.map((item, idx) => {
          const isActive = routeBased
            ? item.href === pathname || pathname.startsWith(`${item.href}/`)
            : item.value === value;

          const baseClasses = `
            flex items-center gap-2 whitespace-nowrap py-3 text-sm font-medium transition-colors relative
            ${isActive ? "text-signal-600" : "text-text-secondary hover:text-text"}
          `;

          const content = (
            <>
              {item.label}
              {item.badge && (
                <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded-full ${isActive ? 'bg-signal-100 text-signal-700' : 'bg-surface-sunken text-text-muted'}`}>
                  {item.badge}
                </span>
              )}
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-signal-600 rounded-t-full" />
              )}
            </>
          );

          if (routeBased && item.href) {
            return (
              <Link key={item.href || idx} href={item.href} className={baseClasses}>
                {content}
              </Link>
            );
          }

          return (
            <button
              key={item.value || idx}
              type="button"
              onClick={() => item.value && onChange?.(item.value)}
              className={baseClasses}
              aria-selected={isActive}
              role="tab"
            >
              {content}
            </button>
          );
        })}
      </div>
      
      {/* Scroll Indicators for mobile */}
      {canScrollLeft && (
        <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-surface to-transparent pointer-events-none sm:hidden flex items-center">
          <ChevronLeft className="h-4 w-4 text-text-muted ml-1" />
        </div>
      )}
      {canScrollRight && (
        <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-surface to-transparent pointer-events-none sm:hidden flex items-center justify-end">
          <ChevronRight className="h-4 w-4 text-text-muted mr-1" />
        </div>
      )}
    </div>
  );
}
