# WhatsApp and SMS notifications

The code is complete and switched off. This runbook turns it on once the keys exist. Nothing
here needs a code change.

## How it works, in one paragraph

Every notice is still written once, in-app (or push), exactly as before. A signal copies it onto
WhatsApp or SMS when its template code is in `backend/apps/notifications/channel_plan.py`
(72 WhatsApp, 7 SMS). `channel_router.py` holds every gate: the channel is on, the audience is a
Customer or Partner, no kill switch or mute, the person opted in (WhatsApp only), and the notice
is fresh (SMS 30 minutes, WhatsApp 24 hours). One notice can produce at most one message.
Delivery attempts are `NotificationDelivery` rows with provider `meta_whatsapp` or `msg91`.

## WhatsApp (Meta Cloud API)

1. **Credentials.** In the Meta app linked to the Business account: WhatsApp → API Setup →
   *Phone number ID*. Create a System User with the WhatsApp permissions and generate a
   never-expiring token. App settings → Basic → *App secret*.
2. **Set:**
   ```
   WHATSAPP_PHONE_NUMBER_ID=...
   WHATSAPP_ACCESS_TOKEN=...
   WHATSAPP_APP_SECRET=...
   WHATSAPP_WEBHOOK_VERIFY_TOKEN=<any string you choose>
   WHATSAPP_TEMPLATE_LANGUAGE=en        # en_US if you create the templates as English (US)
   ```
   Leave `WHATSAPP_ENABLED=false` for now.
3. **Check the keys:** `python manage.py send_test_message --channel whatsapp --to +91<your number>`
   sends Meta's built-in `hello_world`. A `200` means the number id and token work.
4. **Submit the templates:** `python manage.py channel_templates --channel whatsapp` prints all 72.
   In WhatsApp Manager create each one with the **name shown**, category **Utility**, the language
   above, and the body exactly as printed (`{{1}}`, `{{2}}` … in order). Each test value line says
   which value goes in which number. An optional static "Open app" URL button can be added in
   WhatsApp Manager; the code sends no button values.
5. **Webhook:** in the Meta app, WhatsApp → Configuration → Webhook, callback URL
   `https://<api host>/api/v1/notification-webhooks/whatsapp/`, verify token as set above;
   subscribe to `messages`.
6. **Turn on:** `WHATSAPP_ENABLED=true` on the backend and
   `NEXT_PUBLIC_WHATSAPP_UPDATES_ENABLED=true` on the customer and partner sites. Production
   refuses to boot with WhatsApp on and no token or phone number id.
7. Templates still awaiting approval fail with Meta error `132001` (recorded as `meta_132001`)
   and nothing else breaks. You can go live with the approved ones and add the rest as they
   are approved.

People receive WhatsApp only after opting in: the "Get updates on WhatsApp" card (customer
booking page and Message settings) or the WhatsApp switch on the partner Me page.

## SMS (MSG91 + DLT)

1. `python manage.py channel_templates --channel sms` prints the 7 templates in DLT form
   (`{#var#}`) and MSG91 form (`##name##`), and a `MSG91_TEMPLATE_IDS` skeleton.
2. Register each on DLT, create it in MSG91 with the same text, and note MSG91's template id.
3. **Set:**
   ```
   MESSAGE_TRANSPORT=msg91
   MSG91_AUTH_KEY=...
   MSG91_SENDER_ID=...
   MSG91_TEMPLATE_IDS={"customer_visit_en_route":"...","customer_visit_arrived":"...", ...}
   ```
4. **Check:** `python manage.py send_test_message --channel sms --to +91<your number> --template customer_visit_arrived`.
5. **Turn on:** `SMS_NOTIFICATIONS_ENABLED=true`. A code missing from `MSG91_TEMPLATE_IDS` is
   recorded as `no_provider_template` and skipped, never sent with another template's text.

## Turning it off

Engage the `WHATSAPP` or `SMS` kill switch in Operations (copies are recorded as suppressed), or
set `WHATSAPP_ENABLED` / `SMS_NOTIFICATIONS_ENABLED` to false (nothing is recorded at all).

## Changing which notices go where

Edit `channel_plan.py`: add, move or remove one entry. `tests/notifications/test_channel_plan.py`
fails if a route asks for a value its notice does not carry. A new or changed WhatsApp text
needs Meta's approval before it sends; a new SMS text needs DLT registration and an id in
`MSG91_TEMPLATE_IDS`.
