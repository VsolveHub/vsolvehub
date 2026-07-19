-- One partner cannot hold two active bookings for the same slot. This index is
-- the referee for concurrent checkouts: the loser gets a unique violation and
-- assignment moves to the next ranked candidate. Partial + expression-free so
-- it stays cheap; Prisma cannot express it — do not let `migrate dev` drop it.
--
-- `slot` is a block-start ISO string, identical for two bookings of the same
-- scheduled block, so a double-book collides here. Instant bookings carry
-- differing timestamps and are guarded instead by the "no active job" filter in
-- the availability matcher.
CREATE UNIQUE INDEX "Booking_partner_slot_active"
  ON "Booking" ("assignedPartnerId", "slot")
  WHERE "assignedPartnerId" IS NOT NULL
    AND "status" IN ('ASSIGNED','PROVIDER_ARRIVING','STARTED');
