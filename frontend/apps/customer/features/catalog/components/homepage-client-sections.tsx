"use client";

import { useState, useRef, useEffect, useCallback, type ReactNode } from "react";
import Link from "next/link";
import { IntentLink } from "@/components/intent-link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, formatMoney, useHydrated } from "@vsolve/ui";
import { describeError, fetchCachedQuery, queryKeys, SESSION_STATE } from "@vsolve/query";
import { fetchServiceDetail } from "@/features/catalog/client-queries";
import {
  useAddCartItem,
  useCart,
  useUpdateCartItem,
  useRemoveCartItem,
  type Cart,
  type CartItem,
} from "@/features/checkout/queries";
import { cartMergeConflict, duplicateCartItemConflict } from "@/features/checkout/conflicts";
import { RemoteImage } from "@/components/remote-image";
import Image from "next/image";
import { getApiClient } from "@/lib/api/browser";
import { request } from "@vsolve/api-client";

interface GuideContent {
  title: string;
  category: string;
  included: string[];
  duration: string;
  pricing: string;
  expectations: string;
  bookingSlug: string;
}

const SERVICE_GUIDES: Record<string, GuideContent> = {
  electrician: {
    title: "Electrical Works & Safety Guide",
    category: "Electrician Services",
    included: [
      "Wiring insulation inspection",
      "Short-circuit diagnostics and fix",
      "Switchboard / socket replacement",
      "Heavy appliance load calculation",
    ],
    duration: "30 - 90 minutes",
    pricing: "Starts from a base inspection fee, credited towards any repairs you authorize.",
    expectations: "Main power breaker (MDB) must be switched off during the installation phase.",
    bookingSlug: "switch-socket-repair",
  },
  plumbing: {
    title: "Plumbing Installation & Repair Guide",
    category: "Plumber Services",
    included: [
      "Leakage trace using specialized pressure meters",
      "Gasket and mixer tap replacement",
      "Drain block removal and pipe alignment",
      "Sanitary fixture fitting",
    ],
    duration: "30 - 120 minutes",
    pricing: "Task-based rates with detailed invoices; spare pipes or taps billed separately.",
    expectations: "Please specify where the main inlet valve is located to cut off water flow.",
    bookingSlug: "tap-repair",
  },
  carpentry: {
    title: "Furniture Repair & Assembly Guide",
    category: "Carpenter Services",
    included: [
      "Door lock and latch alignment",
      "Hinge replacement and drawer slide adjustment",
      "Custom wall shelves and fittings mounting",
      "Flatpack furniture assembly",
    ],
    duration: "45 - 180 minutes",
    pricing: "Based on task complexity and fittings supplied; custom wood repairs quoted on-site.",
    expectations: "Clear a flat working space if we are assembling complex cabinet sets.",
    bookingSlug: "cupboard-hinge-repair",
  },
};

const BEST_SELLERS = [
  {
    name: "Fan Installation",
    price: 249,
    slug: "fan-installation",
    categorySlug: "electrician",
    desc: "Assembly, mounting and wiring of a new ceiling or wall fan.",
  },
  {
    name: "Cupboard Hinge Repair",
    price: 299,
    slug: "cupboard-hinge-repair",
    categorySlug: "technician",
    desc: "Meticulous cabinet hinge replacement and slide channel alignment.",
  },
  {
    name: "Plug Point Fixing",
    price: 99,
    slug: "electrician-plug-point-fixing",
    categorySlug: "electrician",
    desc: "Secure loose sockets and restore safe power to your plug points.",
  },
  {
    name: "Tap Replacement",
    price: 199,
    slug: "plumber-tap-replacement",
    categorySlug: "plumber",
    desc: "Swap worn taps with a new fixture and leak-free connections.",
  },
];

const ELECTRICIAN_SERVICES = [
  {
    name: "Fan Installation",
    price: 249,
    slug: "fan-installation",
    categorySlug: "electrician",
    desc: "Assembly, mounting and wiring of a new ceiling or wall fan.",
  },
  {
    name: "Exhaust Fan Installation",
    price: 149,
    slug: "electrician-exhaust-fan-installation",
    categorySlug: "electrician",
    desc: "Kitchen and bathroom exhaust fan mounting with proper ducting.",
  },
  {
    name: "Door Bell Installation",
    price: 99,
    slug: "electrician-door-bell-installation",
    categorySlug: "electrician",
    desc: "Wireless or wired doorbell setup with chime alignment and testing.",
  },
  {
    name: "DB Board Repair",
    price: 299,
    slug: "electrician-db-board-repair",
    categorySlug: "electrician",
    desc: "Distribution board fault tracing, breaker checks, and safe repairs.",
  },
];

const PLUMBING_SERVICES = [
  {
    name: "Tap Replacement",
    price: 199,
    slug: "plumber-tap-replacement",
    categorySlug: "plumber",
    desc: "Swap worn taps with a new fixture and leak-free connections.",
  },
  {
    name: "Shower Repair",
    price: 149,
    slug: "plumber-shower-repair",
    categorySlug: "plumber",
    desc: "Fix dripping showers, weak flow, and mixer cartridge issues.",
  },
  {
    name: "Pipe Leakage Fix",
    price: 149,
    slug: "plumber-pipe-leakage-fix",
    categorySlug: "plumber",
    desc: "Trace and seal leaking pipe joints under sinks, walls, or ceilings.",
  },
  {
    name: "Pipe Joint Repair",
    price: 149,
    slug: "plumber-pipe-joint-repair",
    categorySlug: "plumber",
    desc: "Reseal leaking joints under sinks, washbasins, and exposed piping.",
  },
];

const CARPENTRY_SERVICES = [
  {
    name: "Cupboard Hinge Repair",
    price: 299,
    slug: "cupboard-hinge-repair",
    categorySlug: "technician",
    desc: "Meticulous cabinet hinge replacement and slide channel alignment.",
  },
  {
    name: "Door Repair",
    price: 199,
    slug: "carpenter-door-repair",
    categorySlug: "technician",
    desc: "Fix sticking doors, misaligned frames, and damaged hinges or latches.",
  },
  {
    name: "Lock Fitting",
    price: 149,
    slug: "carpenter-lock-fitting",
    categorySlug: "technician",
    desc: "Install or replace door locks, latches, and security hardware.",
  },
  {
    name: "Shelf Installation",
    price: 199,
    slug: "carpenter-shelf-installation",
    categorySlug: "technician",
    desc: "Wall-mounted shelf fitting with level alignment and secure anchoring.",
  },
];

