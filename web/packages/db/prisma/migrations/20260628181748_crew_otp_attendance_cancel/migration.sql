-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Booking" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bookingRef" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "addressId" TEXT NOT NULL,
    "vendorId" TEXT,
    "slot" TEXT NOT NULL,
    "scheduleType" TEXT NOT NULL DEFAULT 'scheduled',
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "paymentStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "paymentMethod" TEXT,
    "archetype" TEXT NOT NULL DEFAULT 'A',
    "archetypeDetails" TEXT NOT NULL DEFAULT '{}',
    "issueDescription" TEXT NOT NULL DEFAULT '',
    "mediaUrls" TEXT NOT NULL DEFAULT '[]',
    "vendorAssignmentMode" TEXT NOT NULL DEFAULT 'auto',
    "baseChargePaise" INTEGER NOT NULL DEFAULT 0,
    "quotedAmount" INTEGER NOT NULL,
    "finalAmountPaise" INTEGER,
    "durationDays" INTEGER NOT NULL DEFAULT 1,
    "assignmentMode" TEXT NOT NULL DEFAULT 'quotes',
    "startOtp" TEXT,
    "startConfirmedAt" DATETIME,
    "endOtp" TEXT,
    "cancelledAt" DATETIME,
    "cancelReason" TEXT,
    "cancelFeePaise" INTEGER NOT NULL DEFAULT 0,
    "rating" INTEGER,
    "review" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedProviderId" TEXT,
    "crewId" TEXT,
    CONSTRAINT "Booking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Booking_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Booking_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "Address" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Booking_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Booking_assignedProviderId_fkey" FOREIGN KEY ("assignedProviderId") REFERENCES "Provider" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Booking_crewId_fkey" FOREIGN KEY ("crewId") REFERENCES "Crew" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Booking" ("addressId", "archetype", "archetypeDetails", "assignedProviderId", "assignmentMode", "baseChargePaise", "bookingRef", "createdAt", "crewId", "durationDays", "finalAmountPaise", "id", "issueDescription", "mediaUrls", "paymentMethod", "paymentStatus", "quotedAmount", "rating", "review", "scheduleType", "serviceId", "slot", "status", "userId", "vendorAssignmentMode", "vendorId") SELECT "addressId", "archetype", "archetypeDetails", "assignedProviderId", "assignmentMode", "baseChargePaise", "bookingRef", "createdAt", "crewId", "durationDays", "finalAmountPaise", "id", "issueDescription", "mediaUrls", "paymentMethod", "paymentStatus", "quotedAmount", "rating", "review", "scheduleType", "serviceId", "slot", "status", "userId", "vendorAssignmentMode", "vendorId" FROM "Booking";
DROP TABLE "Booking";
ALTER TABLE "new_Booking" RENAME TO "Booking";
CREATE UNIQUE INDEX "Booking_bookingRef_key" ON "Booking"("bookingRef");
CREATE TABLE "new_CrewJobDay" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bookingId" TEXT NOT NULL,
    "dayDate" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "progressPhotos" TEXT NOT NULL DEFAULT '[]',
    "earnedPaise" INTEGER NOT NULL DEFAULT 0,
    "customerApprovedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CrewJobDay_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CrewJobDay" ("bookingId", "createdAt", "customerApprovedAt", "dayDate", "id", "progressPhotos", "status") SELECT "bookingId", "createdAt", "customerApprovedAt", "dayDate", "id", "progressPhotos", "status" FROM "CrewJobDay";
DROP TABLE "CrewJobDay";
ALTER TABLE "new_CrewJobDay" RENAME TO "CrewJobDay";
CREATE INDEX "CrewJobDay_bookingId_idx" ON "CrewJobDay"("bookingId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
