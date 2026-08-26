"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Menu, X } from "lucide-react";

export function MobileDrawer({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);

  // Focus trap and escape to close
  useEffect(() => {
    if (!isOpen) return;
    
    // Body scroll lock
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
      
      // Simple focus trap
      if (e.key === "Tab" && drawerRef.current) {
        const focusable = drawerRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const firstElement = focusable[0] as HTMLElement;
        const lastElement = focusable[focusable.length - 1] as HTMLElement;

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
    const focusable = drawerRef.current?.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    (focusable?.[0] as HTMLElement)?.focus();

    const trigger = triggerRef.current;

    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      trigger?.focus(); // Focus restoration
    };
  }, [isOpen]);

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        onClick={() => setIsOpen(true)}
        className="md:hidden p-1 text-text-secondary hover:text-text rounded-md focus:outline-none"
        aria-label="Toggle navigation menu"
        aria-expanded={isOpen}
      >
        <Menu className="h-5 w-5" />
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-40 md:hidden flex" role="dialog" aria-modal="true" aria-label="Mobile navigation menu">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity duration-300"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />
          <aside
            ref={drawerRef}
            className="relative z-50 w-64 max-w-[80vw] bg-surface h-full shadow-xl flex flex-col border-r border-line animate-in slide-in-from-left-full duration-300 overscroll-contain"
          >
            <div className="flex items-center justify-between p-4 border-b border-line">
              <span className="font-semibold text-sm text-text">Navigation</span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1 text-text-secondary hover:text-text"
                aria-label="Close navigation menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {/* The child (nav) will need to know when to close the menu. We can use a Context, or cloneElement, or just a click handler wrapper. */}
            <div className="overflow-y-auto flex-1 overscroll-contain" onClick={(e) => {
              if ((e.target as HTMLElement).closest('a')) {
                setIsOpen(false);
              }
            }}>
              {children}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
