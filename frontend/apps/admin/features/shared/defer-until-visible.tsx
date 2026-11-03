"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Mounts `children` once the placeholder comes within `rootMargin` of the viewport, so a section
 * below the fold fetches nothing until somebody scrolls toward it. Stays mounted after that.
 * Without IntersectionObserver (old browsers, some test environments) it mounts at once.
 */
export function DeferUntilVisible({
  children,
  placeholder,
  rootMargin = "200px",
}: {
  children: ReactNode;
  placeholder: ReactNode;
  rootMargin?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (visible) return;
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible, rootMargin]);

  return visible ? <>{children}</> : <div ref={ref}>{placeholder}</div>;
}