/**
 * One entry in a home rail.
 *
 * There is deliberately no `image` here. The rails above used to carry a stock
 * photograph each, and a nullable-or-optional `image?: string` is exactly how
 * those URLs would find their way back one entry at a time — so the field is
 * gone from the shape, not merely left unset. FE-9's rule about listings is the
 * reason: a service list pays one image request per row, and these rows sit
 * above the fold on the busiest page in the app.
 */
type HomepageServiceItem = {
  name: string;
  price: number;
  slug: string;
  categorySlug: string;
  desc: string;
};

function homepageServiceHref(item: HomepageServiceItem): string {
  return `/catalog/${item.categorySlug}/${item.slug}`;
}

function homepageServiceGridClass(count: number): string {
  const cols =
    count >= 4
      ? "md:grid-cols-4"
      : count === 3
        ? "md:grid-cols-3"
        : count === 2
          ? "md:grid-cols-2"
          : "md:grid-cols-1";

  return `flex gap-5 overflow-x-auto pb-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:grid ${cols} md:gap-6 md:overflow-visible md:pb-0`;
}

/**
 * One rail tile: name, one line of what it is, the price, and the Add.
 *
 * ## Why the picture band went and nothing replaced it
 *
 * The `h-36` band held a stock photograph chosen by hand per entry, so the
 * catalogue's own listing rule applies — see `ServiceGrid` and `ServiceRow`,
 * both of which already refuse a cover on a list for the same reason. Four
 * rails of four is sixteen requests before the reader has scrolled.
 *
 * Nothing takes its place. A generic mark repeated sixteen times identifies
 * nothing, and the honest alternative — a per-service icon — is not ours to
 * invent: these are hardcoded marketing entries with no `icon_key`, and
 * `iconForService` keys off a vocabulary the backend owns. The tile already has
 * its anchors in the price and the orange Add; what it loses is decoration.
 */
function HomepageServiceCard({
  item,
  renderAction,
}: {
  item: HomepageServiceItem;
  renderAction: (slug: string) => ReactNode;
}) {
  const href = homepageServiceHref(item);

  return (
    <div className="group flex w-[280px] shrink-0 flex-col rounded-2xl border border-[#e7e2da] bg-white shadow-xs transition-shadow hover:shadow-md md:w-full">
      <div className="flex flex-1 flex-col justify-between gap-4 p-4">
        <IntentLink href={href} className="flex cursor-pointer flex-col gap-1.5">
          <h3 className="font-extrabold text-base text-navy-900 transition-colors group-hover:text-action">
            {item.name}
          </h3>
          <p className="text-xs text-text-secondary line-clamp-2 leading-relaxed">{item.desc}</p>
        </IntentLink>
        <div className="mt-1 flex items-center justify-between">
          <span className="text-sm font-black text-navy-900">₹{item.price}</span>
          {renderAction(item.slug)}
        </div>
      </div>
    </div>
  );
}

function HomepageServiceRow({
  items,
  renderAction,
}: {
  items: HomepageServiceItem[];
  renderAction: (slug: string) => ReactNode;
}) {
  return (
    <div className={homepageServiceGridClass(items.length)}>
      {items.map((item) => (
        <HomepageServiceCard key={item.slug} item={item} renderAction={renderAction} />
      ))}
    </div>
  );
}

/**
 * A slide of the featured-service hero. **Keeps its `image` on purpose.**
 *
 * FE-9 strips list-level imagery, and it says so with a carve-out: not "an
 * unrelated marketing hero". This is that hero. It is three slides linking to
 * three category pages, one of them visible at a time — a fixed cost that does
 * not grow with the catalogue, which is the whole distinction the rule turns
 * on. A rail that renders one image per service is what scales to four hundred
 * requests; a carousel with three does not.
 *
 * So `image` living here while `HomepageServiceItem` has none is the intended
 * asymmetry, not an oversight to tidy up on the next pass.
 */
interface FeaturedServiceSlide {
  id: string;
  chipLabel: string;
  categoryTag: string;
  title: string;
  subtitle: string;
  highlights: [string, string];
  price: string;
  rating: string;
  bookings: string;
  guarantee: string;
  buttonText: string;
  link: string;
  image: string;
}

const FEATURED_SERVICES: FeaturedServiceSlide[] = [
  {
    id: "electrician",
    chipLabel: "⚡ Electrical",
    categoryTag: "Electrician",
    title: "Electrical Safety & Repairs",
    subtitle: "Modular switchboard fixing, wiring short-circuit fault diagnosis, and safety load checks.",
    highlights: [
      "Modular switchboard diagnostic & spark repair",
      "Complete home wiring audit & load calculation",
    ],
    price: "₹129",
    rating: "4.8",
    bookings: "12k bookings",
    guarantee: "Verified Certified Pros",
    buttonText: "Book Electrician",
    link: "/catalog/electrician",
    image: "/catalog/featured/electrician.jpg",
  },
  {
    id: "plumber",
    chipLabel: "💧 Plumbing",
    categoryTag: "Plumber",
    title: "Plumbing Upgrades & Leaks",
    subtitle: "Drip-free tap installations, drain unclogging, and pipe pressure tests.",
    highlights: [
      "Precision leak tracing with pressure meters",
      "Premium bathroom mixer & tap replacements",
    ],
    price: "₹199",
    rating: "4.9",
    bookings: "18k bookings",
    guarantee: "No-Mess Guarantee",
    buttonText: "Book Plumber",
    link: "/catalog/plumber",
    image: "/catalog/featured/plumber.jpg",
  },
  {
    id: "carpenter",
    chipLabel: "🪚 Carpentry",
    categoryTag: "Carpenter",
    title: "Carpentry & Door Fittings",
    subtitle: "Cabinet hinge alignment, lock repairs, and custom wall shelf mounting.",
    highlights: [
      "Squeak-free hinge & drawer slide alignment",
      "Laser-level shelf and decor wall mounting",
    ],
    price: "₹299",
    rating: "4.7",
    bookings: "9k bookings",
    guarantee: "Clean Drilling & Leveling",
    buttonText: "Book Carpenter",
    link: "/catalog/technician",
    image: "/catalog/featured/carpenter.jpg",
  },
];

