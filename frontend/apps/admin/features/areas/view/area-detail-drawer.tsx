"use client";

import { useMemo, useState } from "react";
import { Badge, Button, Drawer, Input, Spinner } from "@vsolve/ui";
import { ApiRequestError } from "@vsolve/api-client";
import { describeError } from "@vsolve/query";
import { Plus, X } from "lucide-react";
import {
  useAddPin,
  useRemovePin,
  useServiceAreaDetail,
  useToggleService,
  useUpdateServiceArea,
} from "../queries";
import { AreaTargets } from "./area-targets";

interface AreaDetailDrawerProps {
  areaId: string | null;
  onClose: () => void;
  /** A PIN to add straight away (from "Link PIN to an area…" on a request). */
  initialPin?: string;
}

export function AreaDetailDrawer({ areaId, onClose, initialPin = "" }: AreaDetailDrawerProps) {
  const { data: area, isLoading, error } = useServiceAreaDetail(areaId);
  const [newPin, setNewPin] = useState(initialPin);
  // A PIN we have never loaded needs its place name before it can join an area.
  const [needsPlace, setNeedsPlace] = useState(false);
  const [newCity, setNewCity] = useState("");
  const [newState, setNewState] = useState("");
  const [serviceSearch, setServiceSearch] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const updateMutation = useUpdateServiceArea();
  const addPinMutation = useAddPin();
  const removePinMutation = useRemovePin();
  const toggleServiceMutation = useToggleService();

  // Group services by trade_name
  const servicesByTrade = useMemo(() => {
    if (!area?.services) return [];
    const map = new Map<string, typeof area.services>();
    area.services.forEach((s) => {
      const trade = s.trade_name || "General";
      const list = map.get(trade) ?? [];
      list.push(s);
      map.set(trade, list);
    });
    return Array.from(map.entries()).map(([trade, services]) => ({
      trade,
      services,
    }));
  }, [area?.services]);

  const filteredServicesByTrade = useMemo(() => {
    if (!serviceSearch.trim()) return servicesByTrade;
    const q = serviceSearch.trim().toLowerCase();
    return servicesByTrade
      .map(({ trade, services }) => ({
        trade,
        services: services.filter(
          (s) => s.variant_name.toLowerCase().includes(q) || trade.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.services.length > 0);
  }, [servicesByTrade, serviceSearch]);

  if (!areaId) return null;

  const handleToggleAccepting = (checked: boolean) => {
    setActionError(null);
    updateMutation.mutate(
      {
        areaId,
        body: { is_accepting_partners: checked },
      },
      {
        onError: (err) => setActionError(describeError(err).message),
      },
    );
  };

  const handleAddPin = (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    const pin = newPin.trim();
    if (!pin) return;

    addPinMutation.mutate(
      {
        areaId,
        postalCode: pin,
        city: newCity.trim(),
        state: newState.trim(),
      },
      {
        onSuccess: () => {
          setNewPin("");
          setNewCity("");
          setNewState("");
          setNeedsPlace(false);
        },
        onError: (err) => {
          if (err instanceof ApiRequestError && err.code === "postal_code_not_found") {
            setNeedsPlace(true);
            setActionError("We have not loaded this PIN yet. Add its city and state, then add it again.");
            return;
          }
          setActionError(describeError(err).message);
        },
      },
    );
  };

  const handleRemovePin = (pin: string) => {
    if (!window.confirm(`Remove postal code ${pin} from this service area?`)) return;
    setActionError(null);
    removePinMutation.mutate(
      {
        areaId,
        postalCode: pin,
      },
      {
        onError: (err) => setActionError(describeError(err).message),
      },
    );
  };

  const handleToggleVariant = (variantId: string, currentActive: boolean) => {
    setActionError(null);
    toggleServiceMutation.mutate(
      {
        areaId,
        variantId,
        isActive: !currentActive,
      },
      {
        onError: (err) => setActionError(describeError(err).message),
      },
    );
  };

  const handleToggleCategory = (
    tradeServices: { variant_id: string; is_active: boolean }[],
    targetActive: boolean,
  ) => {
    if (!areaId) return;
    setActionError(null);
    const variantIds = tradeServices.map((s) => s.variant_id);
    toggleServiceMutation.mutate(
      {
        areaId,
        variantIds,
        isActive: targetActive,
      },
      {
        onError: (err) => setActionError(describeError(err).message),
      },
    );
  };

  return (
    <Drawer
      open={Boolean(areaId)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      trigger={<span className="hidden" />}
      title={area?.name ?? "Service Area Details"}
      size="xl"
    >
      <div className="space-y-6 text-sm">
        {isLoading ? (
          <div className="flex justify-center p-8">
            <Spinner />
          </div>
        ) : error || !area ? (
          <div className="rounded bg-danger-surface p-3 text-xs text-danger-text border border-danger-line">
            {describeError(error ?? new Error("Area not found")).message}
          </div>
        ) : (
          <>
            {actionError ? (
              <div className="rounded bg-danger-surface p-3 text-xs text-danger-text border border-danger-line">
                {actionError}
              </div>
            ) : null}

            {/* Area Header & Info */}
            <div className="rounded-control border border-line bg-surface-sunken p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-extrabold text-base text-text">{area.name}</h3>
                  <span className="text-xs text-text-muted font-mono">{area.slug}</span>
                </div>
                <div className="flex items-center gap-2">
                  {area.zone ? <Badge tone="neutral">{area.zone}</Badge> : null}
                  {area.state_code ? <Badge tone="neutral">{area.state_code}</Badge> : null}
                  <Badge tone={area.is_accepting_partners ? "success" : "warning"}>
                    {area.is_accepting_partners ? "Accepting Partners" : "Paused"}
                  </Badge>
                </div>
              </div>

              <div className="pt-2 border-t border-line/60 flex items-center justify-between">
                <span className="text-xs font-semibold text-text">Accept New Partners:</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={area.is_accepting_partners}
                    onChange={(e) => handleToggleAccepting(e.target.checked)}
                    disabled={updateMutation.isPending}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-line peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-action"></div>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-line/60 text-center text-xs">
                <div>
                  <span className="block text-text-muted text-[10px] uppercase font-bold">Total Partners</span>
                  <span className="font-extrabold text-success-text text-base">{area.partner_count}</span>
                </div>
                <div>
                  <span className="block text-text-muted text-[10px] uppercase font-bold">Active Services</span>
                  <span className="font-extrabold text-text text-base">
                    {area.services_active_count} / {area.services_total_count}
                  </span>
                </div>
              </div>
            </div>

            {/* Postal Codes Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-text">Assigned PIN Codes ({area.postal_codes.length})</h4>
                  <p className="text-xs text-text-secondary">Pincodes covered exclusively by this area.</p>
                </div>
              </div>

              {/* Add PIN Form */}
              <form onSubmit={handleAddPin} className="flex flex-wrap gap-2">
                <Input
                  value={newPin}
                  onChange={(e) => {
                    setNewPin(e.target.value);
                    setNeedsPlace(false);
                  }}
                  placeholder="Enter 6-digit PIN"
                  maxLength={6}
                  className="font-mono text-xs"
                />
                <Button
                  variant="secondary"
                  type="submit"
                  disabled={addPinMutation.isPending || !newPin.trim()}
                  className="shrink-0 text-xs"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Add PIN
                </Button>
                {needsPlace ? (
                  <div className="flex w-full gap-2">
                    <Input
                      value={newCity}
                      onChange={(e) => setNewCity(e.target.value)}
                      placeholder="City"
                      className="text-xs"
                    />
                    <Input
                      value={newState}
                      onChange={(e) => setNewState(e.target.value)}
                      placeholder="State"
                      className="text-xs"
                    />
                  </div>
                ) : null}
              </form>

              {/* PIN list chips */}
              <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-1 border border-line rounded bg-surface">
                {area.postal_codes.length === 0 ? (
                  <p className="text-xs text-text-muted p-2 italic">No PIN codes assigned yet.</p>
                ) : (
                  area.postal_codes.map((pin) => (
                    <div
                      key={pin}
                      className="inline-flex items-center gap-1.5 rounded bg-surface-sunken px-2.5 py-1 text-xs border border-line font-mono font-medium"
                    >
                      <span>{pin}</span>
                      <button
                        type="button"
                        onClick={() => handleRemovePin(pin)}
                        disabled={removePinMutation.isPending}
                        className="text-text-muted hover:text-danger-text transition-colors"
                        title="Remove PIN"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <AreaTargets areaId={area.id} />

            {/* Enabled Services & Trades Section */}
            <div className="space-y-3 pt-2 border-t border-line">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="font-bold text-text">Service Variants & Trades</h4>
                  <p className="text-xs text-text-secondary">Toggle services offered in this service area.</p>
                </div>
                {servicesByTrade.length > 0 ? (
                  <div className="w-full sm:w-56">
                    <Input
                      value={serviceSearch}
                      onChange={(e) => setServiceSearch(e.target.value)}
                      placeholder="Search services..."
                      className="text-xs h-8"
                    />
                  </div>
                ) : null}
              </div>

              <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
                {filteredServicesByTrade.length === 0 ? (
                  <p className="text-xs text-text-muted p-3 text-center italic bg-surface rounded border border-line">
                    {serviceSearch ? "No services match your search." : "No services available."}
                  </p>
                ) : (
                  filteredServicesByTrade.map(({ trade, services }) => {
                    const activeCount = services.filter((s) => s.is_active).length;
                    const allActive = activeCount === services.length && services.length > 0;

                    return (
                      <div key={trade} className="rounded border border-line p-3 bg-surface">
                        <div className="flex flex-wrap justify-between items-center gap-2 mb-2 pb-2 border-b border-line/60">
                          <div>
                            <span className="font-bold text-xs uppercase tracking-wide text-text">
                              {trade}
                            </span>
                            <span className="text-[11px] text-text-muted ml-2">
                              ({activeCount} of {services.length} active)
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleToggleCategory(services, !allActive)}
                              disabled={toggleServiceMutation.isPending}
                              className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors flex items-center gap-1 border ${
                                allActive
                                  ? "bg-surface-sunken text-danger-text hover:bg-danger-surface border-line hover:border-danger-line"
                                  : "bg-success-surface text-success-text hover:bg-success-surface/80 border border-success-line"
                              }`}
                              title={allActive ? `Disable all in ${trade}` : `Enable all in ${trade}`}
                            >
                              {allActive ? "Disable All" : "Enable All"}
                            </button>
                            {!allActive && activeCount > 0 ? (
                              <button
                                type="button"
                                onClick={() => handleToggleCategory(services, false)}
                                disabled={toggleServiceMutation.isPending}
                                className="px-2 py-0.5 rounded text-[11px] font-medium text-text-muted hover:text-danger-text hover:bg-danger-surface border border-transparent hover:border-danger-line transition-colors"
                                title={`Disable all ${activeCount} currently active services`}
                              >
                                Disable All
                              </button>
                            ) : null}
                          </div>
                        </div>

                        <div className="space-y-2">
                        {services.map((variant) => (
                          <div
                            key={variant.variant_id}
                            className="flex items-center justify-between text-xs py-1 border-b border-line/40 last:border-0"
                          >
                            <div>
                              <span className="font-medium text-text block">{variant.variant_name}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleToggleVariant(variant.variant_id, variant.is_active)}
                              disabled={toggleServiceMutation.isPending}
                              className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${
                                variant.is_active
                                  ? "bg-success-surface text-success-text hover:bg-success-surface/80 border border-success-line"
                                  : "bg-surface-sunken text-text-muted hover:text-text border border-line"
                              }`}
                            >
                              {variant.is_active ? "Enabled" : "Disabled"}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
              </div>
            </div>
          </>
        )}
      </div>
    </Drawer>
  );
}
