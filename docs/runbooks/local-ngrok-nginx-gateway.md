# Local Ngrok & Nginx Gateway Setup

This setup uses a local Nginx reverse proxy on port `8080` to route traffic to the three Next.js apps and the Django backend, allowing a single Ngrok tunnel to serve all parts of the application. 

## Path Mapping

- `/` → Customer App (port `3000`)
- `/partner/` → Partner App (port `3001`, requires `NEXT_PUBLIC_BASE_PATH=/partner`)
- `/ops/` → Admin App (port `3002`, requires `NEXT_PUBLIC_BASE_PATH=/ops`)
- `/api/` & `/media/` → Django API (port `8000`)

## Startup Commands

If you need to start the setup again, run the following commands:

1. **Start the Nginx Gateway:**
   ```bash
   ~/nginx/sbin/nginx -c $(pwd)/infra/local/ngrok-gateway.conf
   ```
   *(To reload config: `~/nginx/sbin/nginx -s reload -c $(pwd)/infra/local/ngrok-gateway.conf`)*

2. **Start the Frontend Apps:**
   Ensure old Next.js servers are killed before starting them. These must be built and started with the correct base paths.
   ```bash
   # Customer
   cd frontend/apps/customer
   NEXT_PUBLIC_API_BASE_URL="" API_BASE_URL="http://127.0.0.1:8000" pnpm run start -p 3000

   # Partner
   cd frontend/apps/partner
   NEXT_PUBLIC_API_BASE_URL="" NEXT_PUBLIC_BASE_PATH="/partner" API_BASE_URL="http://127.0.0.1:8000" pnpm run start -p 3001
   
   # Admin
   cd frontend/apps/admin
   NEXT_PUBLIC_API_BASE_URL="" NEXT_PUBLIC_BASE_PATH="/ops" API_BASE_URL="http://127.0.0.1:8000" pnpm run start -p 3002
   ```

3. **Start Ngrok:**
   Point Ngrok to the Nginx gateway on `8080`.
   ```bash
   ngrok http 8080 --log=stdout --log-format=logfmt
   ```

## Webhooks

Make sure your Razorpay webhooks point to:
`https://<your-ngrok-domain>.ngrok-free.dev/api/v1/payment-webhooks/razorpay/`
(GET returns 405; Razorpay POSTs.) Django CSRF trusted origins allow `*.ngrok-free.dev`.

## Razorpay Checkout website allowlist (ngrok)

If Checkout opens (Test Mode ribbon visible) then shows **"Uh! oh! Something went wrong … continue browsing on \<ngrok-host\>"**, the Django order + key are usually fine — Razorpay is blocking the parent page origin.

1. Razorpay Dashboard → **Account & Settings** → **Website and app settings** (or **Payment gateway → Settings → Checkout**).
2. Under allowed websites / Checkout preferences, add the **exact** current ngrok origin, e.g. `https://unbitten-greasily-unwound.ngrok-free.dev` (no path).
3. Save, wait a minute, hard-refresh the Customer tab, retry wallet top-up or rental pay.
4. After every ngrok hostname change, update this allowlist (and the webhook URL above).

Do **not** treat this iframe error as a missing `provider_order_id` if the Test Mode ribbon already appeared — that ribbon means `checkout.js` loaded with a key; the domain check failed afterward.
