"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { usePathname } from "next/navigation";
import { Bell, Sparkles, X, ShieldAlert, ExternalLink, CheckCircle, Lock, Check } from "lucide-react";
import { useCurrentSession } from "@vsolve/query";
import {
  Dialog,
  Button,
  usePushPermission,
  useTranslator,
  type Locale,
  type PushPermissionState,
} from "@vsolve/ui";
import {
  PUSH_NOTIFICATION_EVENTS,
  trackPushAnalyticsEvent,
} from "@vsolve/config";
import { browserApiBaseUrl, getApiClient } from "@/lib/api/browser";

const ONESIGNAL_APP_ID =
  process.env.NEXT_PUBLIC_ONESIGNAL_PARTNER_APP_ID ||
  process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID ||
  "";

interface AlertBannerLocaleCopy {
  deniedTitle: string;
  deniedBanner: string;
  step1: string;
  tapHere: string;
  step2: string;
  allowBadge: string;
  requiredNote: string;
  deniedError: string;
  stayOffline: string;
  showMeHow: string;
  iveAllowedIt: string;
  defaultTitle: string;
  defaultBadge: string;
  defaultBanner: string;
  defaultTip: string;
  defaultEligibility: string;
  enableAlerts: string;
  howToTitle: string;
  howToSubtitle: string;
  howToClose: string;
}

