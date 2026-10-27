"use client";

const ALERT_SRC = "/sounds/booking-alert.wav?v=6";

const WEB_DING_HZ = 880;
const WEB_DONG_HZ = 660;
const WEB_PEAK_GAIN = 0.55;
const WEB_LOOP_MS = 1_450;
const PLAY_RETRY_MS = 1_200;

let audio: HTMLAudioElement | null = null;
let audioSrc: string | null = null;
let loopWanted = false;
let autoplayUnlocked = false;
const listeners: Set<() => void> = new Set();

/**
 * The system-notification copy, set by whoever requests the alert loop.
 *
 * This module runs outside any component, so it cannot call `useT()` itself —
 * the hook only resolves inside the React tree. `useBookingAlertSound` calls
 * `useT()` and passes the resolved strings down through `requestBookingAlertLoop`;
 * the English defaults below are what a caller that does not supply any (the
 * deprecated `startBookingAlertLoop`) still gets.
 */
let notificationCopy = {
  title: "New booking request",
  body: "Accept or decline before the timer runs out.",
};

let webContext: AudioContext | null = null;
let webLoopTimer: ReturnType<typeof setInterval> | null = null;
let webLoopActive = false;
let playRetryTimer: ReturnType<typeof setInterval> | null = null;

function notifyStatus(): void {
  listeners.forEach((fn) => fn());
}

function getAudio(): HTMLAudioElement {
  if (!audio || audioSrc !== ALERT_SRC) {
    if (audio) {
      audio.pause();
      audio.src = "";
    }
    audio = new Audio(ALERT_SRC);
    audioSrc = ALERT_SRC;
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = 1;
    audio.addEventListener("playing", notifyStatus);
    audio.addEventListener("pause", notifyStatus);
    audio.addEventListener("ended", notifyStatus);
  }
  return audio;
}

function getWebContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!webContext || webContext.state === "closed") {
    webContext = new AudioContext();
  }
  return webContext;
}

function playWebBeep(): void {
  const ctx = getWebContext();
  if (!ctx || ctx.state !== "running") return;

  const now = ctx.currentTime;
  const ding = ctx.createOscillator();
  const dong = ctx.createOscillator();
  const gain = ctx.createGain();
  ding.type = "sine";
  dong.type = "sine";
  ding.frequency.value = WEB_DING_HZ;
  dong.frequency.value = WEB_DONG_HZ;
  gain.gain.value = WEB_PEAK_GAIN;
  ding.connect(gain);
  dong.connect(gain);
  gain.connect(ctx.destination);
  ding.start(now);
  ding.stop(now + 0.28);
  dong.start(now + 0.34);
  dong.stop(now + 0.68);
}

function startWebAudioLoop(): void {
  if (webLoopActive) return;
  const ctx = getWebContext();
  if (!ctx || ctx.state !== "running") return;

  webLoopActive = true;
  playWebBeep();
  webLoopTimer = setInterval(() => {
    if (!loopWanted) {
      stopWebAudioLoop();
      return;
    }
    playWebBeep();
  }, WEB_LOOP_MS);
  notifyStatus();
}

function stopWebAudioLoop(): void {
  webLoopActive = false;
  if (webLoopTimer !== null) {
    clearInterval(webLoopTimer);
    webLoopTimer = null;
  }
  notifyStatus();
}

function resumeWebContextFromGesture(): void {
  const ctx = getWebContext();
  if (!ctx) return;

  if (ctx.state === "suspended") {
    void ctx.resume().then(() => {
      autoplayUnlocked = true;
      if (loopWanted) {
        void startAlertPlayback();
      }
      notifyStatus();
    }).catch(() => {
      handleAlertPlaybackFailure();
    });
    return;
  }

  autoplayUnlocked = true;
  if (loopWanted) {
    void startAlertPlayback();
  }
}

export function preloadBookingAlertAudio(): void {
  if (typeof window === "undefined") return;
  void getAudio().load();
}

export function isBookingAlertRequested(): boolean {
  return loopWanted;
}

export function isBookingAlertPlaying(): boolean {
  const el = audio;
  const htmlPlaying = el !== null && !el.paused && !el.ended;
  return htmlPlaying || webLoopActive;
}

export function isBookingAlertAutoplayUnlocked(): boolean {
  return autoplayUnlocked;
}

