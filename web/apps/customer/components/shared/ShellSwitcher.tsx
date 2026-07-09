"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { AppHeader, BottomNav } from "@/components/shared/AppShell";
import { AppFooter } from "@/components/shared/AppFooter";

export function ShellSwitcher({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  useEffect(() => {
    if (typeof window !== "undefined" && "navigator" in window && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          localStorage.setItem("user_lat", latitude.toString());
          localStorage.setItem("user_lng", longitude.toString());

          // Default fallback location values
          let detectedAddressText = "Gachibowli, Hyderabad";
          let detectedPincode = "500032";
          let detectedArea = "Gachibowli";
          let detectedCity = "Hyderabad";

          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3500);
            const response = await fetch(
              `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`,
              { signal: controller.signal, headers: { "User-Agent": "VSolveHub" } }
            );
            clearTimeout(timeoutId);
            if (response.ok) {
              const data = await response.json();
              if (data && data.address) {
                detectedCity = data.address.city || data.address.town || data.address.village || "Hyderabad";
                detectedArea = data.address.suburb || data.address.neighbourhood || data.address.road || "Gachibowli";
                detectedPincode = data.address.postcode || "500032";
                detectedAddressText = data.display_name || `${detectedArea}, ${detectedCity} — ${detectedPincode}`;
              }
            }
          } catch (e) {
            console.error("Nominatim reverse geocoding failed/timed out, using defaults:", e);
          }

          localStorage.setItem("user_address", detectedAddressText);
          localStorage.setItem("user_area", detectedArea);
          localStorage.setItem("user_city", detectedCity);
          localStorage.setItem("user_pincode", detectedPincode);

          // Dispatch location update event to app
          window.dispatchEvent(new Event("location_updated"));

          try {
            // Check session and save if logged in and don't have address
            const sessionRes = await fetch("/api/auth/session");
            if (sessionRes.ok) {
              const sessionData = await sessionRes.json();
              if (sessionData && sessionData.user) {
                // User is logged in! Check saved addresses
                const addrRes = await fetch("/api/profile/addresses");
                if (addrRes.ok) {
                  const { addresses } = await addrRes.json();
                  if (!addresses || addresses.length === 0) {
                    // No addresses exist, save the detected location!
                    const saveRes = await fetch("/api/profile/addresses", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        label: "Current Location",
                        houseNumber: "Detected Location",
                        landmark: "GPS Coordinates",
                        area: detectedArea,
                        city: detectedCity,
                        pincode: detectedPincode,
                        lat: latitude,
                        lng: longitude,
                        isDefault: true,
                      }),
                    });

                    if (saveRes.ok) {
                      const saveData = await saveRes.json();
                      if (saveData && saveData.address) {
                        localStorage.setItem("location_id", saveData.address.id);
                        console.log("Auto-created first address:", saveData.address.id);
                      }
                    }
                  } else {
                    // Store the existing default address ID and update local storage details
                    const defaultAddr = addresses.find((a: any) => a.isDefault) || addresses[0];
                    if (defaultAddr) {
                      localStorage.setItem("location_id", defaultAddr.id);
                      localStorage.setItem("user_area", defaultAddr.area || "");
                      localStorage.setItem("user_city", defaultAddr.city || "");
                      localStorage.setItem("user_address", defaultAddr.fullAddress || "");
                      window.dispatchEvent(new Event("location_updated"));
                    }
                  }
                }
              }
            }
          } catch (err) {
            console.error("Error updating user addresses with location:", err);
          }
        },
        (error) => {
          console.warn("User denied location or location error:", error);
        },
        { enableHighAccuracy: true, timeout: 6000 }
      );
    }
  }, []);

  // Keep navigation present on all customer pages for a consistent, user-friendly app feel.
  // The header already supports a compact mode on certain routes via `app-header--compact`.
  const hideHeader = false;
  const hideBottomNav = false;

  return (
    <div className="shell-switcher-layout" suppressHydrationWarning>
      {!hideHeader && <AppHeader />}
      <main className={hideBottomNav ? "main-content-wrapper" : "main-content main-content-wrapper"}>{children}</main>
      {!hideBottomNav && <BottomNav />}
      <AppFooter />
    </div>
  );
}
