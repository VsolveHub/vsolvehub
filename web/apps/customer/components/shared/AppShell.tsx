"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, FormEvent, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BellIcon,
  PinIcon,
  ChevronDownIcon,
  HeaderSearchIcon,
  HomeIcon,
  BookingsIcon,
  PlusIcon,
  MessagesIcon,
  ProfileIcon,
  MenuIcon,
} from "@/components/ui/AppIcons";
import logoMark from "@/public/logo-mark.png";
import { CustomerNotificationBell } from "@/components/notifications/CustomerNotificationBell";
import { FlaticonIcon } from "@/components/ui/FlaticonIcon";
import { CartBadge } from "@/components/shared/CartBadge";
import { DEFAULT_LOCATION_LABEL, readActiveLocationLabel } from "@/lib/location/geocode";
import { AddressPicker } from "@/components/customer/address/AddressPicker";

export function AppHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [displayLocation, setDisplayLocation] = useState(DEFAULT_LOCATION_LABEL);
  const [showAddrModal, setShowAddrModal] = useState(false);
  const [autoDetect, setAutoDetect] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  const isBookingPage = pathname.startsWith("/booking");
  const isProfilePage = pathname.startsWith("/profile");
  const isNotificationPage = pathname.startsWith("/notifications");
  const isServiceDetailPage = pathname.startsWith("/services/") && pathname.split("/").length > 3;
  const hideSearchLocation = isBookingPage || isProfilePage || isNotificationPage;
  const isHome = pathname === "/";

  useEffect(() => {
    const saved = readActiveLocationLabel();
    setDisplayLocation(saved ?? DEFAULT_LOCATION_LABEL);

    // No location yet → prompt once per session to grant location & auto-fill.
    if (!saved && isHome) {
      const prompted = sessionStorage.getItem("loc_autoprompt_done");
      if (!prompted) {
        sessionStorage.setItem("loc_autoprompt_done", "1");
        setAutoDetect(true);
        setShowAddrModal(true);
      }
    }

    const handleLocationUpdate = () => {
      setDisplayLocation(readActiveLocationLabel() ?? DEFAULT_LOCATION_LABEL);
    };

    window.addEventListener("location_updated", handleLocationUpdate);
    const openLocation = () => setShowAddrModal(true);
    window.addEventListener("open_location_modal", openLocation);
    return () => {
      window.removeEventListener("location_updated", handleLocationUpdate);
      window.removeEventListener("open_location_modal", openLocation);
    };
  }, [isHome]);

  useEffect(() => {
    setShowMobileMenu(false);
  }, [pathname]);

  useEffect(() => {
    if (!showMobileMenu) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [showMobileMenu]);

  function handleSearch(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    router.push(q ? `/services?q=${encodeURIComponent(q)}` : "/services");
  }

  return (
    <>
      <header className="bg-white/95 backdrop-blur-md text-[#0b1c30] sticky top-0 z-50 border-b border-slate-100 shadow-[0_2px_15px_rgba(0,0,0,0.03)] py-2.5">
        <div className="flex items-center justify-between gap-3 w-full max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
          <button
            type="button"
            className="md:hidden flex items-center justify-center w-9 h-9 border-none bg-transparent text-[#0b1c30] cursor-pointer p-0"
            onClick={() => setShowMobileMenu(true)}
            aria-label="Open menu"
          >
            <MenuIcon size={20} />
          </button>

          <Link href="/" className="flex items-center gap-2.5 flex-1 md:flex-none justify-center md:justify-start group">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 overflow-hidden shadow-xs group-hover:scale-105 transition-transform">
              <img src={logoMark.src} alt="Vsolve Hub" className="w-full h-full object-contain" />
            </div>
            <span className="flex flex-col leading-tight hidden sm:flex">
              <span className="font-heading text-lg font-black tracking-tight text-[#0b1c30]">
                Vsolve <span className="text-[#ea580c]">Hub</span>
              </span>
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-1.5 text-xs sm:text-sm font-semibold">
            <Link
              href="/services"
              className={`px-3.5 py-1.5 rounded-full transition-all ${
                pathname.startsWith("/services")
                  ? "bg-[#fff7ed] text-[#ea580c] font-bold border border-[#ffedd5]"
                  : "text-slate-600 hover:text-[#ea580c] hover:bg-slate-50"
              }`}
            >
              Find Services
            </Link>
            <Link
              href="/profile/bookings"
              className={`px-3.5 py-1.5 rounded-full transition-all ${
                pathname.startsWith("/profile/bookings") || pathname.startsWith("/booking")
                  ? "bg-[#fff7ed] text-[#ea580c] font-bold border border-[#ffedd5]"
                  : "text-slate-600 hover:text-[#ea580c] hover:bg-slate-50"
              }`}
            >
              My Bookings
            </Link>
            <Link
              href="/support"
              className={`px-3.5 py-1.5 rounded-full transition-all ${
                pathname.startsWith("/support")
                  ? "bg-[#fff7ed] text-[#ea580c] font-bold border border-[#ffedd5]"
                  : "text-slate-600 hover:text-[#ea580c] hover:bg-slate-50"
              }`}
            >
              Support
            </Link>
          </nav>

          <div className="flex items-center gap-3">
            <CustomerNotificationBell />
            <CartBadge />
            <Link
              href="/profile"
              aria-label="Profile"
              className={`flex h-9 w-9 items-center justify-center rounded-full transition-all shrink-0 cursor-pointer ${
                pathname.startsWith("/profile") && !pathname.startsWith("/profile/bookings")
                  ? "bg-[#ea580c] text-white shadow-sm ring-2 ring-[#ea580c]/20"
                  : "bg-slate-100 text-[#0b1c30] hover:bg-[#fff7ed] hover:text-[#ea580c]"
              }`}
            >
              <ProfileIcon size={18} />
            </Link>
          </div>
        </div>

        {isServiceDetailPage && (
          <div className="flex items-center gap-2 px-4 sm:px-6 md:px-8 max-w-7xl mx-auto mt-2">
            <button
              type="button"
              className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 text-[#0b1c30] hover:bg-slate-200 transition-colors cursor-pointer"
              onClick={() => router.back()}
              aria-label="Go back"
            >
              ←
            </button>
            <span className="text-sm font-semibold text-slate-700">Back</span>
          </div>
        )}
      </header>

      <AnimatePresence>
        {showMobileMenu && (
          <MobileNavDrawer pathname={pathname} onClose={() => setShowMobileMenu(false)} />
        )}
      </AnimatePresence>

      <AddressPicker
        open={showAddrModal}
        autoDetect={autoDetect}
        redirectAfterLogin="/"
        onClose={() => {
          setShowAddrModal(false);
          setAutoDetect(false);
        }}
        onLocationChanged={(loc) => setDisplayLocation(loc)}
      />
    </>
  );
}

const MOBILE_NAV_LINKS = [
  { href: "/", label: "Home", icon: HomeIcon, match: (p: string) => p === "/" },
  { href: "/services", label: "Find Services", icon: HeaderSearchIcon, match: (p: string) => p.startsWith("/services") },
  { href: "/cart", label: "Cart", icon: CartNavIcon, match: (p: string) => p.startsWith("/cart") },
  { href: "/profile/bookings", label: "My Bookings", icon: BookingsIcon, match: (p: string) => p.startsWith("/profile/bookings") || p.startsWith("/booking") },
  { href: "/profile/messages", label: "Messages", icon: MessagesIcon, match: (p: string) => p.startsWith("/profile/messages") },
  { href: "/notifications", label: "Notifications", icon: BellIcon, match: (p: string) => p.startsWith("/notifications") },
  { href: "/support", label: "Support", icon: SupportNavIcon, match: (p: string) => p.startsWith("/support") },
  { href: "/profile", label: "Profile", icon: ProfileIcon, match: (p: string) => p.startsWith("/profile") && !p.startsWith("/profile/bookings") && !p.startsWith("/profile/messages") },
] as const;

function SupportNavIcon({ size = 20 }: { size?: number; active?: boolean }) {
  return <FlaticonIcon name="headset" size={size} />;
}

function CartNavIcon({ size = 20 }: { size?: number; active?: boolean }) {
  return <FlaticonIcon name="cart" size={size} />;
}

function MobileNavDrawer({ pathname, onClose }: { pathname: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex" role="presentation">
      <motion.div 
        className="absolute inset-0 bg-black/50"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.aside
        initial={{ x: "-100%" }}
        animate={{ x: 0 }}
        exit={{ x: "-100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className="relative w-[280px] bg-white h-full flex flex-col shadow-2xl z-[101]"
        onClick={(e) => e.stopPropagation()}
        aria-label="Navigation menu"
      >
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <img src={logoMark.src} alt="Vsolve Hub" className="w-8 h-8 object-cover rounded-lg border border-gray-100 shadow-xs" />
            <span className="font-extrabold text-gray-900 tracking-tight">Vsolve Hub</span>
          </div>
          <button type="button" className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-50 text-gray-500 hover:bg-gray-100 transition-colors" onClick={onClose} aria-label="Close menu">
            &times;
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-4 flex flex-col gap-1">
          {MOBILE_NAV_LINKS.map((item) => {
            const active = item.match(pathname);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-colors ${active ? "bg-[var(--color-brand-light)] text-[var(--color-brand)]" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"}`}
                onClick={onClose}
              >
                <span className="flex items-center justify-center w-6 h-6">
                  <Icon size={20} active={active} />
                </span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-5 border-t border-gray-100">
          <Link href="/services" className="flex items-center justify-center w-full py-3.5 bg-[var(--color-brand)] text-white rounded-xl text-sm font-bold shadow-md hover:bg-opacity-90 transition-opacity" onClick={onClose}>
            Book a service
          </Link>
        </div>
      </motion.aside>
    </div>
  );
}

export function BottomNav() {
  const pathname = usePathname();

  const isHome = pathname === "/";
  const isNotifications = pathname === "/notifications";
  const isBookings =
    pathname.startsWith("/profile/bookings") ||
    pathname.startsWith("/booking/track") ||
    pathname.startsWith("/vehicle/track") ||
    pathname.startsWith("/accommodation/track");
  const isMessages = pathname.startsWith("/profile/messages");
  const isProfile =
    pathname.startsWith("/profile") && !isBookings && !isMessages && !isNotifications;

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] flex items-end justify-around bg-white border-t border-gray-200 px-2 pt-2 pb-[14px] z-50 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] md:hidden">
      <Link href="/" className={`flex flex-col items-center gap-1 text-[10px] font-semibold py-1 px-2 min-w-[56px] ${isHome ? "text-[var(--color-brand)]" : "text-gray-500"}`}>
        <HomeIcon active={isHome} />
        <span>Home</span>
      </Link>
      <Link href="/profile/bookings" className={`flex flex-col items-center gap-1 text-[10px] font-semibold py-1 px-2 min-w-[56px] ${isBookings ? "text-[var(--color-brand)]" : "text-gray-500"}`}>
        <BookingsIcon active={isBookings} />
        <span>My Bookings</span>
      </Link>
      <Link href="/services" className="flex items-center justify-center w-[52px] h-[52px] bg-gradient-to-br from-blue-600 to-[#172a53] text-white rounded-full -mt-7 shadow-[0_4px_16px_rgba(30,58,138,0.4)] z-[1] shrink-0" aria-label="Book a service">
        <PlusIcon />
      </Link>
      <Link href="/profile/messages" className={`flex flex-col items-center gap-1 text-[10px] font-semibold py-1 px-2 min-w-[56px] ${isMessages ? "text-[var(--color-brand)]" : "text-gray-500"}`}>
        <MessagesIcon active={isMessages} />
        <span>Messages</span>
      </Link>
      <Link href="/profile" className={`flex flex-col items-center gap-1 text-[10px] font-semibold py-1 px-2 min-w-[56px] ${isProfile ? "text-[var(--color-brand)]" : "text-gray-500"}`}>
        <ProfileIcon active={isProfile} />
        <span>Profile</span>
      </Link>
    </nav>
  );
}
