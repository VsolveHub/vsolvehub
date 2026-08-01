> **FROZEN — reference only, do not build on this.** The M1 (Django-backed)
> frontend now lives in `frontend/` at the repo root. Everything genuinely
> reusable from this tree — the shared packages, the booking workspace, the
> catalog pages, `features/application`, `features/partner-review`, the
> partner marketing site, and every app-level layout/error boundary that
> didn't depend on Prisma or Supabase — has already moved there with its git
> history intact. What remains here is what M1 excludes: other verticals
> (vehicle, accommodation, store, crew), the Prisma/Supabase data layer, and
> screens built against a domain model the current backend doesn't implement.
> Kept as design/UX reference for later milestones, not as a codebase to
> extend. See `Django_Next.js_Plan/M1/03-frontend-tasks.md`.

# VSolveHub — Web Monorepo

Partner portal (`partner.vsolvehub.com`) and customer marketplace (`vsolvehub.com`)
on **Next.js 15 (App Router) + Prisma + SQLite**, in a pnpm + Turborepo monorepo.

## Layout

```
apps/
  partner/     partner.vsolvehub.com — onboarding, KYC, dashboard (primary build)
  customer/    vsolvehub.com — customer marketplace (moved from demo/)
packages/
  db/          Prisma schema, client singleton, seed (single source of truth)
  ui/          design system (tokens + primitives) from the Figma
  config/      service catalog + config-driven onboarding wizard steps
  crypto/      AES-256-GCM for Aadhaar/bank PII at rest
data/          dev.sqlite (gitignored)
```

## Getting started

```bash
cd web
pnpm install

# create app env files
cp apps/partner/.env.example apps/partner/.env.local   # set PARTNER_PII_KEY
cp apps/customer/.env.example apps/customer/.env.local # set AUTH_SECRET

pnpm db:generate     # prisma generate
pnpm db:migrate      # create SQLite schema
pnpm db:seed         # services, cities, demo partner "Raju K."

pnpm dev:partner     # http://localhost:3001
pnpm dev:customer    # http://localhost:3000
```

## SEO surfaces (partner)

- `/` marketing landing — SSG
- `/become-a/[service]` — SSG per service, JSON-LD `JobPosting`, canonical
- `sitemap.xml`, `robots.ts` (auth areas disallowed)

Auth-gated areas (`/login`, `/onboarding`, `/dashboard`) render SSR/CSR — not indexed.

## Next steps (not yet built)

Auth (phone + OTP), the config-driven onboarding wizard, document upload,
and the dashboard shell. See the data model in `packages/db/prisma/schema.prisma`.
