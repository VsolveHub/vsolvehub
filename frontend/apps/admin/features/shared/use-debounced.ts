"use client";

import { useEffect, useState } from "react";

/** `value`, once it has stopped changing for `delay` ms. Typing in a search box asks the server once. */
export function useDebounced<T>(value: T, delay = 350): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return settled;
}
