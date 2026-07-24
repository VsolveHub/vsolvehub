import type { IconName } from "@/components/ui/ServiceIcons";

export type QuickService = {
  id: string;
  label: string;
  icon: IconName;
  color: string;
  href: string;
};

/** Top-level categories — single home row (M1 single-provider services only).
 *  Vehicle (ride) & Accommodation (stay) entry points are intentionally
 *  disconnected for M1; their routes/UI remain for M3/M4. */
export const QUICK_SERVICES: QuickService[] = [
  { id: "cleaning", label: "Cleaning", icon: "broom", color: "#059669", href: "/services?q=cleaning" },
  { id: "plumbing", label: "Plumbing", icon: "faucet", color: "#2563eb", href: "/services/home-services" },
  { id: "electrician", label: "Electrician", icon: "bolt", color: "#d97706", href: "/services/home-services" },
  { id: "beauty", label: "Salon/Beauty", icon: "beauty", color: "#db2777", href: "/services/beauty-wellness" },
  { id: "all", label: "More", icon: "grid-menu", color: "#7c3aed", href: "/services" },
];

export type TrendingSearch = {
  label: string;
  href: string;
};

/** High-intent searches within the M1 single-provider services. */
export const TRENDING_SEARCHES: TrendingSearch[] = [
  { label: "AC repair", href: "/services?q=ac" },
  { label: "House cleaning", href: "/services?q=cleaning" },
  { label: "Electrician", href: "/services?q=electrical" },
  { label: "Plumber", href: "/services?q=plumbing" },
  { label: "Facial", href: "/services?q=facial" },
  { label: "Pet grooming", href: "/services?q=pet" },
  { label: "Pest control", href: "/services?q=pest" },
  { label: "Salon at home", href: "/services?category=beauty-wellness" },
];

// M1 single-provider promos — two cards per carousel slide.
export const PROMO_CARDS = [
  {
    id: "home",
    title: "Home Services On Demand",
    cta: "Book Now",
    subtitle: "Electrician, plumber, AC & more",
    image: "/cleaner_illustration.jpg",
    badge: { text: "Trending", color: "bg-red-600" },
    bg: "linear-gradient(145deg, #ede9fe 0%, #f5f3ff 100%)",
    btnColor: "#6d28d9",
    icon: "broom" as IconName,
    categorySlug: "home-services",
    href: "/services/home-services",
  },
  {
    id: "beauty",
    title: "Beauty & Wellness At Home",
    cta: "Book Now",
    subtitle: "Premium care at home",
    image: "/beauty_hd.jpg",
    badge: { text: "Save ₹100", color: "bg-green-700" },
    bg: "linear-gradient(145deg, #fce7f3 0%, #fdf2f8 100%)",
    btnColor: "#db2777",
    icon: "beauty" as IconName,
    categorySlug: "beauty-wellness",
    href: "/services/beauty-wellness",
  },
  {
    id: "ac",
    title: "Smart Home Setup",
    cta: "Book Now",
    subtitle: "Premium smart locks & devices",
    image: "/ac_illustration.jpg",
    bg: "linear-gradient(145deg, #e0f2fe 0%, #f0f9ff 100%)",
    btnColor: "#0284c7",
    icon: "ac-unit" as IconName,
    categorySlug: "home-services",
    href: "/services/home-services",
  },
  {
    id: "pet",
    title: "Pet Grooming & Care",
    cta: "Book Now",
    subtitle: "Pamper your furry friends",
    image: "/pet_hd.jpg",
    bg: "linear-gradient(145deg, #f3e8ff 0%, #faf5ff 100%)",
    btnColor: "#7c3aed",
    icon: "pets" as IconName,
    categorySlug: "pet-services",
    href: "/services",
  },
];

export const WHY_CHOOSE: { icon: IconName; label: string; color: string }[] = [
  { icon: "shield", label: "Verified\nProfessionals", color: "#16a34a" },
  { icon: "diamond", label: "Affordable\nPricing", color: "#db2777" },
  { icon: "headset", label: "Quick\nSupport", color: "#2563eb" },
  { icon: "lock", label: "Secure\nPayments", color: "#7c3aed" },
  { icon: "check-circle", label: "Quality\nGuaranteed", color: "#059669" },
  { icon: "tag-percent", label: "Best\nOffers", color: "#ea580c" },
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
  // Vehicle (ride) & Accommodation (stay) spotlights disconnected for M1.
  {
    id: "home",
    title: "Home services on demand",
    subtitle: "Electrician, plumber, AC, cleaning & more",
    cta: "Book now",
    href: "/services?category=home-services",
    icon: "house",
    color: "#6d28d9",
    bg: "linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)",
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
