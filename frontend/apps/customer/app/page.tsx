import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { EmptyState } from "@vsolve/ui";

import {
  CategoryCard,
} from "@/features/catalog/components/category-card";
import { getCategories } from "@/features/catalog/queries";
import { HomepageClientSections } from "@/features/catalog/components/homepage-client-sections";

export const metadata: Metadata = {
  title: "V Solve Hub — Book a verified technician",
  description:
    "Book home services with a real, eligible professional. See the price before you book, and pay only once someone has committed to the job.",
  alternates: { canonical: "/" },
};

export const revalidate = 300;

const APPROACH = [
  {
    title: "1. Request",
    body: "Detail your needs through our intuitive platform. We analyze the scope instantly.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="size-5" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M15.042 21.672 13.684 16.6m0 0-2.51 2.225.569-9.47 5.227 7.917-3.286-.672ZM12 2.25V4.5m5.834.166-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m4.007-5.834L6.166 3.075m11.226 10.155a5.25 5.25 0 0 1-5.756 8.356L12 21v-4.5Z" />
      </svg>
    ),
  },
  {
    title: "2. Match",
    body: "We pair you with a top-tier, rigorously vetted professional suited for your specific task.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="size-5" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 12.75 11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 0 1-1.043 3.296 3.745 3.745 0 0 1-3.296 1.043A3.745 3.745 0 0 1 12 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 0 1-3.296-1.043 3.745 3.745 0 0 1-1.043-3.296A3.745 3.745 0 0 1 3 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 0 1 1.043-3.296 3.746 3.746 0 0 1 3.296-1.043A3.746 3.746 0 0 1 12 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 0 1 3.296 1.043 3.746 3.746 0 0 1 1.043 3.296A3.745 3.745 0 0 1 21 12Z" />
      </svg>
    ),
  },
  {
    title: "3. Resolve",
    body: "The job is completed to our exacting standards, with seamless cashless payment.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="size-5" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M4.5 12.75l6 6 9-13.5" />
      </svg>
    ),
  },
] as const;

function CategoryGridSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {Array.from({ length: 4 }, (_, index) => {
        const spanClasses =
          index === 0
            ? "md:col-span-2 md:row-span-2 min-h-[24rem]"
            : index === 3
              ? "md:col-span-3 min-h-[10rem]"
              : "md:col-span-1 min-h-[10rem]";
        return (
          <div
            key={index}
            className={`rounded-card bg-surface-sunken animate-pulse ${spanClasses}`}
          />
        );
      })}
    </div>
  );
}

/**
 * Every published category, from the API (2026-08-26). The previous grid
 * hardcoded three trades — names, Unsplash URLs and copy inline — so nothing
 * new could ever surface on home without a code change. Now the first category
 * is the featured photo card and the rest follow, each on its own published
 * `image_url` with the bordered card as the fallback for a category without a
 * photo yet.
 */
