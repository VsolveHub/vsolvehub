"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PinIcon } from "@/components/ui/AppIcons";
import { readActiveLocationLabel, DEFAULT_LOCATION_LABEL } from "@/lib/location/geocode";

type Props = {
  onLocationClick?: () => void;
};

export function HomeSearchHero({ onLocationClick }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState(DEFAULT_LOCATION_LABEL);

  useEffect(() => {
    setLocation(readActiveLocationLabel() ?? DEFAULT_LOCATION_LABEL);
    const onUpdate = () => setLocation(readActiveLocationLabel() ?? DEFAULT_LOCATION_LABEL);
    window.addEventListener("location_updated", onUpdate);
    return () => window.removeEventListener("location_updated", onUpdate);
  }, []);

  function handleSearch(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    router.push(q ? `/services?q=${encodeURIComponent(q)}` : "/services");
  }

  function openLocationModal() {
    window.dispatchEvent(new Event("open_location_modal"));
  }

  return (
    <div className="home-search-hero">
      <button type="button" className="home-search-hero__location" onClick={onLocationClick ?? openLocationModal}>
        <PinIcon />
        <span>{location}</span>
        <span aria-hidden>▾</span>
      </button>
      <form className="home-search-hero__bar" onSubmit={handleSearch}>
        <input
          type="search"
          className="home-search-hero__input"
          placeholder="Search electrician, cleaning, salon…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search services"
        />
        <button type="submit" className="home-search-hero__btn">
          Search
        </button>
      </form>
    </div>
  );
}
