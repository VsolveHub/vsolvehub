import { cookies } from "next/headers";
import { prisma } from "@/lib/db/client";
import { hashOtp } from "@vsolve/crypto";
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/constants";
import { randomBytes } from "crypto";

export type SessionUser = {
  id: string;
  phone: string;
  name: string | null;
};

// OTP lifetime and lockout, matched to the partner app so both surfaces behave
// the same. Kept local (not imported from @vsolve/config) to avoid coupling the
// customer app to a partner-config package.
const OTP_TTL_SECONDS = 300;
const OTP_MAX_ATTEMPTS = 5;
// Send-side throttle: without it the endpoint can be scripted to SMS-bomb a
// number (real gateway cost) and to hand out unlimited fresh codes to brute
// force. Must wait between resends, and only so many codes per rolling window.
const OTP_RESEND_COOLDOWN_SECONDS = 30;
const OTP_SEND_WINDOW_SECONDS = 3600;
const OTP_MAX_SENDS_PER_WINDOW = 5;
/** Fixed code used only when on-screen delivery is enabled (never in prod). */
const DEV_OTP = "1234";

/**
 * Whether to reveal the OTP instead of delivering it by SMS. True in dev, and in
 * prod only when SHOW_OTP_ON_SCREEN=true (a stop-gap until an SMS provider is
 * wired in). SECURITY: while enabled the code is knowable, so it must never be
 * on in a real launch — the same contract the partner app uses.
 */
function otpOnScreen(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.SHOW_OTP_ON_SCREEN === "true";
}

function generateCode(): string {
  if (otpOnScreen()) return DEV_OTP;
  return String(Math.floor(100000 + Math.random() * 900000));
}

export type SendOtpResult =
  | { ok: true; devOtp?: string }
  | { ok: false; error: string };

/**
 * Issue an OTP challenge for a phone number. The raw code is never stored — only
 * a salted hash — and the challenge expires. Throttled per phone (see the
 * OTP_RESEND_* / OTP_MAX_SENDS constants). Returns the code for on-screen
 * display only while otpOnScreen() is enabled.
 */
export async function sendOtp(phone: string): Promise<SendOtpResult> {
  const now = Date.now();

  const latest = await prisma.otpChallenge.findFirst({
    where: { phone },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (latest && now - latest.createdAt.getTime() < OTP_RESEND_COOLDOWN_SECONDS * 1000) {
    return { ok: false, error: "Please wait a moment before requesting another code." };
  }

  const windowStart = new Date(now - OTP_SEND_WINDOW_SECONDS * 1000);
  const recentSends = await prisma.otpChallenge.count({
    where: { phone, createdAt: { gt: windowStart } },
  });
  if (recentSends >= OTP_MAX_SENDS_PER_WINDOW) {
    return { ok: false, error: "Too many code requests. Please try again later." };
  }

  const code = generateCode();
  await prisma.otpChallenge.create({
    data: {
      phone,
      codeHash: hashOtp(code, phone),
      expiresAt: new Date(now + OTP_TTL_SECONDS * 1000),
    },
  });
  // TODO(prod): deliver via SMS (MSG91/Fast2SMS) here.
  return { ok: true, devOtp: otpOnScreen() ? code : undefined };
}

export type VerifyOtpResult = { ok: true } | { ok: false; error: string };

/**
 * Verify a submitted code against the latest unconsumed, unexpired challenge for
 * the phone. Wrong codes burn an attempt; the challenge locks after
 * OTP_MAX_ATTEMPTS and is single-use on success. There is no global bypass code:
 * a code is only ever valid against a challenge that was actually issued.
 */
export async function verifyOtp(phone: string, code: string): Promise<VerifyOtpResult> {
  const challenge = await prisma.otpChallenge.findFirst({
    where: { phone, consumed: false, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!challenge) return { ok: false, error: "Code expired. Please request a new one." };
  if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
    return { ok: false, error: "Too many attempts. Please request a new code." };
  }
  if (challenge.codeHash !== hashOtp(code.trim(), phone)) {
    await prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
    });
    return { ok: false, error: "Incorrect code. Please try again." };
  }
  await prisma.otpChallenge.update({ where: { id: challenge.id }, data: { consumed: true } });
  return { ok: true };
}

function generateToken() {
  return randomBytes(32).toString("hex");
}

export async function createSession(userId: string) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);

  await prisma.session.create({
    data: { userId, token, expiresAt },
  });

  return { token, expiresAt };
}

export async function deleteSession(token: string) {
  await prisma.session.deleteMany({ where: { token } });
}

export async function getServerSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const session = await prisma.session.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!session || session.expiresAt < new Date()) {
      if (session) await prisma.session.delete({ where: { id: session.id } });
      return null;
    }

    return {
      id: session.user.id,
      phone: session.user.phone,
      name: session.user.name,
    };
  } catch {
    // DB unavailable — treat as logged out instead of crashing pages.
    return null;
  }
}

export async function findOrCreateUser(phone: string) {
  return prisma.user.upsert({
    where: { phone },
    update: {},
    create: { phone },
  });
}

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
  };
}
