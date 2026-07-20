"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useLogoutMutation } from "@/lib/query/hooks";

const links = [
  { href: "/profile", label: "Overview" },
  { href: "/profile/bookings", label: "Bookings" },
  { href: "/profile/saved", label: "Saved" },
  { href: "/profile/addresses", label: "Addresses" },
];

export function ProfileNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-2 overflow-x-auto hide-scrollbar">
      {links.map((link) => {
        const active = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold transition-colors ${
              active
                ? "bg-[var(--color-brand)] text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function LogoutButton() {
  const logoutMutation = useLogoutMutation();

  function logout() {
    logoutMutation.mutate(undefined, {
      onSuccess: () => {
        window.location.href = "/";
      },
    });
  }

  return (
    <Button variant="secondary" onClick={logout} disabled={logoutMutation.isPending}>
      {logoutMutation.isPending ? "Logging out..." : "Logout"}
    </Button>
  );
}
