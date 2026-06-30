import { cookies } from "next/headers";
import { prisma } from "@/lib/db/client";
import { MOCK_OTP, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/constants";
import { randomBytes } from "crypto";

export type SessionUser = {
  id: string;
  phone: string;
  name: string | null;
};

const pendingOtps = new Map<string, string>();

export function sendMockOtp(phone: string) {
  pendingOtps.set(phone, MOCK_OTP);
  return { otp: MOCK_OTP };
}

export function verifyMockOtp(phone: string, otp: string) {
  return pendingOtps.get(phone) === otp || otp === MOCK_OTP;
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
