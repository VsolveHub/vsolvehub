-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "platformFeePaise" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "taxPaise" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "workPhotos" TEXT NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "Partner" ADD COLUMN     "experience" TEXT;

-- CreateTable
CREATE TABLE "Notification" (
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
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
