"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, FormEvent, useEffect, useCallback } from "react";
import {
  BellIcon,
  WalletIcon,
  PinIcon,
  ChevronDownIcon,
  HeaderSearchIcon,
  HomeIcon,
  BookingsIcon,
  PlusIcon,
  MessagesIcon,
  ProfileIcon,
  CartIcon,
  MenuIcon,
} from "@/components/ui/AppIcons";
import { CustomerNotificationBell } from "@/components/notifications/CustomerNotificationBell";
import { FlaticonIcon } from "@/components/ui/FlaticonIcon";
import {
  DEFAULT_LOCATION_LABEL,
  LocationError,
  detectCurrentLocation,
  readActiveLocationLabel,
  storeActiveLocation,
} from "@/lib/location/geocode";

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
            <Link href="/cart" className="header-cart-icon">
              <CartIcon size={20} />
              <span className="cart-badge">1</span>
            </Link>
            <Link href="/profile" className="profile-avatar-mini">
              <img src="https://api.dicebear.com/7.x/notionists/svg?seed=Felix&backgroundColor=f3f4f6" alt="Profile" />
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

      {showAddrModal && (
        <AddressModal
          autoDetect={autoDetect}
          onClose={() => {
            setShowAddrModal(false);
            setAutoDetect(false);
          }}
          onLocationChanged={(loc) => setDisplayLocation(loc)}
        />
      )}
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

type AddrForm = {
  label: string;
  houseNumber: string;
  landmark: string;
  area: string;
  city: string;
  pincode: string;
  lat?: number;
  lng?: number;
};

const EMPTY_FORM: AddrForm = {
  label: "Home",
  houseNumber: "",
  landmark: "",
  area: "",
  city: "",
  pincode: "",
};

