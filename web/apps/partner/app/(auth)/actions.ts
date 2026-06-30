"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@vsolve/db";
import { hashOtp } from "@vsolve/crypto";
import { OTP_TTL_SECONDS, OTP_MAX_ATTEMPTS, serviceBySlug } from "@vsolve/config";
import { createSession } from "@/lib/session";

export type AuthState = { error?: string; devCode?: string };

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  const ten = digits.slice(-10);
  if (ten.length !== 10) return null;
  return `+91${ten}`;
}

async function issueOtp(phone: string): Promise<string> {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  await prisma.otpChallenge.create({
    data: {
      phone,
      codeHash: hashOtp(code, phone),
      expiresAt: new Date(Date.now() + OTP_TTL_SECONDS * 1000),
    },
  });
  // Production: send via MSG91/Fast2SMS here. Dev: surface the code to the UI.
  if (process.env.NODE_ENV !== "production") console.log(`[DEV OTP] ${phone} -> ${code}`);
  return code;
}

export async function requestOtp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const phone = normalizePhone(String(formData.get("phone") ?? ""));
  const service = String(formData.get("service") ?? "").trim();
  if (!phone) return { error: "Enter a valid 10-digit mobile number." };

  const code = await issueOtp(phone);
  const store = await cookies();
  const opts = { httpOnly: true, sameSite: "lax" as const, path: "/", maxAge: OTP_TTL_SECONDS };
  store.set("otp_phone", phone, opts);
  if (service) store.set("otp_service", service, opts);
  if (process.env.NODE_ENV !== "production") {
    store.set("otp_dev_code", code, { ...opts, httpOnly: false });
  }
  redirect("/verify");
}

export async function resendOtp(): Promise<AuthState> {
  const store = await cookies();
  const phone = store.get("otp_phone")?.value;
  if (!phone) return { error: "Session expired. Please re-enter your number." };
  const code = await issueOtp(phone);
  if (process.env.NODE_ENV !== "production") {
    store.set("otp_dev_code", code, {
      httpOnly: false,
      sameSite: "lax",
      path: "/",
      maxAge: OTP_TTL_SECONDS,
    });
  }
  return { devCode: process.env.NODE_ENV !== "production" ? code : undefined };
}

export async function verifyOtp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const store = await cookies();
  const phone = store.get("otp_phone")?.value;
  const serviceSlug = store.get("otp_service")?.value;
  const code = String(formData.get("code") ?? "").replace(/\D/g, "");

  if (!phone) return { error: "Session expired. Please re-enter your number." };
  if (code.length !== 6) return { error: "Enter the 6-digit code." };

  const challenge = await prisma.otpChallenge.findFirst({
    where: { phone, consumed: false, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!challenge) return { error: "Code expired. Tap resend to get a new one." };
  if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
    return { error: "Too many attempts. Tap resend to get a new code." };
  }
  if (challenge.codeHash !== hashOtp(code, phone)) {
    await prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
    });
    return { error: "Incorrect code. Please try again." };
  }

  await prisma.otpChallenge.update({ where: { id: challenge.id }, data: { consumed: true } });

  const svc = serviceSlug ? serviceBySlug(serviceSlug) : undefined;
  const serviceRow = serviceSlug
    ? await prisma.trade.findUnique({ where: { slug: serviceSlug } })
    : null;

  let partner = await prisma.partner.findUnique({ where: { phone } });
  if (!partner) {
    partner = await prisma.partner.create({
      data: {
        phone,
        phoneVerified: true,
        providerType: svc?.archetype ?? "CAPTAIN",
        tradeId: serviceRow?.id ?? null,
      },
    });
  } else if (!partner.phoneVerified) {
    partner = await prisma.partner.update({
      where: { id: partner.id },
      data: { phoneVerified: true },
    });
  }

  await createSession(partner.id);
  store.delete("otp_phone");
  store.delete("otp_service");
  store.delete("otp_dev_code");

  redirect(partner.status === "DRAFT" ? "/onboarding" : "/live");
}
