import Link from "next/link";
import { Clock, CheckCircle2, ArrowRight, Hourglass, RefreshCw, AlertTriangle, type LucideIcon } from "lucide-react";
import { cn } from "@vsolve/ui";
import { Medallion, type Tone } from "@/components/graphics";
import { logout } from "./actions";
import type { Props } from "./types";

/* ------------------------------------------------------------------ *
 * GATE — non-active states (draft / pending / attention).
 * ------------------------------------------------------------------ */
export function GateScreen(p: Props) {
  if (p.status === "DRAFT") {
    return (
      <GateLayout
        name={p.name}
        icon={Hourglass}
        tone="amber"
        badge="Application incomplete"
        badgeTone="amber"
        title="Finish your application"
        body="You're a few steps away from going live. Complete your profile to get verified and start earning."
        cta={{ href: "/onboarding", label: "Continue application" }}
      />
    );
  }
  if (p.status === "PENDING") {
    return (
      <GateLayout
        name={p.name}
        icon={Clock}
        tone="brand"
        badge="Verification in progress"
        badgeTone="brand"
        title="Almost there!"
        body="Our team is reviewing your documents. We take safety seriously — this usually takes 24–48 hours. We'll notify you by SMS."
        cta={{ href: "/dashboard/support", label: "Chat with Support" }}
      >
        <div className="mt-5 space-y-2.5 text-left">
          <Journey state="done" title="Submitted" body="Profile & documents uploaded" />
          <Journey state="active" title="Under review" body="Being verified by our team" />
          <Journey state="todo" title="Decision" body="You'll be notified via app & SMS" last />
        </div>
      </GateLayout>
    );
  }
  // ACTION_REQUIRED / REJECTED / SUSPENDED
  return (
    <GateLayout
      name={p.name}
      icon={AlertTriangle}
      tone="rose"
      badge={p.status === "ACTION_REQUIRED" ? "Action required" : "Needs attention"}
      badgeTone="rose"
      title="Application needs a few fixes"
      body={p.reason}
      cta={{ href: "/dashboard/documents", label: "Re-submit documents" }}
    >
      <p className="mt-5 mb-2 text-left text-xs font-bold uppercase tracking-wide text-gray-400">
        Checklist · Ref {p.refId}
      </p>
      <ul className="space-y-2 text-left">
        {p.checklist.map((c) => (
          <li key={c.label} className="flex items-center gap-2 rounded-xl border border-border bg-white p-2.5 text-sm">
            {c.ok ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
            )}
            <span className={c.ok ? "text-gray-500" : "font-semibold text-ink-900"}>{c.label}</span>
          </li>
        ))}
      </ul>
    </GateLayout>
  );
}

function GateLayout({
  name,
  icon,
  tone,
  badge,
  badgeTone,
  title,
  body,
  cta,
  children,
}: {
  name: string;
  icon: LucideIcon;
  tone: Tone;
  badge: string;
  badgeTone: "amber" | "brand" | "rose";
  title: string;
  body: string;
  cta: { href: string; label: string };
  children?: React.ReactNode;
}) {
  const badgeCls = {
    amber: "bg-amber-50 text-amber-700",
    brand: "bg-brand-50 text-brand-700",
    rose: "bg-red-50 text-red-600",
  }[badgeTone];
  return (
    <div className="vsh-rise flex min-h-full flex-col">
      <div className="mb-4 flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-base font-bold text-white">
          {name.charAt(0).toUpperCase()}
        </div>
        <div>
          <p className="text-[11px] text-gray-500">Hello</p>
          <p className="text-sm font-bold text-ink-900">{name}</p>
        </div>
      </div>

      <div className="rounded-3xl border border-border bg-white p-6 text-center shadow-sm">
        <div className="flex justify-center">
          <Medallion icon={icon} tone={tone} size={72} className="vsh-float" />
        </div>
        <div className="mt-4 flex justify-center">
          <span className={cn("rounded-full px-3 py-1 text-xs font-bold", badgeCls)}>{badge}</span>
        </div>
        <h2 className="mt-3 text-xl font-bold text-ink-900">{title}</h2>
        <p className="mx-auto mt-1.5 max-w-[18rem] text-sm text-gray-500">{body}</p>
        {children}
      </div>

      <Link
        href={cta.href}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3.5 font-bold text-white shadow-lg active:scale-[0.98]"
      >
        {cta.label} <ArrowRight className="h-4 w-4" />
      </Link>
      <form action={logout} className="mt-2">
        <button type="submit" className="w-full py-2 text-center text-sm font-medium text-gray-500">
          Log out
        </button>
      </form>
    </div>
  );
}

function Journey({
  state,
  title,
  body,
  last,
}: {
  state: "done" | "active" | "todo";
  title: string;
  body: string;
  last?: boolean;
}) {
  const dot = {
    done: "bg-green-500 text-white",
    active: "bg-brand-600 text-white ring-4 ring-brand-100",
    todo: "bg-gray-100 text-gray-400",
  }[state];
  const Icon = state === "done" ? CheckCircle2 : state === "active" ? RefreshCw : Clock;
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <span className={cn("grid h-7 w-7 place-items-center rounded-full", dot)}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        {!last && <span className="my-0.5 w-0.5 flex-1 bg-border" />}
      </div>
      <div className={last ? "" : "pb-2"}>
        <p className={cn("text-sm font-semibold", state === "active" ? "text-brand-700" : "text-ink-900")}>{title}</p>
        <p className="text-xs text-gray-500">{body}</p>
      </div>
    </div>
  );
}
