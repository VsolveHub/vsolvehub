import { prisma } from "@vsolve/db";
import { requirePartner, type PartnerWithRelations } from "@/lib/auth";
import { inr, timeAgo } from "@/lib/format";
import { CaptainLive, type Offer, type LedgerEntry, type AlertItem } from "./captain-live";
import { CrewRequestPoller } from "./crew-request-poller";

export const metadata = { title: "Captain Live", robots: { index: false } };

/** Platform commission on crew jobs — the lead's payout is the rest (lead-settled). */
const CREW_COMMISSION_RATE = 0.15;

const DOC_LABELS: Record<string, string> = {
  SELFIE: "Profile Photo",
  AADHAAR: "Aadhaar Verification",
  PAN: "PAN Card",
  TRADE_CERTIFICATE: "Trade Certificate",
  DRIVING_LICENCE: "Driving Licence",
  BANK_PASSBOOK: "Bank Details",
  RC: "Registration Certificate",
  OTHER: "Document",
};

function refId(id: string): string {
  let n = 0;
  for (const ch of id) n = (n * 31 + ch.charCodeAt(0)) % 9000;
  return `#VS-${1000 + n}`;
}

function tierFor(jobs: number): string {
  if (jobs >= 200) return "Gold Captain";
  if (jobs >= 50) return "Silver Captain";
  return "Bronze Captain";
}

function defaultChecklist(type: PartnerWithRelations["providerType"]) {
  return type === "DRIVER"
    ? [
        { label: "Valid Driver's Licence", ok: true },
        { label: "Insurance Certificate", ok: false },
        { label: "Aadhaar Verification", ok: true },
      ]
    : [
        { label: "Aadhaar Verification", ok: true },
        { label: "Trade Certificate", ok: false },
        { label: "Bank Details", ok: true },
      ];
}

/** A realistic incoming job built for the partner's trade. */
function offerFor(type: string, service: string, city: string): Offer {
  const area = city ? `Banjara Hills, ${city}` : "Banjara Hills, Hyderabad";
  if (type === "DRIVER") {
    return {
      kind: "RIDE",
      title: "Airport Drop · Sedan",
      fare: 640,
      surge: 1.4,
      travelKm: 3.1,
      etaMin: 6,
      durationMin: 38,
      area,
      pickup: "Jubilee Hills Checkpost",
      drop: "RGIA Terminal 1, Shamshabad",
      customer: { name: "Ananya Rao", rating: 4.9, since: "2022" },
      tasks: [
        "Verify pickup OTP with rider",
        "Confirm drop location & route",
        "Assist with luggage",
        "Maintain AC & clean cabin",
      ],
      materials: [],
    };
  }
  if (type === "CLEANER") {
    return {
      kind: "CLEAN",
      title: "AC Deep Cleaning · 2 Units",
      fare: 850,
      surge: 1.2,
      travelKm: 7.2,
      etaMin: 16,
      durationMin: 55,
      area,
      pickup: "Your location",
      drop: "Flat 402, Sunshine Apartments",
      customer: { name: "Rajesh Kumar", rating: 4.8, since: "2023" },
      tasks: [
        "Capture before photos of both units",
        "Dismantle & jet-wash filters",
        "Deep clean coils & blower",
        "Reassemble & test cooling",
        "Capture after photos",
      ],
      materials: ["Coil cleaner spray", "Microfiber cloths", "Fin comb"],
    };
  }
  return {
    kind: "REPAIR",
    title: service ? `${service} · On-site` : "Electrical Repair · On-site",
    fare: 450,
    surge: 1.3,
    travelKm: 4.2,
    etaMin: 11,
    durationMin: 50,
    area,
    pickup: "Your location",
    drop: "24, Green Valley Estate, Phase 3",
    customer: { name: "Rajesh Kumar", rating: 4.8, since: "2023" },
    tasks: [
      "Inspect main switch & wiring",
      "Diagnose tripping fault",
      "Replace faulty MCB / connector",
      "Test all circuits under load",
      "Capture after-work photo",
    ],
    materials: ["32A MCB", "Insulation tape", "Wire connectors"],
  };
}

