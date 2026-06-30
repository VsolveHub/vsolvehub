import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export async function POST(req: NextRequest) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const formData = await req.formData();
  const files = formData.getAll("files");

  if (files.length === 0) {
    return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
  }

  if (files.length > 5) {
    return NextResponse.json({ error: "Maximum 5 files allowed" }, { status: 400 });
  }

  const uploadDir = path.join(process.cwd(), "public", "uploads", "bookings");
  await mkdir(uploadDir, { recursive: true });

  const urls: string[] = [];

  for (const entry of files) {
    if (!(entry instanceof File)) continue;
    if (!ALLOWED_TYPES.includes(entry.type)) {
      return NextResponse.json({ error: "Only image files are allowed" }, { status: 400 });
    }
    if (entry.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "Each file must be under 5 MB" }, { status: 400 });
    }

    const ext = entry.name.split(".").pop() ?? "jpg";
    const filename = `${randomUUID()}.${ext}`;
    const buffer = Buffer.from(await entry.arrayBuffer());
    await writeFile(path.join(uploadDir, filename), buffer);
    urls.push(`/uploads/bookings/${filename}`);
  }

  return NextResponse.json({ urls });
}
