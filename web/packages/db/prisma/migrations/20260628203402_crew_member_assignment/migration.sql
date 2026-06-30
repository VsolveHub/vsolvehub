-- CreateTable
CREATE TABLE "CrewAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bookingId" TEXT NOT NULL,
    "crewMemberId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CrewAssignment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CrewAssignment_crewMemberId_fkey" FOREIGN KEY ("crewMemberId") REFERENCES "CrewMember" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CrewAssignment_bookingId_idx" ON "CrewAssignment"("bookingId");

-- CreateIndex
CREATE INDEX "CrewAssignment_crewMemberId_idx" ON "CrewAssignment"("crewMemberId");

-- CreateIndex
CREATE UNIQUE INDEX "CrewAssignment_bookingId_crewMemberId_key" ON "CrewAssignment"("bookingId", "crewMemberId");