export default async function LivePage() {
  const partner = await requirePartner();
  const firstName = partner.fullName?.split(" ")[0] ?? "Captain";
  const isDriver = partner.providerType === "DRIVER";
  const serviceName = partner.trade?.name ?? "";
  const cityName = partner.city?.name ?? "Hyderabad";
  const offer = offerFor(partner.providerType, serviceName, cityName);

  const [earnings, trips, documents, payout, crew] = await Promise.all([
    prisma.earningRecord.findMany({ where: { partnerId: partner.id }, orderBy: { createdAt: "desc" } }),
    prisma.trip.findMany({ where: { partnerId: partner.id }, orderBy: { createdAt: "desc" } }),
    prisma.document.findMany({ where: { partnerId: partner.id }, orderBy: { createdAt: "desc" } }),
    prisma.payoutDetail.findUnique({ where: { partnerId: partner.id } }),
    prisma.crew.findUnique({ where: { leadPartnerId: partner.id }, select: { id: true, name: true } }),
  ]);

  // Crew lead surface. "jobs" = needs-attention (in progress, or done but unpaid).
  // Paid crew jobs become real earnings, derived straight from the bookings (no drift).
  let crewSummary = null;
  const crewEarningRows: { id: string; amount: number; ref: string; createdAt: Date; title: string }[] = [];
  if (crew) {
    const [attentionJobs, paidJobs, pendingRequests] = await Promise.all([
      prisma.booking.findMany({
        where: {
          crewId: crew.id,
          OR: [
            { status: { in: ["CREW_ASSIGNED", "CREW_EN_ROUTE", "CREW_WORKING"] } },
            { status: "COMPLETED", paymentStatus: { not: "PAID" } },
          ],
        },
        orderBy: { createdAt: "desc" },
        include: { service: { select: { name: true } }, address: { select: { area: true, city: true, fullAddress: true } } },
      }),
      prisma.booking.findMany({
        where: {
          crewId: crew.id,
          paymentStatus: "PAID",
          OR: [{ status: "COMPLETED" }, { status: "CANCELLED", cancelFeePaise: { gt: 0 } }],
        },
        orderBy: { createdAt: "desc" },
        take: 30,
        include: { service: { select: { name: true } } },
      }),
      prisma.crewJobOffer.count({ where: { crewId: crew.id, status: "PENDING", expiresAt: { gt: new Date() } } }),
    ]);

    crewSummary = {
      name: crew.name,
      pendingRequests,
      jobs: attentionJobs.map((j) => ({
        bookingRef: j.bookingRef,
        service: j.service.name,
        location: j.address.area || j.address.city || j.address.fullAddress,
        status: j.status === "COMPLETED" ? "AWAITING_PAYMENT" : j.status,
        durationDays: j.durationDays,
        amountRupees: Math.round(j.quotedAmount / 100),
      })),
    };

    for (const b of paidJobs) {
      const gross = Math.round((b.finalAmountPaise ?? b.quotedAmount) / 100);
      const net = Math.round(gross * (1 - CREW_COMMISSION_RATE));
      crewEarningRows.push({ id: b.id, amount: net, ref: b.bookingRef, createdAt: b.createdAt, title: `${b.service.name} · Team` });
    }
  }

  // Money split: positive entries are EARNINGS (jobs), negative are WITHDRAWALS.
  // Withdrawals reduce the available balance only — never the earnings figures.
  const rawEntries = isDriver
    ? trips.map((t) => ({ id: t.id, amount: t.fare, ref: t.ref, createdAt: t.createdAt, title: `${t.fromArea} → ${t.toArea}` }))
    : earnings.map((e) => ({ id: e.id, amount: e.amount, ref: e.ref, createdAt: e.createdAt, title: serviceName || "Service job" }));

  // Earnings (credits) = positive job entries + crew payouts. This is the jobs history.
  const rows = [...rawEntries.filter((r) => r.amount > 0), ...crewEarningRows].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );
  // Withdrawals (debits).
  const withdrawalEntries = rawEntries
    .filter((r) => r.amount < 0)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayTotal = rows.filter((r) => r.createdAt >= startOfToday).reduce((s, r) => s + r.amount, 0);

  const week = Array.from({ length: 7 }, (_, i) => {
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - (6 - i));
    const next = new Date(day.getTime() + 864e5);
    const value = rows.filter((r) => r.createdAt >= day && r.createdAt < next).reduce((s, r) => s + r.amount, 0);
    return { label: ["S", "M", "T", "W", "T", "F", "S"][day.getDay()] ?? "", value };
  });
  const weekTotal = week.reduce((s, d) => s + d.value, 0);
  const totalEarned = rows.reduce((s, r) => s + r.amount, 0);
  const withdrawnTotal = withdrawalEntries.reduce((s, r) => s + Math.abs(r.amount), 0);
  // Available balance = lifetime earnings minus what's already been withdrawn.
  const allTotal = Math.max(0, totalEarned - withdrawnTotal);
  const jobsCompleted = partner.jobsCompleted || rows.length;
  const avgJob = rows.length ? Math.round(totalEarned / rows.length) : offer.fare;

  const withdrawals = withdrawalEntries.slice(0, 6).map((r) => ({
    id: r.id,
    amount: Math.abs(r.amount),
    ref: r.ref,
    when: timeAgo(r.createdAt),
  }));

  const ledger: LedgerEntry[] = rows.slice(0, 8).map((r) => ({
    id: r.id,
    title: r.title,
    ref: r.ref,
    amount: r.amount,
    when: timeAgo(r.createdAt),
  }));

  // Real-ish notification feed derived from the partner's data.
  const alerts: AlertItem[] = [];
  if (partner.status === "ACTIVE") {
    alerts.push({
      kind: "offer",
      title: "New job nearby",
      body: `${offer.title} · ${offer.travelKm} km · ${inr(offer.fare)}`,
      when: "now",
    });
  }
  const rejectedDoc = documents.find((d) => d.status === "REJECTED");
  const pendingDoc = documents.find((d) => d.status === "PENDING");
  if (rejectedDoc) {
    alerts.push({
      kind: "doc",
      title: "Document needs attention",
      body: rejectedDoc.reason ?? `Please re-upload your ${DOC_LABELS[rejectedDoc.type] ?? "document"}.`,
      when: timeAgo(rejectedDoc.createdAt),
    });
  } else if (pendingDoc) {
    alerts.push({
      kind: "doc",
      title: "Document under review",
      body: `We're verifying your ${DOC_LABELS[pendingDoc.type] ?? "document"}.`,
      when: timeAgo(pendingDoc.createdAt),
    });
  }
  if (rows[0]) {
    alerts.push({
      kind: "payout",
      title: `Payout of ${inr(rows[0].amount)} confirmed`,
      body: payout?.accountLast4 ? `Credited to ····${payout.accountLast4}` : "Credited to your wallet",
      when: timeAgo(rows[0].createdAt),
    });
  }
  if (jobsCompleted >= 50) {
    alerts.push({
      kind: "milestone",
      title: "Milestone reached! 🏆",
      body: `You've completed ${jobsCompleted} jobs — you're a ${tierFor(jobsCompleted)}.`,
      when: "this week",
    });
  }

  // Gate checklist (non-active states).
  const checklist = documents.length
    ? documents.map((d) => ({ label: DOC_LABELS[d.type] ?? d.type, ok: d.status === "APPROVED" }))
    : defaultChecklist(partner.providerType);
  const reason =
    documents.find((d) => d.status === "REJECTED" && d.reason)?.reason ??
    "Some details couldn't be verified. Please review the checklist and re-submit.";

  return (
    <>
      {crew ? <CrewRequestPoller /> : null}
      <CaptainLive
      name={firstName}
      providerType={partner.providerType}
      service={serviceName}
      city={cityName}
      status={partner.status}
      rating={partner.rating}
      jobsCompleted={jobsCompleted}
      onlineHours={partner.onlineHours}
      todayEarnings={todayTotal}
      weekTotal={weekTotal}
      allTotal={allTotal}
      avgJob={avgJob}
      week={week}
      ledger={ledger}
      alerts={alerts}
      tier={tierFor(jobsCompleted)}
      bankLast4={payout?.accountLast4 ?? null}
      offer={offer}
      refId={refId(partner.id)}
      reason={reason}
      checklist={checklist}
      crew={crewSummary}
      withdrawals={withdrawals}
      />
    </>
  );
}
