"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Power,
  Search,
  MapPin,
  Navigation,
  Phone,
  Star,
  IndianRupee,
  Clock,
  CheckCircle2,
  Circle,
  Camera,
  ShieldCheck,
  Wallet,
  Bell,
  User,
  Home,
  Zap,
  TrendingUp,
  ChevronRight,
  Briefcase,
  Sparkles,
  Award,
  Target,
  Banknote,
  BadgeCheck,
  Wifi,
  BatteryMedium,
  SignalHigh,
  X,
  ArrowRight,
  Timer,
  LayoutGrid,
  FileText,
  Wrench,
  Settings,
  HelpCircle,
  Users,
  Car,
  Hourglass,
  RefreshCw,
  AlertTriangle,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@vsolve/ui";
import { Medallion, AreaChart, type Tone } from "@/components/graphics";
import { inr } from "@/lib/format";
import { logout } from "./actions";
import { WithdrawSheet } from "./withdraw-sheet";
import { setOnlineStatus } from "./availability-actions";
import { arriveAction, startAction, completeAction, releaseAction } from "./work-actions";
export type Offer = {
  kind: "RIDE" | "CLEAN" | "REPAIR";
  title: string;
  fare: number;
  surge: number;
  travelKm: number;
  etaMin: number;
  durationMin: number;
  area: string;
  pickup: string;
  drop: string;
  customer: { name: string; rating: number; since: string };
  tasks: string[];
  materials: string[];
};

export type LedgerEntry = { id: string; title: string; ref: string; amount: number; when: string };
export type AlertKind = "offer" | "payout" | "doc" | "milestone" | "job";
export type AlertItem = { kind: AlertKind; title: string; body: string; when: string };

type Props = {
  name: string;
  providerType: string;
  service: string;
  city: string;
  status: string;
  rating: number;
  /** Number of customer reviews backing the rating (0 = not yet rated). */
  reviewCount: number;
  /** Recent customer reviews to surface on the profile. */
  reviews: PartnerReview[];
  jobsCompleted: number;
  onlineHours: number;
  todayEarnings: number;
  weekTotal: number;
  allTotal: number;
  avgJob: number;
  /** Lifetime net earnings (real). */
  lifetimeEarnings: number;
  /** Average earnings per active day = lifetime / distinct days worked. */
  avgPerDay: number;
  week: { label: string; value: number }[];
  ledger: LedgerEntry[];
  alerts: AlertItem[];
  tier: string;
  bankLast4: string | null;
  offer: Offer;
  // gate data (non-active states)
  refId: string;
  reason: string;
  checklist: { label: string; ok: boolean }[];
  // crew (team lead) data — surfaced in the Jobs tab + Home banner
  crew?: CrewSummary | null;
  withdrawals: WithdrawalEntry[];
  /** The partner's current real job (accepted via the offer poller), if any. */
  activeJob: ActiveJob | null;
  /** Persisted online state from the DB so a reload keeps the captain online. */
  initialOnline: boolean;
};

export type ActiveJob = {
  bookingId: string;
  bookingRef: string;
  status: string;
  service: string;
  area: string;
  customerName: string;
  customerPhone: string;
  amountPaise: number;
  /** Structured intake the customer submitted (e.g. Switch type: Modular). */
  details: { label: string; value: string }[];
  /** Optional free-text note from the customer. */
  note: string;
};

export type PartnerReview = {
  bookingRef: string;
  rating: number;
  review: string;
  date: string;
  service: string;
  customerName: string;
};

/** Map a real booking status to the captain-live work-loop stage. */
function workStage(status: string): "enroute" | "arrived" | "working" {
  if (status === "PROVIDER_ARRIVING") return "arrived";
  if (status === "STARTED") return "working";
  return "enroute"; // ASSIGNED
}

export type WithdrawalEntry = { id: string; amount: number; ref: string; when: string };

export type CrewJobLite = {
  bookingRef: string;
  service: string;
  location: string;
  status: string;
  durationDays: number;
  amountRupees: number;
};

export type CrewSummary = {
  name: string;
  pendingRequests: number;
  jobs: CrewJobLite[];
};

const CREW_JOB_STATUS_LABEL: Record<string, string> = {
  CREW_ASSIGNED: "Assigned",
  CREW_EN_ROUTE: "On the way",
  CREW_WORKING: "Working",
  AWAITING_PAYMENT: "Awaiting payment",
};

type Stage = "offline" | "searching" | "offer" | "enroute" | "arrived" | "working" | "complete";
type Tab = "home" | "jobs" | "earnings" | "alerts" | "profile";

const KIND_ICON: Record<Offer["kind"], LucideIcon> = {
  RIDE: Navigation,
  CLEAN: Sparkles,
  REPAIR: Zap,
};

const ALERT_META: Record<AlertKind, { icon: LucideIcon; tone: Tone }> = {
  offer: { icon: Zap, tone: "brand" },
  payout: { icon: Banknote, tone: "green" },
  doc: { icon: FileText, tone: "amber" },
  milestone: { icon: Award, tone: "violet" },
  job: { icon: CheckCircle2, tone: "green" },
};

