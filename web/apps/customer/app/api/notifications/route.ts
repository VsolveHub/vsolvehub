import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { getCustomerNotifications } from "@/lib/notifications/customer";

export async function GET() {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const items = await getCustomerNotifications(session.id);
  const unreadCount = items.length;

  return NextResponse.json({ items, unreadCount });
}
