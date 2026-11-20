"use client";

import { useMemo, useState } from "react";
import { Badge, Button, EmptyState, ErrorState, Input, PageHeader, Spinner } from "@vsolve/ui";
import { describeError } from "@vsolve/query";
import { MapPin, Plus, Search, Settings2, Upload } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useServiceAreas, type OperationsServiceArea } from "../queries";
import { AreaDetailDrawer } from "./area-detail-drawer";
import { BulkPinDialog } from "./bulk-pin-dialog";
import { NewAreaDialog } from "./new-area-dialog";

export function AreasPage() {
  const searchParams = useSearchParams();
  const initialPin = searchParams?.get("pin") ?? "";

  const { data: areas = [], isLoading, error, refetch } = useServiceAreas();

  // "Link PIN to an area…" arrives with ?pin=. That PIN is usually in no area yet, so it is not a
  // search filter: the list stays whole, and the PIN is prefilled in whichever area is opened.
  const [search, setSearch] = useState("");
  const [selectedZone, setSelectedZone] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACCEPTING" | "PAUSED">("ALL");

  const [activeAreaId, setActiveAreaId] = useState<string | null>(null);
  const [isNewAreaOpen, setIsNewAreaOpen] = useState(false);
  const [isBulkPinOpen, setIsBulkPinOpen] = useState(false);

  // Extract unique zones
  const zones = useMemo(() => {
    const set = new Set<string>();
    areas.forEach((a) => {
      if (a.zone?.trim()) set.add(a.zone.trim());
    });
    return Array.from(set).sort();
  }, [areas]);

  // Filtered areas
  const filteredAreas = useMemo(() => {
    return areas.filter((area) => {
      if (selectedZone !== "ALL" && area.zone !== selectedZone) {
        return false;
      }
      if (statusFilter === "ACCEPTING" && !area.is_accepting_partners) {
        return false;
      }
      if (statusFilter === "PAUSED" && area.is_accepting_partners) {
        return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const matchesName = area.name.toLowerCase().includes(q);
        const matchesSlug = area.slug.toLowerCase().includes(q);
        const matchesZone = (area.zone || "").toLowerCase().includes(q);
        const matchesPin = area.postal_codes.some((p) => p.includes(q));
        if (!matchesName && !matchesSlug && !matchesZone && !matchesPin) {
          return false;
        }
      }
      return true;
    });
  }, [areas, selectedZone, statusFilter, search]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Service Areas"
        description="Manage geographic operational areas, PIN code coverage, and trade capabilities."
        actions={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => setIsBulkPinOpen(true)}
              className="text-xs"
            >
              <Upload className="w-3.5 h-3.5 mr-1.5" />
              Bulk PINs
            </Button>
            <Button
              variant="primary"
              onClick={() => setIsNewAreaOpen(true)}
              className="text-xs"
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              New Service Area
            </Button>
          </div>
        }
      />

      {initialPin ? (
        <div className="rounded border border-info-line bg-info-surface p-3 text-xs text-info-text">
          Open the area that should cover PIN <span className="font-mono font-bold">{initialPin}</span>,
          then choose Add PIN. If we have not loaded this PIN yet, you will be asked for its city and
          state.
        </div>
      ) : null}

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-line bg-surface p-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-text-muted" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by name, slug, zone, PIN..."
              className="pl-8 text-xs"
            />
          </div>

          <div className="flex items-center gap-1.5 text-xs text-text-secondary">
            <span className="font-medium">Zone:</span>
            <select
              value={selectedZone}
              onChange={(e) => setSelectedZone(e.target.value)}
              className="rounded border border-line bg-surface p-1.5 text-xs text-text"
            >
              <option value="ALL">All Zones ({zones.length})</option>
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-text-secondary">
            <span className="font-medium">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="rounded border border-line bg-surface p-1.5 text-xs text-text"
            >
              <option value="ALL">All Statuses</option>
              <option value="ACCEPTING">Accepting Partners</option>
              <option value="PAUSED">Paused</option>
            </select>
          </div>
        </div>

        <div className="text-xs text-text-muted font-medium">
          Showing {filteredAreas.length} of {areas.length} areas
        </div>
      </div>

      {/* Main Content Table */}
      {isLoading ? (
        <div className="flex justify-center p-12">
          <Spinner />
        </div>
      ) : error ? (
        <ErrorState
          title="Could not load service areas"
          message={describeError(error).message}
          actionLabel="Try Again"
          onAction={() => refetch()}
        />
      ) : filteredAreas.length === 0 ? (
        <EmptyState
          icon={<MapPin className="h-8 w-8 text-text-muted" />}
          title="No service areas found"
          description={
            search || selectedZone !== "ALL" || statusFilter !== "ALL"
              ? "No areas match your current filter criteria."
              : "No service areas have been created yet."
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-control border border-line bg-surface">
          <table className="w-full text-left text-xs divide-y divide-line">
            <thead className="bg-surface-sunken text-text-secondary font-semibold">
              <tr>
                <th className="p-3">Area Name</th>
                <th className="p-3">Zone</th>
                <th className="p-3">State</th>
                <th className="p-3">Accepting</th>
                <th className="p-3 text-right">PIN Codes</th>
                <th className="p-3 text-right">Active Services</th>
                <th className="p-3 text-right">Partners</th>
                <th className="p-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filteredAreas.map((area) => (
                <tr
                  key={area.id}
                  onClick={() => setActiveAreaId(area.id)}
                  className="hover:bg-surface-hover/60 cursor-pointer transition-colors"
                >
                  <td className="p-3">
                    <span className="font-bold text-text block text-sm">{area.name}</span>
                    <span className="font-mono text-text-muted text-[11px]">{area.slug}</span>
                  </td>
                  <td className="p-3">
                    {area.zone ? (
                      <Badge tone="neutral">{area.zone}</Badge>
                    ) : (
                      <span className="text-text-muted italic">—</span>
                    )}
                  </td>
                  <td className="p-3 text-text-secondary font-mono">{area.state_code}</td>
                  <td className="p-3">
                    <Badge tone={area.is_accepting_partners ? "success" : "warning"}>
                      {area.is_accepting_partners ? "Accepting" : "Paused"}
                    </Badge>
                  </td>
                  <td className="p-3 text-right font-mono font-semibold text-text">
                    {area.postal_code_count}
                  </td>
                  <td className="p-3 text-right text-text-secondary">
                    {area.services_active_count} / {area.services_total_count}
                  </td>
                  <td className="p-3 text-right font-extrabold text-success-text">
                    {area.partner_count}
                  </td>
                  <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setActiveAreaId(area.id)}
                      className="text-xs py-1 px-2.5 font-medium hover:border-action-secondary hover:text-action-secondary inline-flex items-center"
                    >
                      <Settings2 className="w-3.5 h-3.5 mr-1 text-text-muted" />
                      Configure
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modals and Drawers */}
      <NewAreaDialog
        open={isNewAreaOpen}
        onOpenChange={setIsNewAreaOpen}
        onSuccess={(id) => setActiveAreaId(id)}
      />

      <BulkPinDialog
        open={isBulkPinOpen}
        onOpenChange={setIsBulkPinOpen}
        areas={areas}
        initialAreaId={activeAreaId ?? undefined}
      />

      <AreaDetailDrawer
        initialPin={initialPin}
        areaId={activeAreaId}
        onClose={() => setActiveAreaId(null)}
      />
    </div>
  );
}
