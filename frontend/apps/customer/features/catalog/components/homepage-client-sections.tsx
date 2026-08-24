"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, formatMoney } from "@vsolve/ui";
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
    image: "https://images.unsplash.com/photo-1558002038-1055907df827?q=80&w=1200&auto=format&fit=crop",
    desc: "Assembly, mounting and wiring of a new ceiling or wall fan.",
  },
  {
    name: "Cupboard Hinge Repair",
    price: 299,
    slug: "cupboard-hinge-repair",
    categorySlug: "technician",
    image: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?q=80&w=1200&auto=format&fit=crop",
    desc: "Meticulous cabinet hinge replacement and slide channel alignment.",
  },
  {
    name: "Plug Point Fixing",
    price: 99,
    slug: "electrician-plug-point-fixing",
    categorySlug: "electrician",
    image: "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?q=80&w=1200&auto=format&fit=crop",
    desc: "Secure loose sockets and restore safe power to your plug points.",
  },
  {
    name: "Tap Replacement",
    price: 199,
    slug: "plumber-tap-replacement",
    categorySlug: "plumber",
    image: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?q=80&w=1200&auto=format&fit=crop",
    desc: "Swap worn taps with a new fixture and leak-free connections.",
  },
];

const ELECTRICIAN_SERVICES = [
  {
    name: "Fan Installation",
    price: 249,
    slug: "fan-installation",
    categorySlug: "electrician",
    image: "https://images.unsplash.com/photo-1558002038-1055907df827?q=80&w=1200&auto=format&fit=crop",
    desc: "Assembly, mounting and wiring of a new ceiling or wall fan.",
  },
  {
    name: "Exhaust Fan Installation",
    price: 149,
    slug: "electrician-exhaust-fan-installation",
    categorySlug: "electrician",
    image: "https://images.unsplash.com/photo-1565814329452-e1efa11c5b89?q=80&w=1200&auto=format&fit=crop",
    desc: "Kitchen and bathroom exhaust fan mounting with proper ducting.",
  },
  {
    name: "Door Bell Installation",
    price: 99,
    slug: "electrician-door-bell-installation",
    categorySlug: "electrician",
    image: "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?q=80&w=1200&auto=format&fit=crop",
    desc: "Wireless or wired doorbell setup with chime alignment and testing.",
  },
  {
    name: "DB Board Repair",
    price: 299,
    slug: "electrician-db-board-repair",
    categorySlug: "electrician",
    image: "https://images.unsplash.com/photo-1621905252507-b35492cc74b4?q=80&w=1200&auto=format&fit=crop",
    desc: "Distribution board fault tracing, breaker checks, and safe repairs.",
  },
];

const PLUMBING_SERVICES = [
  {
    name: "Tap Replacement",
    price: 199,
    slug: "plumber-tap-replacement",
    categorySlug: "plumber",
    image: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?q=80&w=1200&auto=format&fit=crop",
    desc: "Swap worn taps with a new fixture and leak-free connections.",
  },
  {
    name: "Shower Repair",
    price: 149,
    slug: "plumber-shower-repair",
    categorySlug: "plumber",
    image: "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?q=80&w=1200&auto=format&fit=crop",
    desc: "Fix dripping showers, weak flow, and mixer cartridge issues.",
  },
  {
    name: "Pipe Leakage Fix",
    price: 149,
    slug: "plumber-pipe-leakage-fix",
    categorySlug: "plumber",
    image: "https://images.unsplash.com/photo-1607472586893-edb57bdc0e39?q=80&w=1200&auto=format&fit=crop",
    desc: "Trace and seal leaking pipe joints under sinks, walls, or ceilings.",
  },
  {
    name: "Pipe Joint Repair",
    price: 149,
    slug: "plumber-pipe-joint-repair",
    categorySlug: "plumber",
    image: "https://images.unsplash.com/photo-1585704032915-c3400ca276ec?q=80&w=1200&auto=format&fit=crop",
    desc: "Reseal leaking joints under sinks, washbasins, and exposed piping.",
  },
];

const CARPENTRY_SERVICES = [
  {
    name: "Cupboard Hinge Repair",
    price: 299,
    slug: "cupboard-hinge-repair",
    categorySlug: "technician",
    image: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?q=80&w=1200&auto=format&fit=crop",
    desc: "Meticulous cabinet hinge replacement and slide channel alignment.",
  },
  {
    name: "Door Repair",
    price: 199,
    slug: "carpenter-door-repair",
    categorySlug: "technician",
    image: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?q=80&w=1200&auto=format&fit=crop",
    desc: "Fix sticking doors, misaligned frames, and damaged hinges or latches.",
  },
  {
    name: "Lock Fitting",
    price: 149,
    slug: "carpenter-lock-fitting",
    categorySlug: "technician",
    image: "https://images.unsplash.com/photo-1558002038-1055907df827?q=80&w=1200&auto=format&fit=crop",
    desc: "Install or replace door locks, latches, and security hardware.",
  },
  {
    name: "Shelf Installation",
    price: 199,
    slug: "carpenter-shelf-installation",
    categorySlug: "technician",
    image: "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?q=80&w=1200&auto=format&fit=crop",
    desc: "Wall-mounted shelf fitting with level alignment and secure anchoring.",
  },
];

