import { NextRequest, NextResponse } from "next/server";
import { clockWithOtp } from "@/lib/crew-clock";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const token = String(body.token ?? "");
  const otp = String(body.otp ?? "");
  if (!token) return NextResponse.json({ error: "Missing member link" }, { status: 400 });

  const result = await clockWithOtp(token, otp);
  if (!result.ok) return NextResponse.json({ error: result.error ?? "Could not record attendance" }, { status: 400 });
  return NextResponse.json({ ok: true, action: result.action, message: result.message });
}
