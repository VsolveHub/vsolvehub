-- Booking engine: Order money envelope, JobStatus enum, cart + tracking columns.
--
-- Ordering matters. Columns are added first (additive, safe), legacy status
-- values are normalised while the column is still TEXT, the conversion is
-- guarded by a check that FAILS LOUDLY on anything unmapped, and only then is
-- the column retyped. A silent coercion here would corrupt live bookings.

-- 1. Enums --------------------------------------------------------------------
CREATE TYPE "OrderStatus" AS ENUM (
  'DRAFT','PENDING_PAYMENT','AUTHORIZED','PARTIALLY_SETTLED','SETTLED','CANCELLED'
);

CREATE TYPE "PaymentState" AS ENUM (
  'NONE','AUTHORIZED','PARTIALLY_CAPTURED','CAPTURED','VOIDED','REFUNDED','COD_PENDING'
);

-- Both the single-provider and the crew lifecycles write to Booking.status, so
-- the enum must cover both or crew bookings fail to migrate.
CREATE TYPE "JobStatus" AS ENUM (
  'DRAFT','AUTHORIZED',
  'PENDING','SEARCHING_PROVIDER','ASSIGNED','PROVIDER_ARRIVING','STARTED','NO_WORKER_FOUND',
  'SEARCHING_CREW','CREW_ASSIGNED','CREW_EN_ROUTE','CREW_WORKING','NO_CREW_FOUND',
  'COMPLETED','CANCELLED'
);

-- 2. Order table ---------------------------------------------------------------
CREATE TABLE "Order" (
  "id"              TEXT NOT NULL,
  "orderRef"        TEXT NOT NULL,
  "userId"          TEXT NOT NULL,
  "status"          "OrderStatus"  NOT NULL DEFAULT 'DRAFT',
  "paymentState"    "PaymentState" NOT NULL DEFAULT 'NONE',
  "paymentMethod"   TEXT,
  "gatewayIntentId" TEXT,
  "idempotencyKey"  TEXT,
  "authorizedPaise" INTEGER NOT NULL DEFAULT 0,
  "capturedPaise"   INTEGER NOT NULL DEFAULT 0,
  "voidedPaise"     INTEGER NOT NULL DEFAULT 0,
  "refundedPaise"   INTEGER NOT NULL DEFAULT 0,
  "authorizedAt"    TIMESTAMP(3),
  "authExpiresAt"   TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Order_orderRef_key"       ON "Order"("orderRef");
CREATE UNIQUE INDEX "Order_idempotencyKey_key" ON "Order"("idempotencyKey");
CREATE INDEX        "Order_userId_status_idx"  ON "Order"("userId", "status");

ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A user may hold at most one open order at a time. This is what makes a
-- double-submitted checkout collide at the database rather than authorize twice.
CREATE UNIQUE INDEX "Order_one_open_per_user" ON "Order"("userId")
  WHERE "status" IN ('DRAFT', 'PENDING_PAYMENT');

-- 3. Booking columns ------------------------------------------------------------
ALTER TABLE "Booking"
  ADD COLUMN "orderId"           TEXT,
  ADD COLUMN "lineItems"         TEXT NOT NULL DEFAULT '[]',
  ADD COLUMN "capturedPaise"     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "providerLat"       DOUBLE PRECISION,
  ADD COLUMN "providerLng"       DOUBLE PRECISION,
  ADD COLUMN "providerLocatedAt" TIMESTAMP(3),
  ADD COLUMN "etaMinutes"        INTEGER;

ALTER TABLE "Booking" ADD CONSTRAINT "Booking_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Booking_orderId_idx"       ON "Booking"("orderId");
CREATE INDEX "Booking_userId_status_idx" ON "Booking"("userId", "status");

-- 4. Normalise legacy statuses BEFORE converting the column ----------------------
UPDATE "Booking" SET "status" = 'PENDING'            WHERE "status" = 'REQUESTED';
UPDATE "Booking" SET "status" = 'SEARCHING_PROVIDER' WHERE "status" = 'SEARCHING';
UPDATE "Booking" SET "status" = 'ASSIGNED'           WHERE "status" = 'ACCEPTED';
UPDATE "Booking" SET "status" = 'PROVIDER_ARRIVING'  WHERE "status" IN ('ON_THE_WAY', 'ARRIVED');
UPDATE "Booking" SET "status" = 'STARTED'            WHERE "status" = 'IN_PROGRESS';

-- Refuse to migrate rather than silently coerce an unrecognised status.
DO $$
DECLARE unmapped INTEGER;
BEGIN
  SELECT COUNT(*) INTO unmapped FROM "Booking"
  WHERE "status" NOT IN (
    'DRAFT','AUTHORIZED',
    'PENDING','SEARCHING_PROVIDER','ASSIGNED','PROVIDER_ARRIVING','STARTED','NO_WORKER_FOUND',
    'SEARCHING_CREW','CREW_ASSIGNED','CREW_EN_ROUTE','CREW_WORKING','NO_CREW_FOUND',
    'COMPLETED','CANCELLED'
  );
  IF unmapped > 0 THEN
    RAISE EXCEPTION 'Cannot migrate: % booking row(s) have an unmapped status', unmapped;
  END IF;
END $$;

-- 5. Convert the column ---------------------------------------------------------
ALTER TABLE "Booking" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Booking"
  ALTER COLUMN "status" TYPE "JobStatus" USING "status"::"JobStatus";
ALTER TABLE "Booking" ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- 6. Enforce the 7-day booking window -------------------------------------------
-- Existing rows predate the rule, so the constraint is NOT VALID: it applies to
-- inserts and updates without rejecting historical data. `slot` is stored as an
-- ISO-8601 TEXT column, so compare on the parsed timestamp.
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_slot_within_window"
  CHECK ("slot"::timestamptz <= "createdAt" + INTERVAL '8 days') NOT VALID;