const STRINGS: Record<Locale, AlertBannerLocaleCopy> = {
  "en-IN": {
    deniedTitle: "Notifications are blocked in your browser",
    deniedBanner:
      "To receive instant job alerts, click the lock/settings icon in your browser address bar and set Notifications to Allow.",
    step1: "Tap the 🔒 icon at very top of screen",
    tapHere: "Tap here ☝️",
    step2: "Turn Notifications to ALLOW",
    allowBadge: "Allow",
    requiredNote:
      "Push notification subscription is required to go online and receive job offers.",
    deniedError:
      'Notifications are still blocked in your browser. Please tap the 🔒 icon at the top of your screen, set Notifications to "Allow", then tap verify below.',
    stayOffline: "Stay Offline",
    showMeHow: "Show me how",
    iveAllowedIt: "I've allowed it — Go Online",
    defaultTitle: "Never miss nearby job alerts",
    defaultBadge: "Instant Job Offers",
    defaultBanner:
      "Turn on notifications to get instant alerts when a nearby Instant Booking becomes available—even when the app is in the background.",
    defaultTip: "👉 Tap 'ALLOW' on the next screen",
    defaultEligibility:
      "Instant dispatch eligibility requires active push notifications.",
    enableAlerts: "Enable job alerts & Go Online",
    howToTitle: "Unblocking Browser Notifications",
    howToSubtitle:
      "When notifications are blocked, your browser prevents web apps from re-prompting. Follow these steps in your browser:",
    howToClose: "Close",
  },
  "hi-IN": {
    deniedTitle: "ब्राउज़र में नोटिफिकेशन ब्लॉक हैं",
    deniedBanner:
      "नए काम की तुरंत घंटी पाने के लिए, ऊपर एड्रेस बार में 🔒 लॉक या सेटिंग्स आइकॉन दबाएं और Notifications को Allow करें।",
    step1: "स्क्रीन के सबसे ऊपर 🔒 लॉक आइकॉन दबाएं",
    tapHere: "यहाँ दबाएं ☝️",
    step2: "Notifications को ALLOW चालू करें",
    allowBadge: "Allow",
    requiredNote:
      "काम के ऑफर्स पाने और ऑनलाइन जाने के लिए नोटिफिकेशन चालू करना जरूरी है।",
    deniedError:
      'नोटिफिकेशन अभी भी ब्लॉक हैं। कृपया ऊपर 🔒 आइकॉन दबाकर Notifications को "Allow" करें, फिर नीचे जांचें।',
    stayOffline: "ऑफलाइन रहें",
    showMeHow: "तरीका देखें",
    iveAllowedIt: "Allow कर दिया — Go Online",
    defaultTitle: "नया काम कभी न चूकें",
    defaultBadge: "तुरंत काम के ऑफर्स",
    defaultBanner:
      "आस-पास के इंस्टेंट बुकिंग ऑफर्स तुरंत पाने के लिए नोटिफिकेशन चालू करें—ऐप बंद होने पर भी घंटी बजेगी।",
    defaultTip: "👉 अगली स्क्रीन पर 'ALLOW' दबाएं",
    defaultEligibility: "तुरंत काम पाने के लिए नोटिफिकेशन आवश्यक है।",
    enableAlerts: "नोटिफिकेशन चालू करें & Go Online",
    howToTitle: "ब्राउज़र में नोटिफिकेशन कैसे चालू करें",
    howToSubtitle:
      "जब नोटिफिकेशन ब्लॉक होते हैं, तो ब्राउज़र दोबारा पूछने की अनुमति नहीं देता। ये कदम अपनाएं:",
    howToClose: "बंद करें",
  },
  "te-IN": {
    deniedTitle: "మీ బ్రౌజర్‌లో నోటిఫికేషన్‌లు బ్లాక్ చేయబడ్డాయి",
    deniedBanner:
      "తక్షణ జాబ్ అలర్ట్‌లు పొందడానికి, పై అడ్రస్ బార్‌లో 🔒 లాక్ లేదా సెట్టింగ్‌ల చిహ్నాన్ని నొక్కి Notifications ని Allow చేయండి.",
    step1: "స్క్రీన్ పైన ఉన్న 🔒 లాక్ చిహ్నాన్ని నొక్కండి",
    tapHere: "ఇక్కడ నొక్కండి ☝️",
    step2: "Notifications ని ALLOW చేయండి",
    allowBadge: "Allow",
    requiredNote:
      "ఆన్‌లైన్‌లోకి వెళ్లడానికి మరియు జాబ్ ఆఫర్‌లను స్వీకరించడానికి నోటిఫికేషన్‌లు తప్పనిసరి.",
    deniedError:
      'నోటిఫికేషన్‌లు ఇంకా బ్లాక్ చేయబడి ఉన్నాయి. దయచేసి పైన 🔒 చిహ్నాన్ని నొక్కి Notifications ని "Allow" చేయండి, తర్వాత కింద క్లిక్ చేయండి.',
    stayOffline: "ఆఫ్‌లైన్‌లో ఉండండి",
    showMeHow: "ఎలా చేయాలో చూడండి",
    iveAllowedIt: "Allow చేశాను — Go Online",
    defaultTitle: "జాబ్ అలర్ట్‌లను మిస్ అవ్వకండి",
    defaultBadge: "తక్షణ జాబ్ ఆఫర్లు",
    defaultBanner:
      "సమీపంలోని తక్షణ బుకింగ్‌లు వచ్చినప్పుడు అలర్ట్ పొందడానికి నోటిఫికేషన్‌లను ఆన్ చేయండి—యాప్ బ్యాక్‌గ్రౌండ్‌లో ఉన్నా అలర్ట్ వస్తుంది.",
    defaultTip: "👉 తదుపరి స్క్రీన్‌లో 'ALLOW' నొక్కండి",
    defaultEligibility: "తక్షణ జాబ్‌లు పొందడానికి పుష్ నోటిఫికేషన్‌లు అవసరం.",
    enableAlerts: "నోటిఫికేషన్‌లను ఆన్ చేసి Go Online అవ్వండి",
    howToTitle: "బ్రౌజర్ నోటిఫికేషన్‌లను ఎలా అన్‌బ్లాక్ చేయాలి",
    howToSubtitle:
      "నోటిఫికేషన్‌లు బ్లాక్ చేయబడినప్పుడు, బ్రౌజర్ అనుమతి అడగకుండా ఆపుతుంది. ఈ దశలను అనుసరించండి:",
    howToClose: "మూసివేయి",
  },
};

