import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
// MIME → extension. The stored extension is ALWAYS derived from this map, never
// from the client-supplied filename — otherwise an `image/png` upload named
// `x.svg`/`x.html` would be written as active content and served same-origin
// (stored XSS). SVG is intentionally excluded: it can carry script.
const ALLOWED_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

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
    const ext = ALLOWED_EXT[entry.type];
    if (!ext) {
      return NextResponse.json({ error: "Only JPEG, PNG, WebP or GIF images are allowed" }, { status: 400 });
    }
    if (entry.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "Each file must be under 5 MB" }, { status: 400 });
    }

    const filename = `${randomUUID()}.${ext}`;
    const buffer = Buffer.from(await entry.arrayBuffer());
    await writeFile(path.join(uploadDir, filename), buffer);
    urls.push(`/uploads/bookings/${filename}`);
  }

  return NextResponse.json({ urls });
}
