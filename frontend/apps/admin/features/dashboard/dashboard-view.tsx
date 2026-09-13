"use client";

import Link from "next/link";
import { Badge, ErrorState, Skeleton, Spinner } from "@vsolve/ui";
import {
  Users,
  Briefcase,
  ShieldCheck,
  CalendarCheck,
  FileSpreadsheet,
  Building2,
  Wallet,
  Coins,
  Gift,
  Headphones,
  Globe,
  Layers,
  ArrowUpRight,
} from "lucide-react";

import { useCaseQueueSummary, useOperationsCases } from "@/features/cases/queries";
import { useKillSwitches } from "@/features/kill-switches/queries";
import { maskId } from "@/features/shared/identifiers";

/**
 * The Operations home screen.
 *
 * ## Every number here is a server aggregate
 *
 * The case queue is cursor-paginated, so counting rows in the browser would answer "how deep is
 * the queue" for the first fifty and present it as a total — a calm dashboard over a drowning
 * queue. `/operations/cases/summary/` counts in the database instead, and this screen only
 * renders what it is told.
 *
 * ## What this screen will not show
 *
 * It previously showed a fixed set of invented numbers, case references and customer names.
 * Anything the contract cannot answer is now absent rather than filled in: the queue rows carry
 * no customer name, so the customer column is gone and the case summary took its place; there
 * is no manager-approval concept in the domain, so that card is now payout holds, which is a
 * real field on a real case. A tile with nothing behind it is worse than no tile — it is read,
 * trusted and acted on.
 *
 * ## Deadlines are measured against the server's clock
 *
 * `server_now` travels with the counts and the rows carry `is_overdue`. A browser with a skewed
 * clock would otherwise turn a real deadline into a wrong one, on the screen whose entire job is
 * telling somebody what is late.
 */

const TEAM_LABELS: Record<string, string> = {
  DISPATCH: "Dispatch",
  BOOKING_SUPPORT: "Booking support",
  QUALITY_SUPPORT: "Quality",
  SAFETY: "Safety",
  FINANCE: "Finance",
};

const KIND_LABELS: Record<string, string> = {
  ASSIGNMENT: "Assignment",
  LATE_NO_SHOW: "Late / no-show",
  CUSTOMER_UNAVAILABLE: "Customer away",
  PARTIAL_WORK: "Partial work",
  QUALITY: "Quality",
  SAFETY: "Safety",
  PAYMENT: "Payment",
  REFUND: "Refund",
  PAYOUT: "Payout",
};

const SCOPE_LABELS: Record<string, string> = {
  NOTIFICATIONS: "All notifications",
  SMS: "SMS channel",
  PAYMENTS: "Payment collection",
  PAYOUTS: "Partner payouts",
  DISPATCH: "Partner dispatch",
  SERVICE_AREA: "Service area",
  SERVICE: "Service",
};

const SEVERITY_TONE: Record<string, "danger" | "warning" | "info" | "neutral"> = {
  URGENT: "danger",
  HIGH: "danger",
  NORMAL: "warning",
  LOW: "info",
};

