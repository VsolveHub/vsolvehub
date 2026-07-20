import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  sendOtp,
  verifyOtp,
  createSession,
  findOrCreateUser,
  sessionCookieOptions,
} from "@/lib/auth/session";
import { otpSendSchema, otpVerifySchema } from "@/lib/validation/schemas";
import { SESSION_COOKIE } from "@/lib/constants";

async function handleSend(body: unknown): Promise<NextResponse> {
  const parsed = otpSendSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.errors[0]?.message ?? "Enter a valid 10-digit phone number";
    return NextResponse.json({ error: message }, { status: 400 });
  }
  const result = await sendOtp(parsed.data.phone);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 429 });
  }
  return NextResponse.json({ success: true, message: "OTP sent to your phone", devOtp: result.devOtp });
}

async function handleVerify(body: unknown): Promise<NextResponse> {
  const parsed = otpVerifySchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.errors[0]?.message ?? "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
  const verification = await verifyOtp(parsed.data.phone, parsed.data.otp);
  if (!verification.ok) {
    return NextResponse.json({ error: verification.error }, { status: 401 });
  }

  const user = await findOrCreateUser(parsed.data.phone);
  const { token, expiresAt } = await createSession(user.id);

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));

  return NextResponse.json({
    success: true,
    user: { id: user.id, phone: user.phone, name: user.name },
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const action = (body as { action?: unknown }).action;

    if (action === "send") return handleSend(body);
    if (action === "verify") return handleVerify(body);
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("[auth/otp]", err);
    return NextResponse.json({ error: "Unable to process request. Please try again." }, { status: 500 });
  }
}
