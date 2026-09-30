"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";

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
}

/**
 * A side-sheet drawer primitive for mobile filters, details panels, or navigation.
 * Includes focus trapping, Escape-to-close, and body scroll locking.
 */
export function Drawer({ children, trigger, title, onOpenChange, side = "right", open }: DrawerProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  
  const isOpen = open !== undefined ? open : internalOpen;
  
  const handleOpenChange = useCallback((newOpen: boolean) => {
    setInternalOpen(newOpen);
    onOpenChange?.(newOpen);
  }, [onOpenChange]);

  const triggerRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    
    const triggerNode = triggerRef.current;
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
    
    // Focus first element on open
    setTimeout(() => {
      const focusable = drawerRef.current?.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      (focusable?.[0] as HTMLElement)?.focus();
    }, 50); // slight delay for animation

    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      triggerNode?.querySelector("button")?.focus();
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
        <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label={title || "Drawer"}>
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity duration-300"
            onClick={() => handleOpenChange(false)}
            aria-hidden="true"
          />
          <aside
            ref={drawerRef}
            className={`fixed top-0 bottom-0 z-50 w-80 max-w-[85vw] bg-surface shadow-xl flex flex-col border-line duration-300 overscroll-contain ${positionClass} ${slideInClass}`}
          >
            <div className="flex items-center justify-between p-4 border-b border-line shrink-0">
              <span className="font-semibold text-base text-text">{title}</span>
              <button
                type="button"
                onClick={() => handleOpenChange(false)}
                className="p-2 -mr-2 text-text-secondary hover:text-text rounded-md focus:outline-none focus:ring-2 focus:ring-signal-500"
                aria-label="Close drawer"
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
