-- Track wrong start-OTP attempts per booking so the on-site start code cannot be
-- brute-forced. Locks once the attempt cap is reached; reset when the partner
-- releases or a new code is issued.
ALTER TABLE "Booking" ADD COLUMN "startOtpAttempts" INTEGER NOT NULL DEFAULT 0;
