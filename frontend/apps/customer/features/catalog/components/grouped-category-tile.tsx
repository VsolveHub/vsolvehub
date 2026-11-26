"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowRight, Droplets, Wrench, X, Zap, type LucideIcon } from "lucide-react";

import { IntentLink } from "@/components/intent-link";
import { RemoteImage } from "@/components/remote-image";
import { catalogCategoryHref } from "@/lib/routes";

import { HOME_REPAIR_GROUP, type HomeCategorySummary } from "../home-category-groups";

type TradeCardTheme = {
  icon: LucideIcon;
  iconShellClass: string;
  iconFallbackGradientClass: string;
  cardHoverClass: string;
  exploreTextClass: string;
  mobileArrowClass: string;
  fallbackDescription: string;
};

const MODAL_SURFACE_STYLE = {
  backgroundImage:
    "radial-gradient(70% 85% at 6% 10%, rgba(224, 231, 255, 0.56) 0%, rgba(224, 231, 255, 0) 68%), radial-gradient(65% 85% at 94% 94%, rgba(254, 226, 226, 0.58) 0%, rgba(254, 226, 226, 0) 68%), linear-gradient(135deg, #F7F8FD 0%, #FFFFFF 48%, #FDF7F6 100%)",
} as const;

const TRADE_CARD_THEMES: Readonly<Record<string, TradeCardTheme>> = {
  technician: {
    icon: Wrench,
    iconShellClass:
      "bg-[#F4F3F1] ring-1 ring-[#5B63F6]/15 shadow-[0_10px_22px_-6px_rgba(91,99,246,0.26),0_2px_6px_-1px_rgba(15,23,42,0.06)]",
    iconFallbackGradientClass: "bg-gradient-to-br from-[#757AF8] to-[#585DF0] text-white",
    cardHoverClass: "hover:border-[#5B63F6]/25",
    exploreTextClass: "text-[#3642B8]",
    mobileArrowClass: "bg-[#EEF0FF] text-[#3642B8] ring-[#5B63F6]/15",
    fallbackDescription: "Reviewed one-person Technician task visits.",
  },
  electrician: {
    icon: Zap,
    iconShellClass:
      "bg-[#FBF7F4] ring-1 ring-[#F97316]/15 shadow-[0_10px_22px_-6px_rgba(249,115,22,0.28),0_2px_6px_-1px_rgba(15,23,42,0.06)]",
    iconFallbackGradientClass: "bg-gradient-to-br from-[#FF9D42] to-[#F37622] text-white",
    cardHoverClass: "hover:border-[#F97316]/25",
    exploreTextClass: "text-[#B84A0C]",
    mobileArrowClass: "bg-[#FFF3EA] text-[#B84A0C] ring-[#F97316]/15",
    fallbackDescription: "Wiring, fittings, fans and power faults, fixed in one visit.",
  },
  plumber: {
    icon: Droplets,
    iconShellClass:
      "bg-[#F9F6F3] ring-1 ring-[#0D9488]/15 shadow-[0_10px_22px_-6px_rgba(13,148,136,0.26),0_2px_6px_-1px_rgba(15,23,42,0.06)]",
    iconFallbackGradientClass: "bg-gradient-to-br from-[#19B5BD] to-[#0E92A8] text-white",
    cardHoverClass: "hover:border-[#0D9488]/25",
    exploreTextClass: "text-[#0C6E78]",
    mobileArrowClass: "bg-[#ECFAFB] text-[#0C6E78] ring-[#0D9488]/15",
    fallbackDescription: "Taps, leaks, drains and fittings, fixed in one visit.",
  },
};

const DEFAULT_CARD_THEME: TradeCardTheme = {
  icon: Wrench,
  iconShellClass:
    "bg-[#F8F9FA] ring-1 ring-black/[0.06] shadow-[0_10px_22px_-6px_rgba(15,23,42,0.16),0_2px_6px_-1px_rgba(15,23,42,0.05)]",
  iconFallbackGradientClass: "bg-gradient-to-br from-navy-700 to-navy-900 text-white",
  cardHoverClass: "hover:border-navy-900/20",
  exploreTextClass: "text-navy-900",
  mobileArrowClass: "bg-surface-sunken text-navy-900 ring-black/[0.05]",
  fallbackDescription: "Verified home repair and maintenance specialists.",
};

function tradeThemeFor(slug: string): TradeCardTheme {
  return TRADE_CARD_THEMES[slug] ?? DEFAULT_CARD_THEME;
}

