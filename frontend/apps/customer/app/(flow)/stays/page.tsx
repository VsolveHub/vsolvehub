"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BedDouble,
  Building2,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  GraduationCap,
  Grid,
  HardHat,
  Home,
  KeyRound,
  Layers,
  MapPin,
  Search,
  Sparkles,
  Users,
} from "lucide-react";

const POPULAR_HERO_CHIPS = [
  "Gachibowli",
  "Madhapur",
  "Hitech City",
  "Kondapur",
  "Ameerpet",
  "LB Nagar",
];

interface StayServiceItem {
  name: string;
  slug: string;
}

interface StayCategoryCard {
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  badgeStyle: string;
  price?: string;
  priceSuffix?: string;
  infoText?: string;
  image: string;
  icon: React.ComponentType<{ className?: string }>;
  iconContainerStyle: string;
  href: string;
  services: StayServiceItem[];
}

const PRIMARY_CATEGORIES: StayCategoryCard[] = [
  {
    id: "rooms",
    title: "Rooms",
    subtitle: "Single, sharing, furnished & AC rooms with attached bath.",
    badge: "13 Services",
    badgeStyle: "bg-[#e8f7ee] text-[#1e824c] border-emerald-200/50",
    price: "₹4,500",
    priceSuffix: "/month",
    image: "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?w=800&auto=format&fit=crop&q=80",
    icon: BedDouble,
    iconContainerStyle: "bg-[#eef4ff] text-[#1e50b3]",
    href: "/catalog/rooms-pg-hostel?tile=rooms",
    services: [
      { name: "Single Room", slug: "single-room" },
      { name: "Double Sharing Room", slug: "double-sharing-room" },
      { name: "Triple Sharing Room", slug: "triple-sharing-room" },
      { name: "Four Sharing Room", slug: "four-sharing-room" },
      { name: "Family Room", slug: "family-room" },
      { name: "Studio Room", slug: "studio-room" },
      { name: "Furnished Room", slug: "furnished-room" },
      { name: "Semi Furnished Room", slug: "semi-furnished-room" },
      { name: "Non Furnished Room", slug: "non-furnished-room" },
      { name: "AC Room", slug: "ac-room" },
      { name: "Non AC Room", slug: "non-ac-room" },
      { name: "Attached Bathroom Room", slug: "attached-bathroom-room" },
      { name: "Shared Bathroom Room", slug: "shared-bathroom-room" },
    ],
  },
  {
    id: "pg-accommodation",
    title: "PG Accommodation",
    subtitle: "Move-in ready luxury PGs with food & Wi-Fi.",
    badge: "14 Services",
    badgeStyle: "bg-[#e8f7ee] text-[#1e824c] border-emerald-200/50",
    price: "₹6,500",
    priceSuffix: "/month",
    image: "/stays/pg_room.jpg",
    icon: Building2,
    iconContainerStyle: "bg-[#eef4ff] text-[#1e50b3]",
    href: "/catalog/rooms-pg-hostel?tile=pg-accommodation",
    services: [
      { name: "Gents PG", slug: "gents-pg" },
      { name: "Ladies PG", slug: "ladies-pg" },
      { name: "Students PG", slug: "students-pg" },
      { name: "Working Professionals PG", slug: "working-professionals-pg" },
      { name: "AC PG", slug: "ac-pg" },
      { name: "Non AC PG", slug: "non-ac-pg" },
      { name: "Food Included PG", slug: "food-included-pg" },
      { name: "Without Food PG", slug: "without-food-pg" },
      { name: "Single Sharing PG", slug: "single-sharing-pg" },
      { name: "Double Sharing PG", slug: "double-sharing-pg" },
      { name: "Triple Sharing PG", slug: "triple-sharing-pg" },
      { name: "Four Sharing PG", slug: "four-sharing-pg" },
      { name: "Luxury PG", slug: "luxury-pg" },
      { name: "Budget PG", slug: "budget-pg" },
    ],
  },
  {
    id: "hostels",
    title: "Hostels",
    subtitle: "Budget-friendly stays for students, youth & working professionals.",
    badge: "9 Services",
    badgeStyle: "bg-[#fff2ea] text-[#b84814] border-orange-200/50",
    price: "₹4,800",
    priceSuffix: "/month",
    image: "/stays/hostel_bunk.jpg",
    icon: Users,
    iconContainerStyle: "bg-[#f2eefb] text-[#6b3eb8]",
    href: "/catalog/rooms-pg-hostel?tile=hostels",
    services: [
      { name: "Gents Hostel", slug: "gents-hostel" },
      { name: "Ladies Hostel", slug: "ladies-hostel" },
      { name: "Students Hostel", slug: "students-hostel" },
      { name: "Working Professionals Hostel", slug: "working-professionals-hostel" },
      { name: "AC Hostel", slug: "ac-hostel" },
      { name: "Non AC Hostel", slug: "non-ac-hostel" },
      { name: "Dormitory Hostel", slug: "dormitory-hostel" },
      { name: "Backpacker Hostel", slug: "backpacker-hostel" },
      { name: "Budget Hostel", slug: "budget-hostel" },
    ],
  },
  {
    id: "bed-space",
    title: "Bed Space",
    subtitle: "Economical single, double, shared & labour bed spaces.",
    badge: "4 Services",
    badgeStyle: "bg-[#e8f1fd] text-[#1e5cb8] border-blue-200/50",
    price: "₹2,500",
    priceSuffix: "/month",
    image: "https://images.unsplash.com/photo-1595526114035-0d45ed16cfbf?w=800&auto=format&fit=crop&q=80",
    icon: BedDouble,
    iconContainerStyle: "bg-[#e6f8f1] text-[#0e8a5b]",
    href: "/catalog/rooms-pg-hostel?tile=bed-space",
    services: [
      { name: "Single Bed Space", slug: "single-bed-space" },
      { name: "Double Bed Space", slug: "double-bed-space" },
      { name: "Shared Bed Space", slug: "shared-bed-space" },
      { name: "Labour Bed Space", slug: "labour-bed-space" },
    ],
  },
  {
    id: "co-living-spaces",
    title: "Co-Living Spaces",
    subtitle: "Live, work and connect with modern community amenities.",
    badge: "4 Services",
    badgeStyle: "bg-[#e8f1fd] text-[#1e5cb8] border-blue-200/50",
    price: "₹8,000",
    priceSuffix: "/month",
    image: "/stays/coliving_lounge.jpg",
    icon: Sparkles,
    iconContainerStyle: "bg-[#e6f8f1] text-[#0e8a5b]",
    href: "/catalog/rooms-pg-hostel?tile=co-living-spaces",
    services: [
      { name: "Co-Living Room", slug: "co-living-room" },
      { name: "Shared Co-Living", slug: "shared-co-living" },
      { name: "Premium Co-Living", slug: "premium-co-living" },
      { name: "Fully Managed Co-Living", slug: "fully-managed-co-living" },
    ],
  },
  {
    id: "apartments",
    title: "Apartments",
    subtitle: "1 RK, 1 BHK, 2 BHK, 3 BHK & 4 BHK gated community flats.",
    badge: "8 Services",
    badgeStyle: "bg-[#e8f1fd] text-[#1e5cb8] border-blue-200/50",
    price: "₹18,000",
    priceSuffix: "/month",
    image: "/stays/apartment_balcony.jpg",
    icon: Home,
    iconContainerStyle: "bg-[#eef4ff] text-[#1e50b3]",
    href: "/catalog/rooms-pg-hostel?tile=apartments",
    services: [
      { name: "1 RK Apartment", slug: "1-rk-apartment" },
      { name: "1 BHK Apartment", slug: "1-bhk-apartment" },
      { name: "2 BHK Apartment", slug: "2-bhk-apartment" },
      { name: "3 BHK Apartment", slug: "3-bhk-apartment" },
      { name: "4 BHK Apartment", slug: "4-bhk-apartment" },
      { name: "Fully Furnished Apartment", slug: "fully-furnished-apartment" },
      { name: "Semi Furnished Apartment", slug: "semi-furnished-apartment" },
      { name: "Unfurnished Apartment", slug: "unfurnished-apartment" },
    ],
  },
  {
    id: "rental-properties",
    title: "Rental Properties",
    subtitle: "Independent houses, villas, farm houses & duplexes.",
    badge: "10 Services",
    badgeStyle: "bg-[#e8f7ee] text-[#1e824c] border-emerald-200/50",
    price: "₹25,000",
    priceSuffix: "/month",
    image: "/stays/independent_house.jpg",
    icon: KeyRound,
    iconContainerStyle: "bg-[#fdeeee] text-[#c92a2a]",
    href: "/catalog/rooms-pg-hostel?tile=rental-properties",
    services: [
      { name: "Independent House", slug: "independent-house" },
      { name: "Villa", slug: "villa" },
      { name: "Duplex House", slug: "duplex-house" },
      { name: "Farm House", slug: "farm-house" },
      { name: "Studio Apartment", slug: "studio-apartment" },
      { name: "Service Apartment", slug: "service-apartment" },
      { name: "Commercial Space", slug: "commercial-space" },
      { name: "Office Space", slug: "office-space" },
      { name: "Shop Space", slug: "shop-space" },
      { name: "Godown / Warehouse", slug: "godown-warehouse" },
    ],
  },
  {
    id: "short-stay",
    title: "Short Stay",
    subtitle: "Daily, weekly, monthly and flexible hourly accommodation.",
    badge: "7 Services",
    badgeStyle: "bg-[#f2eefb] text-[#6b3eb8] border-purple-200/50",
    price: "₹999",
    priceSuffix: "/day",
    image: "/stays/short_stay_suite.jpg",
    icon: Calendar,
    iconContainerStyle: "bg-[#f2eefb] text-[#6b3eb8]",
    href: "/catalog/rooms-pg-hostel?tile=short-stay",
    services: [
      { name: "Daily Room", slug: "daily-room" },
      { name: "Weekly Stay", slug: "weekly-stay" },
      { name: "Monthly Stay", slug: "monthly-stay" },
      { name: "Hourly Stay", slug: "hourly-stay" },
      { name: "Guest House", slug: "guest-house" },
      { name: "Service Apartment", slug: "short-stay-service-apartment" },
      { name: "Vacation Home", slug: "vacation-home" },
    ],
  },
  {
    id: "student-accommodation",
    title: "Student Accommodation",
    subtitle: "College-nearby hostels, PGs & exam stay rooms.",
    badge: "4 Services",
    badgeStyle: "bg-[#fff2ea] text-[#b84814] border-orange-200/50",
    price: "₹5,000",
    priceSuffix: "/month",
    image: "https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=800&auto=format&fit=crop&q=80",
    icon: GraduationCap,
    iconContainerStyle: "bg-[#fff2ea] text-[#d9531e]",
    href: "/catalog/rooms-pg-hostel?tile=student-accommodation",
    services: [
      { name: "College Nearby Hostel", slug: "college-nearby-hostel" },
      { name: "College Nearby PG", slug: "college-nearby-pg" },
      { name: "Coaching Student PG", slug: "coaching-student-pg" },
      { name: "Exam Stay Room", slug: "exam-stay-room" },
    ],
  },
  {
    id: "worker-accommodation",
    title: "Worker Accommodation",
    subtitle: "Labour rooms, camps, factory and staff quarters.",
    badge: "6 Services",
    badgeStyle: "bg-[#eef4ff] text-[#1e50b3] border-blue-200/50",
    price: "₹3,000",
    priceSuffix: "/month",
    image: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=800&auto=format&fit=crop&q=80",
    icon: HardHat,
    iconContainerStyle: "bg-[#eef4ff] text-[#1e50b3]",
    href: "/catalog/rooms-pg-hostel?tile=worker-accommodation",
    services: [
      { name: "Labour Room", slug: "labour-room" },
      { name: "Labour Camp", slug: "labour-camp" },
      { name: "Factory Worker Stay", slug: "factory-worker-stay" },
      { name: "Construction Worker Stay", slug: "construction-worker-stay" },
      { name: "Staff Accommodation", slug: "staff-accommodation" },
      { name: "Driver Accommodation", slug: "driver-accommodation" },
    ],
  },
  {
    id: "property-listing",
    title: "Property Listing",
    subtitle: "Flats, houses, shops, offices and godowns for rent.",
    badge: "9 Services",
    badgeStyle: "bg-[#e8f7ee] text-[#1e824c] border-emerald-200/50",
    price: "₹15,000",
    priceSuffix: "/month",
    image: "https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&auto=format&fit=crop&q=80",
    icon: Building2,
    iconContainerStyle: "bg-[#eef4ff] text-[#1e50b3]",
    href: "/catalog/rooms-pg-hostel?tile=property-listing",
    services: [
      { name: "Room for Rent", slug: "room-for-rent" },
      { name: "PG for Rent", slug: "pg-for-rent" },
      { name: "Hostel Vacancy", slug: "hostel-vacancy" },
      { name: "Apartment for Rent", slug: "apartment-for-rent" },
      { name: "House for Rent", slug: "house-for-rent" },
      { name: "Villa for Rent", slug: "villa-for-rent" },
      { name: "Commercial Space for Rent", slug: "commercial-space-for-rent" },
      { name: "Office Space for Rent", slug: "office-space-for-rent" },
      { name: "Godown / Warehouse for Rent", slug: "godown-warehouse-for-rent" },
    ],
  },
  {
    id: "premium-stays",
    title: "Premium Stays",
    subtitle: "Luxury apartments, premium villas & executive suites.",
    badge: "5 Services",
    badgeStyle: "bg-[#fff2ea] text-[#b84814] border-orange-200/50",
    price: "₹50,000",
    priceSuffix: "/month",
    image: "/stays/villa_house.jpg",
    icon: Sparkles,
    iconContainerStyle: "bg-[#fff2ea] text-[#d9531e]",
    href: "/catalog/rooms-pg-hostel?tile=premium-stays",
    services: [
      { name: "Luxury Apartment", slug: "luxury-apartment" },
      { name: "Premium Villa", slug: "premium-villa" },
      { name: "Executive Suite", slug: "executive-suite" },
      { name: "Corporate Stay", slug: "corporate-stay" },
      { name: "Serviced Residence", slug: "serviced-residence" },
    ],
  },
];