function AddressModal({
  autoDetect = false,
  onClose,
  onLocationChanged,
}: {
  autoDetect?: boolean;
  onClose: () => void;
  onLocationChanged: (loc: string) => void;
}) {
  const [addresses, setAddresses] = useState<any[]>([]);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"list" | "form">("list");
  const [form, setForm] = useState<AddrForm>(EMPTY_FORM);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [detecting, setDetecting] = useState(false);

  function setField<K extends keyof AddrForm>(key: K, value: AddrForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const detectLocation = useCallback(async (autoLabel = false) => {
    setError("");
    setDetecting(true);
    try {
      const loc = await detectCurrentLocation();
      setForm((prev) => ({
        ...prev,
        label: autoLabel || !prev.label ? "Current location" : prev.label,
        houseNumber: loc.houseNumber || prev.houseNumber,
        landmark: prev.landmark,
        area: loc.area || prev.area,
        city: loc.city || prev.city,
        pincode: loc.pincode || prev.pincode,
        lat: loc.lat,
        lng: loc.lng,
      }));
      setView("form");
      if (!loc.area && !loc.city) {
        setError("We found your position but couldn't read the address — please complete the fields.");
      }
    } catch (err) {
      const message = err instanceof LocationError ? err.message : "Couldn't get your location.";
      setError(message);
      setView("form");
    } finally {
      setDetecting(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      setLoading(true);
      try {
        const sessionRes = await fetch("/api/auth/session");
        let loggedIn = false;
        let list: any[] = [];
        if (sessionRes.ok) {
          const sessionData = await sessionRes.json();
          if (sessionData && sessionData.user) {
            loggedIn = true;
            const addrRes = await fetch("/api/profile/addresses");
            if (addrRes.ok) {
              const data = await addrRes.json();
              list = data.addresses || [];
            }
          }
        }
        if (cancelled) return;
        setIsLoggedIn(loggedIn);
        setAddresses(list);
        // No saved addresses, or caller asked to auto-detect → open form & detect.
        if (autoDetect || list.length === 0) {
          setView("form");
          if (autoDetect) detectLocation(true);
        }
      } catch {
        if (!cancelled) setError("Couldn't load your addresses.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadData();
    return () => {
      cancelled = true;
    };
  }, [autoDetect, detectLocation]);

  async function selectAddress(id: string) {
    try {
      const res = await fetch("/api/profile/addresses", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.address) {
          const a = data.address;
          const display = storeActiveLocation({
            id: a.id,
            label: a.label,
            area: a.area,
            city: a.city,
            fullAddress: a.fullAddress,
          });
          onLocationChanged(display);
          onClose();
        }
      } else {
        setError("Failed to select address");
      }
    } catch {
      setError("An error occurred");
    }
  }

  async function saveAddress(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.label.trim()) {
      setError("Label is required");
      return;
    }
    const hasArea = form.area.trim() && form.city.trim();
    const hasCoords = form.lat != null && form.lng != null;
    if (!hasArea && !hasCoords) {
      setError("Enter at least an area and city, or use your current location.");
      return;
    }
    if (form.pincode && !/^\d{6}$/.test(form.pincode)) {
      setError("Enter a valid 6-digit pincode");
      return;
    }

    setSaving(true);
    const payload = {
      label: form.label.trim(),
      houseNumber: form.houseNumber.trim() || undefined,
      landmark: form.landmark.trim() || undefined,
      area: form.area.trim() || undefined,
      city: form.city.trim() || undefined,
      pincode: form.pincode.trim() || undefined,
      lat: form.lat,
      lng: form.lng,
    };

    try {
      if (isLoggedIn) {
        const res = await fetch("/api/profile/addresses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, isDefault: addresses.length === 0 }),
        });
        if (res.ok) {
          const { address } = await res.json();
          setAddresses((prev) => [...prev, address]);
          setForm(EMPTY_FORM);
          await selectAddress(address.id);
        } else {
          setError("Failed to save address. Please check the fields.");
        }
      } else {
        // Guest: persist locally only.
        const fullAddress = [payload.houseNumber, payload.landmark, payload.area, [payload.city, payload.pincode].filter(Boolean).join(" — ")]
          .filter(Boolean)
          .join(", ");
        const display = storeActiveLocation({
          label: payload.label,
          area: payload.area,
          city: payload.city,
          fullAddress,
        });
        onLocationChanged(display);
        onClose();
      }
    } catch {
      setError("Failed to save address");
    } finally {
      setSaving(false);
    }
  }

  const detectButton = (
    <button
      type="button"
      className="addr-detect-btn"
      onClick={() => detectLocation(false)}
      disabled={detecting}
    >
      <PinIcon />
      {detecting ? "Detecting your location…" : "Use my current location"}
    </button>
  );

  return (
    <div className="addr-modal-backdrop" onClick={onClose}>
      <div className="addr-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="addr-modal-header">
          <h2 className="addr-modal-title">{view === "form" ? "Add address" : "Select Address"}</h2>
          <button className="addr-modal-close" onClick={onClose} aria-label="Close">&times;</button>
        </div>

        {error && (
          <div className="alert alert-error" style={{ fontSize: "0.8rem", padding: "0.6rem 0.75rem", borderRadius: "8px", margin: 0 }}>
            {error}
          </div>
        )}

        {loading ? (
          <p style={{ textAlign: "center", fontSize: "0.875rem" }}>Loading addresses…</p>
        ) : view === "list" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {detectButton}

            {isLoggedIn ? (
              <>
                <div className="addr-modal-list">
                  {addresses.map((addr) => {
                    const active = localStorage.getItem("location_id") === addr.id || addr.isDefault;
                    return (
                      <div
                        key={addr.id}
                        className={`addr-item ${active ? "addr-item--active" : ""}`}
                        onClick={() => selectAddress(addr.id)}
                      >
                        <span className="addr-item__icon">📍</span>
                        <div className="addr-item__info">
                          <span className="addr-item__label">{addr.label}</span>
                          <span className="addr-item__text">{addr.fullAddress}</span>
                        </div>
                        {active && <span className="addr-item__check">✓</span>}
                      </div>
                    );
                  })}
                  {addresses.length === 0 && (
                    <p className="text-muted" style={{ textAlign: "center", fontSize: "0.875rem", margin: 0 }}>
                      No saved addresses yet.
                    </p>
                  )}
                </div>

                <button
                  className="addr-modal-btn"
                  style={{ background: "transparent", color: "var(--color-brand)", border: "1.5px dashed var(--color-brand)", boxShadow: "none" }}
                  onClick={() => {
                    setForm(EMPTY_FORM);
                    setError("");
                    setView("form");
                  }}
                >
                  + Add new address
                </button>
              </>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", textAlign: "center" }}>
                <p className="text-muted" style={{ fontSize: "0.825rem", margin: 0 }}>
                  Log in to save addresses to your account, or set one for this session below.
                </p>
                <Link href={`/booking/otp?redirect=/`} className="addr-modal-btn" style={{ textDecoration: "none" }} onClick={onClose}>
                  Log In / Register
                </Link>
                <button
                  className="addr-modal-btn"
                  style={{ background: "transparent", color: "var(--color-brand)", border: "1.5px dashed var(--color-brand)", boxShadow: "none" }}
                  onClick={() => {
                    setForm(EMPTY_FORM);
                    setError("");
                    setView("form");
                  }}
                >
                  Enter address manually
                </button>
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={saveAddress} className="addr-modal-form" style={{ border: "none", paddingTop: 0 }}>
            {detectButton}

            <div className="addr-input-group">
              <label className="addr-input-label">Label</label>
              <input
                type="text"
                placeholder="Home, Office, Parent's house…"
                value={form.label}
                onChange={(e) => setField("label", e.target.value)}
                className="addr-input"
                required
              />
            </div>

            <div className="addr-form-row">
              <div className="addr-input-group">
                <label className="addr-input-label">House / flat no.</label>
                <input
                  type="text"
                  placeholder="Flat 204, Block B"
                  value={form.houseNumber}
                  onChange={(e) => setField("houseNumber", e.target.value)}
                  className="addr-input"
                />
              </div>
              <div className="addr-input-group">
                <label className="addr-input-label">Pincode</label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="500032"
                  value={form.pincode}
                  onChange={(e) => setField("pincode", e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="addr-input"
                />
              </div>
            </div>

            <div className="addr-input-group">
              <label className="addr-input-label">Landmark</label>
              <input
                type="text"
                placeholder="Near metro station"
                value={form.landmark}
                onChange={(e) => setField("landmark", e.target.value)}
                className="addr-input"
              />
            </div>

            <div className="addr-form-row">
              <div className="addr-input-group">
                <label className="addr-input-label">Area / locality</label>
                <input
                  type="text"
                  placeholder="Gachibowli"
                  value={form.area}
                  onChange={(e) => setField("area", e.target.value)}
                  className="addr-input"
                />
              </div>
              <div className="addr-input-group">
                <label className="addr-input-label">City</label>
                <input
                  type="text"
                  placeholder="Hyderabad"
                  value={form.city}
                  onChange={(e) => setField("city", e.target.value)}
                  className="addr-input"
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button type="submit" className="addr-modal-btn" style={{ flexGrow: 1 }} disabled={saving || detecting}>
                {saving ? "Saving…" : "Save & select"}
              </button>
              {(isLoggedIn ? addresses.length > 0 : true) && (
                <button
                  type="button"
                  className="addr-modal-btn"
                  style={{ background: "var(--m3-surface-variant, #e7e0ec)", color: "var(--m3-on-surface, #1d1b20)", width: "auto", boxShadow: "none" }}
                  onClick={() => {
                    setError("");
                    setView("list");
                  }}
                >
                  {isLoggedIn && addresses.length > 0 ? "Back" : "Cancel"}
                </button>
              )}
            </div>
          </form>
        )}
      </div>
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
