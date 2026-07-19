import Link from "next/link";
import {
  BadgeCheck,
  Award,
  Star,
  Zap,
  ShieldCheck,
  Briefcase,
  IndianRupee,
  Banknote,
  CheckCircle2,
  ChevronRight,
  Car,
  Wrench,
  Users,
  FileText,
  Settings,
  HelpCircle,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@vsolve/ui";
import { Medallion, type Tone } from "@/components/graphics";
import { inr } from "@/lib/format";
import { logout } from "./actions";
import { Stat } from "./Stat";
import type { Props } from "./types";

/* ------------------------------------------------------------------ *
 * PROFILE tab.
 * ------------------------------------------------------------------ */
export function ProfileTab(p: Props & { todayJobs: number }) {
  const isDriver = p.providerType === "DRIVER";
  const menu: { icon: LucideIcon; label: string; href: string }[] = [
    isDriver
      ? { icon: Car, label: "Vehicle & Documents", href: "/dashboard/vehicle" }
      : { icon: Wrench, label: "Skills & Certificates", href: "/dashboard/skills" },
    { icon: Users, label: "My Crew", href: "/dashboard/crew" },
    { icon: FileText, label: "Documents", href: "/dashboard/documents" },
    { icon: Settings, label: "Account & Settings", href: "/dashboard/settings" },
    { icon: HelpCircle, label: "Help & Support", href: "/dashboard/support" },
  ];
  return (
    <div className="vsh-rise">
      <ProfileHeader name={p.name} service={p.service} city={p.city} tier={p.tier} />

      <div className="mt-4 grid grid-cols-3 gap-3">
        <Stat icon={Briefcase} tone="brand" label="Lifetime" value={p.jobsCompleted} />
        <Stat
          icon={Star}
          tone="green"
          label={p.reviewCount > 0 ? `${p.reviewCount} review${p.reviewCount === 1 ? "" : "s"}` : "Rating"}
          value={p.reviewCount > 0 ? p.rating.toFixed(1) : "New"}
        />
        <Stat icon={IndianRupee} tone="amber" label="Avg / day" value={inr(p.avgPerDay)} />
      </div>

      <ReviewsList reviews={p.reviews} />

      {p.bankLast4 && <BankCard bankLast4={p.bankLast4} />}

      <AchievementsRow tier={p.tier} />

      <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-white">
        {menu.map((m, i) => (
          <Link
            key={m.label}
            href={m.href}
            className={cn(
              "flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-surface-muted",
              i > 0 && "border-t border-border",
            )}
          >
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand-50 text-brand-600">
              <m.icon className="h-4.5 w-4.5" />
            </div>
            <span className="flex-1 text-sm font-medium text-ink-900">{m.label}</span>
            <ChevronRight className="h-4 w-4 text-gray-300" />
          </Link>
        ))}
      </div>

      <form action={logout} className="mt-4">
        <button
          type="submit"
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-white py-3 text-sm font-semibold text-gray-600 active:scale-[0.99]"
        >
          <LogOut className="h-4 w-4" /> Log out
        </button>
      </form>
    </div>
  );
}

function ProfileHeader({ name, service, city, tier }: { name: string; service: string; city: string; tier: string }) {
  return (
    <div className="rounded-3xl bg-gradient-to-br from-ink-800 to-brand-900 p-5 text-white shadow-lg">
      <div className="flex items-center gap-4">
        <div className="grid h-16 w-16 place-items-center rounded-2xl bg-white/15 text-2xl font-bold">
          {name.charAt(0).toUpperCase()}
        </div>
        <div>
          <p className="flex items-center gap-1.5 text-lg font-bold">
            {name} <BadgeCheck className="h-4.5 w-4.5 text-accent-400" />
          </p>
          <p className="text-xs text-white/70">
            {service || "Verified Captain"} · {city}
          </p>
          <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-accent-500 px-2 py-0.5 text-[11px] font-bold text-ink-900">
            <Award className="h-3 w-3" /> {tier}
          </span>
        </div>
      </div>
    </div>
  );
}

function ReviewsList({ reviews }: { reviews: Props["reviews"] }) {
  return (
    <>
      {/* Customer reviews — real feedback that drives the rating above. */}
      <p className="mb-2 mt-4 text-xs font-bold uppercase tracking-wide text-gray-400">Customer reviews</p>
      {reviews.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-white p-4 text-center text-xs text-gray-500">
          No reviews yet. Complete jobs to start earning ratings.
        </div>
      ) : (
        <div className="space-y-2">
          {reviews.map((r) => (
            <div key={r.bookingRef} className="rounded-2xl border border-border bg-white p-3.5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-ink-900">{r.customerName}</p>
                <span className="flex items-center gap-1 text-xs font-bold text-ink-900">
                  <Star className="h-3.5 w-3.5 fill-accent-400 text-accent-400" /> {r.rating.toFixed(1)}
                </span>
              </div>
              <p className="text-[11px] text-gray-400">
                {r.service} · {new Date(r.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
              </p>
              {r.review ? <p className="mt-1 text-xs text-gray-600">“{r.review}”</p> : null}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function BankCard({ bankLast4 }: { bankLast4: string }) {
  return (
    <div className="mt-4 flex items-center gap-3 rounded-2xl border border-border bg-white p-3.5">
      <div className="grid h-10 w-10 place-items-center rounded-lg bg-green-50 text-green-600">
        <Banknote className="h-5 w-5" />
      </div>
      <div className="flex-1">
        <p className="text-sm font-semibold text-ink-900">Bank ····{bankLast4}</p>
        <p className="text-[11px] text-gray-500">Linked for payouts</p>
      </div>
      <CheckCircle2 className="h-5 w-5 text-green-600" />
    </div>
  );
}

function AchievementsRow({ tier }: { tier: string }) {
  const achievements: { icon: LucideIcon; tone: Tone; label: string }[] = [
    { icon: Award, tone: "amber", label: tier.split(" ")[0]! },
    { icon: Star, tone: "green", label: "Top Rated" },
    { icon: Zap, tone: "violet", label: "Fast" },
    { icon: ShieldCheck, tone: "brand", label: "Verified" },
  ];
  return (
    <>
      <p className="mb-2 mt-4 text-xs font-bold uppercase tracking-wide text-gray-400">Achievements</p>
      <div className="flex justify-between rounded-2xl border border-border bg-white p-4">
        {achievements.map((a) => (
          <div key={a.label} className="flex flex-col items-center gap-1.5">
            <Medallion icon={a.icon} tone={a.tone} size={44} />
            <span className="text-[10px] font-medium text-gray-500">{a.label}</span>
          </div>
        ))}
      </div>
    </>
  );
}