export function subscribeBookingAlertStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function showBookingAlertSystemNotification(): void {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  try {
    new Notification(notificationCopy.title, {
      body: notificationCopy.body,
      tag: "vsolve-partner-booking-alert",
      silent: false,
    });
  } catch {
    /* blocked in this context */
  }
}

function handleAlertPlaybackFailure(): void {
  if (loopWanted) {
    showBookingAlertSystemNotification();
  }
  notifyStatus();
}

function startPlayRetry(): void {
  if (playRetryTimer !== null) return;
  playRetryTimer = setInterval(() => {
    if (!loopWanted) {
      stopPlayRetry();
      return;
    }
    if (!isBookingAlertPlaying()) {
      void startAlertPlayback();
    }
  }, PLAY_RETRY_MS);
}

function stopPlayRetry(): void {
  if (playRetryTimer === null) return;
  clearInterval(playRetryTimer);
  playRetryTimer = null;
}

async function startAlertPlayback(): Promise<void> {
  if (typeof window === "undefined" || !loopWanted) return;

  const el = getAudio();
  el.muted = false;
  el.volume = 1;
  el.loop = true;
  el.currentTime = 0;

  try {
    await el.play();
    autoplayUnlocked = true;
    stopWebAudioLoop();
    notifyStatus();
    return;
  } catch {
    /* HTML audio blocked — fall through to Web Audio */
  }

  const ctx = getWebContext();
  if (ctx?.state === "running") {
    startWebAudioLoop();
    if (webLoopActive) {
      autoplayUnlocked = true;
      notifyStatus();
      return;
    }
  }

  handleAlertPlaybackFailure();
}

/** Call from login / Go online / nav — must run inside pointerdown or click. */
export async function requestBookingAlertNotificationPermission(): Promise<void> {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "default") return;

  try {
    await Notification.requestPermission();
  } catch {
    /* user dismissed or browser blocked */
  }
}

/** Prime HTML audio, Web Audio, and optionally request system-notification permission. */
export function prepareBookingAlertsFromGesture(): void {
  primeBookingAlertFromGesture();
  void requestBookingAlertNotificationPermission();
}

/**
 * First tap anywhere on the Partner app — unlocks autoplay for this tab.
 * Must run synchronously inside pointerdown / click / keydown / touchstart.
 */
export function primeBookingAlertFromGesture(): void {
  if (typeof window === "undefined") return;

  resumeWebContextFromGesture();

  const el = getAudio();
  el.muted = false;

  if (!autoplayUnlocked) {
    el.volume = loopWanted ? 1 : 0.001;
    el.loop = loopWanted;
    el.currentTime = 0;
    void el.play().then(() => {
      autoplayUnlocked = true;
      if (!loopWanted) {
        el.pause();
        el.currentTime = 0;
        el.volume = 1;
      } else {
        stopWebAudioLoop();
      }
      notifyStatus();
    }).catch(() => {
      resumeWebContextFromGesture();
    });
    return;
  }

  if (loopWanted && !isBookingAlertPlaying()) {
    playBookingAlertFromGesture();
  }
}

/**
 * Must run synchronously inside pointerdown / click / keydown — browser autoplay rule.
 */
export function playBookingAlertFromGesture(): void {
  if (typeof window === "undefined" || !loopWanted) return;
  resumeWebContextFromGesture();
  void startAlertPlayback();
}

/** Popup opened — plays when autoplay was unlocked by login, Go online, or any tap. */
export function requestBookingAlertLoop(copy?: { title: string; body: string }): void {
  if (typeof window === "undefined") return;
  if (copy) notificationCopy = copy;
  loopWanted = true;
  startPlayRetry();
  void startAlertPlayback();
}

export function stopBookingAlertLoop(): void {
  if (typeof window === "undefined") return;
  loopWanted = false;
  stopPlayRetry();
  stopWebAudioLoop();
  if (!audio) {
    notifyStatus();
    return;
  }
  audio.pause();
  audio.currentTime = 0;
  notifyStatus();
}

/** @deprecated use playBookingAlertFromGesture */
export function unlockPartnerAlertAudio(): void {
  playBookingAlertFromGesture();
}

/** @deprecated use requestBookingAlertLoop */
export async function startBookingAlertLoop(): Promise<void> {
  requestBookingAlertLoop();
}
