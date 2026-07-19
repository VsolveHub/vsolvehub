-- NOTE: this migration duplicates 20260707150000_booking_work_photos_and_notifications
-- almost exactly. Both were generated during the 2026-07-08 schema-drift incident;
-- the only statement unique to this one is Partner.experience.
--
-- On the shared database, 07-07 applied cleanly and Partner.experience was added
-- out of band, so this migration collided ("column platformFeePaise already
-- exists") and failed having applied 0 steps. Every statement is therefore
-- written idempotently: a no-op where the objects already exist, and still
-- correct on a fresh database that replays the whole history in order.

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "platformFeePaise" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "taxPaise"         INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "workPhotos"       TEXT    NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "Partner" ADD COLUMN IF NOT EXISTS "experience" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'booking',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "href" TEXT NOT NULL DEFAULT '/',
    "tone" TEXT NOT NULL DEFAULT 'info',
    "icon" TEXT NOT NULL DEFAULT 'bell',
    "bookingRef" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- AddForeignKey (ADD CONSTRAINT has no IF NOT EXISTS, so guard on the catalog)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Notification_userId_fkey'
  ) THEN
    ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
