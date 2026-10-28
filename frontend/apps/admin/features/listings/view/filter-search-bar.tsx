import { Search } from "lucide-react";

export interface FilterSearchBarProps {
  filter: string;
  onFilterChange: (filter: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  pendingCount: number | string;
  removedCount: number | string;
}

export function FilterSearchBar({
  filter,
  onFilterChange,
  searchQuery,
  onSearchChange,
  pendingCount,
  removedCount,
}: FilterSearchBarProps) {
  const tabs = [
    { id: "ALL", label: "All Listings" },
    { id: "PENDING", label: `Pending Review (${pendingCount})` },
    { id: "ACTIVE", label: "Published" },
    { id: "DRAFT", label: "Drafts" },
    { id: "REMOVED", label: `Removed (${removedCount})` },
    { id: "CLOSED", label: "Closed / Expired" },
  ];

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-1.5">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onFilterChange(tab.id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
              filter === tab.id
                ? "bg-action-secondary text-action-secondary-text shadow"
                : "text-text-secondary hover:bg-surface-hover hover:text-text"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="relative w-full sm:w-72">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
        <input
          type="text"
          placeholder="Search title, location, phone..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full rounded-lg border border-line py-1.5 pl-9 pr-3 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
        />
      </div>
    </div>
  );
}
