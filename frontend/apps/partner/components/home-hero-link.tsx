"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";

export const HOME_HERO_HREF = "/#hero";

export function HomeHeroLink({
  children,
  className,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  const pathname = usePathname();

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.();

    if (pathname !== "/") return;

    event.preventDefault();
    document.getElementById("hero")?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <Link href={HOME_HERO_HREF} className={className} onClick={handleClick}>
      {children}
    </Link>
  );
}
