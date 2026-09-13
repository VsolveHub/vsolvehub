"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

export interface GovernanceContextType {
  selectedCity: string;
  setSelectedCity: (city: string) => void;
  dateFilter: string;
  setDateFilter: (filter: string) => void;
  activePersona: string;
  setActivePersona: (persona: string) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  isSearchOpen: boolean;
  setIsSearchOpen: (open: boolean) => void;
}

const GovernanceContext = createContext<GovernanceContextType>({
  selectedCity: "hyderabad",
  setSelectedCity: () => {},
  dateFilter: "today",
  setDateFilter: () => {},
  activePersona: "super_admin",
  setActivePersona: () => {},
  searchQuery: "",
  setSearchQuery: () => {},
  isSearchOpen: false,
  setIsSearchOpen: () => {},
});

export function GovernanceProvider({ children }: { children: React.ReactNode }) {
  const [selectedCity, setSelectedCity] = useState("hyderabad");
  const [dateFilter, setDateFilter] = useState("today");
  const [activePersona, setActivePersona] = useState("super_admin");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <GovernanceContext.Provider
      value={{
        selectedCity,
        setSelectedCity,
        dateFilter,
        setDateFilter,
        activePersona,
        setActivePersona,
        searchQuery,
        setSearchQuery,
        isSearchOpen,
        setIsSearchOpen,
      }}
    >
      {children}
    </GovernanceContext.Provider>
  );
}

export function useGovernance() {
  return useContext(GovernanceContext);
}