function UnifiedRepairsArtwork({ desktop }: { desktop: boolean }) {
  const [imageFailed, setImageFailed] = useState(false);

  if (!imageFailed) {
    return (
      <span className="relative block size-full">
        <RemoteImage
          src={HOME_REPAIR_GROUP.imageUrl}
          alt=""
          fill
          sizes={desktop ? "(min-width: 1280px) 200px, 16vw" : "33vw"}
          onError={() => setImageFailed(true)}
          className="object-cover transition-transform duration-300 group-hover:scale-105"
        />
      </span>
    );
  }

  return (
    <span
      aria-hidden
      className="grid size-12 place-items-center rounded-xl bg-navy-50 text-navy-700 shadow-xs"
    >
      <Wrench className="size-6" strokeWidth={1.8} />
    </span>
  );
}

function TradeIconTile({
  imageUrl,
  theme,
}: {
  imageUrl: string;
  theme: TradeCardTheme;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const FallbackIcon = theme.icon;
  const hasImage = imageUrl !== "" && !imageFailed;

  return (
    <span
      className={`relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl transition-transform duration-200 group-hover/card:scale-105 md:size-14 lg:size-[60px] ${
        hasImage ? theme.iconShellClass : `${theme.iconFallbackGradientClass} ${theme.iconShellClass}`
      }`}
    >
      {hasImage ? (
        <RemoteImage
          src={imageUrl}
          alt=""
          fill
          sizes="64px"
          onError={() => setImageFailed(true)}
          className="scale-[1.04] object-cover transition-transform duration-200 group-hover/card:scale-110"
        />
      ) : (
        <FallbackIcon className="size-6" strokeWidth={1.9} />
      )}
    </span>
  );
}

/**
 * Single "Technician, Electrician & Plumber" category tile that opens a
 * luminous modal with elevated white cards for the grouped trades
 * (`Technician`, `Electrician`, `Plumber`) using the current category icons
 * inside rounded-square badges.
 */
export function GroupedCategoryTile({
  members,
  variant,
}: {
  members: HomeCategorySummary[];
  variant: "desktop" | "mobile";
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [open, setOpen] = useState(false);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      previousFocusRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : triggerRef.current;
      dialog.showModal();
      const frame = requestAnimationFrame(() => {
        requestAnimationFrame(() => setEntered(true));
      });
      return () => cancelAnimationFrame(frame);
    }

    if (!open) {
      setEntered(false);
      if (dialog.open) dialog.close();
    }
  }, [open]);

  useEffect(() => {
    if (open) return;
    const target = previousFocusRef.current;
    previousFocusRef.current = null;
    if (!target || !target.isConnected) return;
    const active = document.activeElement;
    if (active === null || active === document.body) {
      target.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const desktop = variant === "desktop";

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`group flex h-full w-full flex-col items-center justify-start text-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action ${
          desktop ? "gap-2.5" : "gap-1.5 sm:gap-2"
        }`}
      >
        <span className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-2xl border border-line/80 bg-[#F8F9FA] shadow-xs transition-all duration-200 group-hover:scale-105 group-hover:border-line-strong group-hover:bg-[#FFF8F3] group-hover:shadow-md motion-reduce:transform-none">
          <UnifiedRepairsArtwork desktop={desktop} />
        </span>

        {desktop ? (
          <div className="w-full px-0.5 lg:px-1">
            <h3 className="text-balance text-[13.5px] font-bold leading-tight text-navy-900 transition-colors group-hover:text-signal-700 xl:text-[15px]">
              {HOME_REPAIR_GROUP.title}
            </h3>
          </div>
        ) : (
          <span className="w-full text-balance px-0.5 text-center text-[11px] font-bold leading-[1.25] text-[#00112e] transition-colors group-hover:text-[#f87000] sm:text-xs">
            {HOME_REPAIR_GROUP.title}
          </span>
        )}
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === dialogRef.current) setOpen(false);
        }}
        className={`m-auto w-[calc(100%-2rem)] max-w-[56rem] overflow-hidden rounded-[2rem] border border-white/90 bg-white p-0 text-navy-900 shadow-[0_28px_70px_-16px_rgba(15,23,42,0.22),0_8px_24px_-8px_rgba(15,23,42,0.08)] ring-1 ring-black/[0.04] backdrop:bg-[#0f172a]/20 backdrop:backdrop-blur-[3px] transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none motion-reduce:transform-none max-md:mb-0 max-md:mt-auto max-md:max-h-[85dvh] max-md:w-full max-md:max-w-none max-md:rounded-b-none max-md:rounded-t-[1.875rem] ${
          entered
            ? "scale-100 translate-y-0 opacity-100"
            : "scale-[0.97] translate-y-2 opacity-0 max-md:scale-100 max-md:translate-y-4"
        }`}
      >
        <div
          style={MODAL_SURFACE_STYLE}
          className="relative flex max-h-[85dvh] flex-col overflow-hidden px-5 pb-6 pt-3 md:px-11 md:py-10"
        >
          {/* Mobile drag indicator */}
          <div
            aria-hidden
            className="mx-auto mb-3.5 h-1 w-9 shrink-0 rounded-full bg-[#D5DBE5] md:hidden"
          />

          {/* Top-right circular close button */}
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="absolute right-5 top-5 z-10 grid size-9 place-items-center rounded-full border border-[#E6E8F0] bg-white text-[#334155] shadow-[0_4px_12px_rgba(15,23,42,0.06)] transition-colors hover:border-[#CBD5E1] hover:bg-[#F8FAFC] hover:text-navy-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action md:right-7 md:top-7 md:size-10"
          >
            <X className="size-4" strokeWidth={1.9} />
          </button>

          {/* Clean header */}
          <div className="shrink-0 pr-12">
            <h2
              id={titleId}
              className="text-balance text-[1.25rem] font-extrabold leading-[1.2] tracking-[-0.025em] text-navy-900 sm:text-[1.45rem] md:text-[1.75rem]"
            >
              {HOME_REPAIR_GROUP.title}
            </h2>
            <p id={descriptionId} className="mt-1.5 text-xs text-[#5A6270] md:text-[15px]">
              {HOME_REPAIR_GROUP.modalDescription}
            </p>
          </div>

          {/* Mobile: horizontal white rows; Desktop: 3-column elevated white cards */}
          <div className="-mx-2 mt-5 min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-1 md:mx-0 md:mt-8 md:overflow-visible md:p-0">
            <ul className="grid list-none grid-cols-1 gap-3.5 p-0 md:grid-cols-3 md:gap-5">
              {members.map((member) => {
                const theme = tradeThemeFor(member.slug);
                const description = member.description?.trim() || theme.fallbackDescription;

                return (
                  <li key={member.id} className="min-w-0">
                    <IntentLink
                      href={catalogCategoryHref(member.slug)}
                      onClick={() => setOpen(false)}
                      className={`group/card flex h-full flex-row items-center gap-3.5 rounded-[1.25rem] border border-black/[0.04] bg-white p-3.5 shadow-[0_12px_30px_-12px_rgba(15,23,42,0.09),0_2px_8px_-2px_rgba(15,23,42,0.04)] transition-all duration-200 hover:shadow-[0_22px_44px_-14px_rgba(15,23,42,0.14),0_4px_12px_-2px_rgba(15,23,42,0.05)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action md:flex-col md:items-stretch md:justify-between md:gap-0 md:rounded-[1.375rem] md:p-7 md:hover:-translate-y-1 ${theme.cardHoverClass}`}
                    >
                      <div className="flex min-w-0 flex-1 flex-row items-center gap-3.5 md:flex-col md:items-start md:gap-0">
                        <TradeIconTile imageUrl={member.image_url} theme={theme} />

                        <div className="min-w-0 flex-1 md:mt-6 md:w-full">
                          <h3 className="text-[15px] font-extrabold tracking-[-0.02em] text-navy-900 md:text-[1.125rem]">
                            {member.name}
                          </h3>
                          <p className="mt-1 line-clamp-2 text-xs leading-snug text-[#5A6270] md:mt-1.5 md:line-clamp-none md:text-[13px] md:leading-[1.55]">
                            {description}
                          </p>
                        </div>
                      </div>

                      {/* Mobile right circular arrow pill */}
                      <span
                        aria-hidden
                        className={`grid size-9 shrink-0 place-items-center rounded-full ring-1 transition-transform duration-200 group-hover/card:translate-x-0.5 md:hidden ${theme.mobileArrowClass}`}
                      >
                        <ArrowRight className="size-4" strokeWidth={2.2} />
                      </span>

                      {/* Desktop bottom Explore action */}
                      <span
                        className={`mt-6 hidden items-center gap-1.5 text-[13px] font-bold tracking-[-0.01em] md:inline-flex ${theme.exploreTextClass}`}
                      >
                        <span>Explore</span>
                        <ArrowRight
                          className="size-3.5 transition-transform duration-200 group-hover/card:translate-x-1"
                          strokeWidth={2.2}
                        />
                      </span>
                    </IntentLink>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </dialog>
    </>
  );
}
