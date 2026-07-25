// Perf baseline measurer for the VSolve customer app.
//
// Run against a PRODUCTION build (dev-server timings are inflated by Turbopack
// compilation), e.g. in one terminal:
//
//     pnpm --filter customer build && pnpm --filter customer start
//
// then in another:
//
//     node web/scripts/perf-measure.mjs
//
// Auth: authenticated routes need your logged-in session cookie. Log in via the
// browser, copy the whole Cookie header (or just the session cookie) from
// DevTools > Network > any request, and pass it:
//
//     SESSION_COOKIE="vsolve_session=…" node web/scripts/perf-measure.mjs
//
// Optional env:
//     BASE_URL       default http://localhost:3000
//     SERVICE_PATH   a real /services/<cat>/<slug> to measure (auto-detected if omitted)
//     RUNS           timed samples per route (default 6, plus 1 warmup)
//
// Output: prints a markdown table AND writes web/perf-baseline.json (raw), which
// the assistant reads to build PERF_BASELINE.md. No app code is touched.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const BASE = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const COOKIE = process.env.SESSION_COOKIE || "";
const RUNS = Math.max(1, Number(process.env.RUNS) || 6);
const WARMUP = 1;

const headersFor = (needsAuth) => {
  const h = { "user-agent": "perf-measure" };
  if (needsAuth && COOKIE) h["cookie"] = COOKIE;
  return h;
};

async function timeOnce(url, needsAuth) {
  const t0 = performance.now();
  try {
    const res = await fetch(url, { headers: headersFor(needsAuth), redirect: "manual" });
    // Consume the body so we measure full response time, not just headers.
    await res.arrayBuffer();
    return { ms: performance.now() - t0, status: res.status };
  } catch (err) {
    return { ms: performance.now() - t0, status: 0, error: String(err?.cause?.code || err?.message || err) };
  }
}

function stats(samples) {
  const ms = samples.map((s) => s.ms).sort((a, b) => a - b);
  const median = ms[Math.floor(ms.length / 2)];
  const p95 = ms[Math.min(ms.length - 1, Math.ceil(ms.length * 0.95) - 1)];
  return { median: Math.round(median), p95: Math.round(p95), min: Math.round(ms[0]) };
}

async function measure(route) {
  const url = BASE + route.path;
  for (let i = 0; i < WARMUP; i++) await timeOnce(url, route.auth);
  const samples = [];
  for (let i = 0; i < RUNS; i++) samples.push(await timeOnce(url, route.auth));
  const last = samples[samples.length - 1];
  return { ...route, url, status: last.status, error: last.error, ...stats(samples) };
}

// Try to discover a real service detail path so the measurement is representative.
async function resolveServicePath() {
  if (process.env.SERVICE_PATH) return process.env.SERVICE_PATH;
  const fallback = "/services/technician/electrician";
  try {
    const res = await fetch(BASE + "/api/catalog", { headers: headersFor(false) });
    if (!res.ok) return fallback;
    const data = await res.json();
    const cats = Array.isArray(data) ? data : data?.categories ?? [];
    for (const c of cats) {
      const svc = (c.services ?? [])[0] || (c.subCategories ?? []).flatMap((s) => s.services ?? [])[0];
      if (c.slug && svc?.slug) return `/services/${c.slug}/${svc.slug}`;
    }
  } catch {
    /* fall through */
  }
  return fallback;
}

const run = async () => {
  const servicePath = await resolveServicePath();

  const routes = [
    { name: "home", path: "/", auth: false },
    { name: "services list", path: "/services", auth: false },
    { name: "service detail", path: servicePath, auth: false },
    { name: "store", path: "/store", auth: false },
    { name: "cart", path: "/cart", auth: true },
    { name: "checkout", path: "/checkout", auth: true },
    { name: "profile/bookings", path: "/profile/bookings", auth: true },
    { name: "api notifications", path: "/api/notifications?audience=customer", auth: true },
    { name: "api cart", path: "/api/cart", auth: true },
    { name: "api cart?count=1", path: "/api/cart?count=1", auth: true },
    { name: "api catalog", path: "/api/catalog", auth: false },
    { name: "api auth/session", path: "/api/auth/session", auth: true },
    { name: "api store/products", path: "/api/store/products", auth: false },
  ];

  console.log(`\nPerf baseline — ${BASE}  (${RUNS} samples/route, cookie: ${COOKIE ? "yes" : "NONE"})`);
  console.log(`service detail path: ${servicePath}\n`);

  const results = [];
  for (const r of routes) {
    const out = await measure(r);
    results.push(out);
    const flag = out.status >= 400 || out.status === 0 ? ` ⚠️ ${out.status}${out.error ? " " + out.error : ""}` : "";
    const authNote = r.auth && !COOKIE ? " (no cookie — likely unauth)" : "";
    console.log(
      `${r.name.padEnd(20)} ${String(out.median).padStart(6)}ms  p95 ${String(out.p95).padStart(6)}ms  [${out.status}]${flag}${authNote}`,
    );
  }

  console.log("\n| Route | Median | p95 | Status |");
  console.log("|---|--:|--:|:--:|");
  for (const r of results) {
    console.log(`| ${r.name} | ${r.median}ms | ${r.p95}ms | ${r.status || "ERR"} |`);
  }

  const outPath = resolve(dirname(fileURLToPath(import.meta.url)), "..", "perf-baseline.json");
  writeFileSync(outPath, JSON.stringify({ base: BASE, runs: RUNS, cookie: !!COOKIE, servicePath, at: new Date().toISOString(), results }, null, 2));
  console.log(`\nWrote ${outPath}`);
};

run();
