-- Baseline for schema applied earlier via `prisma db push` (never recorded as a
-- migration). Guards are IF NOT EXISTS so this replays safely on environments
-- that already have the objects, and creates them on a fresh database.

-- AlterTable
ALTER TABLE "ServiceCategory" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;

-- AlterTable
ALTER TABLE "ServiceSubCategory" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;

-- AlterTable
ALTER TABLE "Service" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "AppPromo" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "imageUrl" TEXT NOT NULL,
    "href" TEXT NOT NULL,
    "badge" TEXT,
    "badgeColor" TEXT DEFAULT 'blue',
    "type" TEXT NOT NULL DEFAULT 'spotlight',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppPromo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AppStory" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "iconBg" TEXT NOT NULL,
    "borderGlow" TEXT NOT NULL,
    "ctaText" TEXT NOT NULL,
    "ctaHref" TEXT NOT NULL,
    "slidesJson" TEXT NOT NULL DEFAULT '[]',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppStory_pkey" PRIMARY KEY ("id")
);