export function HeroSplitCarousel() {
  const router = useRouter();
  const N = FEATURED_SERVICES.length;
  const half = Math.floor(N / 2);

  // Desktop Carousel State
  const [activeIdx, setActiveIdx] = useState(0);
  const [isDHovered, setIsDHovered] = useState(false);
  const [isDFocused, setIsDFocused] = useState(false);
  const prevPcs = useRef<number[]>([]);
  const isFirstRender = useRef(true);
  const dragStartX = useRef<number | null>(null);

  // Mobile Web Carousel State
  const mobileScrollRef = useRef<HTMLDivElement | null>(null);
  const [mobileActiveIdx, setMobileActiveIdx] = useState(0);
  const [isMobileInteracting, setIsMobileInteracting] = useState(false);
  const [isMobileHovered, setIsMobileHovered] = useState(false);

  // Reduced motion preference
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const dgo = useCallback((targetIdx: number) => {
    setActiveIdx((targetIdx % N + N) % N);
  }, [N]);

  // Desktop Autoplay (every 3.5s)
  useEffect(() => {
    if (reducedMotion || isDHovered || isDFocused) return;
    const interval = setInterval(() => {
      if (document.hidden) return;
      setActiveIdx((prev) => (prev + 1) % N);
    }, 3500);
    return () => clearInterval(interval);
  }, [reducedMotion, isDHovered, isDFocused, N]);

  // Desktop Keyboard Arrow Navigation
  const handleDesktopKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      dgo(activeIdx + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      dgo(activeIdx - 1);
    }
  };

  // Desktop Pointer Drag
  const handlePointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest(".featured-book-btn")) return;
    dragStartX.current = e.clientX;
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (dragStartX.current === null) return;
    const dx = e.clientX - dragStartX.current;
    dragStartX.current = null;
    if (dx < -50) {
      dgo(activeIdx + 1);
    } else if (dx > 50) {
      dgo(activeIdx - 1);
    } else if (Math.abs(dx) < 6) {
      const cardEl = (e.target as HTMLElement).closest("[data-card-pc]");
      if (cardEl && cardEl.getAttribute("data-card-pc") === "1") {
        dgo(activeIdx + 1);
      }
    }
  };

  // Mobile step calculation (card width + 10px gap)
  const getMobileStep = () => {
    if (!mobileScrollRef.current) return 300;
    const firstCard = mobileScrollRef.current.querySelector<HTMLElement>("[data-mobile-card]");
    return firstCard ? firstCard.offsetWidth + 10 : mobileScrollRef.current.offsetWidth - 24;
  };

  const handleMobileScroll = () => {
    if (!mobileScrollRef.current) return;
    const step = getMobileStep();
    if (step <= 0) return;
    const newIdx = Math.max(0, Math.min(N - 1, Math.round(mobileScrollRef.current.scrollLeft / step)));
    if (newIdx !== mobileActiveIdx) {
      setMobileActiveIdx(newIdx);
    }
  };

  const scrollToMobileSlide = (idx: number) => {
    if (!mobileScrollRef.current) return;
    const step = getMobileStep();
    mobileScrollRef.current.scrollTo({
      left: idx * step,
      behavior: reducedMotion ? "auto" : "smooth",
    });
    setMobileActiveIdx(idx);
  };

  // Mobile Autoplay (every 3.5s)
  useEffect(() => {
    if (reducedMotion || isMobileInteracting || isMobileHovered) return;
    const interval = setInterval(() => {
      if (document.hidden || !mobileScrollRef.current) return;
      setMobileActiveIdx((prev) => {
        const next = (prev + 1) % N;
        const step = getMobileStep();
        mobileScrollRef.current?.scrollTo({
          left: next * step,
          behavior: "smooth",
        });
        return next;
      });
    }, 3500);
    return () => clearInterval(interval);
  }, [reducedMotion, isMobileInteracting, isMobileHovered, N]);

  // Track initial render for instant placement
  useEffect(() => {
    isFirstRender.current = false;
  }, []);

  return (
    <section className="w-full">
      <style>{`
        @keyframes featuredKb {
          from { transform: scale(1); }
          to { transform: scale(1.05); }
        }
        .featured-kb-active {
          animation: featuredKb 3.5s ease-out forwards;
        }
        @media (prefers-reduced-motion: reduce) {
          .featured-kb-active {
            animation: none !important;
          }
          .featured-desktop-card {
            transition: none !important;
          }
        }
      `}</style>

      {/* =======================================================
          A) DESKTOP HERO CAROUSEL (768px and up: md:)
          ======================================================= */}
      <div
        className="hidden md:block w-full select-none"
        onMouseEnter={() => setIsDHovered(true)}
        onMouseLeave={() => setIsDHovered(false)}
        onFocus={() => setIsDFocused(true)}
        onBlur={() => setIsDFocused(false)}
      >
        {/* Viewport */}
        <div
          tabIndex={0}
          role="region"
          aria-roledescription="carousel"
          aria-label="Featured services"
          onKeyDown={handleDesktopKeyDown}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => { dragStartX.current = null; }}
          className="relative h-[460px] lg:h-[440px] w-full overflow-hidden touch-pan-y outline-none focus-visible:ring-2 focus-visible:ring-[#EA580C] focus-visible:ring-offset-2 rounded-[32px]"
        >
          {FEATURED_SERVICES.map((service, i) => {
            const p = ((i - activeIdx + N + half) % N) - half;
            const pc = Math.max(-1, Math.min(2, p));
            const oldPc = prevPcs.current[i];
            const isJump = isFirstRender.current || (oldPc !== undefined && Math.abs(pc - oldPc) > 1);
            prevPcs.current[i] = pc;

            const isCurrent = pc === 0;
            const isPeeking = pc === 1;

            return (
              <article
                key={service.id}
                data-card-pc={pc}
                aria-hidden={isCurrent ? "false" : "true"}
                onClick={() => {
                  if (isPeeking) {
                    dgo(activeIdx + 1);
                  }
                }}
                style={{
                  transformOrigin: "left center",
                  transform: `translateX(calc(${pc} * (100% + 16px))) scale(${isCurrent ? 1 : 0.965})`,
                  opacity: isCurrent ? 1 : isPeeking ? 0.5 : 0,
                  pointerEvents: isCurrent || isPeeking ? "auto" : "none",
                  cursor: isPeeking ? "pointer" : "default",
                  transition: isJump
                    ? "none"
                    : "transform 0.55s cubic-bezier(0.22, 0.8, 0.3, 1), opacity 0.45s ease",
                }}
                className="featured-desktop-card absolute left-0 top-0 w-[calc(100%-72px)] h-full bg-white border border-[#ECE7E1] rounded-[32px] px-6 py-6 lg:px-10 lg:py-8 shadow-xs hover:shadow-md transition-shadow overflow-hidden grid grid-cols-1 md:grid-cols-12 gap-6 lg:gap-10 items-stretch"
              >
                {/* Left Content (md:col-span-7) */}
                <div className="md:col-span-7 flex flex-col justify-center min-w-0">
                  {/* Eyebrow: Pill + Verified Guarantee */}
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="px-3 py-1 text-xs font-black uppercase tracking-wider bg-[#FFF1E8] text-[#D9480F] rounded-full border border-[#F8C9A8]">
                      Featured service
                    </span>
                    <span className="text-sm font-medium text-[#3C4658]">
                      {service.guarantee}
                    </span>
                  </div>

                  {/* Title */}
                  <h3 className="mt-2.5 lg:mt-3 text-2xl lg:text-[32px] xl:text-[34px] font-extrabold text-navy-900 leading-[1.15] tracking-tight">
                    {service.title}
                  </h3>

                  {/* Description */}
                  <p className="mt-1.5 lg:mt-2 text-sm lg:text-[15px] text-[#2D3748] leading-relaxed line-clamp-2">
                    {service.subtitle}
                  </p>

                  {/* 2 Checkmark Highlights */}
                  <div className="mt-3 lg:mt-3.5 border-y border-[#ECE7E1] py-2.5 lg:py-3 flex flex-col gap-2 lg:gap-2.5">
                    {service.highlights.map((hl: string, hlIdx: number) => (
                      <div key={hlIdx} className="flex items-center gap-2.5 text-[13px] lg:text-[14.5px] font-medium text-navy-900 min-w-0">
                        <span className="size-5.5 rounded-full bg-[#E4F4EA] text-[#1E8E4E] flex items-center justify-center shrink-0">
                          <svg className="w-3 h-3 stroke-[3] fill-none stroke-current" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m5 12.5 4.5 4.5L19 7.5" />
                          </svg>
                        </span>
                        <span className="truncate">{hl}</span>
                      </div>
                    ))}
                  </div>

                  {/* Price & Rating Row */}
                  <div className="mt-3 lg:mt-3.5 flex items-center justify-between">
                    <div>
                      <small className="text-xs uppercase tracking-wider font-bold text-[#3C4658] block leading-none">
                        Starting from
                      </small>
                      <b className="text-2xl lg:text-[28px] font-extrabold text-navy-900 leading-tight block mt-0.5">
                        {service.price}
                      </b>
                    </div>

                    <div className="flex items-center gap-1.5 bg-[#FBF9F6] px-3.5 py-2 rounded-xl border border-[#ECE7E1] text-[13px] text-[#5B6270] whitespace-nowrap">
                      <span className="text-[#F59E0B] font-black text-sm">★</span>
                      <b className="font-extrabold text-navy-900 text-sm ml-0.5 mr-0.5">{service.rating}</b>
                      <span>· {service.bookings}</span>
                    </div>
                  </div>

                  {/* Book CTA Button */}
                  <div className="mt-3.5 lg:mt-4">
                    <button
                      type="button"
                      tabIndex={isCurrent ? 0 : -1}
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(service.link);
                      }}
                      className="featured-book-btn inline-flex items-center justify-center gap-2.5 px-7 h-[48px] lg:h-[50px] rounded-xl bg-[#EA580C] hover:bg-[#C94F03] text-white text-sm lg:text-base font-extrabold shadow-xs transition-all cursor-pointer self-start active:translate-y-[1px]"
                    >
                      <span>{service.buttonText}</span>
                      <svg className="w-[18px] h-[18px] fill-none stroke-current stroke-2 shrink-0" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Right Photo Column (md:col-span-5) */}
                <div className="md:col-span-5 h-full min-h-[300px] relative rounded-[20px] overflow-hidden bg-[#EDE7DF] shadow-xs">
                  <Image
                    src={service.image}
                    alt={service.title}
                    fill
                    unoptimized
                    sizes="(min-width: 768px) 500px, 100vw"
                    className={`object-cover object-center ${isCurrent && !reducedMotion ? "featured-kb-active" : ""}`}
                  />
                  <div className="absolute top-3.5 right-3.5 bg-white/95 backdrop-blur-xs px-3.5 py-1.5 rounded-full shadow-sm text-[13px] font-bold text-navy-900">
                    {service.categoryTag}
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {/* Desktop Dots: 18px below card, inactive 8px circle, active 24px orange pill */}
        <div
          role="tablist"
          aria-label="Choose service"
          className="mt-[18px] flex items-center justify-center gap-1"
        >
          {FEATURED_SERVICES.map((s, idx) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-label={`Show ${s.categoryTag}`}
              aria-current={idx === activeIdx ? "true" : "false"}
              onClick={() => dgo(idx)}
              className="p-1 cursor-pointer bg-transparent border-0 inline-flex items-center justify-center"
            >
              <span
                className={`block h-2 rounded-full transition-all duration-300 ease-out ${
                  idx === activeIdx
                    ? "w-6 bg-[#EA580C]"
                    : "w-2 bg-[#D6D0C8] hover:bg-[#BDB6AC]"
                }`}
              />
            </button>
          ))}
        </div>
      </div>

      {/* =======================================================
          B) MOBILE HERO CAROUSEL (below 768px: md:hidden)
          ======================================================= */}
      <div
        className="md:hidden w-full select-none"
        onMouseEnter={() => setIsMobileHovered(true)}
        onMouseLeave={() => setIsMobileHovered(false)}
      >
        {/* Horizontal Native Snap Container */}
        <div
          ref={mobileScrollRef}
          role="region"
          aria-roledescription="carousel"
          aria-label="Featured services"
          onScroll={handleMobileScroll}
          onTouchStart={() => setIsMobileInteracting(true)}
          onTouchEnd={() => setIsMobileInteracting(false)}
          onPointerDown={() => setIsMobileInteracting(true)}
          onPointerUp={() => setIsMobileInteracting(false)}
          className="flex gap-2.5 overflow-x-auto snap-x snap-mandatory overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden cursor-grab active:cursor-grabbing pb-1"
        >
          {FEATURED_SERVICES.map((service) => (
            <article
              key={service.id}
              data-mobile-card
              className="flex-none w-[calc(100vw-66px)] max-w-[calc(100%-34px)] snap-start bg-white border border-[#ECE7E1] rounded-[24px] p-3 flex flex-col justify-between shadow-xs"
            >
              {/* Inset Photo (150px height) */}
              <div className="relative h-[150px] w-full rounded-2xl overflow-hidden bg-[#EDE7DF]">
                <Image
                  src={service.image}
                  alt={service.title}
                  fill
                  unoptimized
                  sizes="(max-width: 768px) 100vw, 400px"
                  className="object-cover object-center"
                />
                <span className="absolute top-2 left-2 bg-white text-[#D9480F] text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full shadow-xs">
                  Featured
                </span>
                <span className="absolute top-2 right-2 bg-black/80 text-white text-[11px] font-bold px-2 py-1 rounded-lg flex items-center gap-1 shadow-xs">
                  <span className="text-[#FBBF24]">★</span>
                  <span>{service.rating}</span>
                </span>
              </div>

              {/* Title & 2-line clamped description with min-height */}
              <div className="pt-2">
                <h3 className="text-[19px] font-extrabold text-navy-900 leading-[1.2] tracking-tight mt-1 mb-1 line-clamp-1">
                  {service.title}
                </h3>
                <p className="text-[12.5px] text-[#5B6270] leading-[1.45] mb-2 line-clamp-2 min-h-[2.9em]">
                  {service.subtitle}
                </p>
              </div>

              {/* 2 Checkmark Highlights */}
              <div className="border-y border-[#ECE7E1] py-2 flex flex-col gap-1.5">
                {service.highlights.map((hl, hlIdx) => (
                  <div key={hlIdx} className="flex items-center gap-2 text-xs font-medium text-navy-900 min-w-0">
                    <span className="size-4.5 rounded-full bg-[#E4F4EA] text-[#1E8E4E] flex items-center justify-center text-[10px] font-black shrink-0">
                      ✓
                    </span>
                    <span className="truncate">{hl}</span>
                  </div>
                ))}
              </div>

              {/* Starts at Price + Book CTA Button */}
              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="shrink-0">
                  <small className="text-[9.5px] font-bold uppercase tracking-wider text-[#3C4658] block leading-none">
                    Starts at
                  </small>
                  <b className="text-[20px] font-extrabold text-navy-900 leading-tight block mt-0.5">
                    {service.price}
                  </b>
                </div>

                <button
                  type="button"
                  onClick={() => router.push(service.link)}
                  className="h-[34px] px-3.5 rounded-xl bg-[#EA580C] hover:bg-[#C94F03] text-white text-[12.5px] font-bold inline-flex items-center justify-center gap-1.5 shadow-xs cursor-pointer active:scale-95 transition-all whitespace-nowrap shrink-0"
                >
                  <span>{service.buttonText}</span>
                  <svg
                    className="w-3.5 h-3.5 fill-none stroke-current stroke-[2.5] shrink-0"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </article>
          ))}

          {/* 24px trailing spacer */}
          <div className="w-6 flex-none" aria-hidden="true" />
        </div>

        {/* Mobile Dots: 8px below cards, >= 44px tap target, active 24px orange pill */}
        <div
          role="tablist"
          aria-label="Choose service"
          className="mt-2 flex items-center justify-center gap-1"
        >
          {FEATURED_SERVICES.map((s, idx) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-label={`Service ${idx + 1}`}
              aria-current={idx === mobileActiveIdx ? "true" : "false"}
              onClick={() => scrollToMobileSlide(idx)}
              className="min-h-[44px] px-1.5 cursor-pointer bg-transparent border-0 inline-flex items-center justify-center"
            >
              <span
                className={`block h-2 rounded-full transition-all duration-300 ease-out ${
                  idx === mobileActiveIdx
                    ? "w-6 bg-[#EA580C]"
                    : "w-2 bg-[#D6D0C8]"
                }`}
              />
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

const REVIEWS = [
  {
    user: "Sarah K.",
    initials: "SK",
    avatarBg: "bg-[#e0f2fe] text-[#0369a1]",
    rating: 5,
    date: "Yesterday",
    text: "The technician resolved our switchboard sparking issue in under 30 minutes. High quality and quick response!",
    verified: true,
    trade: "Electrician",
    accent: "border-t-[#EA580C]",
  },
  {
    user: "David M.",
    initials: "DM",
    avatarBg: "bg-[#fef3c7] text-[#b45309]",
    rating: 5,
    date: "3 days ago",
    text: "Excellent carpentry work. Placed wood fillers and aligned the drawer slides perfectly.",
    verified: true,
    trade: "Carpenter",
    accent: "border-t-[#D97706]",
  },
  {
    user: "Elena R.",
    initials: "ER",
    avatarBg: "bg-[#d1fae5] text-[#047857]",
    rating: 5,
    date: "1 week ago",
    text: "Professional plumber fixed our tap leakage instantly and did pressure checks. Highly recommend!",
    verified: true,
    trade: "Plumber",
    accent: "border-t-[#0284C7]",
  },
  {
    user: "Priya N.",
    initials: "PN",
    avatarBg: "bg-[#fce7f3] text-[#be185d]",
    rating: 5,
    date: "2 days ago",
    text: "Fan installation was neat and tidy. The pro tested every speed setting before leaving.",
    verified: true,
    trade: "Electrician",
    accent: "border-t-[#EA580C]",
  },
  {
    user: "James T.",
    initials: "JT",
    avatarBg: "bg-[#dbeafe] text-[#1d4ed8]",
    rating: 5,
    date: "4 days ago",
    text: "Kitchen drain unblocked in one visit. Transparent pricing and no mess left behind.",
    verified: true,
    trade: "Plumber",
    accent: "border-t-[#0284C7]",
  },
  {
    user: "Anita S.",
    initials: "AS",
    avatarBg: "bg-[#ffedd5] text-[#c2410c]",
    rating: 5,
    date: "5 days ago",
    text: "Door hinge alignment was flawless. Opens smoothly now without scraping the frame.",
    verified: true,
    trade: "Carpenter",
    accent: "border-t-[#D97706]",
  },
  {
    user: "Michael B.",
    initials: "MB",
    avatarBg: "bg-[#ede9fe] text-[#6d28d9]",
    rating: 5,
    date: "1 week ago",
    text: "LED panel install looked factory-finished. Wiring was concealed and the room feels brighter.",
    verified: true,
    trade: "Electrician",
    accent: "border-t-[#EA580C]",
  },
  {
    user: "Rhea P.",
    initials: "RP",
    avatarBg: "bg-[#ccfbf1] text-[#0f766e]",
    rating: 5,
    date: "1 week ago",
    text: "Shower mixer repair stopped the constant drip. Polite, punctual, and very thorough.",
    verified: true,
    trade: "Plumber",
    accent: "border-t-[#0284C7]",
  },
  {
    user: "Karan V.",
    initials: "KV",
    avatarBg: "bg-[#fef9c3] text-[#a16207]",
    rating: 5,
    date: "2 weeks ago",
    text: "Wall shelf installation was perfectly level. Drilled cleanly with zero wall damage.",
    verified: true,
    trade: "Carpenter",
    accent: "border-t-[#D97706]",
  },
  {
    user: "Lisa W.",
    initials: "LW",
    avatarBg: "bg-[#e0e7ff] text-[#4338ca]",
    rating: 5,
    date: "2 weeks ago",
    text: "DB board repair fixed recurring tripping. Explained the fault clearly before starting work.",
    verified: true,
    trade: "Electrician",
    accent: "border-t-[#EA580C]",
  },
] as const;

type ReviewItem = (typeof REVIEWS)[number];

function ReviewCard({ review }: { review: ReviewItem }) {
  return (
    <article
      className={`group relative flex w-[300px] md:w-[340px] shrink-0 flex-col justify-between gap-5 rounded-2xl border border-[#e7e2da] bg-white p-6 shadow-sm transition-shadow duration-300 hover:shadow-[0_20px_40px_rgba(0,0,0,0.06)] border-t-4 ${review.accent}`}
    >
      <span className="absolute right-4 top-2.5 select-none text-6xl text-[#e7e2da]/20">
        &rdquo;
      </span>

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div
            className={`flex size-9 shrink-0 items-center justify-center rounded-full font-black text-xs shadow-2xs ${review.avatarBg}`}
          >
            {review.initials}
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-extrabold leading-tight text-navy-900">{review.user}</span>
            <span className="mt-0.5 text-[10px] leading-none text-text-secondary">{review.date}</span>
          </div>
        </div>

        <div className="flex items-center gap-0.5 text-amber-400">
          {Array.from({ length: review.rating }).map((_, i) => (
            <svg key={i} viewBox="0 0 20 20" fill="currentColor" className="size-4">
              <path d="M10.868 2.784c-.226-.83-1.41-.83-1.636 0L7.87 6.425a1 1 0 01-.95.69h-3.83c-.88 0-1.245 1.137-.534 1.657l3.1 2.253a1 1 0 01.363 1.118l-1.18 3.65c-.263.815.674 1.497 1.39 1.012l3.1-2.203a1 1 0 011.173 0l3.1 2.203c.717.485 1.653-.197 1.39-1.012l-1.18-3.65a1 1 0 01.363-1.118l3.1-2.253c.71-.52.346-1.657-.534-1.657h-3.83a1 1 0 01-.95-.69l-1.36-3.64z" />
            </svg>
          ))}
        </div>

        <p className="text-xs font-medium italic leading-relaxed text-text-secondary transition-colors group-hover:text-navy-950">
          &ldquo;{review.text}&rdquo;
        </p>
      </div>

      <div className="flex items-center gap-2">
        {review.verified ? (
          <div className="flex items-center gap-1.5 rounded-full border border-[#137333]/5 bg-[#E6F4EA] px-2.5 py-1 text-[9px] font-black tracking-wide text-[#137333] shadow-3xs">
            <span className="size-1.5 rounded-full bg-[#137333]" />
            Verified Job
          </div>
        ) : null}
        <span className="rounded-md border border-[#e7e2da] bg-[#FAF9F7] px-2 py-1 text-[9px] font-bold text-text-secondary">
          {review.trade}
        </span>
      </div>
    </article>
  );
}

function CustomerReviewsMarquee() {
  const marqueeReviews = [...REVIEWS, ...REVIEWS];

  return (
    <section
      aria-labelledby="reviews-heading"
      className="relative w-full overflow-hidden pb-12 md:pb-16"
    >
      <div className="mx-auto flex max-w-[1216px] flex-col items-center gap-3 px-4 text-center md:px-6 lg:px-0">
        <span className="rounded-full border border-[#e7e2da] bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-action">
          Trusted by homeowners
        </span>
        <h2
          id="reviews-heading"
          className="text-2xl font-extrabold tracking-tight text-navy-900 md:text-4xl"
        >
          What Customers Say
        </h2>
        <p className="max-w-xl text-sm text-text-secondary md:text-base">
          Real feedback from verified domestic jobs across electrician, plumbing, and carpentry work.
        </p>
      </div>

      <div className="reviews-marquee-shell relative mt-8 overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-[#FAF9F7] to-transparent md:w-24"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-[#FAF9F7] to-transparent md:w-24"
        />

        <div className="reviews-marquee-track gap-5 px-4 md:gap-6 md:px-6">
          {marqueeReviews.map((review, index) => (
            <ReviewCard key={`${review.user}-${review.date}-${index}`} review={review} />
          ))}
        </div>
      </div>
    </section>
  );
}

export function HomepageClientSections() {
  const queryClient = useQueryClient();
  const cartQuery = useCart();
  // The server renders with no cart; the browser may already hold one in the query cache.
  // Reading it before hydration drew a quantity stepper where the server drew "Add +" and
  // React threw a hydration mismatch. Until hydrated, render exactly what the server did.
  const hydrated = useHydrated();
  const addItem = useAddCartItem();
  const updateItem = useUpdateCartItem();
  const removeItem = useRemoveCartItem();
  const router = useRouter();

  const isUpdating = updateItem.isPending;
  const isRemoving = removeItem.isPending;

  const [activeGuideKey, setActiveGuideKey] = useState<string | null>(null);
  const [addingSlug, setAddingSlug] = useState<string | null>(null);
  const [addErrorSlug, setAddErrorSlug] = useState<string | null>(null);
  const [variantPicker, setVariantPicker] = useState<{
    serviceName: string;
    variants: { id: string; name: string; pricePaise: number }[];
  } | null>(null);

  const cartMerge = cartQuery.isError ? cartMergeConflict(cartQuery.error) : null;

  const loadCart = async (): Promise<Cart> => {
    if (cartQuery.data) return cartQuery.data;

    try {
      return await fetchCachedQuery(queryClient, {
        queryKey: queryKeys.booking.cart(),
        queryFn: () => request(() => getApiClient().GET("/api/v1/cart/")),
        ...SESSION_STATE,
      });
    } catch (error) {
      if (cartMergeConflict(error)) {
        router.push("/cart");
      }
      throw error;
    }
  };

  const runAddToCart = (variantId: string, slug: string, onDone?: () => void) => {
    void (async () => {
      setAddErrorSlug(null);

      try {
        const cart = await loadCart();

        addItem.mutate(
          {
            expectedCartVersion: cart.version,
            variantId,
            quantity: 1,
          },
          {
            onSuccess: () => {
              setAddErrorSlug(null);
              onDone?.();
            },
            onError: (error) => {
              if (duplicateCartItemConflict(error)) {
                void cartQuery.refetch();
                setAddErrorSlug(null);
                onDone?.();
                return;
              }
              setAddErrorSlug(slug);
            },
            onSettled: () => {
              setAddingSlug(null);
            },
          },
        );
      } catch (error) {
        setAddErrorSlug(slug);
        setAddingSlug(null);
        if (!cartMergeConflict(error)) {
          console.error("Add to cart failed:", error);
        }
      }
    })();
  };

  const addVariantToCart = (variantId: string, onDone?: () => void) => {
    runAddToCart(variantId, "variant-picker", onDone);
  };

  const handleQuickAdd = async (slug: string) => {
    if (addingSlug) return;
    setAddingSlug(slug);
    setAddErrorSlug(null);

    try {
      const service = await fetchServiceDetail(queryClient, slug);

      const variantId =
        service.bookable_variant_id ??
        (service.variants.length === 1 ? service.variants[0]?.id : null);

      if (!variantId) {
        setVariantPicker({
          serviceName: service.name,
          variants: service.variants.map((variant) => ({
            id: variant.id,
            name: variant.name,
            pricePaise: variant.starting_price.amount_paise,
          })),
        });
        setAddingSlug(null);
        return;
      }

      runAddToCart(variantId, slug);
    } catch (error) {
      console.error("Quick add failed:", error);
      setAddErrorSlug(slug);
      setAddingSlug(null);
    }
  };

  const handleIncrement = (item: CartItem) => {
    const cart = cartQuery.data;
    if (cart && !isUpdating) {
      updateItem.mutate({
        expectedCartVersion: cart.version,
        expectedItemVersion: item.version,
        itemId: item.id,
        quantity: item.quantity + 1,
      });
    }
  };

  const handleDecrement = (item: CartItem) => {
    const cart = cartQuery.data;
    if (cart && !isUpdating && !isRemoving) {
      if (item.quantity > 1) {
        updateItem.mutate({
          expectedCartVersion: cart.version,
          expectedItemVersion: item.version,
          itemId: item.id,
          quantity: item.quantity - 1,
        });
      } else {
        removeItem.mutate({
          expectedCartVersion: cart.version,
          expectedItemVersion: item.version,
          itemId: item.id,
        });
      }
    }
  };

  const renderItemAction = (slug: string) => {
    const cart = hydrated ? cartQuery.data : undefined;
    const cartItem = cart?.items.find((item) => item.service_slug === slug);

    if (cartItem) {
      return (
        <div className="inline-flex h-8 items-center border border-action rounded-full overflow-hidden bg-white shadow-xs relative z-20">
          <button
            type="button"
            onClick={() => handleDecrement(cartItem)}
            disabled={isUpdating || isRemoving}
            className="px-3 h-full flex items-center justify-center text-action font-extrabold text-base hover:bg-[#FFF0E5] transition-colors disabled:opacity-50 cursor-pointer"
          >
            -
          </button>
          <span className="text-xs px-2 font-black text-navy-900 min-w-[16px] text-center">
            {cartItem.quantity}
          </span>
          <button
            type="button"
            onClick={() => handleIncrement(cartItem)}
            disabled={isUpdating}
            className="px-3 h-full flex items-center justify-center text-action font-extrabold text-base hover:bg-[#FFF0E5] transition-colors disabled:opacity-50 cursor-pointer"
          >
            +
          </button>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            void handleQuickAdd(slug);
          }}
          disabled={addingSlug === slug || Boolean(cartMerge)}
          className="h-8 px-5 rounded-full bg-action hover:bg-[#d65f1a] text-white font-bold text-xs shadow-xs active:scale-95 transition-transform cursor-pointer relative z-20 disabled:opacity-50"
        >
          {addingSlug === slug ? "Adding..." : "Add +"}
        </button>
        {addErrorSlug === slug ? (
          <span className="max-w-[180px] text-right text-[10px] font-semibold leading-tight text-[#C2410C]">
            {cartQuery.error
              ? describeError(cartQuery.error, "read").message
              : addItem.error
                ? describeError(addItem.error, "mutation").message
                : "Could not add to cart. Try again."}
          </span>
        ) : null}
      </div>
    );
  };

  const activeGuide = activeGuideKey ? SERVICE_GUIDES[activeGuideKey] : null;

  return (
    <div className="flex flex-col gap-12 mt-8 px-4 md:px-0">

      {cartMerge ? (
        <div className="rounded-2xl border border-[#EA580C]/30 bg-[#FFF0E5] px-4 py-3 text-sm text-navy-900">
          Your basket needs a quick merge after sign-in before you can add services.{" "}
          <Link href="/cart" className="font-bold text-action underline underline-offset-2">
            Review cart
          </Link>
        </div>
      ) : null}
      
      {/* 1. Best Sellers Slider */}
      <section className="flex flex-col gap-5">
        <div>
          <h2 className="text-2xl md:text-3xl font-extrabold text-navy-900 tracking-tight">Best Sellers</h2>
          <p className="text-sm md:text-base text-text-secondary mt-1">Popular quick fixes with a fixed starting price</p>
        </div>

        <HomepageServiceRow items={BEST_SELLERS} renderAction={renderItemAction} />
      </section>

      {/* 2. Featured Service Carousel */}
      <HeroSplitCarousel />

      {/* 3. Electrician Slider */}
      <section className="flex flex-col gap-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl md:text-3xl font-extrabold text-navy-900 tracking-tight">Electrician Services</h2>
            <p className="text-sm md:text-base text-text-secondary mt-1 font-medium">Certified electrical installations and diagnostics</p>
          </div>
          <IntentLink
            href="/catalog/electrician"
            className="-my-3.5 inline-flex items-center gap-1 py-3.5 text-xs sm:text-sm font-bold text-[#EA580C] hover:text-[#C2410C] hover:underline shrink-0 whitespace-nowrap transition-colors"
          >
            See all
            <svg viewBox="0 0 20 20" fill="currentColor" className="size-4">
              <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
            </svg>
          </IntentLink>
        </div>

        <HomepageServiceRow items={ELECTRICIAN_SERVICES} renderAction={renderItemAction} />
      </section>

      {/* 4. Service Booking Guides */}
      <section className="flex flex-col gap-5">
        <div>
          <h2 className="text-2xl md:text-3xl font-extrabold text-navy-900 tracking-tight">Service & Booking Guides</h2>
          <p className="text-sm md:text-base text-text-secondary mt-1">Read what is included & how to prepare</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
          {[
            { label: "Electrician Guide", key: "electrician", icon: "⚡", iconBg: "bg-[#FFF0E5] text-[#EA580C]" },
            { label: "Plumbing Guide", key: "plumbing", icon: "💧", iconBg: "bg-[#E0F2FE] text-[#0284C7]" },
            { label: "Carpenter Guide", key: "carpentry", icon: "🪚", iconBg: "bg-[#F3F4F6] text-[#4B5563]" },
          ].map((guide) => (
            <button
              key={guide.key}
              type="button"
              onClick={() => setActiveGuideKey(guide.key)}
              className="flex items-center justify-between p-5 bg-white border border-[#e7e2da] rounded-2xl shadow-2xs hover:border-[#EA580C] hover:shadow-sm transition-all duration-300 text-left cursor-pointer group"
            >
              <div className="flex items-center gap-4">
                <div className={`size-10 rounded-full flex items-center justify-center font-bold text-lg shrink-0 ${guide.iconBg}`}>
                  {guide.icon}
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-extrabold text-navy-900 group-hover:text-action transition-colors">{guide.label}</span>
                  <span className="text-[10px] text-text-secondary mt-0.5 font-semibold">Check inclusions & prep</span>
                </div>
              </div>
              <div className="size-7 rounded-full bg-[#FAF9F7] group-hover:bg-[#FFF0E5] flex items-center justify-center text-text-secondary group-hover:text-action transition-all duration-300">
                <svg viewBox="0 0 20 20" fill="currentColor" className="size-4 transform group-hover:translate-x-0.5 transition-transform">
                  <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                </svg>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* 5. Plumber Slider */}
      <section className="flex flex-col gap-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl md:text-3xl font-extrabold text-navy-900 tracking-tight">Plumbing Services</h2>
            <p className="text-sm md:text-base text-text-secondary mt-1 font-medium">Taps, leakages, and sanitary fixes</p>
          </div>
          <IntentLink
            href="/catalog/plumber"
            className="-my-3.5 inline-flex items-center gap-1 py-3.5 text-xs sm:text-sm font-bold text-[#EA580C] hover:text-[#C2410C] hover:underline shrink-0 whitespace-nowrap transition-colors"
          >
            See all
            <svg viewBox="0 0 20 20" fill="currentColor" className="size-4">
              <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
            </svg>
          </IntentLink>
        </div>

        <HomepageServiceRow items={PLUMBING_SERVICES} renderAction={renderItemAction} />
      </section>

      {/* 6. Carpenter Slider */}
      <section className="flex flex-col gap-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl md:text-3xl font-extrabold text-navy-900 tracking-tight">Carpenter Services</h2>
            <p className="text-sm md:text-base text-text-secondary mt-1 font-medium">Furniture repair, mounts, and fittings</p>
          </div>
          <IntentLink
            href="/catalog/technician"
            className="-my-3.5 inline-flex items-center gap-1 py-3.5 text-xs sm:text-sm font-bold text-[#EA580C] hover:text-[#C2410C] hover:underline shrink-0 whitespace-nowrap transition-colors"
          >
            See all
            <svg viewBox="0 0 20 20" fill="currentColor" className="size-4">
              <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
            </svg>
          </IntentLink>
        </div>

        <HomepageServiceRow items={CARPENTRY_SERVICES} renderAction={renderItemAction} />
      </section>

      {/* 7. Customer Testimonials */}
      <CustomerReviewsMarquee />

      {/* Interactive Guide Dialog Modal */}
      <Dialog
        open={activeGuideKey !== null}
        onOpenChange={(open) => {
          if (!open) setActiveGuideKey(null);
        }}
        title={activeGuide?.title || "Service Guide"}
        description={activeGuide?.category || "Overview & preparation Checklist"}
      >
        {activeGuide && (
          <div className="flex flex-col gap-5 py-2">
            
            {/* Checklist of what's included */}
            <div className="flex flex-col gap-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-navy-900">What is included:</h4>
              <ul className="flex flex-col gap-2 pl-1">
                {activeGuide.included.map((item, index) => (
                  <li key={index} className="flex gap-2 items-start text-xs text-text-secondary leading-relaxed">
                    <span className="text-action shrink-0 mt-0.5">✓</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Typical Duration */}
            <div className="flex items-center justify-between text-xs border-t border-line/60 pt-3">
              <span className="font-extrabold text-navy-900">Estimated Duration:</span>
              <span className="font-medium text-text-secondary bg-[#FAF9F7] px-2.5 py-1 rounded-md border border-[#e7e2da]">{activeGuide.duration}</span>
            </div>

            {/* Pricing Policy */}
            <div className="flex flex-col gap-1 border-t border-line/60 pt-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-navy-900">Pricing Policy:</h4>
              <p className="text-xs text-text-secondary leading-relaxed">
                {activeGuide.pricing}
              </p>
            </div>

            {/* Preparation Expectations */}
            <div className="flex flex-col gap-1 border-t border-line/60 pt-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-navy-900">How to Prepare:</h4>
              <p className="text-xs text-text-secondary leading-relaxed">
                {activeGuide.expectations}
              </p>
            </div>

            {/* Book Now Action button */}
            <button
              type="button"
              onClick={() => {
                setActiveGuideKey(null);
                router.push(`/catalog/technician`);
              }}
              className="mt-3 w-full bg-[#EA580C] hover:bg-[#C2410C] text-white font-bold py-3 rounded-xl text-sm transition-colors cursor-pointer"
            >
              Explore and Book Services
            </button>
          </div>
        )}
      </Dialog>

      {/* Variant picker for multi-option services */}
      <Dialog
        open={variantPicker !== null}
        onOpenChange={(open) => {
          if (!open) setVariantPicker(null);
        }}
        title={variantPicker?.serviceName ?? "Choose an option"}
        description="Pick the option that matches your job before adding to cart."
      >
        {variantPicker ? (
          <ul className="flex flex-col gap-3 py-2">
            {variantPicker.variants.map((variant) => (
              <li
                key={variant.id}
                className="flex items-center justify-between gap-4 rounded-xl border border-[#e7e2da] bg-white p-4"
              >
                <div className="min-w-0">
                  <p className="font-bold text-sm text-navy-900">{variant.name}</p>
                  <p className="mt-1 text-sm font-black text-navy-900">
                    {formatMoney(variant.pricePaise)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => addVariantToCart(variant.id, () => setVariantPicker(null))}
                  disabled={addItem.isPending || Boolean(cartMerge)}
                  className="h-8 shrink-0 px-5 rounded-full bg-action hover:bg-[#d65f1a] text-white font-bold text-xs shadow-xs active:scale-95 transition-transform cursor-pointer disabled:opacity-50"
                >
                  Add +
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </Dialog>

    </div>
  );
}
