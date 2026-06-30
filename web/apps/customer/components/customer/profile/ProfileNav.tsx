"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/Button";

const links = [
  { href: "/profile", label: "Overview" },
  { href: "/profile/bookings", label: "Bookings" },
  { href: "/profile/saved", label: "Saved" },
  { href: "/profile/addresses", label: "Addresses" },
];

export function ProfileNav() {
  const pathname = usePathname();

  return (
    <nav className="profile-nav">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={`profile-nav-link ${pathname === link.href ? "active" : ""}`}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}

export function LogoutButton() {
  async function logout() {
    await fetch("/api/auth/session", { method: "DELETE" });
    window.location.href = "/";
  }

  return (
    <Button variant="secondary" onClick={logout}>
      Logout
    </Button>
  );
}