async function CategoryGrid() {
  const categories = await getCategories();

  if (categories.length === 0) {
    return (
      <EmptyState
        title="No services are published yet"
        description="Our catalogue is being set up. Please check back shortly."
      />
    );
  }

  const [featured, ...rest] = categories;

  return (
    <>
      {/* Desktop: one featured photo card, then the rest of the catalogue. */}
      <div className="hidden md:grid grid-cols-3 gap-6">
        {featured ? (
          <Link
            href={`/catalog/${featured.slug}`}
            className="col-span-2 row-span-2 min-h-[24rem] rounded-card overflow-hidden relative group shadow-xl hover:shadow-2xl flex flex-col focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
          >
            {featured.image_url !== "" ? (
              <div
                className="absolute inset-0 bg-cover bg-center group-hover:scale-105 transition-transform duration-700 ease-out"
                style={{ backgroundImage: `url('${featured.image_url}')` }}
              />
            ) : (
              <div className="absolute inset-0 bg-navy-900" />
            )}
            <div className="absolute inset-0 bg-navy-900/60 mix-blend-multiply" />
            <div className="absolute inset-0 bg-gradient-to-t from-navy-900/90 via-navy-900/50 to-navy-900/30" />
            <div className="relative flex flex-col p-10 h-full justify-start">
              <h3 className="text-[1.75rem] font-bold text-white mb-3">{featured.name}</h3>
              <p className="text-base leading-relaxed text-white/80 max-w-md">
                {featured.description}
              </p>
            </div>
          </Link>
        ) : null}
        {rest.map((category) =>
          category.image_url !== "" ? (
            <Link
              key={category.id}
              href={`/catalog/${category.slug}`}
              className="relative min-h-[10rem] rounded-card overflow-hidden group shadow-sm hover:shadow-md transition-shadow flex flex-col justify-end p-5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
            >
              <div
                className="absolute inset-0 bg-cover bg-center group-hover:scale-105 transition-transform duration-700 ease-out"
                style={{ backgroundImage: `url('${category.image_url}')` }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-navy-900/85 via-navy-900/40 to-transparent" />
              <div className="relative z-10">
                <h3 className="text-white font-bold text-[1.1rem]">{category.name}</h3>
                <p className="mt-1 line-clamp-2 text-[0.8rem] leading-relaxed text-white/80">
                  {category.description}
                </p>
              </div>
            </Link>
          ) : (
            <CategoryCard
              key={category.id}
              href={`/catalog/${category.slug}`}
              name={category.name}
              description={category.description}
              titleAs="h3"
              variant="standard"
            />
          ),
        )}
      </div>

      {/* Mobile: the whole catalogue as photo tiles, three across. */}
      <ul className="grid md:hidden list-none grid-cols-3 gap-3 p-0">
        {categories.map((category) => (
          <li key={category.id} className="min-w-0">
            <Link
              href={`/catalog/${category.slug}`}
              className="flex flex-col items-center gap-2 rounded-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
            >
              {category.image_url !== "" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={category.image_url}
                  alt=""
                  loading="lazy"
                  className="aspect-square w-full rounded-[1.25rem] bg-surface-sunken object-cover shadow-xs"
                />
              ) : (
                <span
                  aria-hidden
                  className="grid aspect-square w-full place-items-center rounded-[1.25rem] bg-navy-50 text-navy-700 shadow-xs"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-6"
                  >
                    <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  </svg>
                </span>
              )}
              <span className="line-clamp-2 w-full text-center text-[11px] font-bold leading-tight text-[#00112e]">
                {category.name}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

export default async function HomePage() {
  await connection();
  // The whole published catalogue, unfiltered (2026-08-26): the old page kept a
  // three-slug allowlist here, so no new category could ever reach the home
  // screen without a code change.
  const categories = await getCategories();

  return (
    <main className="bg-[#FAF9F7] md:bg-transparent min-h-screen pb-20 md:pb-0 overflow-x-hidden">
      <div className="mx-auto max-w-[1216px] md:pt-8 px-4 sm:px-6 lg:px-0">
        
        {/* ---------------------------------------------------- */}
        {/* DESKTOP LAYOUT (100% UNTOUCHED & PRESERVED)          */}
        {/* ---------------------------------------------------- */}
        <div className="hidden md:block">
          {/* Hero Section */}
          <section className="relative min-h-[90vh] md:min-h-[500px] w-full -mt-[4.5rem] md:mt-4 flex items-center md:block">
            {/* Floating Vetted Badge */}
            <div className="absolute -top-4 right-[10%] z-10 hidden md:flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-sm font-bold text-navy-900 shadow-sm">
              <span className="flex size-5 items-center justify-center rounded-full bg-[#fdf3ec] text-action">
                <svg viewBox="0 0 20 20" fill="currentColor" className="size-3.5">
                  <path fillRule="evenodd" d="M16.403 12.652a3 3 0 0 0 0-5.304 3 3 0 0 0-3.75-3.751 3 3 0 0 0-5.305 0 3 3 0 0 0-3.751 3.75 3 3 0 0 0 0 5.305 3 3 0 0 0 3.75 3.751 3 3 0 0 0 5.305 0 3 3 0 0 0 3.751-3.75Zm-2.546-4.46a.75.75 0 0 0-1.214-.883l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" />
                </svg>
              </span>
              100% Vetted Pros
            </div>

            {/* Main Hero Container */}
            <div className="w-full relative h-full flex flex-col md:block">
              
              {/* Left Content */}
              <div className="md:absolute md:left-0 md:top-[10%] md:w-[480px] z-10 relative mt-0 mx-4 md:mx-0 flex flex-col justify-center h-full pt-[4.5rem] md:pt-0">
                <div className="rounded-none md:rounded-card bg-transparent md:bg-navy-900 p-0 md:p-10 shadow-none md:shadow-2xl relative">
                  <h1 className="text-[2.75rem] md:text-[2.75rem] md:font-sans font-extrabold leading-[1.1] text-white tracking-tight">
                    Your Home,<br /><span className="text-[#FFAE7B] md:text-action italic md:not-italic">Masterfully</span><br className="md:hidden"/> Handled.
                  </h1>
                  <p className="mt-4 md:mt-6 text-[0.95rem] md:text-[1.05rem] leading-relaxed text-white/80 font-light md:font-normal">
                    Bespoke professional services for the modern homeowner. Elite, vetted specialists for every domestic need.
                  </p>
                  <div className="mt-6 md:mt-8 pb-4 md:pb-0 hidden md:block">
                    <Link
                      href="/catalog"
                      className="inline-flex min-h-12 items-center gap-2 rounded-full bg-action px-6 md:px-8 text-[0.95rem] font-bold text-white shadow-sm transition-transform hover:scale-105"
                    >
                      Explore Services
                      <svg viewBox="0 0 20 20" fill="none" className="size-4" aria-hidden="true">
                        <path d="M4 10h11m-4-4 4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </Link>
                  </div>


                </div>
              </div>

              {/* Right Image */}
              <div className="absolute inset-0 md:static md:h-[550px] w-full md:w-3/4 md:ml-auto md:rounded-card overflow-hidden bg-navy-100 md:shadow-inner">
                <div className="w-full h-full bg-[url('https://images.unsplash.com/photo-1581578731548-c64695cc6952?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center md:bg-top" />
              </div>
            </div>
          </section>

          {/* The V Solve Approach Section */}
          <section aria-labelledby="approach-heading" className="mt-20 mb-6 text-center max-w-4xl mx-auto">
            <h2 id="approach-heading" className="text-[2.25rem] md:text-[2.75rem] font-extrabold tracking-tight text-navy-900">
              The V Solve Approach
            </h2>
            <p className="mt-3 text-[1.05rem] text-text-secondary font-normal">
              A seamless, curated process designed to deliver excellence without friction.
            </p>
            
            <div className="mt-16 relative w-full px-0">
              {/* Dashed connecting line for desktop */}
              <div className="absolute top-8 left-[15%] right-[15%] h-px border-t-2 border-dashed border-[#F3E7D3]" />
              
              <ul className="grid grid-cols-3 gap-8 overflow-visible">
                {APPROACH.map((step) => (
                  <li key={step.title} className="relative flex flex-col items-center text-center bg-transparent p-0 rounded-none shadow-none border-transparent">
                    <div className="z-10 flex size-16 items-center justify-center rounded-full bg-navy-900 text-white shadow-sm mb-8 shrink-0">
                      {step.icon}
                    </div>
                    <h3 className="text-lg font-bold text-navy-900">{step.title}</h3>
                    <p className="mt-3 text-sm text-text-secondary leading-relaxed font-normal max-w-xs text-center">
                      {step.body}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* Curated Services Section */}
          <section aria-labelledby="categories-heading" className="mt-36 pb-12 bg-transparent rounded-none px-0">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-6 mb-8 md:mb-8">
              <div>
                <h2 id="categories-heading" className="text-[2.25rem] md:text-[2.75rem] font-extrabold tracking-tight text-navy-900">
                  Curated Services
                </h2>
                <p className="mt-2 text-[1.05rem] text-text-secondary font-normal">
                  Expertise across every domain of your property.
                </p>
              </div>
              <Link
                href="/catalog"
                className="hidden sm:inline-flex min-h-11 shrink-0 items-center self-start text-sm font-bold text-[#b46535] hover:text-action transition-colors"
              >
                View All Categories
                <svg viewBox="0 0 20 20" fill="none" className="size-4 ml-1" aria-hidden="true">
                  <path d="M4 10h11m-4-4 4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
            </div>
            <Suspense fallback={<CategoryGridSkeleton />}>
              <CategoryGrid />
            </Suspense>
          </section>

          {/* Additional Rich Sections (Best Sellers, Wellness Sliders, Promo Banners, Booking Guides) */}
          <div className="mt-20">
            <HomepageClientSections />
          </div>
        </div>

        {/* ---------------------------------------------------- */}
        {/* MOBILE LAYOUT (NEW PREMIUM REDESIGN MATCHING MOCKUP) */}
        {/* ---------------------------------------------------- */}
        <div className="block md:hidden flex flex-col gap-6 px-4">
          {/* Search Input */}
          <div className="relative w-full">
            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-text-secondary">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="size-4 opacity-60">
                <circle cx="9" cy="9" r="6" />
                <path d="m20 20-4.5-4.5" />
              </svg>
            </div>
            <input
              type="text"
              placeholder="Search for a service..."
              className="w-full bg-[#f4f1ec] border-0 rounded-xl py-3.5 pl-11 pr-4 text-sm text-navy-900 placeholder:text-text-secondary/70 focus:outline-none focus:ring-2 focus:ring-focus-ring/25 font-medium shadow-2xs"
            />
          </div>

          {/* Hero Banner Card */}
          <div className="relative min-h-[200px] rounded-[1.5rem] overflow-hidden shadow-md">
            <div 
              className="absolute inset-0 bg-cover bg-center" 
              style={{ backgroundImage: `url('https://images.unsplash.com/photo-1581578731548-c64695cc6952?q=80&w=2070&auto=format&fit=crop')` }}
            />
            <div className="absolute inset-0 bg-gradient-to-r from-navy-900/90 via-navy-900/50 to-transparent" />
            
            <div className="relative z-10 flex flex-col justify-between p-5 h-full min-h-[200px] max-w-[80%]">
              <div className="self-start bg-[#f87000] text-white text-[9px] font-extrabold px-3 py-1 rounded-full uppercase tracking-wider">
                Premium Quality
              </div>
              <div className="mt-auto">
                <h2 className="text-white font-extrabold text-[1.65rem] leading-tight tracking-tight">
                  Elite Home Services, at Your Doorstep
                </h2>
              </div>
            </div>
          </div>

          {/* Our Services Section */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-extrabold text-[#00112e]">Our Services</h2>
              <Link href="/catalog" className="text-sm font-bold text-[#f87000] hover:text-[#fb8130] transition-colors">
                See All
              </Link>
            </div>
            <ul className="grid list-none grid-cols-3 gap-3 p-0">
              {categories.map((category) => (
                <li key={category.id} className="min-w-0">
                  <Link
                    href={`/catalog/${category.slug}`}
                    className="flex flex-col items-center gap-2 rounded-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
                  >
                    {category.image_url !== "" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={category.image_url}
                        alt=""
                        loading="lazy"
                        className="aspect-square w-full rounded-[1.25rem] bg-surface-sunken object-cover shadow-xs"
                      />
                    ) : (
                      <span
                        aria-hidden
                        className="grid aspect-square w-full place-items-center rounded-[1.25rem] bg-navy-50 text-navy-700 shadow-xs"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="size-6"
                        >
                          <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                        </svg>
                      </span>
                    )}
                    <span className="line-clamp-2 w-full text-center text-[11px] font-bold leading-tight text-[#00112e]">
                      {category.name}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Interactive sliders, guides, and diagnostic grids */}
          <HomepageClientSections />

          {/* The V Solve Way */}
          <div className="bg-[#f4f1ec] rounded-[1.5rem] p-6 shadow-2xs border border-[#e7e2da]/30">
            <h2 className="text-center text-xl font-extrabold text-[#00112e] mb-6">
              The V Solve Way
            </h2>
            <div className="relative flex flex-col gap-6 pl-2">
              {/* Vertical Connecting Line */}
              <div className="absolute left-[30px] top-6 bottom-6 w-[2px] bg-navy-900/10" />
              
              {/* Step 1 */}
              <div className="flex gap-4 items-start relative z-10">
                <div className="flex size-11 items-center justify-center rounded-full bg-[#00112e] text-white shadow-xs shrink-0">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-5">
                    <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                    <line x1="12" y1="18" x2="12" y2="18.01" />
                  </svg>
                </div>
                <div className="flex-1 pt-1">
                  <h3 className="font-extrabold text-[#00112e] text-sm">1. Book a Service</h3>
                  <p className="text-[11px] text-text-secondary mt-0.5 font-semibold leading-relaxed">
                    Select your required service and preferred time slot easily.
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex gap-4 items-start relative z-10">
                <div className="flex size-11 items-center justify-center rounded-full bg-[#00112e] text-white shadow-xs shrink-0">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-5">
                    <rect x="3" y="4" width="18" height="16" rx="2" />
                    <path d="m9 12 2 2 4-4" />
                  </svg>
                </div>
                <div className="flex-1 pt-1">
                  <h3 className="font-extrabold text-[#00112e] text-sm">2. Get Matched</h3>
                  <p className="text-[11px] text-text-secondary mt-0.5 font-semibold leading-relaxed">
                    We assign a highly trained, background-checked professional.
                  </p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="flex gap-4 items-start relative z-10">
                <div className="flex size-11 items-center justify-center rounded-full bg-[#f87000] text-white shadow-xs shrink-0">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-5">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                    <polyline points="9 22 9 12 15 12 15 22" />
                  </svg>
                </div>
                <div className="flex-1 pt-1">
                  <h3 className="font-extrabold text-[#00112e] text-sm">3. Service at Home</h3>
                  <p className="text-[11px] text-text-secondary mt-0.5 font-semibold leading-relaxed">
                    Sit back and relax while our expert completes the job.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Why V Solve Hub? */}
          <div className="flex flex-col gap-4">
            <h2 className="text-xl font-extrabold text-[#00112e]">
              Why V Solve Hub?
            </h2>
            
            {/* Quality Assurance Card */}
            <div className="bg-white border border-[#e7e2da]/40 rounded-[1.25rem] p-4 flex items-center gap-4 shadow-card hover:shadow-md transition-shadow">
              <div className="flex size-12 items-center justify-center rounded-full bg-[#00112e] text-white shrink-0 shadow-xs">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-5">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <path d="m9 11 2 2 4-4" />
                </svg>
              </div>
              <div>
                <h3 className="font-extrabold text-[#00112e] text-sm">100% Quality Assurance</h3>
                <p className="text-xs text-text-secondary mt-0.5 font-semibold">
                  Guaranteed satisfaction on every job.
                </p>
              </div>
            </div>

            {/* Expert Training Card */}
            <div className="bg-white border border-[#e7e2da]/40 rounded-[1.25rem] p-4 flex items-center gap-4 shadow-card hover:shadow-md transition-shadow">
              <div className="flex size-12 items-center justify-center rounded-full bg-[#00112e] text-white shrink-0 shadow-xs">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-5">
                  <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                  <path d="M6 12v5c0 2 2 3 6 3s6-1 6-3v-5" />
                </svg>
              </div>
              <div>
                <h3 className="font-extrabold text-[#00112e] text-sm">Expert Training</h3>
                <p className="text-xs text-text-secondary mt-0.5 font-semibold">
                  Professionals vetted and trained to elite standards.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
