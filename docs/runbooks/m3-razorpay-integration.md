# M3 Razorpay Integration Runbook

## Environment Variables
To configure the Razorpay integration in Vsolve Hub, the following environment variables must be set:
- `PAYMENT_PROVIDER`: Set to `razorpay` to use Razorpay or `development` to use the simulated capture (fake provider).
- `RAZORPAY_KEY_ID`: Your Razorpay API Key ID.
- `RAZORPAY_KEY_SECRET`: Your Razorpay API Key Secret.
- `PAYMENT_WEBHOOK_SECRET`: The secret configured in your Razorpay dashboard for verifying webhook payloads.
- `RAZORPAY_API_BASE_URL`: The base URL for Razorpay API (default: `https://api.razorpay.com/v1`).

*(Never include actual secret values in code or unencrypted files.)*

## Test Mode vs Production Mode
- **Test Mode**: Use Razorpay test credentials (`rzp_test_...`). Test cards and UPI IDs can be used to simulate successful or failed payments. Webhooks must be configured to point to your development/staging server.
- **Production Mode**: Use Razorpay live credentials (`rzp_live_...`). Real money is processed. Ensure webhooks are secured and pointing to your production URL.

## Checkout website allowlist (required for ngrok / local tunnels)

Razorpay Checkout validates the **parent page origin**. If the widget opens with the Test Mode ribbon and then shows **"Uh! oh! Something went wrong … continue browsing on \<your-host\>"**:

1. Open Razorpay Dashboard → **Account & Settings** → **Website and app settings** (wording varies; look for Checkout / Website URL).
2. Add the full HTTPS origin you use in the browser, e.g. `https://<subdomain>.ngrok-free.dev`.
3. Save, refresh the Customer app, retry. Update again whenever the ngrok hostname rotates.

This is a Dashboard configuration step — not fixed by rewriting `provider_order_id` handling when the order and key are already correct.

## Webhook Setup Instructions
1. Log in to the Razorpay Dashboard.
2. Go to Account & Settings > Webhooks.
3. Click "Add New Webhook".
4. Enter your endpoint URL (e.g., `https://api.vsolvehub.com/webhooks/razorpay/`).
5. Set the `PAYMENT_WEBHOOK_SECRET` matching your environment variable.
6. Select the necessary events, specifically:
   - `payment.captured`
   - `payment.authorized`
   - `payment.failed`
7. Save and enable the webhook.

## Failure, Retry, and Refund Documentation
- **Failures**: If a payment fails (e.g., card declined, insufficient funds), Razorpay triggers a `payment.failed` event. The system listens to this via webhooks and marks the internal `PaymentAttempt` as `FAILED`.
- **Retries**: A new `PaymentAttempt` or a retry from the client side creates a new Razorpay order. The idempotency key ensures that the same request isn't processed twice.
- **Refunds**: Refunds should be processed via Razorpay API or Dashboard for now. Automatic system-initiated refunds must map the internal payment ID to the `provider_payment_id`.

## Simulated Capture (Fake Provider)
When `PAYMENT_PROVIDER` is set to `development`, the application bypasses Razorpay entirely:
- A "fake" checkout session and order are created.
- The system automatically triggers the `captured` callback synchronously.
- This is useful for local development and CI testing without needing internet access or test credentials.
