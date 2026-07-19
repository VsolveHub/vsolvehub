"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, FormEvent, useEffect } from "react";
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
import { CustomerNotificationBell } from "@/components/notifications/CustomerNotificationBell";
import { FlaticonIcon } from "@/components/ui/FlaticonIcon";
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
      <header className={`app-header ${hideSearchLocation ? "app-header--compact" : ""}`}>
        <div className="app-header-top">
          <button
            type="button"
            className="header-menu-btn"
            onClick={() => setShowMobileMenu(true)}
            aria-label="Open menu"
          >
            <MenuIcon size={20} />
          </button>

          <Link href="/" className="brand-logo">
            <img src="/logo-mark.png" alt="V Solve Hub" className="brand-mark" />
            <span className="brand-text">
              <span className="brand-name">Vsolve Hub</span>
            </span>
          </Link>

          <nav className="desktop-nav-links">
            <Link href="/" className={pathname === "/" ? "active" : ""}>Find Services</Link>
            <Link href="/profile/bookings" className={pathname.startsWith("/profile/bookings") || pathname.startsWith("/booking") ? "active" : ""}>My Bookings</Link>
            <Link href="/support" className={pathname.startsWith("/support") ? "active" : ""}>Support</Link>
          </nav>

          <div className="header-actions">
            {!hideSearchLocation && (
              <button type="button" className="location-bar-clean" onClick={() => setShowAddrModal(true)}>
                <PinIcon size={14} />
                <span>{displayLocation}</span>
                <ChevronDownIcon size={12} />
              </button>
            )}
            <Link href="/profile" className="profile-avatar-mini">
              <img src="/avatar-default.svg" alt="Profile" />
            </Link>
          </div>
        </div>

        {isServiceDetailPage && (
          <div className="header-inline-back">
            <button type="button" className="header-back-btn" onClick={() => router.back()} aria-label="Go back">
              ←
            </button>
            <span className="header-back-label">Back</span>
          </div>
        )}
      </header>

      {showMobileMenu && (
        <MobileNavDrawer pathname={pathname} onClose={() => setShowMobileMenu(false)} />
      )}

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
  { href: "/profile/bookings", label: "My Bookings", icon: BookingsIcon, match: (p: string) => p.startsWith("/profile/bookings") || p.startsWith("/booking") },
  { href: "/profile/messages", label: "Messages", icon: MessagesIcon, match: (p: string) => p.startsWith("/profile/messages") },
  { href: "/notifications", label: "Notifications", icon: BellIcon, match: (p: string) => p.startsWith("/notifications") },
  { href: "/support", label: "Support", icon: SupportNavIcon, match: (p: string) => p.startsWith("/support") },
  { href: "/profile", label: "Profile", icon: ProfileIcon, match: (p: string) => p.startsWith("/profile") && !p.startsWith("/profile/bookings") && !p.startsWith("/profile/messages") },
] as const;

function SupportNavIcon({ size = 20 }: { size?: number; active?: boolean }) {
  return <FlaticonIcon name="headset" size={size} />;
}

function MobileNavDrawer({ pathname, onClose }: { pathname: string; onClose: () => void }) {
  return (
    <div className="mobile-nav-backdrop" onClick={onClose} role="presentation">
      <aside
        className="mobile-nav-drawer"
        onClick={(e) => e.stopPropagation()}
        aria-label="Navigation menu"
      >
        <div className="mobile-nav-drawer__head">
          <div className="mobile-nav-drawer__brand">
            <img src="/logo-mark.png" alt="" className="brand-mark" />
            <span>Vsolve Hub</span>
          </div>
          <button type="button" className="mobile-nav-drawer__close" onClick={onClose} aria-label="Close menu">
            &times;
          </button>
        </div>

        <nav className="mobile-nav-drawer__links">
          {MOBILE_NAV_LINKS.map((item) => {
            const active = item.match(pathname);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`mobile-nav-drawer__link${active ? " active" : ""}`}
                onClick={onClose}
              >
                <span className="mobile-nav-drawer__link-icon">
                  <Icon size={20} active={active} />
                </span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mobile-nav-drawer__footer">
          <Link href="/services" className="mobile-nav-drawer__cta" onClick={onClose}>
            Book a service
          </Link>
        </div>
      </aside>
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
    <nav className="bottom-nav">
      <Link href="/" className={`bottom-nav-item ${isHome ? "active" : ""}`}>
        <HomeIcon active={isHome} />
        <span>Home</span>
      </Link>
      <Link href="/profile/bookings" className={`bottom-nav-item ${isBookings ? "active" : ""}`}>
        <BookingsIcon active={isBookings} />
        <span>My Bookings</span>
      </Link>
      <Link href="/services" className="bottom-nav-fab" aria-label="Book a service">
        <PlusIcon />
      </Link>
      <Link href="/profile/messages" className={`bottom-nav-item ${isMessages ? "active" : ""}`}>
        <MessagesIcon active={isMessages} />
        <span>Messages</span>
      </Link>
      <Link href="/profile" className={`bottom-nav-item ${isProfile ? "active" : ""}`}>
        <ProfileIcon active={isProfile} />
        <span>Profile</span>
      </Link>
    </nav>
  );
}