export default function StaysSubCategoriesPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [filterQuery, setFilterQuery] = useState("");

  const toggleExpand = (catId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setExpandedCategories((prev) => ({ ...prev, [catId]: !prev[catId] }));
  };

  const handleSearch = () => {
    router.push("/catalog/rooms-pg-hostel?tile=rooms");
  };

  // Filter categories and services if user types in search or filter query
  const totalServiceCount = PRIMARY_CATEGORIES.reduce((sum, c) => sum + c.services.length, 0);

  return (
    <div className="min-h-screen bg-[#FBFBFA] pb-20 text-navy-900 selection:bg-signal-500 selection:text-white">
      <main className="mx-auto max-w-[1216px] px-4 sm:px-6 lg:px-8">
        {/* Top Hero Section */}
        <section className="pt-6 sm:pt-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            {/* Left Column: Breadcrumb, Heading, Subtitle, Location */}
            <div className="flex-1 max-w-xl">
              <Link
                href="/"
                className="inline-flex items-center gap-1 text-xs sm:text-sm font-semibold text-gray-700 hover:text-navy-900 transition-colors mb-3"
              >
                <ChevronLeft className="h-4 w-4" />
                <span>All Services</span>
              </Link>

              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 text-[#1e824c] border border-emerald-200 text-xs font-bold mb-2">
                <Sparkles className="h-3.5 w-3.5" />
                <span>12 Subcategories • {totalServiceCount} Stay Services & Variants</span>
              </div>

              <h1 className="text-3xl sm:text-4xl lg:text-[42px] font-black tracking-tight text-[#001844] leading-tight">
                Rooms, PG & Hostels
              </h1>

              <p className="mt-1.5 text-sm sm:text-base font-medium text-gray-500">
                Find a stay that fits your lifestyle. Verified properties with zero brokerage.
              </p>

              <div className="mt-3.5 flex items-center gap-1.5 text-xs sm:text-sm font-bold text-navy-900">
                <MapPin className="h-4 w-4 text-navy-900 shrink-0" />
                <span>Hyderabad, Telangana</span>
              </div>
            </div>

            {/* Right Column: Hero Image with Sticker Badge */}
            <div className="relative w-full md:w-[440px] lg:w-[500px] h-[190px] sm:h-[220px] rounded-2xl overflow-hidden shadow-xs shrink-0 border border-gray-100">
              <img
                src="/stays/hero_bedroom.jpg"
                alt="Rooms, PG & Hostels in Hyderabad"
                className="w-full h-full object-cover"
              />

              {/* Decorative Sticker Badge */}
              <div className="absolute top-3.5 right-4 select-none pointer-events-none text-right">
                <div className="font-extrabold text-[#001844] text-lg sm:text-2xl leading-[1.05] tracking-tight rotate-[-4deg] drop-shadow-sm font-serif italic">
                  <span className="block">Better</span>
                  <span className="block">Stays</span>
                  <span className="block">Brighter</span>
                  <span className="relative inline-block pr-1">
                    Days
                    <svg
                      className="absolute -bottom-1 left-0 w-full h-2 text-[#f87000]"
                      viewBox="0 0 100 20"
                      preserveAspectRatio="none"
                      fill="currentColor"
                    >
                      <path d="M0,15 Q50,0 100,12 Q50,5 0,15 Z" />
                    </svg>
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Search Bar */}
          <div className="mt-6 sm:mt-8">
            <div className="flex flex-col sm:flex-row items-center gap-2 rounded-2xl border border-gray-200/90 bg-white p-1.5 sm:p-2 shadow-xs focus-within:border-gray-300 focus-within:shadow-sm transition-all">
              <div className="relative flex-1 w-full flex items-center">
                <Search className="h-4 sm:h-5 w-4 sm:w-5 text-gray-400 ml-3 shrink-0" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  placeholder="Search by locality, area or landmark (e.g. Gachibowli, Madhapur, Kondapur...)"
                  className="w-full pl-3 pr-4 py-2 text-xs sm:text-sm font-normal text-navy-900 placeholder:text-gray-400 focus:outline-none bg-transparent"
                />
              </div>
              <button
                onClick={handleSearch}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#f87000] px-6 py-2.5 sm:py-3 text-xs sm:text-sm font-bold text-white shadow-xs hover:bg-[#e06500] transition-colors shrink-0 cursor-pointer"
              >
                <Search className="h-4 w-4" />
                <span>Search</span>
              </button>
            </div>

            {/* Popular Localities Chips */}
            <div className="mt-3.5 flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
              <span className="text-xs font-semibold text-gray-500 shrink-0 mr-1">
                Popular:
              </span>
              {POPULAR_HERO_CHIPS.map((loc) => (
                <Link
                  key={loc}
                  href="/catalog/rooms-pg-hostel?tile=rooms"
                  className="rounded-full border border-gray-200/80 bg-white px-4 py-1 text-xs font-medium text-gray-700 hover:border-gray-400 hover:bg-gray-50 transition-colors whitespace-nowrap shadow-2xs"
                >
                  {loc}
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* Catalog List Banner */}
        <section className="mt-8 rounded-2xl border border-blue-200/80 bg-gradient-to-r from-blue-50/80 via-white to-orange-50/60 p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#001844] text-white shadow-xs">
              <Layers className="h-5 w-5 text-[#f87000]" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-black text-[#001844]">
                Looking for the full Catalog Grid?
              </h3>
              <p className="text-xs text-gray-600 font-medium mt-0.5">
                View all 12 sub-categories and 93 services in the standard technician & rental service layout.
              </p>
            </div>
          </div>
          <Link
            href="/catalog/rooms-pg-hostel"
            className="inline-flex items-center gap-2 rounded-xl bg-[#001844] px-4 py-2.5 text-xs font-bold text-white hover:bg-navy-800 transition-colors shadow-xs shrink-0"
          >
            <Grid className="h-4 w-4" />
            <span>Open Standard Catalog</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </section>

        {/* "Choose your stay" Section with 12 Subcategories & Clickable Service Pills */}
        <section className="mt-10 sm:mt-12">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#001844]">
                Choose your stay
              </h2>
              <p className="mt-1 text-xs sm:text-sm text-gray-500">
                Select a subcategory or click an individual service variant to filter instantly.
              </p>
            </div>

            <Link
              href="/catalog/rooms-pg-hostel?tile=rooms"
              className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-[#b84814] hover:text-[#f87000] transition-colors self-start sm:self-auto group"
            >
              <span>Browse all properties</span>
              <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>

          {/* 2-Column Grid of 12 Category Cards with Integrated Service Pills */}
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
            {PRIMARY_CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              const isExpanded = !!expandedCategories[cat.id];
              const visibleServices = isExpanded ? cat.services : cat.services.slice(0, 4);
              const remainingCount = cat.services.length - 4;

              return (
                <div
                  key={cat.id}
                  className="group flex flex-col justify-between rounded-2xl border border-gray-200/90 bg-white p-4 shadow-2xs hover:shadow-md hover:border-gray-300 transition-all duration-200 gap-3"
                >
                  {/* Top Content Row */}
                  <div className="flex items-start justify-between gap-3">
                    {/* Thumbnail Image */}
                    <Link
                      href={cat.href}
                      className="relative w-28 h-24 sm:w-36 sm:h-28 rounded-xl overflow-hidden shrink-0 bg-warm-100"
                    >
                      <img
                        src={cat.image}
                        alt={cat.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    </Link>

                    {/* Middle Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-2">
                        <div
                          className={`flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-lg ${cat.iconContainerStyle}`}
                        >
                          <Icon className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
                        </div>
                        <div className="min-w-0">
                          <Link href={cat.href}>
                            <h3 className="text-sm sm:text-base font-extrabold text-navy-900 hover:text-[#f87000] transition-colors leading-tight">
                              {cat.title}
                            </h3>
                          </Link>
                          <p className="mt-0.5 text-[11px] sm:text-xs text-gray-500 line-clamp-2">
                            {cat.subtitle}
                          </p>
                        </div>
                      </div>

                      {/* Badge & Price */}
                      <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                        <span
                          className={`inline-block rounded-full border px-2 py-0.5 text-[10px] sm:text-[11px] font-semibold ${cat.badgeStyle}`}
                        >
                          {cat.badge}
                        </span>
                        {cat.price && (
                          <span className="text-xs text-gray-600 font-medium">
                            From{" "}
                            <strong className="font-extrabold text-xs sm:text-sm text-navy-900">
                              {cat.price}
                            </strong>{" "}
                            {cat.priceSuffix}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* View Arrow Link */}
                    <Link
                      href={cat.href}
                      className="flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-full border border-gray-200 text-gray-400 hover:border-navy-900 hover:text-navy-900 hover:translate-x-0.5 transition-all"
                      title={`Browse ${cat.title}`}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </div>

                  {/* Bottom: Service Variants Pills */}
                  <div className="mt-1 pt-2.5 border-t border-gray-100">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                        Available Services / Variants:
                      </span>
                      {remainingCount > 0 && (
                        <button
                          type="button"
                          onClick={(e) => toggleExpand(cat.id, e)}
                          className="inline-flex items-center gap-0.5 text-[11px] font-bold text-[#f87000] hover:text-[#e06500] cursor-pointer"
                        >
                          <span>{isExpanded ? "Show Less" : `+${remainingCount} more`}</span>
                          {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        </button>
                      )}
                    </div>

                    {/* Interactive Service Chips */}
                    <div className="flex flex-wrap gap-1.5">
                      {visibleServices.map((svc) => (
                        <Link
                          key={svc.slug}
                          href={`/catalog/rooms-pg-hostel?tile=${cat.id}`}
                          className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-warm-50/70 hover:border-[#f87000] hover:bg-orange-50/70 px-2.5 py-1 text-[11px] font-medium text-gray-700 hover:text-[#b84814] transition-colors"
                        >
                          <span>{svc.name}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Interactive Full 93 Services Directory */}
        <section className="mt-14 rounded-2xl border border-gray-200/90 bg-white p-6 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-5">
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-[#001844]">
                All 93 Stay Services Directory
              </h2>
              <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
                Every single service variant provided across our 12 stay categories.
              </p>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                placeholder="Filter 93 services..."
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-gray-200 focus:outline-none focus:border-[#001844]"
              />
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {PRIMARY_CATEGORIES.map((cat) => {
              const matchedServices = cat.services.filter((s) =>
                filterQuery.trim()
                  ? s.name.toLowerCase().includes(filterQuery.toLowerCase()) ||
                    cat.title.toLowerCase().includes(filterQuery.toLowerCase())
                  : true
              );

              if (matchedServices.length === 0) return null;

              return (
                <div key={cat.id} className="rounded-xl border border-gray-100 bg-warm-50/40 p-4">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <Link
                      href={cat.href}
                      className="font-extrabold text-sm text-[#001844] hover:text-[#f87000] transition-colors"
                    >
                      {cat.title}
                    </Link>
                    <span className="text-[10px] font-bold rounded-full bg-blue-100 text-blue-800 px-2 py-0.5">
                      {matchedServices.length}
                    </span>
                  </div>
                  <ul className="space-y-1.5 text-xs">
                    {matchedServices.map((svc) => (
                      <li key={svc.slug}>
                        <Link
                          href={`/catalog/rooms-pg-hostel?tile=${cat.id}`}
                          className="flex items-center justify-between text-gray-600 hover:text-[#f87000] hover:translate-x-0.5 transition-all py-0.5"
                        >
                          <span>{svc.name}</span>
                          <ChevronRight className="h-3 w-3 text-gray-400" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