type HomepageServiceItem = {
  name: string;
  price: number;
  slug: string;
  categorySlug: string;
  image: string;
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

function HomepageServiceCard({
  item,
  renderAction,
}: {
  item: HomepageServiceItem;
  renderAction: (slug: string) => ReactNode;
}) {
  const href = homepageServiceHref(item);

  return (
    <div className="group flex w-[280px] shrink-0 flex-col overflow-hidden rounded-2xl border border-[#e7e2da] bg-white shadow-xs transition-shadow hover:shadow-md md:w-full">
      <Link href={href} className="block overflow-hidden">
        <div
          className="h-36 bg-cover bg-center animate-fade-in transition-transform duration-500 group-hover:scale-105"
          style={{ backgroundImage: `url('${item.image}')` }}
        />
      </Link>
      <div className="flex flex-1 flex-col justify-between gap-4 p-4">
        <Link href={href} className="flex cursor-pointer flex-col gap-1.5">
          <h3 className="font-extrabold text-base text-navy-900 transition-colors group-hover:text-action">
            {item.name}
          </h3>
          <p className="text-xs text-text-secondary line-clamp-2 leading-relaxed">{item.desc}</p>
        </Link>
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

interface PromoSlide {
  title: string;
  subtitle: string;
  buttonText: string;
  link: string;
  image: string;
  bgClass: string;
  btnBg: string;
}

const CAROUSEL_SLIDES: PromoSlide[] = [
  {
    title: "Electrical Safety",
    subtitle: "Ensure your home wiring is safe. Book modular switchboard repairs and switch safety audits starting at ₹129.",
    buttonText: "Know more",
    link: "/catalog/electrician",
    image: "https://images.unsplash.com/photo-1621905252507-b35492cc74b4?q=80&w=1200&auto=format&fit=crop",
    bgClass: "bg-[#FFF9F5]",
    btnBg: "bg-[#EA580C] hover:bg-[#C2410C] text-white",
  },
  {
    title: "Plumbing Upgrades",
    subtitle: "Trace hidden pipeline leaks and install premium, drip-free bathroom mixers starting at ₹199.",
    buttonText: "Know more",
    link: "/catalog/plumber",
    image: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?q=80&w=1200&auto=format&fit=crop",
    bgClass: "bg-[#F0F7FF]",
    btnBg: "bg-[#0284C7] hover:bg-[#0369a1] text-white",
  },
  {
    title: "Carpentry Fitting",
    subtitle: "Fix loose cabinet shutters, align squeaking door hinges, or mount floating wall shelves starting at ₹299.",
    buttonText: "Know more",
    link: "/catalog/technician",
    image: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?q=80&w=1200&auto=format&fit=crop",
    bgClass: "bg-[#FEFDF0]",
    btnBg: "bg-[#D97706] hover:bg-[#B45309] text-white",
  },
];

export function HeroSplitCarousel() {
  const [currentIdx, setCurrentIdx] = useState(0);
  const router = useRouter();

  const handleNext = () => {
    setCurrentIdx((prev) => (prev + 1) % CAROUSEL_SLIDES.length);
  };

  const handlePrev = () => {
    setCurrentIdx((prev) => (prev - 1 + CAROUSEL_SLIDES.length) % CAROUSEL_SLIDES.length);
  };

  const slide = CAROUSEL_SLIDES[currentIdx];

  return (
    <section className="relative w-full rounded-3xl overflow-hidden border border-[#e7e2da]/40 shadow-sm transition-all duration-300">
      <div className={`flex flex-col md:flex-row min-h-[300px] md:h-[280px] transition-colors duration-500 ${slide.bgClass}`}>
        
        {/* Left Content column */}
        <div className="flex-1 flex flex-col justify-between p-8 md:p-10 z-10">
          <div className="flex flex-col gap-2">
            <span className="text-[9px] uppercase tracking-widest font-black text-text-secondary/70">Featured Service</span>
            <h2 className="text-3xl font-extrabold text-navy-900 leading-tight">
              {slide.title}
            </h2>
            <p className="text-xs md:text-sm text-text-secondary max-w-sm font-medium leading-relaxed mt-1">
              {slide.subtitle}
            </p>
          </div>
          
          <button
            type="button"
            onClick={() => router.push(slide.link)}
            className={`self-start mt-6 px-6 py-2 rounded-xl font-bold text-xs shadow-2xs active:scale-95 transition-all duration-300 cursor-pointer ${slide.btnBg}`}
          >
            {slide.buttonText}
          </button>
        </div>

        {/* Right Image column */}
        <div className="relative w-full md:w-[50%] h-[180px] md:h-full shrink-0 overflow-hidden">
          <div
            className="absolute inset-0 bg-cover bg-center transition-all duration-500 scale-100"
            style={{ backgroundImage: `url('${slide.image}')` }}
          />
        </div>

      </div>

      {/* Navigation Buttons */}
      <button
        onClick={handlePrev}
        className="absolute left-4 top-1/2 -translate-y-1/2 size-8.5 rounded-full bg-white/90 hover:bg-white border border-[#e7e2da]/40 flex items-center justify-center text-navy-900 shadow-sm transition-all cursor-pointer z-20"
        aria-label="Previous slide"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="size-4 rotate-180">
          <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
        </svg>
      </button>
      <button
        onClick={handleNext}
        className="absolute right-4 top-1/2 -translate-y-1/2 size-8.5 rounded-full bg-white/90 hover:bg-white border border-[#e7e2da]/40 flex items-center justify-center text-navy-900 shadow-sm transition-all cursor-pointer z-20"
        aria-label="Next slide"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="size-4">
          <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
        </svg>
      </button>

      {/* Dot Indicators */}
      <div className="absolute bottom-4 left-8 flex gap-1.5 z-20">
        {CAROUSEL_SLIDES.map((_, idx) => (
          <button
            key={idx}
            onClick={() => setCurrentIdx(idx)}
            className={`size-1.5 rounded-full transition-all duration-300 ${
              idx === currentIdx ? "w-5 bg-navy-900" : "bg-navy-900/30"
            }`}
            aria-label={`Go to slide ${idx + 1}`}
          />
        ))}
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
      className="relative left-1/2 w-screen max-w-[100vw] -translate-x-1/2 overflow-hidden pb-12 md:pb-16"
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
    const cart = cartQuery.data;
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
          <p className="text-sm md:text-base text-text-secondary mt-1">Most booked services in your city</p>
        </div>

        <HomepageServiceRow items={BEST_SELLERS} renderAction={renderItemAction} />
      </section>

      {/* 2. Featured Service Carousel */}
      <HeroSplitCarousel />

      {/* 3. Electrician Slider */}
      <section className="flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl md:text-3xl font-extrabold text-navy-900 tracking-tight">Electrician Services</h2>
            <p className="text-sm md:text-base text-text-secondary mt-1 font-medium">Certified electrical installations and diagnostics</p>
          </div>
          <button
            type="button"
            onClick={() => router.push("/catalog/electrician")}
            className="px-4 py-1.5 rounded-full border border-[#EA580C] text-[#EA580C] hover:bg-[#EA580C]/5 text-xs font-black transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
          >
            See all
            <svg viewBox="0 0 20 20" fill="currentColor" className="size-3">
              <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
            </svg>
          </button>
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
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl md:text-3xl font-extrabold text-navy-900 tracking-tight">Plumbing Services</h2>
            <p className="text-sm md:text-base text-text-secondary mt-1 font-medium">Taps, leakages, and sanitary fixes</p>
          </div>
          <button
            type="button"
            onClick={() => router.push("/catalog/plumber")}
            className="px-4 py-1.5 rounded-full border border-[#EA580C] text-[#EA580C] hover:bg-[#EA580C]/5 text-xs font-black transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
          >
            See all
            <svg viewBox="0 0 20 20" fill="currentColor" className="size-3">
              <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        <HomepageServiceRow items={PLUMBING_SERVICES} renderAction={renderItemAction} />
      </section>

      {/* 6. Carpenter Slider */}
      <section className="flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl md:text-3xl font-extrabold text-navy-900 tracking-tight">Carpenter Services</h2>
            <p className="text-sm md:text-base text-text-secondary mt-1 font-medium">Furniture repair, mounts, and fittings</p>
          </div>
          <button
            type="button"
            onClick={() => router.push("/catalog/technician")}
            className="px-4 py-1.5 rounded-full border border-[#EA580C] text-[#EA580C] hover:bg-[#EA580C]/5 text-xs font-black transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
          >
            See all
            <svg viewBox="0 0 20 20" fill="currentColor" className="size-3">
              <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
            </svg>
          </button>
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
