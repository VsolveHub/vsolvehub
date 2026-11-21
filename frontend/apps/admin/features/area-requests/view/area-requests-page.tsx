"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge, Button, EmptyState, ErrorState, Input, PageHeader, Spinner } from "@vsolve/ui";
import { describeError } from "@vsolve/query";
import { Bell, Check, ExternalLink, HelpCircle, Inbox, MapPinPlus, Search, XCircle } from "lucide-react";
import {
  type OperationsAreaRequestGroup,
  useAreaRequests,
  useDismissAreaRequest,
  useNotifyAreaRequest,
} from "../queries";
import { OpenAreaDialog } from "./open-area-dialog";

export function AreaRequestsPage() {
  const [status, setStatus] = useState<string>("ALL");
  const [trade, setTrade] = useState<string>("ALL");
  const [search, setSearch] = useState<string>("");

  const [openFor, setOpenFor] = useState<OperationsAreaRequestGroup | null>(null);
  const [notificationResult, setNotificationResult] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const {
    data: requests = [],
    isLoading,
    error,
    refetch,
  } = useAreaRequests({
    status: status !== "ALL" ? status : undefined,
    trade: trade !== "ALL" ? trade : undefined,
    search: search.trim() || undefined,
  });

  const notifyMutation = useNotifyAreaRequest();
  const dismissMutation = useDismissAreaRequest();

  // Extract all distinct trade names from data
  const availableTrades = useMemo(() => {
    const set = new Set<string>();
    requests.forEach((item: OperationsAreaRequestGroup) => {
      item.trade_counts.forEach((t) => set.add(t.trade_name));
    });
    return Array.from(set).sort();
  }, [requests]);

  const totalAsks = useMemo(() => {
    return requests.reduce((acc: number, curr: OperationsAreaRequestGroup) => acc + curr.request_count, 0);
  }, [requests]);

  const handleNotify = (postalCode: string) => {
    if (
      !window.confirm(
        `Send notifications to partners who requested PIN ${postalCode}? Each partner will receive an update tailored to their application status.`,
      )
    ) {
      return;
    }
    setActionError(null);
    setNotificationResult(null);

    notifyMutation.mutate(postalCode, {
      onSuccess: (data) => {
        setNotificationResult(
          `Successfully notified ${data.notified_count} partner(s) for PIN ${postalCode}.`,
        );
      },
      onError: (err) => {
        setActionError(describeError(err).message);
      },
    });
  };

  const handleDismiss = (postalCode: string) => {
    if (
      !window.confirm(
        `Mark area requests for PIN ${postalCode} as not valid / dismissed?`,
      )
    ) {
      return;
    }
    setActionError(null);
    setNotificationResult(null);

    dismissMutation.mutate(
      { postalCode, reason: "Marked not valid by Operations" },
      {
        onSuccess: (data) => {
          setNotificationResult(
            `Dismissed ${(data as { count?: number } | undefined)?.count ?? 1} request(s) for PIN ${postalCode}.`,
          );
        },
        onError: (err) => {
          setActionError(describeError(err).message);
        },
      },
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Partner Area Requests"
        description="Pincodes requested by applicants during onboarding where coverage was not yet available."
      />

      {notificationResult ? (
        <div className="rounded bg-success-surface p-3 text-xs text-success-text border border-success-line flex justify-between items-center">
          <span>{notificationResult}</span>
          <button
            onClick={() => setNotificationResult(null)}
            className="text-text-muted hover:text-text font-bold text-sm"
          >
            ×
          </button>
        </div>
      ) : null}

      {actionError ? (
        <div className="rounded bg-danger-surface p-3 text-xs text-danger-text border border-danger-line flex justify-between items-center">
          <span>{actionError}</span>
          <button
            onClick={() => setActionError(null)}
            className="text-text-muted hover:text-text font-bold text-sm"
          >
            ×
          </button>
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
              placeholder="Search PIN code or place..."
              className="pl-8 text-xs"
            />
          </div>

          <div className="flex items-center gap-1.5 text-xs text-text-secondary">
            <span className="font-medium">Status:</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="rounded border border-line bg-surface p-1.5 text-xs text-text"
            >
              <option value="ALL">All Statuses</option>
              <option value="WAITING">Waiting (No area)</option>
              <option value="READY">Ready (Area now open)</option>
              <option value="AREA_FULL">Area Full (Paused)</option>
              <option value="DONE">Done (partner holds the area)</option>
              <option value="NOT_VALID">Not valid</option>
            </select>
          </div>

          {availableTrades.length > 0 ? (
            <div className="flex items-center gap-1.5 text-xs text-text-secondary">
              <span className="font-medium">Trade:</span>
              <select
                value={trade}
                onChange={(e) => setTrade(e.target.value)}
                className="rounded border border-line bg-surface p-1.5 text-xs text-text"
              >
                <option value="ALL">All Trades</option>
                {availableTrades.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>

        <div className="text-xs text-text-muted font-medium">
          {totalAsks} total applicant ask(s)
        </div>
      </div>

      {/* Table Content */}
      {isLoading ? (
        <div className="flex justify-center p-12">
          <Spinner />
        </div>
      ) : error ? (
        <ErrorState
          title="Could not load area requests"
          message={describeError(error).message}
          actionLabel="Try Again"
          onAction={() => refetch()}
        />
      ) : requests.length === 0 ? (
        <EmptyState
          icon={<Inbox className="h-8 w-8 text-text-muted" />}
          title="No area requests found"
          description="There are currently no partner requests matching your filters."
        />
      ) : (
        <div className="overflow-x-auto rounded-control border border-line bg-surface">
          <table className="w-full text-left text-xs divide-y divide-line">
            <thead className="bg-surface-sunken text-text-secondary font-semibold">
              <tr>
                <th className="p-3">PIN Code & Place</th>
                <th className="p-3">Live Status</th>
                <th className="p-3">Trade Breakdown</th>
                <th className="p-3 text-right">Asks</th>
                <th className="p-3 text-right">Customer lookups 28d</th>
                <th className="p-3">First Requested</th>
                <th className="p-3">Notification Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {requests.map((req: OperationsAreaRequestGroup) => (
                <tr key={req.postal_code} className="hover:bg-surface-hover/50">
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sm text-text">
                        {req.postal_code}
                      </span>
                      {req.in_pin_list ? (
                        <span className="inline-flex items-center text-[10px] text-success-text" title="Known in PIN database">
                          <Check className="w-3 h-3 mr-0.5" />
                          {req.place || "Verified"}
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-[10px] text-warning-text" title="Uncatalogued PIN code">
                          <HelpCircle className="w-3 h-3 mr-0.5" />
                          Unknown Place
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-3">
                    {req.status === "READY" ? (
                      <Badge tone="success">
                        Ready · in {req.covering_area_name ?? "area"}
                      </Badge>
                    ) : req.status === "AREA_FULL" ? (
                      <Badge tone="warning">
                        Area Full · {req.covering_area_name ?? "area"}
                      </Badge>
                    ) : req.status === "WAITING" ? (
                      <Badge tone="neutral">Waiting (No area)</Badge>
                    ) : req.status === "NOT_VALID" ? (
                      <Badge tone="danger">Not valid</Badge>
                    ) : req.status === "DONE" ? (
                      <Badge tone="success">Done</Badge>
                    ) : (
                      <Badge tone="neutral">{req.status}</Badge>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      {req.trade_counts.map((t) => (
                        <span
                          key={t.trade_name}
                          className="inline-flex items-center rounded bg-surface-sunken px-2 py-0.5 text-[11px] font-medium border border-line"
                        >
                          {t.trade_name}{" "}
                          <span className="ml-1 font-bold text-text-secondary">({t.count})</span>
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="p-3 text-right font-extrabold text-text font-mono text-sm">
                    {req.request_count}
                  </td>
                  <td
                    className="p-3 text-right font-mono text-text-secondary"
                    title="Customers who tried this PIN and were turned away in the last 28 days"
                  >
                    {req.customer_lookups_28d}
                  </td>
                  <td className="p-3 text-text-secondary">
                    {new Date(req.first_requested_at).toLocaleDateString()}
                  </td>
                  <td className="p-3 text-text-secondary">
                    {req.notified_at ? (
                      <span className="text-success-text font-medium text-[11px]">
                        Notified on {new Date(req.notified_at).toLocaleDateString()}
                      </span>
                    ) : (
                      <span className="text-text-muted text-[11px]">Not notified</span>
                    )}
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex justify-end items-center gap-2">
                      {req.status === "READY" ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleNotify(req.postal_code)}
                          disabled={notifyMutation.isPending}
                          className="text-[11px] py-1 px-2"
                        >
                          <Bell className="w-3 h-3 mr-1" />
                          Notify
                        </Button>
                      ) : null}

                      {req.status === "WAITING" ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setOpenFor(req)}
                          className="text-[11px] py-1 px-2"
                        >
                          <MapPinPlus className="w-3 h-3 mr-1" />
                          Open new area
                        </Button>
                      ) : null}

                      <Link href={`/operations/areas?pin=${req.postal_code}`}>
                        <Button variant="secondary" size="sm" className="text-[11px] py-1 px-2">
                          <ExternalLink className="w-3 h-3 mr-1" />
                          Link to Area
                        </Button>
                      </Link>

                      {req.status !== "NOT_VALID" && req.status !== "DONE" ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleDismiss(req.postal_code)}
                          disabled={dismissMutation.isPending}
                          className="text-[11px] py-1 px-2 text-danger-text hover:bg-danger-surface/20"
                        >
                          <XCircle className="w-3 h-3 mr-1" />
                          Mark not valid
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <OpenAreaDialog
        group={openFor}
        onOpenChange={(open) => {
          if (!open) setOpenFor(null);
        }}
        onOpened={(areaName) =>
          setNotificationResult(`Opened ${areaName}. Notify the partners when you are ready.`)
        }
      />
    </div>
  );
}
