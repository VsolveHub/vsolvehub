"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { WithdrawSheet } from "./withdraw-sheet";
import { setOnlineStatus } from "./availability-actions";
import { arriveAction, startAction, completeAction, releaseAction } from "./work-actions";
import { SidePanel } from "./SidePanel";
import { PhoneShell } from "./PhoneShell";
import { GateScreen } from "./GateScreen";
import { HomeTab } from "./HomeTab";
import { JobsTab } from "./JobsTab";
import { EarningsTab } from "./EarningsTab";
import { AlertsTab } from "./AlertsTab";
import { ProfileTab } from "./ProfileTab";
import { workStage, type Props, type Stage, type Tab } from "./types";

export type {
  Offer,
  LedgerEntry,
  AlertKind,
  AlertItem,
  ActiveJob,
  PartnerReview,
  WithdrawalEntry,
  CrewJobLite,
  CrewSummary,
} from "./types";

type JobActionResult = { ok: boolean; error?: string };

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

  // Shared runner for the arrive/release/start/complete work-loop actions:
  // guards on jobId/busy, tracks the busy flag, and reports the error.
  async function performJobAction(
    action: (id: string) => Promise<JobActionResult>,
    onSuccess: () => void,
    fallbackError: string,
    always?: () => void,
  ) {
    if (!jobId || busy) return;
    setBusy(true);
    setWorkError("");
    const res = await action(jobId);
    setBusy(false);
    always?.();
    if (res.ok) onSuccess();
    else setWorkError(res.error ?? fallbackError);
  }

  // ASSIGNED → PROVIDER_ARRIVING
  async function onArrived() {
    await performJobAction(arriveAction, () => setStage("arrived"), "Could not update status");
  }
  // Partner bails before starting — release the job for reassignment.
  async function onRelease() {
    await performJobAction(
      releaseAction,
      () => setStage("searching"),
      "Could not release this job",
      () => setConfirmRelease(false),
    );
  }
  // PROVIDER_ARRIVING → STARTED (start OTP)
  async function onStartWork() {
    await performJobAction(
      (id) => startAction(id, otp),
      () => {
        setTasks(props.offer.tasks.map(() => false));
        setStage("working");
      },
      "Incorrect start code",
    );
  }
  // STARTED → COMPLETED
  async function complete() {
    await performJobAction(
      completeAction,
      () => {
        setTodayJobs((j) => j + 1);
        if (props.activeJob) setTodayEarn((e) => e + props.activeJob!.amountPaise / 100);
        setStage("complete");
      },
      "Could not complete job",
    );
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