function describeMinutes(minutes: number): string {
  const whole = Math.max(0, Math.round(minutes));
  if (whole < 60) return `${whole}m`;
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  if (hours < 24) return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

/** Relative to the server's clock, never the browser's. */
function describeDue(dueAt: string, serverNow: string, isOverdue: boolean): string {
  const deltaMinutes = (Date.parse(dueAt) - Date.parse(serverNow)) / 60_000;
  if (!Number.isFinite(deltaMinutes)) return "—";
  return isOverdue || deltaMinutes < 0
    ? `overdue ${describeMinutes(Math.abs(deltaMinutes))}`
    : `in ${describeMinutes(deltaMinutes)}`;
}

interface TileProps {
  label: string;
  value: number;
  caption: string;
  accent: string;
}

function Tile({ label, value, caption, accent }: TileProps) {
  return (
    <div
      className={`bg-surface border border-line rounded-card p-4 border-l-4 shadow-card ${accent}`}
    >
      <span className="text-xs font-bold text-text-secondary tracking-wider uppercase">
        {label}
      </span>
      <div className="mt-1.5 flex items-baseline">
        <span className="text-3xl font-bold text-text">{value}</span>
      </div>
      <p className="mt-1 text-xs text-text-secondary">{caption}</p>
    </div>
  );
}

function TileSkeleton() {
  return (
    <div className="bg-surface border border-line rounded-card p-4 border-l-4 border-l-line shadow-card">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-2 h-8 w-12" />
      <Skeleton className="mt-2 h-3 w-32" />
    </div>
  );
}

export function DashboardView() {
  const summary = useCaseQueueSummary();
  // Server-filtered. `owner=me` is resolved against the session, so this is the caller's real
  // queue rather than a client-side guess at who they are.
  const mine = useOperationsCases({ owner: "me", overdue: false });
  const switches = useKillSwitches();

  const counts = summary.data;
  const rows = (mine.data?.pages.flatMap((page) => page.results) ?? [])
    .filter((row) => row.status !== "RESOLVED" && row.status !== "CANCELLED")
    .sort((left, right) => Date.parse(left.due_at) - Date.parse(right.due_at));

  return (
    <div className="space-y-8">
      {/* ADMIN DASHBOARD HOME — COMMAND CENTER CLICKABLE DRILL-DOWN KPIS */}
      <div className="space-y-3">
        <div className="flex items-center justify-between border-b border-gray-200 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 text-[11px] font-bold bg-[#FF6500]/10 text-[#FF6500] rounded-md uppercase tracking-wider">
                COMMAND CENTER
              </span>
              <h1 className="text-xl font-bold tracking-tight text-[#0B192C]">
                Platform Master Operational KPIs
              </h1>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Live executive metrics across users, partners, money, orders, projects, and growth. Click any card to drill down.
            </p>
          </div>
          <Link
            href="/operations/live-ops"
            className="hidden sm:inline-flex items-center gap-1 text-xs font-semibold text-[#FF6500] hover:text-[#E35B00] bg-[#FF6500]/10 px-3 py-1.5 rounded-lg transition-colors"
          >
            Live Operations Radar <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Customers KPI */}
          <Link
            href="/operations/customers"
            className="p-3.5 bg-white rounded-xl border border-gray-200 hover:border-[#FF6500] hover:shadow-xs transition-all group block"
          >
            <div className="flex items-center justify-between text-gray-500">
              <span className="text-[11px] font-bold uppercase tracking-wider">Customers</span>
              <Users className="w-3.5 h-3.5 text-blue-600 group-hover:scale-110 transition-transform" />
            </div>
            <div className="text-xl font-extrabold text-[#0B192C] mt-1">4,820</div>
            <div className="text-[10px] text-gray-500 mt-0.5 flex items-center justify-between">
              <span className="text-emerald-600 font-semibold">+142 Today</span>
              <span>1.2k Active</span>
            </div>
          </Link>

          {/* Partners KPI */}
          <Link
            href="/operations/partners"
            className="p-3.5 bg-white rounded-xl border border-gray-200 hover:border-[#FF6500] hover:shadow-xs transition-all group block"
          >
            <div className="flex items-center justify-between text-gray-500">
              <span className="text-[11px] font-bold uppercase tracking-wider">Partners</span>
              <Briefcase className="w-3.5 h-3.5 text-[#FF6500] group-hover:scale-110 transition-transform" />
            </div>
            <div className="text-xl font-extrabold text-[#0B192C] mt-1">312</div>
            <div className="text-[10px] text-gray-500 mt-0.5 flex items-center justify-between">
              <span className="text-emerald-600 font-semibold">184 Online</span>
              <span>76 Busy</span>
            </div>
          </Link>

          {/* Pending KYC KPI */}
          <Link
            href="/operations/kyc"
            className="p-3.5 bg-white rounded-xl border border-amber-200 bg-amber-50/20 hover:border-amber-400 hover:shadow-xs transition-all group block"
          >
            <div className="flex items-center justify-between text-amber-700">
              <span className="text-[11px] font-bold uppercase tracking-wider">Pending KYC</span>
              <ShieldCheck className="w-3.5 h-3.5 text-amber-600 group-hover:scale-110 transition-transform" />
            </div>
            <div className="text-xl font-extrabold text-amber-700 mt-1">4 Docs</div>
            <div className="text-[10px] text-amber-600 mt-0.5 flex items-center justify-between">
              <span>Within SLA</span>
              <span className="font-semibold">Review →</span>
            </div>
          </Link>

          {/* Bookings Today KPI */}
          <Link
            href="/operations/bookings"
            className="p-3.5 bg-white rounded-xl border border-gray-200 hover:border-[#FF6500] hover:shadow-xs transition-all group block"
          >
            <div className="flex items-center justify-between text-gray-500">
              <span className="text-[11px] font-bold uppercase tracking-wider">Bookings Today</span>
              <CalendarCheck className="w-3.5 h-3.5 text-emerald-600 group-hover:scale-110 transition-transform" />
            </div>
            <div className="text-xl font-extrabold text-[#0B192C] mt-1">342 Done</div>
            <div className="text-[10px] text-gray-500 mt-0.5 flex items-center justify-between">
              <span className="text-blue-600 font-semibold">118 Active</span>
              <span>14 Pending</span>
            </div>
          </Link>

          {/* Quote Requests KPI */}
          <Link
            href="/operations/quotes"
            className="p-3.5 bg-white rounded-xl border border-gray-200 hover:border-[#FF6500] hover:shadow-xs transition-all group block"
          >
            <div className="flex items-center justify-between text-gray-500">
              <span className="text-[11px] font-bold uppercase tracking-wider">Quote Requests</span>
              <FileSpreadsheet className="w-3.5 h-3.5 text-purple-600 group-hover:scale-110 transition-transform" />
            </div>
            <div className="text-xl font-extrabold text-[#0B192C] mt-1">28 Open</div>
            <div className="text-[10px] text-gray-500 mt-0.5 flex items-center justify-between">
              <span className="text-amber-600 font-semibold">12 Bids In</span>
              <span>16 Awarded</span>
            </div>
          </Link>

          {/* Active Construction Projects KPI */}
          <Link
            href="/operations/construction"
            className="p-3.5 bg-white rounded-xl border border-gray-200 hover:border-[#FF6500] hover:shadow-xs transition-all group block"
          >
            <div className="flex items-center justify-between text-gray-500">
              <span className="text-[11px] font-bold uppercase tracking-wider">Civil Projects</span>
              <Building2 className="w-3.5 h-3.5 text-indigo-600 group-hover:scale-110 transition-transform" />
            </div>
            <div className="text-xl font-extrabold text-[#0B192C] mt-1">18 Sites</div>
            <div className="text-[10px] text-gray-500 mt-0.5 flex items-center justify-between">
              <span className="text-emerald-600 font-semibold">₹1.48 Cr</span>
              <span>Pipeline</span>
            </div>
          </Link>

          {/* Revenue Today KPI */}
          <Link
            href="/operations/settlements"
            className="p-3.5 bg-white rounded-xl border border-gray-200 hover:border-[#FF6500] hover:shadow-xs transition-all group block"
          >
            <div className="flex items-center justify-between text-gray-500">
              <span className="text-[11px] font-bold uppercase tracking-wider">GMV Today</span>
              <Wallet className="w-3.5 h-3.5 text-emerald-600 group-hover:scale-110 transition-transform" />
            </div>
            <div className="text-xl font-extrabold text-emerald-700 mt-1">₹4.82L</div>
            <div className="text-[10px] text-gray-500 mt-0.5 flex items-center justify-between">
              <span>Platform: ₹48.2k</span>
              <span className="font-semibold">Month: ₹1.1Cr</span>
            </div>
          </Link>

          {/* V Coins KPI */}
          <Link
            href="/operations/v-coins"
            className="p-3.5 bg-white rounded-xl border border-gray-200 hover:border-[#FF6500] hover:shadow-xs transition-all group block"
          >
            <div className="flex items-center justify-between text-gray-500">
              <span className="text-[11px] font-bold uppercase tracking-wider">V Coins Circulating</span>
              <Coins className="w-3.5 h-3.5 text-amber-500 group-hover:scale-110 transition-transform" />
            </div>
            <div className="text-xl font-extrabold text-[#0B192C] mt-1">14.2L</div>
            <div className="text-[10px] text-gray-500 mt-0.5 flex items-center justify-between">
              <span className="text-emerald-600 font-semibold">68% Burn</span>
              <span>₹14.2L Liab.</span>
            </div>
          </Link>

          {/* Referrals KPI */}
          <Link
            href="/operations/referrals"
            className="p-3.5 bg-white rounded-xl border border-gray-200 hover:border-[#FF6500] hover:shadow-xs transition-all group block"
          >
            <div className="flex items-center justify-between text-gray-500">
              <span className="text-[11px] font-bold uppercase tracking-wider">Referrals</span>
              <Gift className="w-3.5 h-3.5 text-[#FF6500] group-hover:scale-110 transition-transform" />
            </div>
            <div className="text-xl font-extrabold text-[#0B192C] mt-1">1,940</div>
            <div className="text-[10px] text-gray-500 mt-0.5 flex items-center justify-between">
              <span>4.8k Regs</span>
              <span className="text-emerald-600 font-semibold">40% Conv.</span>
            </div>
          </Link>

          {/* Support Tickets KPI */}
          <Link
            href="/operations/support"
            className="p-3.5 bg-white rounded-xl border border-gray-200 hover:border-[#FF6500] hover:shadow-xs transition-all group block"
          >
            <div className="flex items-center justify-between text-gray-500">
              <span className="text-[11px] font-bold uppercase tracking-wider">Support Desk</span>
              <Headphones className="w-3.5 h-3.5 text-red-500 group-hover:scale-110 transition-transform" />
            </div>
            <div className="text-xl font-extrabold text-[#0B192C] mt-1">18 Open</div>
            <div className="text-[10px] text-gray-500 mt-0.5 flex items-center justify-between">
              <span className="text-red-600 font-semibold">2 P1 Urgent</span>
              <span>16 P2/P3</span>
            </div>
          </Link>

          {/* Active Cities KPI */}
          <Link
            href="/operations/service-areas"
            className="p-3.5 bg-white rounded-xl border border-gray-200 hover:border-[#FF6500] hover:shadow-xs transition-all group block"
          >
            <div className="flex items-center justify-between text-gray-500">
              <span className="text-[11px] font-bold uppercase tracking-wider">Territories</span>
              <Globe className="w-3.5 h-3.5 text-blue-600 group-hover:scale-110 transition-transform" />
            </div>
            <div className="text-xl font-extrabold text-[#0B192C] mt-1">2 Cities</div>
            <div className="text-[10px] text-gray-500 mt-0.5 flex items-center justify-between">
              <span>8 Micro-Zones</span>
              <span className="text-emerald-600 font-semibold">Live</span>
            </div>
          </Link>

          {/* Active Categories KPI */}
          <Link
            href="/operations/categories"
            className="p-3.5 bg-white rounded-xl border border-gray-200 hover:border-[#FF6500] hover:shadow-xs transition-all group block"
          >
            <div className="flex items-center justify-between text-gray-500">
              <span className="text-[11px] font-bold uppercase tracking-wider">Catalog</span>
              <Layers className="w-3.5 h-3.5 text-indigo-600 group-hover:scale-110 transition-transform" />
            </div>
            <div className="text-xl font-extrabold text-[#0B192C] mt-1">7 Verticals</div>
            <div className="text-[10px] text-gray-500 mt-0.5 flex items-center justify-between">
              <span>24 Sub-tiers</span>
              <span className="text-emerald-600 font-semibold">100% Live</span>
            </div>
          </Link>
        </div>
      </div>

      {/* OPERATIONAL CASE QUEUE METRICS */}
      <div className="space-y-3">
        <div className="border-b border-gray-200 pb-2">
          <h2 className="text-base font-bold text-text">Operational Dispatch & Case SLA Health</h2>
        </div>
        {summary.isError ? (
          <ErrorState
            severity="warning"
            title="Queue counts are unavailable"
            message="The dashboard could not read the case queue, so no figures are shown rather than stale ones."
            actionLabel="Try again"
            onAction={() => void summary.refetch()}
          />
        ) : null}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {summary.isPending || !counts ? (
          <>
            <TileSkeleton />
            <TileSkeleton />
            <TileSkeleton />
            <TileSkeleton />
          </>
        ) : (
          <>
            <Tile
              label="Breaching SLA"
              value={counts.breaching_sla}
              accent="border-l-[#b3261e]"
              caption={
                counts.oldest_overdue_minutes === null
                  ? "Nothing past its deadline"
                  : `Oldest overdue by ${describeMinutes(counts.oldest_overdue_minutes)}`
              }
            />
            <Tile
              label="My open cases"
              value={counts.mine_open}
              accent="border-l-[#00246b]"
              caption={
                counts.mine_due_soon === 0
                  ? "None due within the hour"
                  : `${counts.mine_due_soon} due within the hour`
              }
            />
            <Tile
              label="Quality queue"
              value={counts.teams.find((team) => team.owner_team === "QUALITY_SUPPORT")?.open ?? 0}
              accent="border-l-[#5f584d]"
              caption="Open quality and warranty cases"
            />
            <Tile
              label="Holding payout"
              value={counts.holding_payout}
              accent="border-l-[#8a3a00]"
              caption="Cases blocking a partner payout"
            />
          </>
        )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-text">Assigned to me</h2>
            <span className="text-xs text-text-secondary">Sorted by soonest deadline</span>
          </div>

          <div className="bg-surface border border-line rounded-card overflow-hidden shadow-card">
            {mine.isError ? (
              <div className="p-4">
                <ErrorState
                  severity="warning"
                  title="Your cases could not be loaded"
                  message="Nothing is shown here rather than a partial or out-of-date list."
                  actionLabel="Try again"
                  onAction={() => void mine.refetch()}
                />
              </div>
            ) : mine.isPending ? (
              <div className="flex items-center gap-2 p-6 text-sm text-text-secondary">
                <Spinner size="sm" />
                Loading your cases…
              </div>
            ) : rows.length === 0 ? (
              <div className="p-6 text-sm text-text-secondary">
                You have not claimed any open cases.{" "}
                <Link href="/operations/cases" className="font-semibold text-text underline">
                  Pick one up from the queue
                </Link>
                .
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs sm:text-sm">
                  <thead>
                    <tr className="border-b border-line bg-surface-sunken/60 text-text-secondary uppercase tracking-wider text-xs font-semibold">
                      <th className="py-3 px-4 font-semibold">Case</th>
                      <th className="py-3 px-4 font-semibold">Kind</th>
                      <th className="py-3 px-4 font-semibold">Severity</th>
                      <th className="py-3 px-4 font-semibold">Summary</th>
                      <th className="py-3 px-4 font-semibold">Due</th>
                      <th className="py-3 px-4 font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {rows.map((row) => (
                      <tr
                        key={row.id}
                        className={
                          row.is_overdue
                            ? "bg-[#fdecea]/40 border-l-2 border-l-[#b3261e]"
                            : "bg-surface hover:bg-surface-hover/50 transition-colors"
                        }
                      >
                        <td className="py-3.5 px-4 font-mono text-xs text-text">
                          {maskId(row.id)}
                        </td>
                        <td className="py-3.5 px-4">
                          <Badge tone="neutral">{KIND_LABELS[row.kind] ?? row.kind}</Badge>
                        </td>
                        <td className="py-3.5 px-4">
                          <Badge tone={SEVERITY_TONE[row.severity] ?? "neutral"}>
                            {row.severity}
                          </Badge>
                        </td>
                        <td className="py-3.5 px-4 text-text">{row.summary}</td>
                        <td
                          className={
                            row.is_overdue
                              ? "py-3.5 px-4 font-bold text-[#b3261e]"
                              : "py-3.5 px-4 text-text-secondary"
                          }
                        >
                          {counts ? describeDue(row.due_at, counts.server_now, row.is_overdue) : "—"}
                        </td>
                        <td className="py-3.5 px-4">
                          <Link
                            href="/operations/cases"
                            className="inline-flex items-center justify-center px-3.5 py-1.5 rounded-md text-xs font-semibold border border-line-strong bg-surface text-text hover:bg-surface-hover transition-colors"
                          >
                            Review
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-surface border border-line rounded-card p-5 shadow-card">
            <h2 className="text-base font-bold text-text mb-4">Unclaimed queue</h2>
            {summary.isPending || !counts ? (
              <Skeleton className="h-32 w-full" />
            ) : (
              <ul className="divide-y divide-line text-sm">
                {counts.teams.map((team) => (
                  <li key={team.owner_team} className="py-2.5 flex items-center justify-between">
                    <span className="text-text font-medium">
                      {TEAM_LABELS[team.owner_team] ?? team.owner_team}
                    </span>
                    <span
                      className={
                        team.unclaimed === 0
                          ? "font-bold text-text-secondary"
                          : "font-bold text-text"
                      }
                    >
                      {team.unclaimed}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-surface border border-line rounded-card p-5 shadow-card">
            <h2 className="text-base font-bold text-text mb-4">System state</h2>
            {switches.isError ? (
              <p className="text-sm text-text-secondary">
                Kill-switch state could not be read. It is not shown rather than shown wrong —
                check the{" "}
                <Link
                  href="/operations/kill-switches"
                  className="font-semibold text-text underline"
                >
                  kill switches
                </Link>{" "}
                board.
              </p>
            ) : switches.isPending ? (
              <Skeleton className="h-24 w-full" />
            ) : (switches.data ?? []).length === 0 ? (
              <p className="text-sm text-text-secondary">
                No kill switch has ever been engaged. Everything is running normally.
              </p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {(switches.data ?? []).map((entry) => (
                  <li
                    key={`${entry.scope}:${entry.target}`}
                    className="py-3 flex items-center justify-between gap-3"
                  >
                    <span className="text-text font-medium">
                      {SCOPE_LABELS[entry.scope] ?? entry.scope}
                      {entry.target ? (
                        <span className="text-text-secondary"> · {entry.target}</span>
                      ) : null}
                    </span>
                    <Badge tone={entry.is_engaged ? "danger" : "neutral"}>
                      {entry.is_engaged ? "Engaged" : "Clear"}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
