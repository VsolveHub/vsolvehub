"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Button } from "@vsolve/ui";

/** Hamburger + slide-in drawer for the marketing header on small screens. */
export function MarketingMobileNav({ items }: { items: { href: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const close = () => setOpen(false);

  useEffect(() => setMounted(true), []);

  // Lock background scroll and close on Escape while the drawer is open.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Rendered into <body> so the header's `backdrop-blur` (a containing block for
  // fixed elements) can't clip this overlay — otherwise the panel wouldn't cover
  // the viewport and the page would show through.
  const drawer = (
    <div className="fixed inset-0 z-[100]">
      <div className="absolute inset-0 bg-black/50" onClick={close} aria-hidden />
      <div className="absolute inset-y-0 right-0 flex w-72 max-w-[85%] flex-col bg-white px-5 py-5 shadow-xl">
        <div className="flex items-center justify-between">
          <span className="font-bold text-ink-900">Menu</span>
          <button
            type="button"
            onClick={close}
            aria-label="Close menu"
            className="rounded-lg p-1.5 text-gray-600 hover:bg-surface-muted"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="mt-4 flex flex-col">
          {items.map((n) => (
            <Link
              key={n.label}
              href={n.href}
              onClick={close}
              className="rounded-lg px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-surface-muted"
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="mt-auto space-y-2 border-t border-border pt-4">
          <Link
            href="/login"
            onClick={close}
            className="block rounded-lg px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-surface-muted"
          >
            Login
          </Link>
          <Link href="/login" onClick={close} className="block">
            <Button size="lg" className="w-full">
              Become a Partner
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        className="rounded-lg p-2 text-gray-700 hover:bg-surface-muted"
      >
        <Menu className="h-6 w-6" />
      </button>

      {open && mounted ? createPortal(drawer, document.body) : null}
    </div>
  );
}
