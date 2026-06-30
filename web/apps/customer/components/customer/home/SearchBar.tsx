"use client";

import { useRouter } from "next/navigation";
import { useState, FormEvent } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export function SearchBar({ sticky = false }: { sticky?: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    router.push(q ? `/services?q=${encodeURIComponent(q)}` : "/services");
  }

  const wrapperClass = sticky ? "search-bar-wrap search-sticky" : "search-bar-wrap";

  return (
    <div className={wrapperClass}>
      <form onSubmit={handleSubmit} className="search-bar" role="search">
        <Input
          className="search-input"
          placeholder="Search services, categories, tags..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search services"
        />
        <Button type="submit">Search</Button>
      </form>
    </div>
  );
}
