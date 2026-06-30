import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  sendMockOtp,
  verifyMockOtp,
  createSession,
  findOrCreateUser,
  sessionCookieOptions,
} from "@/lib/auth/session";
import { otpSendSchema, otpVerifySchema } from "@/lib/validation/schemas";
import { SESSION_COOKIE } from "@/lib/constants";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body.action as string;

    if (action === "send") {
      const parsed = otpSendSchema.safeParse(body);
      if (!parsed.success) {
        const message = parsed.error.errors[0]?.message ?? "Enter a valid 10-digit phone number";
        return NextResponse.json({ error: message }, { status: 400 });
      }
      const result = sendMockOtp(parsed.data.phone);
      return NextResponse.json({
        success: true,
        message: "OTP sent to your phone",
        devOtp: process.env.NODE_ENV === "development" ? result.otp : undefined,
      });
    }

    if (action === "verify") {
      const parsed = otpVerifySchema.safeParse(body);
      if (!parsed.success) {
        const message = parsed.error.errors[0]?.message ?? "Invalid request";
        return NextResponse.json({ error: message }, { status: 400 });
      }
      const valid = verifyMockOtp(parsed.data.phone, parsed.data.otp);
      if (!valid) {
        return NextResponse.json({ error: "Invalid OTP" }, { status: 401 });
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

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("[auth/otp]", err);
    return NextResponse.json({ error: "Unable to process request. Please try again." }, { status: 500 });
  }
}
