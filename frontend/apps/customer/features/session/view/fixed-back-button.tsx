"use client";

import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";

export function FixedBackButton({
  href,
  label = "Go back",
  className = "",
}: {
  href?: string;
  label?: string;
  className?: string;
}) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => {
        if (href !== undefined) {
          router.push(href);
          return;
        }
        router.back();
      }}
      aria-label={label}
      className={`fixed left-3 top-[max(0.75rem,env(safe-area-inset-top))] z-50 inline-flex h-11 w-11 items-center justify-center rounded-full border border-line bg-white/95 text-text shadow-sm backdrop-blur-sm transition-colors hover:bg-surface-sunken active:scale-95 ${className}`}
    >
      <ChevronLeft className="size-5" strokeWidth={2.2} aria-hidden />
    </button>
  );
}
