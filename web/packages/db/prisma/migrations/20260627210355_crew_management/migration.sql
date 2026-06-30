-- CreateTable
CREATE TABLE "Crew" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leadPartnerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tradeSlug" TEXT NOT NULL,
    "city" TEXT NOT NULL DEFAULT 'Hyderabad',
    "equipment" TEXT NOT NULL DEFAULT '[]',
    "rating" REAL NOT NULL DEFAULT 4.7,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "lat" REAL NOT NULL DEFAULT 17.385,
    "lng" REAL NOT NULL DEFAULT 78.4867,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Crew_leadPartnerId_fkey" FOREIGN KEY ("leadPartnerId") REFERENCES "Partner" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CrewMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "crewId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "skillLevel" TEXT NOT NULL DEFAULT 'skilled',
    "dayRatePaise" INTEGER,
    "phone" TEXT,
    "photoUrl" TEXT,
    "inviteToken" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'INVITED',
    "invitedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "joinedAt" DATETIME,
    CONSTRAINT "CrewMember_crewId_fkey" FOREIGN KEY ("crewId") REFERENCES "Crew" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CrewJobDay" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bookingId" TEXT NOT NULL,
    "dayDate" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "progressPhotos" TEXT NOT NULL DEFAULT '[]',
    "customerApprovedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CrewJobDay_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CrewClockEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "crewJobDayId" TEXT NOT NULL,
    "crewMemberId" TEXT NOT NULL,
    "clockInAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clockOutAt" DATETIME,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    CONSTRAINT "CrewClockEvent_crewJobDayId_fkey" FOREIGN KEY ("crewJobDayId") REFERENCES "CrewJobDay" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CrewClockEvent_crewMemberId_fkey" FOREIGN KEY ("crewMemberId") REFERENCES "CrewMember" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

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
INSERT INTO "new_Booking" ("addressId", "archetype", "archetypeDetails", "assignedProviderId", "baseChargePaise", "bookingRef", "createdAt", "finalAmountPaise", "id", "issueDescription", "mediaUrls", "paymentMethod", "paymentStatus", "quotedAmount", "rating", "review", "scheduleType", "serviceId", "slot", "status", "userId", "vendorAssignmentMode", "vendorId") SELECT "addressId", "archetype", "archetypeDetails", "assignedProviderId", "baseChargePaise", "bookingRef", "createdAt", "finalAmountPaise", "id", "issueDescription", "mediaUrls", "paymentMethod", "paymentStatus", "quotedAmount", "rating", "review", "scheduleType", "serviceId", "slot", "status", "userId", "vendorAssignmentMode", "vendorId" FROM "Booking";
DROP TABLE "Booking";
ALTER TABLE "new_Booking" RENAME TO "Booking";
CREATE UNIQUE INDEX "Booking_bookingRef_key" ON "Booking"("bookingRef");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Crew_leadPartnerId_key" ON "Crew"("leadPartnerId");

-- CreateIndex
CREATE INDEX "Crew_tradeSlug_status_idx" ON "Crew"("tradeSlug", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CrewMember_inviteToken_key" ON "CrewMember"("inviteToken");

-- CreateIndex
CREATE INDEX "CrewMember_crewId_idx" ON "CrewMember"("crewId");

-- CreateIndex
CREATE INDEX "CrewJobDay_bookingId_idx" ON "CrewJobDay"("bookingId");

-- CreateIndex
CREATE INDEX "CrewClockEvent_crewJobDayId_idx" ON "CrewClockEvent"("crewJobDayId");

-- CreateIndex
CREATE INDEX "CrewClockEvent_crewMemberId_idx" ON "CrewClockEvent"("crewMemberId");
