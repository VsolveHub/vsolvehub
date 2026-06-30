import type { IconName } from "@/components/ui/ServiceIcons";

export type QuickService = {
  id: string;
  label: string;
  icon: IconName;
  color: string;
  href: string;
};

/** Top-level categories — single home row (6 tiles). */
export const QUICK_SERVICES: QuickService[] = [
  { id: "cleaning", label: "Cleaning", icon: "broom", color: "#059669", href: "/services?q=cleaning" },
  { id: "plumbing", label: "Plumbing", icon: "faucet", color: "#2563eb", href: "/services/home-services/plumbing-services" },
  { id: "electrician", label: "Electrician", icon: "bolt", color: "#d97706", href: "/services/home-services/electrician" },
  { id: "ride", label: "Book a Ride", icon: "scooter", color: "#ea580c", href: "/vehicle/ride" },
  { id: "beauty", label: "Salon/Beauty", icon: "beauty", color: "#db2777", href: "/services/beauty-wellness" },
  { id: "all", label: "More", icon: "grid-menu", color: "#7c3aed", href: "/services" },
];

export type TrendingSearch = {
  label: string;
  href: string;
};

/** Specific high-intent searches + categories not in the quick row. */
export const TRENDING_SEARCHES: TrendingSearch[] = [
  { label: "AC repair", href: "/services?q=ac" },
  { label: "House cleaning", href: "/services?q=cleaning" },
  { label: "Electrician", href: "/services?q=electrical" },
  { label: "Plumber", href: "/services?q=plumbing" },
  { label: "Car repair", href: "/vehicle/repair" },
  { label: "Event decor", href: "/services?q=decor" },
  { label: "Rentals", href: "/services?category=rental-services" },
  { label: "Stay", href: "/services?category=accommodation-services" },
  { label: "Jobs", href: "/services?category=job-opportunities" },
  { label: "Manpower", href: "/services?category=manpower-support-staff" },
];

export const PROMO_CARDS = [
  {
    id: "home",
    title: "Home Services On Demand",
    cta: "Book Now",
    bg: "#ede9fe",
    btnColor: "#6d28d9",
    icon: "house" as IconName,
    href: "/services?category=home-services",
  },
  {
    id: "construction",
    title: "Skilled Construction Crew",
    cta: "Hire Labour",
    bg: "#fef9c3",
    btnColor: "#ca8a04",
    icon: "hard-hat" as IconName,
    href: "/services?category=construction-services",
  },
  {
    id: "events",
    title: "Plan Your Perfect Event",
    cta: "Explore",
    bg: "#dcfce7",
    btnColor: "#16a34a",
    icon: "calendar-star" as IconName,
    href: "/services?category=event-media-services",
  },
  {
    id: "beauty",
    title: "Beauty & Wellness At Home",
    cta: "Book Now",
    bg: "#fce7f3",
    btnColor: "#db2777",
    icon: "beauty" as IconName,
    href: "/services?category=beauty-wellness",
  },
];

export const WHY_CHOOSE: { icon: IconName; label: string; color: string }[] = [
  { icon: "shield", label: "Verified\nProfessionals", color: "#16a34a" },
  { icon: "diamond", label: "Affordable\nPricing", color: "#db2777" },
  { icon: "headset", label: "Quick\nSupport", color: "#2563eb" },
  { icon: "lock", label: "Secure\nPayments", color: "#7c3aed" },
];

export const HERO_SLIDES: { id: number; title: string; highlight: string; icons: IconName[] }[] = [
  {
    id: 1,
    title: "ALL SERVICES",
    highlight: "AT YOUR FINGERTIPS",
    icons: ["house", "hard-hat", "beauty", "calendar", "car-side", "briefcase"],
  },
  {
    id: 2,
    title: "BOOK TRUSTED",
    highlight: "PROFESSIONALS",
    icons: ["hard-hat", "broom", "beauty", "ac-unit", "bolt", "wrench"],
  },
  {
    id: 3,
    title: "ONE APP",
    highlight: "ALL SOLUTIONS",
    icons: ["shield", "diamond", "headset", "lock", "cart", "scooter"],
  },
];

export const HOME_TESTIMONIALS = [
  {
    quote: "Booked an electrician in 10 minutes. The worker arrived on time and fixed everything.",
    author: "Priya",
    city: "Hyderabad",
    rating: 5,
  },
  {
    quote: "Finally one place for wedding makeup, decor, and photography. Very easy to use.",
    author: "Ramesh",
    city: "Vijayawada",
    rating: 5,
  },
  {
    quote: "Hired masons for our home renovation. Transparent pricing and reliable workers.",
    author: "Lakshmi",
    city: "Guntur",
    rating: 5,
  },
  {
    quote: "Booked a cab and vehicle repair from the same app. Saved so much time!",
    author: "Suresh",
    city: "Warangal",
    rating: 4,
  },
];

export const HOW_IT_WORKS = [
  { step: "1", title: "Pick a service", desc: "Browse categories or search 850+ services." },
  { step: "2", title: "Book in minutes", desc: "Choose a slot, pay securely, get confirmation." },
  { step: "3", title: "Pro at your door", desc: "Verified professional arrives and completes the job." },
];

export const HOME_FAQ = [
  {
    question: "What services can I book on V Solve Hub?",
    answer:
      "Home repairs, cleaning, construction labour, beauty & wellness, events, equipment rentals, vehicle services, stays, jobs, and manpower — all from one app.",
  },
  {
    question: "How do I book a service?",
    answer:
      "Search or pick a category, choose your service, select a time slot, and confirm payment. You'll get a booking reference to track status.",
  },
  {
    question: "Are the professionals verified?",
    answer:
      "Yes. Partners go through ID and skill checks before joining. Ratings and reviews help you pick the right pro.",
  },
  {
    question: "Which cities do you cover?",
    answer:
      "We currently serve Hyderabad and are expanding across Telangana. Check a service page for availability in your area.",
  },
  {
    question: "What payment methods are accepted?",
    answer:
      "UPI, debit/credit cards, V Solve Hub wallet, and cash on completion for select services.",
  },
  {
    question: "Can I cancel or reschedule?",
    answer:
      "Yes. Open My bookings, select your booking, and reschedule or cancel. Free rescheduling is available up to 2 hours before your slot.",
  },
];

export const HOME_SPOTLIGHTS: {
  id: string;
  title: string;
  subtitle: string;
  cta: string;
  href: string;
  icon: IconName;
  color: string;
  bg: string;
}[] = [
  {
    id: "ride",
    title: "Book a ride",
    subtitle: "Bike, auto, taxi & premium cabs",
    cta: "Book now",
    href: "/vehicle/ride",
    icon: "scooter",
    color: "#ea580c",
    bg: "linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)",
  },
  {
    id: "stay",
    title: "Find a stay",
    subtitle: "PG, hostel & rental rooms",
    cta: "Browse stays",
    href: "/accommodation",
    icon: "buildings",
    color: "#0891b2",
    bg: "linear-gradient(135deg, #ecfeff 0%, #cffafe 100%)",
  },
  {
    id: "beauty",
    title: "Salon at home",
    subtitle: "Beauty, spa & bridal packages",
    cta: "Explore",
    href: "/services?category=beauty-wellness",
    icon: "beauty",
    color: "#db2777",
    bg: "linear-gradient(135deg, #fdf2f8 0%, #fce7f3 100%)",
  },
];
