"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

interface HeaderTitleRegistration {
  readonly token: symbol;
  readonly title: string;
}

type RegisterHeaderTitle = (title: string) => () => void;

const PartnerHeaderTitleContext = createContext<RegisterHeaderTitle | null>(null);

export interface PartnerHeaderTitleProviderProps {
  readonly children: (title: string | null) => ReactNode;
}

/** Keeps the focused app-bar title close to the shell without coupling it to a feature query. */
export function PartnerHeaderTitleProvider({ children }: PartnerHeaderTitleProviderProps) {
  const [registration, setRegistration] = useState<HeaderTitleRegistration | null>(null);
  const register = useCallback<RegisterHeaderTitle>((title) => {
    const token = Symbol("partner-header-title");
    setRegistration({ token, title });
    return () => {
      setRegistration((current) => (current?.token === token ? null : current));
    };
  }, []);

  return (
    <PartnerHeaderTitleContext.Provider value={register}>
      {children(registration?.title ?? null)}
    </PartnerHeaderTitleContext.Provider>
  );
}

/**
 * Gives a focused route's app bar a title that only the loaded feature knows.
 *
 * The shell owns the bar, but it must not fetch enquiry data or import proposal
 * features merely to title them. Registering the already-loaded service name
 * keeps that boundary intact and restores the route-derived fallback when the
 * feature unmounts.
 */
export function PartnerHeaderTitle({ title }: { readonly title: string }) {
  const register = useContext(PartnerHeaderTitleContext);

  useEffect(() => {
    const normalized = title.trim();
    if (register === null || normalized === "") return;
    return register(normalized);
  }, [register, title]);

  return null;
}