export interface JobAlertsBannerProps {
  /** Optional controlled open state */
  open?: boolean;
  /** Optional open change handler */
  onOpenChange?: (open: boolean) => void;
  /** Callback to invoke after permission outcome so shift-start can continue */
  onProceed?: () => void;
}

/**
 * Custom pre-permission modal and recovery UI for Partner Instant Job Alerts.
 *
 * ## Trigger Rules
 * - NEVER appears automatically on initial page load, login, or onboarding.
 * - Appears only when the partner initiates "Go Online" / "Start Shift".
 * - Suppressed when already granted, unsupported, or within the 7-day dismissal cooldown.
 * - If denied, presents non-intrusive recovery guidance ("Show me how") without calling requestPermission().
 * - Does not block the partner from working: scheduled and foreground work remain available.
 */
export function JobAlertsBanner({
  open: controlledOpen,
  onOpenChange,
  onProceed,
}: JobAlertsBannerProps = {}) {
  const pathname = usePathname();
  const session = useCurrentSession(getApiClient());
  const userId = session.data?.user?.id ?? null;
  const isAuthenticated = Boolean(userId);

  const { locale } = useTranslator();
  const copy = STRINGS[locale] ?? STRINGS["en-IN"];

  const [internalOpen, setInternalOpen] = useState(false);
  const [showHowToModal, setShowHowToModal] = useState(false);
  const [deniedRecoveryActive, setDeniedRecoveryActive] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [deniedError, setDeniedError] = useState(false);

  const proceedCallbackRef = useRef<(() => void) | undefined>(onProceed);
  useEffect(() => {
    proceedCallbackRef.current = onProceed;
  }, [onProceed]);

  const {
    permissionState,
    isPromptEligible,
    requestPermission,
    dismissPrompt,
    syncSubscription,
    promptCount,
  } = usePushPermission({
    role: "PARTNER",
    userId,
    triggerEvent: "go_online_shift_start",
    apiBaseUrl: browserApiBaseUrl(),
    appId: ONESIGNAL_APP_ID,
  });

  const isModalOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;

  const setOpen = useCallback(
    (nextOpen: boolean) => {
      if (controlledOpen === undefined) {
        setInternalOpen(nextOpen);
      }
      onOpenChange?.(nextOpen);
    },
    [controlledOpen, onOpenChange],
  );

  // Listen for custom "Go Online" trigger event dispatched by presence panel
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleTrigger = (event: Event) => {
      const customEvent = event as CustomEvent<{ onProceed?: () => void; intercepted?: boolean }>;
      if (customEvent.detail?.onProceed) {
        proceedCallbackRef.current = customEvent.detail.onProceed;
      }

      // Check current permission state & eligibility
      if (typeof Notification === "undefined") {
        proceedCallbackRef.current?.();
        return;
      }

      if (Notification.permission === "granted") {
        proceedCallbackRef.current?.();
        return;
      }

      // If not granted, push notifications are required to go online: INTERCEPT!
      if (customEvent.detail) customEvent.detail.intercepted = true;
      setDeniedError(false);

      if (Notification.permission === "denied") {
        setDeniedRecoveryActive(true);
        setOpen(true);
        trackPushAnalyticsEvent(
          PUSH_NOTIFICATION_EVENTS.partnerPermissionDeniedRecoveryViewed,
          {
            user_id: userId,
            role: "PARTNER",
            platform: "web",
            permission_state: "denied",
            trigger_event: "go_online_shift_start",
            prompt_count: promptCount,
            app_id_present: Boolean(ONESIGNAL_APP_ID),
          },
        );
        return;
      }

      // Default state: prompt required to go online
      setDeniedRecoveryActive(false);
      setOpen(true);
      trackPushAnalyticsEvent(PUSH_NOTIFICATION_EVENTS.partnerPromptViewed, {
        user_id: userId,
        role: "PARTNER",
        platform: "web",
        permission_state: "default",
        trigger_event: "go_online_shift_start",
        prompt_count: promptCount,
        app_id_present: Boolean(ONESIGNAL_APP_ID),
      });
    };

    window.addEventListener("vsh:open-job-alerts-prompt", handleTrigger);
    return () => {
      window.removeEventListener("vsh:open-job-alerts-prompt", handleTrigger);
    };
  }, [userId, promptCount, setOpen]);

  // Handle explicit primary CTA click: request permission
  const handleEnableAlerts = async () => {
    setIsRequesting(true);
    setDeniedError(false);
    try {
      const result = await requestPermission();
      setIsRequesting(false);

      if (result === "granted") {
        setOpen(false);
        proceedCallbackRef.current?.();
      } else if (result === "denied") {
        // Show recovery guidance; partner CANNOT go online without push
        setDeniedRecoveryActive(true);
        trackPushAnalyticsEvent(
          PUSH_NOTIFICATION_EVENTS.partnerPermissionDeniedRecoveryViewed,
          {
            user_id: userId,
            role: "PARTNER",
            platform: "web",
            permission_state: "denied",
            trigger_event: "go_online_shift_start",
            prompt_count: promptCount,
            app_id_present: Boolean(ONESIGNAL_APP_ID),
          },
        );
      } else {
        // Still default / dismissed: stay offline
        setOpen(false);
      }
    } catch {
      setIsRequesting(false);
      setOpen(false);
    }
  };

  // Re-check permission after user unblocks in browser address bar
  const handleCheckPermissionAndProceed = async () => {
    setIsChecking(true);
    setDeniedError(false);
    try {
      const current = typeof Notification !== "undefined" ? Notification.permission : "default";
      if (current === "granted") {
        setOpen(false);
        setDeniedRecoveryActive(false);
        void syncSubscription("sync");
        proceedCallbackRef.current?.();
      } else if (current === "default") {
        // User reset permission from Block to Ask in address bar! Now we can prompt!
        const res = await requestPermission();
        if (res === "granted") {
          setOpen(false);
          setDeniedRecoveryActive(false);
          proceedCallbackRef.current?.();
        } else {
          setDeniedError(true);
        }
      } else {
        // Still denied
        setDeniedError(true);
      }
    } finally {
      setIsChecking(false);
    }
  };

  // Partner declines or stays offline: do NOT proceed online
  const handleStayOffline = () => {
    dismissPrompt();
    setOpen(false);
    setDeniedRecoveryActive(false);
    setDeniedError(false);
    // Deliberately do not call proceedCallbackRef.current?.(); partner remains offline!
  };

  if (!isAuthenticated || pathname.startsWith("/login") || pathname.startsWith("/onboarding")) {
    return null;
  }

  if (!isModalOpen && !showHowToModal) {
    return null;
  }

  return (
    <>
      {/* Pre-permission or Denied Recovery Modal */}
      <Dialog
        open={isModalOpen}
        onOpenChange={(next) => {
          if (!next) {
            handleStayOffline();
          } else {
            setOpen(next);
          }
        }}
        title={deniedRecoveryActive ? copy.deniedTitle : copy.defaultTitle}
      >
        <div className="space-y-4 pt-1">
          {deniedRecoveryActive ? (
            /* Denied Recovery UI - Visual & Localized for Selected Language */
            <div className="space-y-3">
              <div className="flex items-start gap-3 rounded-xl bg-amber-500/10 p-3.5 border border-amber-500/20 text-amber-900">
                <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs sm:text-sm font-medium leading-relaxed">
                  {copy.deniedBanner}
                </p>
              </div>

              {/* Visual 2-Step Diagram */}
              <div className="rounded-2xl border-2 border-dashed border-amber-300/80 bg-amber-50/50 p-3.5 space-y-3">
                {/* Step 1 */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                    <span className="flex items-center gap-1.5">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-white text-[10px]">1</span>
                      {copy.step1}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 rounded-xl bg-white p-2.5 border border-slate-200/80 shadow-xs">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-700 font-bold">
                      <Lock className="h-4 w-4" />
                    </div>
                    <div className="flex-1 text-xs text-slate-500 font-mono truncate">
                      vsolvehub.com
                    </div>
                    <span className="text-[10px] font-extrabold text-amber-800 bg-amber-100/90 px-2.5 py-1 rounded-full animate-pulse">
                      {copy.tapHere}
                    </span>
                  </div>
                </div>

                {/* Step 2 */}
                <div className="space-y-1.5 pt-1 border-t border-amber-200/60">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                    <span className="flex items-center gap-1.5">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white text-[10px]">2</span>
                      {copy.step2}
                    </span>
                  </div>

                  <div className="flex items-center justify-between rounded-xl bg-white p-2.5 border border-slate-200/80 shadow-xs text-xs">
                    <span className="font-semibold text-slate-700">Notifications</span>
                    <span className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                      <Check className="h-3.5 w-3.5 text-emerald-600 stroke-[3]" /> {copy.allowBadge}
                    </span>
                  </div>
                </div>
              </div>

              <p className="text-[11px] font-medium text-amber-900/80">
                {copy.requiredNote}
              </p>

              {deniedError && (
                <div className="rounded-xl bg-red-50 p-3 border border-red-200 text-xs text-red-800 font-medium leading-relaxed">
                  {copy.deniedError}
                </div>
              )}

              <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <Button
                  variant="ghost"
                  onClick={handleStayOffline}
                  className="w-full sm:w-auto text-xs text-slate-600"
                >
                  {copy.stayOffline}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowHowToModal(true)}
                  className="w-full sm:w-auto text-xs"
                >
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                  {copy.showMeHow}
                </Button>
                <Button
                  variant="primary"
                  onClick={handleCheckPermissionAndProceed}
                  loading={isChecking}
                  className="w-full sm:w-auto text-xs font-semibold"
                >
                  {copy.iveAllowedIt}
                </Button>
              </div>
            </div>
          ) : (
            /* Default Pre-Permission Modal */
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50/50 p-3.5 border border-amber-200/50">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white shadow-xs">
                  <Bell className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-amber-800">
                    <Sparkles className="h-3 w-3" /> {copy.defaultBadge}
                  </span>
                  <p className="text-xs sm:text-sm font-medium text-slate-700 leading-snug">
                    {copy.defaultBanner}
                  </p>
                  <p className="text-[11px] text-amber-800 font-semibold pt-0.5">
                    {copy.defaultTip}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-[11px] text-slate-500">
                <CheckCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                <span>{copy.defaultEligibility}</span>
              </div>

              <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <Button
                  variant="ghost"
                  onClick={handleStayOffline}
                  className="w-full sm:w-auto text-xs text-slate-600"
                >
                  {copy.stayOffline}
                </Button>
                <Button
                  variant="primary"
                  onClick={handleEnableAlerts}
                  loading={isRequesting}
                  className="w-full sm:w-auto text-xs font-semibold"
                >
                  {copy.enableAlerts}
                </Button>
              </div>
            </div>
          )}
        </div>
      </Dialog>

      {/* Browser Help / Show Me How Modal */}
      <Dialog
        open={showHowToModal}
        onOpenChange={setShowHowToModal}
        title={copy.howToTitle}
      >
        <div className="space-y-3.5 text-xs text-slate-600 pt-1">
          <p>
            {copy.howToSubtitle}
          </p>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
            <p className="font-semibold text-slate-800">In Chrome / Edge / Brave:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Look at the left side of the address bar above.</li>
              <li>Click the icon with sliders or the padlock.</li>
              <li>Toggle <strong>Notifications</strong> to <strong>Allow</strong>.</li>
              <li>Reload the page.</li>
            </ol>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
            <p className="font-semibold text-slate-800">In Safari (macOS / iOS):</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Open Safari Settings → Websites → Notifications.</li>
              <li>Find this website in the list and set to <strong>Allow</strong>.</li>
            </ol>
          </div>
          <div className="flex justify-end pt-2 border-t border-slate-100">
            <Button
              variant="primary"
              onClick={() => setShowHowToModal(false)}
              className="text-xs"
            >
              {copy.howToClose}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