function clock(d: Date) {
  return d
    .toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: false })
    .padStart(5, "0");
}
function mmss(s: number) {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m.toString().padStart(2, "0")}:${r.toString().padStart(2, "0")}`;
}

export function CaptainLive(props: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("home");
  const [stage, setStage] = useState<Stage>(() =>
    props.activeJob ? workStage(props.activeJob.status) : props.initialOnline ? "searching" : "offline",
  );
  const [now, setNow] = useState(() => new Date());
  const [onlineSince, setOnlineSince] = useState<number | null>(
    props.activeJob || props.initialOnline ? Date.now() : null,
  );
  const offerDeadline = useRef<number>(0);
  const [tasks, setTasks] = useState<boolean[]>(() => props.offer.tasks.map(() => false));
  const [otp, setOtp] = useState("");
  const [custRating, setCustRating] = useState(5);
  const [todayEarn, setTodayEarn] = useState(props.todayEarnings);
  const [todayJobs, setTodayJobs] = useState(0);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [workError, setWorkError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmRelease, setConfirmRelease] = useState(false);

  const active = props.status === "ACTIVE";
  const online = stage !== "offline" && stage !== "complete";
  const session = onlineSince ? Math.floor((now.getTime() - onlineSince) / 1000) : 0;
  const offerLeft = stage === "offer" ? Math.max(0, Math.ceil((offerDeadline.current - now.getTime()) / 1000)) : 0;
  const jobId = props.activeJob?.bookingId;

  // Global 1s ticker drives the wall clock + all derived countdowns.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // When a real job appears/advances (accepted via the offer poller, or synced
  // after an action refresh), move the work loop to match the real status.
  useEffect(() => {
    if (props.activeJob) setStage(workStage(props.activeJob.status));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.activeJob?.bookingId, props.activeJob?.status]);

  async function goOnline() {
    setOnlineSince(Date.now());
    setStage("searching");
    await setOnlineStatus(true);
  }
  async function goOffline() {
    setOnlineSince(null);
    setStage("offline");
    await setOnlineStatus(false);
  }
  // ASSIGNED → PROVIDER_ARRIVING
  async function onArrived() {
    if (!jobId || busy) return;
    setBusy(true);
    setWorkError("");
    const res = await arriveAction(jobId);
    setBusy(false);
    if (res.ok) setStage("arrived");
    else setWorkError(res.error ?? "Could not update status");
  }
  // Partner bails before starting — release the job for reassignment.
  async function onRelease() {
    if (!jobId || busy) return;
    setBusy(true);
    setWorkError("");
    const res = await releaseAction(jobId);
    setBusy(false);
    setConfirmRelease(false);
    if (res.ok) setStage("searching");
    else setWorkError(res.error ?? "Could not release this job");
  }
  // PROVIDER_ARRIVING → STARTED (start OTP)
  async function onStartWork() {
    if (!jobId || busy) return;
    setBusy(true);
    setWorkError("");
    const res = await startAction(jobId, otp);
    setBusy(false);
    if (res.ok) {
      setTasks(props.offer.tasks.map(() => false));
      setStage("working");
    } else {
      setWorkError(res.error ?? "Incorrect start code");
    }
  }
  // STARTED → COMPLETED
  async function complete() {
    if (!jobId || busy) return;
    setBusy(true);
    setWorkError("");
    const res = await completeAction(jobId);
    setBusy(false);
    if (res.ok) {
      setTodayJobs((j) => j + 1);
      if (props.activeJob) setTodayEarn((e) => e + props.activeJob!.amountPaise / 100);
      setStage("complete");
    } else {
      setWorkError(res.error ?? "Could not complete job");
    }
  }
  function backToQueue() {
    setStage("searching");
    setTab("home");
    setOtp("");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(900px_500px_at_80%_-10%,#2b2566,transparent),radial-gradient(700px_500px_at_0%_100%,#1b1840,transparent)] bg-ink-900 text-white">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col items-center px-0 py-0 lg:min-h-0 lg:flex-row lg:items-center lg:gap-16 lg:px-5 lg:py-16">
        <SidePanel {...props} gate={!active} />
        <PhoneShell
          now={now}
          online={online}
          session={session}
          tab={tab}
          setTab={setTab}
          nav={active}
          overlay={
            active && withdrawOpen ? (
              <WithdrawSheet
                balance={props.allTotal}
                bankLast4={props.bankLast4}
                onClose={() => setWithdrawOpen(false)}
              />
            ) : null
          }
        >
          {!active ? (
            <GateScreen {...props} />
          ) : (
            <>
              {tab === "home" && (
                <HomeTab
                  {...props}
                  stage={stage}
                  session={session}
                  offerLeft={offerLeft}
                  tasks={tasks}
                  setTasks={setTasks}
                  otp={otp}
                  setOtp={setOtp}
                  custRating={custRating}
                  setCustRating={setCustRating}
                  todayEarn={todayEarn}
                  todayJobs={todayJobs}
                  onGoOnline={goOnline}
                  onGoOffline={goOffline}
                  onAccept={() => {}}
                  onDecline={() => setStage("searching")}
                  onArrived={onArrived}
                  onStartWork={onStartWork}
                  onComplete={complete}
                  onRelease={onRelease}
                  confirmRelease={confirmRelease}
                  setConfirmRelease={setConfirmRelease}
                  workError={workError}
                  busy={busy}
                  onContinue={backToQueue}
                />
              )}
              {tab === "jobs" && <JobsTab {...props} stage={stage} todayJobs={todayJobs} />}
              {tab === "earnings" && (
                <EarningsTab {...props} todayEarn={todayEarn} onWithdraw={() => setWithdrawOpen(true)} />
              )}
              {tab === "alerts" && <AlertsTab {...props} />}
              {tab === "profile" && <ProfileTab {...props} todayJobs={todayJobs} />}
            </>
          )}
        </PhoneShell>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Desktop side panel — gives the page proper layout beyond the phone.
 * ------------------------------------------------------------------ */
function SidePanel({ name, city, rating, jobsCompleted, weekTotal, gate }: Props & { gate: boolean }) {
  return (
    <div className="hidden max-w-md flex-1 lg:block">
      <p className="flex items-center gap-2 text-sm font-semibold text-accent-400">
        <Zap className="h-4 w-4" /> CAPTAIN APP
      </p>
      <h1 className="mt-3 text-4xl font-bold leading-tight">
        {gate ? (
          <>Welcome, <span className="text-accent-400">{name}</span>.</>
        ) : (
          <>Your day, <span className="text-accent-400">earning</span> in real time.</>
        )}
      </h1>
      <p className="mt-4 text-white/70">
        {gate
          ? `This is your V Solve Hub Captain home. Once you're verified, you'll go online and start receiving jobs across ${city} right here.`
          : `Go online, get matched to nearby jobs, navigate, complete the checklist and get paid — all from one app. This is exactly what you see on your phone.`}
      </p>

      {!gate && (
        <div className="mt-8 grid grid-cols-3 gap-3">
          <PanelStat icon={Wallet} tone="amber" label="This week" value={inr(weekTotal)} />
          <PanelStat icon={Briefcase} tone="brand" label="Jobs done" value={jobsCompleted} />
          <PanelStat icon={Star} tone="green" label="Rating" value={rating.toFixed(1)} />
        </div>
      )}

      <ul className="mt-8 space-y-3 text-sm text-white/80">
        {[
          ["Smart dispatch", "Jobs matched by distance, skill & demand"],
          ["Transparent fares", "See fare, surge & travel before you accept"],
          ["Guided on-site flow", "OTP start, photo proof & task checklist"],
        ].map(([t, b]) => (
          <li key={t} className="flex gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-accent-400" />
            <span>
              <span className="font-semibold text-white">{t}.</span> {b}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-8 text-xs text-white/40">Serving {city} · Best on mobile</p>
    </div>
  );
}

function PanelStat({ icon: Icon, tone, label, value }: { icon: LucideIcon; tone: Tone; label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
      <Medallion icon={Icon} tone={tone} size={34} />
      <p className="mt-2 text-lg font-bold text-white">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-white/45">{label}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Phone shell — device frame, status bar, scrollable screen, tab bar.
 * ------------------------------------------------------------------ */
function PhoneShell({
  now,
  online,
  session,
  tab,
  setTab,
  nav,
  overlay,
  children,
}: {
  now: Date;
  online: boolean;
  session: number;
  tab: Tab;
  setTab: (t: Tab) => void;
  nav: boolean;
  overlay?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="w-full shrink-0 lg:max-w-[400px]">
      <div className="relative mx-auto bg-ink-900 lg:rounded-[2.8rem] lg:border lg:border-white/15 lg:p-3 lg:shadow-[0_40px_80px_-20px_rgba(0,0,0,0.7)]">
        {/* Notch — desktop frame only */}
        <div className="pointer-events-none absolute left-1/2 top-3 z-20 hidden h-6 w-32 -translate-x-1/2 rounded-b-2xl bg-ink-900 lg:block" />
        <div className="relative flex h-[100dvh] flex-col overflow-hidden bg-surface-muted lg:h-[760px] lg:max-h-none lg:rounded-[2.3rem]">
          {/* Online indicator only — no fake device status bar (the phone has its own). */}
          {online ? (
            <div className="flex items-center justify-end px-5 pt-3">
              <span className="flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" /> Online
              </span>
            </div>
          ) : null}
          {/* Screen scroll area */}
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 pb-6 pt-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {children}
          </div>
          {/* Tab bar */}
          {nav && <BottomNav tab={tab} setTab={setTab} online={online} />}
          {/* Overlays (e.g. withdraw sheet) — sibling of scroll area so it isn't clipped */}
          {overlay}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * GATE — non-active states (draft / pending / attention).
 * ------------------------------------------------------------------ */
function GateScreen(p: Props) {
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

/* ------------------------------------------------------------------ *
 * HOME tab — drives the full job lifecycle.
 * ------------------------------------------------------------------ */
type HomeProps = Props & {
  stage: Stage;
  session: number;
  offerLeft: number;
  tasks: boolean[];
  setTasks: (t: boolean[]) => void;
  otp: string;
  setOtp: (s: string) => void;
  custRating: number;
  setCustRating: (n: number) => void;
  todayEarn: number;
  todayJobs: number;
  onGoOnline: () => void;
  onGoOffline: () => void;
  onAccept: () => void;
  onDecline: () => void;
  onArrived: () => void;
  onStartWork: () => void;
  onComplete: () => void;
  onContinue: () => void;
  onRelease: () => void;
  confirmRelease: boolean;
  setConfirmRelease: (v: boolean) => void;
  workError: string;
  busy: boolean;
};

function HomeTab(p: HomeProps) {
  switch (p.stage) {
    case "offline":
      return <OfflineScreen {...p} />;
    case "searching":
      return <SearchingScreen {...p} />;
    case "offer":
      return <OfferScreen {...p} />;
    case "enroute":
      return <EnrouteScreen {...p} />;
    case "arrived":
      return <OtpScreen {...p} />;
    case "working":
      return <WorkingScreen {...p} />;
    case "complete":
      return <CompleteScreen {...p} />;
  }
}

function ScreenHeader({ name, rating }: { name: string; rating: number }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-base font-bold text-white">
          {name.charAt(0).toUpperCase()}
        </div>
        <div>
          <p className="text-[11px] text-gray-500">Welcome back</p>
          <p className="text-sm font-bold text-ink-900">{name}</p>
        </div>
      </div>
      <span className="flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-bold text-ink-900 shadow-sm">
        <Star className="h-3.5 w-3.5 fill-accent-400 text-accent-400" /> {rating.toFixed(1)}
      </span>
    </div>
  );
}

function MiniStat({ icon: Icon, tone, label, value }: { icon: LucideIcon; tone: Tone; label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between">
        <Medallion icon={Icon} tone={tone} size={30} />
      </div>
      <p className="mt-2 text-lg font-bold text-ink-900">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-gray-400">{label}</p>
    </div>
  );
}

function OfflineScreen(p: HomeProps) {
  return (
    <div className="vsh-rise">
      <ScreenHeader name={p.name} rating={p.rating} />

      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 to-brand-800 p-6 text-center text-white shadow-lg">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-white/15">
          <Power className="h-9 w-9" />
        </div>
        <h2 className="mt-4 text-xl font-bold">You&apos;re Offline</h2>
        <p className="mx-auto mt-1 max-w-[15rem] text-sm text-white/75">
          Go online to start receiving jobs near you in {p.city}.
        </p>
        <button
          onClick={p.onGoOnline}
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent-500 py-3.5 font-bold text-ink-900 shadow-lg transition active:scale-[0.98]"
        >
          <Power className="h-5 w-5" /> Go Online
        </button>
      </div>

      {p.crew && (p.crew.jobs.length > 0 || p.crew.pendingRequests > 0) ? (
        <div className="mt-4 rounded-2xl border border-brand-200 bg-brand-50 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-ink-900">Your crew · {p.crew.name}</p>
            <Link href="/dashboard/crew/jobs" className="text-xs font-semibold text-brand-700">
              Open
            </Link>
          </div>
          {p.crew.pendingRequests > 0 ? (
            <Link
              href="/dashboard/crew/requests"
              className="mt-2 flex items-center gap-2 rounded-xl border border-brand-200 bg-white px-3 py-2 text-xs font-semibold text-brand-700"
            >
              <Bell className="h-3.5 w-3.5" /> {p.crew.pendingRequests} new request
              {p.crew.pendingRequests === 1 ? "" : "s"} — tap to accept
            </Link>
          ) : null}
          {p.crew.jobs.length > 0 ? (
            <p className="mt-2 text-xs text-gray-600">
              {p.crew.jobs.length} active crew {p.crew.jobs.length === 1 ? "job" : "jobs"} — tap Open to manage attendance.
            </p>
          ) : null}
        </div>
      ) : null}

      <p className="mb-2 mt-6 text-xs font-bold uppercase tracking-wide text-gray-400">Your summary</p>
      <div className="grid grid-cols-2 gap-3">
        <MiniStat icon={Wallet} tone="amber" label="Earnings" value={inr(p.lifetimeEarnings)} />
        <MiniStat icon={Briefcase} tone="brand" label="Jobs done" value={p.jobsCompleted} />
        <MiniStat icon={Star} tone="green" label="Rating" value={p.rating.toFixed(1)} />
        <MiniStat icon={IndianRupee} tone="violet" label="Avg / day" value={inr(p.avgPerDay)} />
      </div>

      <div className="mt-4 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3">
        <Medallion icon={TrendingUp} tone="amber" size={36} />
        <div>
          <p className="text-sm font-bold text-ink-900">High demand near you</p>
          <p className="text-xs text-gray-600">Earn up to {p.offer.surge}× surge in {p.offer.area} right now.</p>
        </div>
      </div>
    </div>
  );
}

function SearchingScreen(p: HomeProps) {
  return (
    <div className="vsh-rise flex h-full flex-col">
      <ScreenHeader name={p.name} rating={p.rating} />

      {/* Radar */}
      <div className="relative mx-auto mt-6 grid h-56 w-56 place-items-center">
        {[0, 0.8, 1.6].map((d) => (
          <span
            key={d}
            className="vsh-ping absolute h-56 w-56 rounded-full border border-brand-300 bg-brand-500/10"
            style={{ animationDelay: `${d}s` }}
          />
        ))}
        <svg viewBox="0 0 100 100" className="vsh-sweep absolute h-56 w-56 opacity-70">
          <defs>
            <linearGradient id="sweep" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d="M50 50 L50 2 A48 48 0 0 1 92 38 Z" fill="url(#sweep)" />
        </svg>
        <div className="relative grid h-20 w-20 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-xl">
          <Search className="h-8 w-8" />
        </div>
      </div>

      <div className="mt-6 text-center">
        <h2 className="text-lg font-bold text-ink-900">Searching for jobs…</h2>
        <p className="text-sm text-gray-500">Hang tight — matching you with nearby requests.</p>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-3">
        <MiniStat icon={Star} tone="violet" label="Rating" value={p.rating.toFixed(1)} />
        <MiniStat icon={Wallet} tone="amber" label="Today" value={inr(p.todayEarn)} />
        <MiniStat icon={Briefcase} tone="green" label="Jobs" value={p.todayJobs} />
      </div>

      <button
        onClick={p.onGoOffline}
        className="mt-auto w-full rounded-xl border border-border bg-white py-3 text-sm font-semibold text-ink-900 active:scale-[0.98]"
      >
        Go Offline
      </button>
    </div>
  );
}

function OfferScreen(p: HomeProps) {
  const Icon = KIND_ICON[p.offer.kind];
  const pct = (p.offerLeft / 30) * 100;
  return (
    <div className="vsh-slideup flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between">
        <span className="flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700">
          <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" /> NEW JOB OFFER
        </span>
        <CountRing left={p.offerLeft} pct={pct} />
      </div>

      <div className="overflow-hidden rounded-3xl border border-border bg-white shadow-lg">
        <div className="flex items-center justify-between bg-gradient-to-br from-brand-600 to-brand-800 p-5 text-white">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/15">
              <Icon className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-bold">{p.offer.title}</p>
              <p className="text-xs text-white/70">{p.offer.area}</p>
            </div>
          </div>
          {p.offer.surge > 1 && (
            <span className="rounded-full bg-accent-500 px-2 py-0.5 text-[11px] font-bold text-ink-900">
              {p.offer.surge}× surge
            </span>
          )}
        </div>

        <div className="p-5">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-gray-400">You earn</p>
              <p className="text-3xl font-bold text-ink-900">{inr(p.offer.fare)}</p>
            </div>
            <div className="text-right">
              <p className="text-[11px] uppercase tracking-wide text-gray-400">Duration</p>
              <p className="text-lg font-bold text-ink-900">~{p.offer.durationMin}m</p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <Pill icon={Navigation} label="Travel" value={`${p.offer.travelKm} km`} />
            <Pill icon={Clock} label="Arrive in" value={`${p.offer.etaMin} min`} />
          </div>

          <div className="mt-4 flex items-start gap-2 rounded-xl bg-surface-muted p-3">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
            <p className="text-xs text-gray-600">{p.offer.drop}</p>
          </div>
        </div>
      </div>

      <div className="mt-auto grid grid-cols-3 gap-3 pt-4">
        <button
          onClick={p.onDecline}
          className="rounded-xl border border-border bg-white py-3.5 text-sm font-semibold text-gray-600 active:scale-[0.98]"
        >
          Decline
        </button>
        <button
          onClick={p.onAccept}
          className="col-span-2 rounded-xl bg-green-600 py-3.5 text-sm font-bold text-white shadow-lg active:scale-[0.98]"
        >
          Accept Job · {inr(p.offer.fare)}
        </button>
      </div>
    </div>
  );
}

function CountRing({ left, pct }: { left: number; pct: number }) {
  const r = 16;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-12 w-12">
      <svg viewBox="0 0 40 40" className="h-full w-full -rotate-90">
        <circle cx="20" cy="20" r={r} fill="none" stroke="#e8e6f0" strokeWidth="4" />
        <circle
          cx="20"
          cy="20"
          r={r}
          fill="none"
          stroke={left <= 10 ? "#dc2626" : "#5b50e6"}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (pct / 100) * c}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-sm font-bold text-ink-900">{left}</span>
    </div>
  );
}

function Pill({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-white p-2.5">
      <div className="grid h-8 w-8 place-items-center rounded-lg bg-brand-50 text-brand-600">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-wide text-gray-400">{label}</p>
        <p className="text-sm font-bold text-ink-900">{value}</p>
      </div>
    </div>
  );
}

function MiniMap({ progress = false }: { progress?: boolean }) {
  return (
    <div className="relative h-44 overflow-hidden rounded-2xl border border-border bg-[#e9eef5]">
      {/* faux roads */}
      <div className="absolute inset-0 opacity-70">
        <div className="absolute left-0 right-0 top-12 h-2 bg-white" />
        <div className="absolute left-0 right-0 bottom-10 h-3 bg-white" />
        <div className="absolute bottom-0 left-16 top-0 w-2 bg-white" />
        <div className="absolute bottom-0 right-20 top-0 w-3 bg-white" />
        <div className="absolute left-24 top-20 h-12 w-16 rounded-sm bg-[#dfe6ef]" />
        <div className="absolute right-10 top-6 h-10 w-12 rounded-sm bg-[#dfe6ef]" />
      </div>
      {/* route */}
      <svg viewBox="0 0 300 176" className="absolute inset-0 h-full w-full">
        <path d="M40 140 C 110 120, 120 60, 200 50" fill="none" stroke="#5b50e6" strokeWidth="4" className={progress ? "vsh-route" : ""} strokeLinecap="round" />
        <circle cx="40" cy="140" r="7" fill="#16a34a" stroke="#fff" strokeWidth="3" />
        <circle cx="200" cy="50" r="9" fill="#5b50e6" stroke="#fff" strokeWidth="3" />
      </svg>
      <span className="absolute bottom-2 left-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-ink-900 shadow">
        Live route
      </span>
    </div>
  );
}

function EnrouteScreen(p: HomeProps) {
  return (
    <div className="vsh-rise">
      <div className="mb-3 flex items-center justify-between">
        <button onClick={p.onDecline} className="grid h-9 w-9 place-items-center rounded-full bg-white shadow-sm">
          <X className="h-4 w-4 text-gray-600" />
        </button>
        <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-700">EN ROUTE</span>
        <div className="w-9" />
      </div>

      <MiniMap progress />

      <div className="mt-4 rounded-2xl border border-border bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-violet-700 font-bold text-white">
              {p.offer.customer.name.charAt(0)}
            </div>
            <div>
              <p className="text-sm font-bold text-ink-900">{p.offer.customer.name}</p>
              <p className="flex items-center gap-1 text-xs text-gray-500">
                <Star className="h-3 w-3 fill-accent-400 text-accent-400" /> {p.offer.customer.rating} · Member since{" "}
                {p.offer.customer.since}
              </p>
            </div>
          </div>
          <button className="grid h-10 w-10 place-items-center rounded-full bg-green-50 text-green-600">
            <Phone className="h-4.5 w-4.5" />
          </button>
        </div>
        <div className="mt-3 flex items-start gap-2 rounded-xl bg-surface-muted p-3">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
          <p className="text-xs text-gray-600">{p.offer.drop}</p>
        </div>

        {p.activeJob && p.activeJob.details.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {p.activeJob.details.map((d) => (
              <span key={d.label} className="rounded-md bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700">
                {d.label}: {d.value}
              </span>
            ))}
          </div>
        ) : null}
        {p.activeJob?.note ? (
          <p className="mt-2 rounded-lg bg-surface-muted px-2.5 py-1.5 text-[11px] italic text-gray-600">“{p.activeJob.note}”</p>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <MiniStat icon={Navigation} tone="brand" label="Distance" value={`${p.offer.travelKm} km`} />
        <MiniStat icon={Clock} tone="violet" label="ETA" value={`${p.offer.etaMin} min`} />
      </div>

      <button
        onClick={p.onArrived}
        disabled={p.busy}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3.5 font-bold text-white shadow-lg active:scale-[0.98] disabled:opacity-50"
      >
        <Navigation className="h-5 w-5" /> {p.busy ? "Updating…" : "I've Arrived"}
      </button>

      {p.confirmRelease ? (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3">
          <p className="text-xs font-semibold text-red-800">
            Release this job? We'll find the customer another professional. Frequent releases affect
            your reliability.
          </p>
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            <button
              onClick={() => p.setConfirmRelease(false)}
              disabled={p.busy}
              className="rounded-lg border border-gray-300 py-2 text-xs font-bold text-gray-600 disabled:opacity-50"
            >
              Keep job
            </button>
            <button
              onClick={p.onRelease}
              disabled={p.busy}
              className="rounded-lg bg-red-600 py-2 text-xs font-bold text-white disabled:opacity-50"
            >
              {p.busy ? "Releasing…" : "Yes, release"}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => p.setConfirmRelease(true)}
          disabled={p.busy}
          className="mt-2 w-full rounded-xl py-2.5 text-xs font-semibold text-gray-500 underline-offset-2 hover:underline disabled:opacity-50"
        >
          Can't make it?
        </button>
      )}
      {p.workError ? <p className="mt-3 text-center text-sm font-medium text-red-600">{p.workError}</p> : null}
    </div>
  );
}

function OtpScreen(p: HomeProps) {
  const digits = [0, 1, 2, 3, 4, 5];
  return (
    <div className="vsh-rise flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between">
        <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700">ARRIVED</span>
      </div>

      <div className="mt-4 rounded-3xl border border-border bg-white p-6 text-center shadow-sm">
        <Medallion icon={ShieldCheck} tone="brand" size={64} className="mx-auto" />
        <h2 className="mt-4 text-lg font-bold text-ink-900">Start the job</h2>
        <p className="mx-auto mt-1 max-w-[16rem] text-sm text-gray-500">
          Ask the customer for the 6-digit start code to begin and unlock payment.
        </p>

        <div className="mt-6 flex justify-center gap-2">
          {digits.map((i) => (
            <div
              key={i}
              className={cn(
                "grid h-14 w-10 place-items-center rounded-xl border-2 text-2xl font-bold",
                p.otp.length > i ? "border-brand-500 bg-brand-50 text-ink-900" : "border-border bg-surface-muted text-gray-300",
              )}
            >
              {p.otp[i] ?? ""}
            </div>
          ))}
        </div>
        {p.workError ? <p className="mt-3 text-sm font-medium text-red-600">{p.workError}</p> : null}
      </div>

      {/* keypad */}
      <div className="mt-5 grid grid-cols-3 gap-2.5">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((k, idx) => (
          <button
            key={idx}
            disabled={k === ""}
            onClick={() => {
              if (k === "⌫") p.setOtp(p.otp.slice(0, -1));
              else if (k && p.otp.length < 6) p.setOtp(p.otp + k);
            }}
            className={cn(
              "h-12 rounded-xl text-lg font-bold transition active:scale-95",
              k === "" ? "invisible" : "bg-white text-ink-900 shadow-sm",
            )}
          >
            {k}
          </button>
        ))}
      </div>

      <button
        onClick={p.onStartWork}
        disabled={p.otp.length < 6 || p.busy}
        className="mt-5 w-full rounded-xl bg-green-600 py-3.5 font-bold text-white shadow-lg transition active:scale-[0.98] disabled:opacity-40"
      >
        {p.busy ? "Verifying…" : "Verify & Start"}
      </button>
    </div>
  );
}

function WorkingScreen(p: HomeProps) {
  const done = p.tasks.filter(Boolean).length;
  const total = p.tasks.length;
  const pct = Math.round((done / total) * 100);
  const allDone = done === total;
  return (
    <div className="vsh-rise">
      <div className="mb-3 flex items-center justify-between">
        <span className="flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-700">
          <span className="h-2 w-2 animate-pulse rounded-full bg-brand-500" /> IN PROGRESS
        </span>
        <span className="text-xs font-semibold text-gray-500">{inr(p.offer.fare)}</span>
      </div>

      <div className="rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 p-4 text-white shadow-lg">
        <p className="text-sm font-bold">{p.offer.title}</p>
        <div className="mt-3 flex items-center justify-between text-xs text-white/80">
          <span>Task progress</span>
          <span>
            {done}/{total} · {pct}%
          </span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/20">
          <div className="h-full rounded-full bg-accent-400 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <p className="mb-2 mt-4 text-xs font-bold uppercase tracking-wide text-gray-400">Checklist</p>
      <div className="space-y-2">
        {p.offer.tasks.map((t, i) => {
          const checked = p.tasks[i];
          return (
            <button
              key={t}
              onClick={() => {
                const next = [...p.tasks];
                next[i] = !next[i];
                p.setTasks(next);
              }}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition active:scale-[0.99]",
                checked ? "border-green-200 bg-green-50" : "border-border bg-white",
              )}
            >
              {checked ? (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
              ) : (
                <Circle className="h-5 w-5 shrink-0 text-gray-300" />
              )}
              <span className={cn("text-sm", checked ? "text-gray-400 line-through" : "font-medium text-ink-900")}>{t}</span>
            </button>
          );
        })}
      </div>

      {p.offer.materials.length > 0 && (
        <>
          <p className="mb-2 mt-4 text-xs font-bold uppercase tracking-wide text-gray-400">Materials used</p>
          <div className="flex flex-wrap gap-2">
            {p.offer.materials.map((m) => (
              <span key={m} className="rounded-full border border-border bg-white px-3 py-1 text-xs font-medium text-gray-600">
                {m}
              </span>
            ))}
          </div>
        </>
      )}

      <div className="mt-4 flex items-center gap-2 rounded-xl border border-dashed border-border bg-white p-3">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-brand-50 text-brand-600">
          <Camera className="h-5 w-5" />
        </div>
        <p className="text-xs text-gray-500">Add before/after photos as proof of work.</p>
      </div>

      <button
        onClick={p.onComplete}
        disabled={!allDone || p.busy}
        className="mt-4 w-full rounded-xl bg-green-600 py-3.5 font-bold text-white shadow-lg transition active:scale-[0.98] disabled:opacity-40"
      >
        {p.busy ? "Completing…" : allDone ? "Mark Completed" : `Complete all tasks (${done}/${total})`}
      </button>
      {p.workError ? <p className="mt-3 text-center text-sm font-medium text-red-600">{p.workError}</p> : null}
    </div>
  );
}

function CompleteScreen(p: HomeProps) {
  return (
    <div className="vsh-rise flex h-full flex-col items-center justify-center text-center">
      <div className="relative">
        <span className="vsh-halo absolute inset-0 rounded-full bg-green-400/40 blur-xl" />
        <div className="vsh-pop relative grid h-24 w-24 place-items-center rounded-full bg-gradient-to-br from-green-400 to-green-600 shadow-xl">
          <svg viewBox="0 0 52 52" className="vsh-check h-12 w-12">
            <path fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" d="M14 27 l8 8 l16 -16" />
          </svg>
        </div>
        {[-40, -10, 20, 50].map((tx, i) => (
          <span
            key={i}
            className="vsh-burst absolute left-1/2 top-1/2 h-2 w-2 rounded-full bg-accent-400"
            style={{ ["--tx" as string]: `${tx}px`, ["--ty" as string]: `${i % 2 ? -50 : -30}px`, animationDelay: `${i * 60}ms` }}
          />
        ))}
      </div>

      <h2 className="mt-6 text-2xl font-bold text-ink-900">Job Done! 🎉</h2>
      <p className="mt-1 text-sm text-gray-500">Payment has been credited to your wallet.</p>

      <div className="mt-5 w-full rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 p-5 text-white shadow-lg">
        <p className="text-xs uppercase tracking-wide text-white/70">You earned</p>
        <p className="text-4xl font-bold">{inr(p.offer.fare)}</p>
        <div className="mt-3 grid grid-cols-2 gap-3 text-left">
          <div className="rounded-xl bg-white/10 p-3">
            <p className="text-[10px] uppercase text-white/60">Today</p>
            <p className="text-lg font-bold">{inr(p.todayEarn)}</p>
          </div>
          <div className="rounded-xl bg-white/10 p-3">
            <p className="text-[10px] uppercase text-white/60">Jobs today</p>
            <p className="text-lg font-bold">{p.todayJobs}</p>
          </div>
        </div>
      </div>

      <div className="mt-5 w-full rounded-2xl border border-border bg-white p-4">
        <p className="text-sm font-semibold text-ink-900">Rate {p.offer.customer.name.split(" ")[0]}</p>
        <div className="mt-2 flex justify-center gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} onClick={() => p.setCustRating(n)}>
              <Star className={cn("h-8 w-8", n <= p.custRating ? "fill-accent-400 text-accent-400" : "text-gray-300")} />
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={p.onContinue}
        className="mt-5 w-full rounded-xl bg-brand-600 py-3.5 font-bold text-white shadow-lg active:scale-[0.98]"
      >
        Find next job
      </button>
      <button onClick={p.onGoOffline} className="mt-2 text-sm font-medium text-gray-500">
        Go offline
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * JOBS tab.
 * ------------------------------------------------------------------ */
function JobsTab(p: Props & { stage: Stage; todayJobs: number }) {
  const active = p.stage !== "offline" && p.stage !== "searching" && p.stage !== "complete";
  return (
    <div className="vsh-rise">
      <TabTitle title="My Jobs" subtitle={`${p.jobsCompleted} completed all-time`} />

      {p.crew && p.crew.pendingRequests > 0 ? (
        <Link
          href="/dashboard/crew/requests"
          className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-4"
        >
          <div>
            <p className="text-sm font-bold text-ink-900">
              {p.crew.pendingRequests} new crew {p.crew.pendingRequests === 1 ? "request" : "requests"}
            </p>
            <p className="text-xs text-gray-600">Accept before another crew does →</p>
          </div>
          <Bell className="h-5 w-5 text-brand-600" />
        </Link>
      ) : null}

      {p.crew && p.crew.jobs.length > 0 ? (
        <div className="mb-5">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">
            Crew jobs · {p.crew.name}
          </p>
          <div className="space-y-2">
            {p.crew.jobs.map((j) => (
              <Link
                key={j.bookingRef}
                href="/dashboard/crew/jobs"
                className="flex items-center justify-between gap-3 rounded-2xl border border-brand-200 bg-white p-3.5 hover:border-brand-400"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-ink-900">{j.service} · Team</p>
                  <p className="truncate text-[11px] text-gray-500">
                    {j.location} · {j.durationDays} {j.durationDays === 1 ? "day" : "days"} · {j.bookingRef}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-bold text-brand-700">
                  {CREW_JOB_STATUS_LABEL[j.status] ?? j.status}
                </span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {active ? (
        <div className="mb-4 rounded-2xl border border-brand-200 bg-brand-50 p-4">
          <span className="flex w-fit items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-brand-700">
            <span className="h-2 w-2 animate-pulse rounded-full bg-brand-500" /> ACTIVE NOW
          </span>
          <p className="mt-2 text-sm font-bold text-ink-900">{p.offer.title}</p>
          <p className="text-xs text-gray-600">{p.offer.drop}</p>
          <p className="mt-1 text-sm font-bold text-brand-700">{inr(p.offer.fare)}</p>
        </div>
      ) : !p.crew?.jobs?.length ? (
        <div className="mb-4 rounded-2xl border border-dashed border-border bg-white p-5 text-center">
          <Medallion icon={Briefcase} tone="slate" size={48} className="mx-auto" />
          <p className="mt-3 text-sm font-semibold text-ink-900">No active job</p>
          <p className="text-xs text-gray-500">Go online from Home to get matched.</p>
        </div>
      ) : null}

      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">History</p>
      {p.ledger.length === 0 ? (
        <div className="rounded-2xl border border-border bg-white p-5 text-center text-sm text-gray-500">
          Your completed jobs will appear here.
        </div>
      ) : (
        <div className="space-y-2">
          {p.ledger.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-2xl border border-border bg-white p-3.5">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-green-50 text-green-600">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-ink-900">{r.title}</p>
                  <p className="text-[11px] text-gray-500">
                    {r.ref} · {r.when}
                  </p>
                </div>
              </div>
              <p className="text-sm font-bold text-ink-900">{inr(r.amount)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * EARNINGS tab.
 * ------------------------------------------------------------------ */
function EarningsTab(p: Props & { todayEarn: number; onWithdraw: () => void }) {
  const [range, setRange] = useState<"D" | "W" | "M">("W");
  const goal = 5000;
  const added = p.todayEarn - p.todayEarnings;
  const optimisticWeek = p.weekTotal + added;
  const optimisticBalance = p.allTotal + added;
  const goalPct = Math.min(100, Math.round((optimisticWeek / goal) * 100));

  return (
    <div className="vsh-rise">
      <TabTitle title="Earnings" subtitle="Track your payouts" />

      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 to-brand-800 p-5 text-white shadow-lg">
        <div className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-white/10 blur-2xl" />
        <p className="text-xs uppercase tracking-wide text-white/70">Available balance</p>
        <p className="text-4xl font-bold">{inr(optimisticBalance)}</p>
        <p className="mt-1 text-xs text-white/60">
          {p.bankLast4 ? `Auto-payout to ····${p.bankLast4}` : "Add a bank account to withdraw"}
        </p>
        <button
          onClick={p.onWithdraw}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-accent-500 px-3 py-2 text-sm font-bold text-ink-900 active:scale-[0.98]"
        >
          <Banknote className="h-4 w-4" /> Withdraw
        </button>
      </div>

      <div className="mt-4 rounded-2xl border border-border bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-bold text-ink-900">Trend</p>
          <div className="flex gap-1 rounded-lg bg-surface-muted p-0.5">
            {(["D", "W", "M"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-semibold transition",
                  range === r ? "bg-white text-brand-700 shadow-sm" : "text-gray-400",
                )}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
        <AreaChart data={p.week} tone="brand" height={140} />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <MiniStat icon={IndianRupee} tone="amber" label="Today" value={inr(p.todayEarn)} />
        <MiniStat icon={TrendingUp} tone="green" label="This week" value={inr(optimisticWeek)} />
        <MiniStat icon={Target} tone="violet" label="Per job" value={inr(p.avgJob)} />
      </div>

      <div className="mt-4 rounded-2xl border border-border bg-white p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-ink-900">Weekly goal</p>
          <span className="text-xs font-semibold text-brand-700">{goalPct}%</span>
        </div>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-surface-muted">
          <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-accent-400" style={{ width: `${goalPct}%` }} />
        </div>
        <p className="mt-2 text-xs text-gray-500">
          {inr(optimisticWeek)} of {inr(goal)} · keep going!
        </p>
      </div>

      {p.ledger.length > 0 && (
        <>
          <p className="mb-2 mt-4 text-xs font-bold uppercase tracking-wide text-gray-400">Recent earnings</p>
          <div className="space-y-2">
            {p.ledger.slice(0, 4).map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-xl border border-border bg-white p-3">
                <div>
                  <p className="text-sm font-semibold text-brand-700">{r.ref}</p>
                  <p className="text-[11px] text-gray-500">{r.when}</p>
                </div>
                <span className="text-sm font-bold text-ink-900">{inr(r.amount)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {p.withdrawals.length > 0 && (
        <>
          <p className="mb-2 mt-4 text-xs font-bold uppercase tracking-wide text-gray-400">Withdrawals</p>
          <div className="space-y-2">
            {p.withdrawals.map((w) => (
              <div key={w.id} className="flex items-center justify-between rounded-xl border border-border bg-white p-3">
                <div className="flex items-center gap-2.5">
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-surface-muted text-gray-500">
                    <Banknote className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-ink-900">Withdrawn to bank</p>
                    <p className="text-[11px] text-gray-500">{w.ref} · {w.when}</p>
                  </div>
                </div>
                <span className="text-sm font-bold text-gray-500">− {inr(w.amount)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * ALERTS tab.
 * ------------------------------------------------------------------ */
function AlertsTab(p: Props) {
  return (
    <div className="vsh-rise">
      <TabTitle title="Notifications" subtitle="Stay in the loop" />
      {p.alerts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-white p-8 text-center">
          <Medallion icon={Bell} tone="slate" size={52} className="mx-auto" />
          <p className="mt-3 text-sm font-semibold text-ink-900">You&apos;re all caught up</p>
          <p className="text-xs text-gray-500">New jobs and payout updates will show here.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {p.alerts.map((n, i) => {
            const meta = ALERT_META[n.kind];
            return (
              <div key={i} className="flex gap-3 rounded-2xl border border-border bg-white p-3.5">
                <Medallion icon={meta.icon} tone={meta.tone} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-bold text-ink-900">{n.title}</p>
                    <span className="shrink-0 text-[10px] text-gray-400">{n.when}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500">{n.body}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * PROFILE tab.
 * ------------------------------------------------------------------ */
function ProfileTab(p: Props & { todayJobs: number }) {
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
      <div className="rounded-3xl bg-gradient-to-br from-ink-800 to-brand-900 p-5 text-white shadow-lg">
        <div className="flex items-center gap-4">
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-white/15 text-2xl font-bold">
            {p.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="flex items-center gap-1.5 text-lg font-bold">
              {p.name} <BadgeCheck className="h-4.5 w-4.5 text-accent-400" />
            </p>
            <p className="text-xs text-white/70">
              {p.service || "Verified Captain"} · {p.city}
            </p>
            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-accent-500 px-2 py-0.5 text-[11px] font-bold text-ink-900">
              <Award className="h-3 w-3" /> {p.tier}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <MiniStat icon={Briefcase} tone="brand" label="Lifetime" value={p.jobsCompleted} />
        <MiniStat
          icon={Star}
          tone="green"
          label={p.reviewCount > 0 ? `${p.reviewCount} review${p.reviewCount === 1 ? "" : "s"}` : "Rating"}
          value={p.reviewCount > 0 ? p.rating.toFixed(1) : "New"}
        />
        <MiniStat icon={IndianRupee} tone="amber" label="Avg / day" value={inr(p.avgPerDay)} />
      </div>

      {/* Customer reviews — real feedback that drives the rating above. */}
      <p className="mb-2 mt-4 text-xs font-bold uppercase tracking-wide text-gray-400">Customer reviews</p>
      {p.reviews.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-white p-4 text-center text-xs text-gray-500">
          No reviews yet. Complete jobs to start earning ratings.
        </div>
      ) : (
        <div className="space-y-2">
          {p.reviews.map((r) => (
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

      {p.bankLast4 && (
        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-border bg-white p-3.5">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-green-50 text-green-600">
            <Banknote className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-ink-900">Bank ····{p.bankLast4}</p>
            <p className="text-[11px] text-gray-500">Linked for payouts</p>
          </div>
          <CheckCircle2 className="h-5 w-5 text-green-600" />
        </div>
      )}

      <p className="mb-2 mt-4 text-xs font-bold uppercase tracking-wide text-gray-400">Achievements</p>
      <div className="flex justify-between rounded-2xl border border-border bg-white p-4">
        {[
          { icon: Award, tone: "amber" as Tone, label: p.tier.split(" ")[0] },
          { icon: Star, tone: "green" as Tone, label: "Top Rated" },
          { icon: Zap, tone: "violet" as Tone, label: "Fast" },
          { icon: ShieldCheck, tone: "brand" as Tone, label: "Verified" },
        ].map((a) => (
          <div key={a.label} className="flex flex-col items-center gap-1.5">
            <Medallion icon={a.icon} tone={a.tone} size={44} />
            <span className="text-[10px] font-medium text-gray-500">{a.label}</span>
          </div>
        ))}
      </div>

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

function TabTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-xl font-bold text-ink-900">{title}</h2>
      <p className="text-xs text-gray-500">{subtitle}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Bottom tab bar — sits inside the phone screen.
 * ------------------------------------------------------------------ */
function BottomNav({ tab, setTab, online }: { tab: Tab; setTab: (t: Tab) => void; online: boolean }) {
  const items: { id: Tab; icon: LucideIcon; label: string }[] = [
    { id: "home", icon: Home, label: "Home" },
    { id: "jobs", icon: LayoutGrid, label: "Jobs" },
    { id: "earnings", icon: Wallet, label: "Earnings" },
    { id: "alerts", icon: Bell, label: "Alerts" },
    { id: "profile", icon: User, label: "Profile" },
  ];
  return (
    <nav className="z-30 flex shrink-0 items-center justify-around border-t border-border bg-white/95 px-2 pb-3 pt-2 backdrop-blur">
      {items.map((it) => {
        const active = tab === it.id;
        return (
          <button
            key={it.id}
            onClick={() => setTab(it.id)}
            className={cn(
              "relative flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[10px] font-semibold transition",
              active ? "text-brand-700" : "text-gray-400",
            )}
          >
            <span className={cn("grid h-8 w-8 place-items-center rounded-xl transition", active && "bg-brand-50")}>
              <it.icon className="h-5 w-5" />
            </span>
            {it.label}
            {it.id === "home" && online && (
              <span className="absolute right-3 top-1 h-2 w-2 rounded-full bg-green-500 ring-2 ring-white" />
            )}
          </button>
        );
      })}
    </nav>
  );
}
