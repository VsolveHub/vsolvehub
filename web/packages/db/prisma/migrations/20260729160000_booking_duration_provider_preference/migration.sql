ALTER TABLE "Booking"
ADD COLUMN "durationMinutes" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN "extensionMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "preferredPartnerId" TEXT;

ALTER TABLE "Booking"
ADD CONSTRAINT "Booking_durationMinutes_check"
CHECK ("durationMinutes" >= 60 AND "durationMinutes" <= 480);

ALTER TABLE "Booking"
ADD CONSTRAINT "Booking_extensionMinutes_check"
CHECK ("extensionMinutes" >= 0);
