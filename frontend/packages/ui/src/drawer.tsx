"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";

import { cn } from "./cn";
import { useTOrDefault } from "./i18n";

export interface DrawerProps {
  /** The content to display inside the drawer */
  children: ReactNode;
  /** Trigger button or element to open the drawer */
  trigger: ReactNode;
  /** Optional title for the drawer header */
  title?: string;
  /** Optional callback when the drawer opens or closes */
  onOpenChange?: (isOpen: boolean) => void;
  /** Drawer position: 'left' | 'right', defaults to 'right' */
  side?: "left" | "right";
  /** Controlled open state (if not using internal state) */
  open?: boolean;
  /** Drawer width preset: 'sm' (320px) | 'md' (384px) | 'lg' (480px) | 'xl' (576px) | '2xl' (704px) */
  size?: "sm" | "md" | "lg" | "xl" | "2xl";
  /** Optional additional className for the drawer aside element */
  className?: string;
}

const SIZE_CLASSES = {
  sm: "w-80 max-w-[85vw]",
  md: "w-96 max-w-[85vw]",
  lg: "w-[30rem] max-w-[90vw]",
  xl: "w-[36rem] max-w-[92vw]",
  "2xl": "w-[44rem] max-w-[95vw]",
} as const;

/**
 * A side-sheet drawer primitive for mobile filters, details panels, or navigation.
 * Includes focus trapping, Escape-to-close, and body scroll locking.
 */
export function Drawer({
  children,
  trigger,
  title,
  onOpenChange,
  side = "right",
  open,
  size = "sm",
  className,
}: DrawerProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const tf = useTOrDefault();

  const isOpen = open !== undefined ? open : internalOpen;
  
  // Keep the latest callback without re-running the open effect when a parent passes a new one.
  const onOpenChangeRef = useRef(onOpenChange);
  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  }, [onOpenChange]);

  const handleOpenChange = useCallback((newOpen: boolean) => {
    setInternalOpen(newOpen);
    onOpenChangeRef.current?.(newOpen);
  }, []);

  const triggerRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const triggerFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const triggerNode = triggerRef.current;
    // Record what was focused prior to opening (e.g. the table row or Configure button)
    triggerFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleOpenChange(false);
      }
      
      if (e.key === "Tab" && drawerRef.current) {
        const focusable = drawerRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const firstElement = focusable[0] as HTMLElement;
        const lastElement = focusable[focusable.length - 1] as HTMLElement;

        if (!firstElement) return;

        if (e.shiftKey && document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    
    // Focus first element on initial open only if focus isn't already inside the drawer
    const timer = setTimeout(() => {
      if (drawerRef.current && !drawerRef.current.contains(document.activeElement)) {
        const focusable = drawerRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        (focusable?.[0] as HTMLElement)?.focus();
      }
    }, 50);

    return () => {
      clearTimeout(timer);
      document.body.style.overflow = originalOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      
      // Restore focus to the trigger element when drawer closes
      const restoreEl = triggerFocusRef.current ?? triggerNode?.querySelector("button");
      restoreEl?.focus();
    };
  }, [isOpen, handleOpenChange]);

  const slideInClass = side === "left" ? "animate-in slide-in-from-left-full" : "animate-in slide-in-from-right-full";
  const positionClass = side === "left" ? "left-0 border-r" : "right-0 border-l";

  return (
    <>
      <div ref={triggerRef} onClick={() => handleOpenChange(true)} className="inline-block">
        {trigger}
      </div>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex"
          role="dialog"
          aria-modal="true"
          aria-label={title || tf("ui.drawer.defaultLabel", "Drawer")}
        >
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity duration-300"
            onClick={() => handleOpenChange(false)}
            aria-hidden="true"
          />
          <aside
            ref={drawerRef}
            className={cn(
              "fixed top-0 bottom-0 z-50 bg-surface shadow-xl flex flex-col border-line duration-300 overscroll-contain",
              SIZE_CLASSES[size ?? "sm"],
              positionClass,
              slideInClass,
              className,
            )}
          >
            <div className="flex items-center justify-between p-4 border-b border-line shrink-0">
              <span className="font-semibold text-base text-text">{title}</span>
              <button
                type="button"
                onClick={() => handleOpenChange(false)}
                className="p-2 -mr-2 text-text-secondary hover:text-text rounded-md focus:outline-none focus:ring-2 focus:ring-signal-500"
                aria-label={tf("ui.drawer.closeDrawer", "Close drawer")}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-4 overscroll-contain">
              {children}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
