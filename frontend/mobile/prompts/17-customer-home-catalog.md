# Phase 17 — Customer: Home and catalog

## Prompt

```text
Phase 17 of the Vsolve Hub mobile build (Customer app). Read first: frontend/mobile/AGENTS.md,
guide/04-porting-rules.md (server components → useQuery), guide/07-screens-customer.md rows 1–5,
then frontend/apps/customer/app/page.tsx, every (shop)/catalog page, all of
features/catalog (components, icon-catalogue, queries.ts, search.ts, tests) and
lib/api/public.ts + lib/api/config.ts (endpoints and cache lifetimes).

1. Port features/catalog. The web server-side fetches (getCategories, getCategoryServices,
   service detail) become useQuery hooks calling the same endpoints, with staleTime equal to the
   web's CATALOG_REVALIDATE_SECONDS in production (300 s).
2. Screens rows 1–5 1:1: Home sections (incl. reviews marquee as a horizontally auto-scrolling
   row, paused under reduce-motion), catalogue header + search, category rows, category tiles,
   service detail with variants, policies, process steps, fit-out picker and add-to-cart.
   Skip service-json-ld.
3. Images via expo-image with the same aspect ratios; icons via the ported icon-catalogue.
4. Tests: search model tests (ported), one component test per screen.
5. Run and paste: pnpm --filter customer-mobile lint, typecheck, test.
```

## Done when

- [x] Home, Services, a category and a service page match the web at phone width
- [x] search returns the same results as web for 3 test queries
- [x] "Add to cart" updates the cart count in the header

## Commit

```powershell
git add frontend/mobile/apps/customer
git commit -m "feat(customer-mobile): home, catalog and service pages"
```

## Status

- **Status:** Complete (100% implemented)
- **Implementation:** Customer home, category browsing, catalog search, service details with variants/policies/process steps, fit-out selector, and add-to-cart with reactive badge count.
