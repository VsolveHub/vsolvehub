"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { cn } from "@vsolve/ui";
import { ChevronRight, X } from "lucide-react";

import type { Category } from "../client-queries";
import { ServicePhoto } from "./category-artwork";

const ANIMATION_MS = 220;

type SeeAllTile = {
  slug: string;
  name: string;
  iconKey: string;
  imageUrl: string;
};

export function TileDesktopSeeAllModal({
  open,
  onOpenChange,
  category,
  tiles,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: Category;
  tiles: readonly SeeAllTile[];
}) {
  const router = useRouter();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const frame = requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
      return () => cancelAnimationFrame(frame);
    }

    setVisible(false);
    const timer = window.setTimeout(() => setMounted(false), ANIMATION_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  const requestClose = useCallback(() => {
    if (!open) return;
    onOpenChange(false);
  }, [open, onOpenChange]);

  const selectTile = useCallback(
    (slug: string) => {
      onOpenChange(false);
      window.setTimeout(() => {
        router.push(`/catalog/${category.slug}?tile=${slug}`, { scroll: false });
      }, ANIMATION_MS);
    },
    [category.slug, onOpenChange, router],
  );

  useEffect(() => {
    if (!mounted) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") requestClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mounted, requestClose]);

  useEffect(() => {
    if (!visible) return;
    closeButtonRef.current?.focus();
  }, [visible]);

  useEffect(() => {
    if (!mounted) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mounted]);

  if (!mounted) return null;

  const categoryLabel = category.name.toLowerCase();

  return createPortal(
    <div
      className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto p-4 sm:p-6"
      role="presentation"
    >
      <button
        type="button"
        aria-label="Close all services popup"
        className={cn(
          "absolute inset-0 bg-black/55 backdrop-blur-[2px] motion-reduce:transition-none",
          "transition-opacity duration-200 ease-out",
          visible ? "opacity-100" : "opacity-0",
        )}
        onClick={requestClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="see-all-services-title"
        aria-describedby="see-all-services-description"
        className={cn(
          "relative z-10 flex min-h-0 w-[min(100%,44rem)] max-h-[min(70dvh,calc(100dvh-4rem))] flex-col overflow-hidden rounded-[1.35rem] border border-[#e7e2da] bg-white shadow-2xl motion-reduce:transition-none motion-reduce:transform-none",
          "transition-[opacity,transform] duration-200 ease-out",
          visible ? "scale-100 opacity-100" : "scale-95 opacity-0",
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 px-5 pb-3 pt-5">
          <div className="min-w-0">
            <h2
              id="see-all-services-title"
              className="text-[1.35rem] font-extrabold tracking-tight text-navy-900"
            >
              All {category.name} Services
            </h2>
            <p
              id="see-all-services-description"
              className="mt-1 text-[13px] font-semibold text-[#EA580C]"
            >
              Explore all {categoryLabel} services available at V Solve Hub
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={requestClose}
            aria-label="Close"
            className="grid size-8 shrink-0 place-items-center rounded-full text-navy-900 transition-colors hover:bg-[#F3F4F6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            <X className="size-5" strokeWidth={2} />
          </button>
        </div>

        <div className="no-scrollbar min-h-0 overflow-y-auto overscroll-contain px-5 pb-5 pt-1">
          <ul className="grid list-none grid-cols-4 gap-x-3 gap-y-3.5 p-0">
            {tiles.map((tile) => (
              <li key={tile.slug} className="min-w-0">
                <button
                  type="button"
                  onClick={() => selectTile(tile.slug)}
                  className="group flex h-full w-full flex-col rounded-[1rem] border border-[#e7e2da] bg-white p-2.5 text-left shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-[border-color,box-shadow] duration-150 hover:border-navy-300 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                >
                  <span className="block w-full rounded-[0.85rem] bg-[#F6F3EE] p-1.5">
                    <ServicePhoto
                      imageUrl={tile.imageUrl}
                      iconKey={tile.iconKey}
                      className="shadow-none"
                    />
                  </span>
                  <span className="mt-2 flex min-w-0 items-center justify-between gap-1.5">
                    <span className="line-clamp-2 text-[12px] font-bold leading-tight text-navy-900">
                      {tile.name}
                    </span>
                    <span
                      aria-hidden
                      className="grid size-6 shrink-0 place-items-center rounded-full bg-[#F3F4F6] text-navy-700 transition-colors group-hover:bg-[#FFF0E5] group-hover:text-[#EA580C]"
                    >
                      <ChevronRight className="size-3.5" strokeWidth={2.2} />
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>,
    document.body,
  );
}
