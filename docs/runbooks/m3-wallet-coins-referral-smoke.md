# Wallet, V Coins, and referral smoke

Closed-loop customer balance. Coins are a checkout discount. The payment provider is charged only what is left.

1. Sign in as a customer on `http://localhost:3000`.
2. Open Account → Wallet. Top up within the Operations min and max. The balance comes from the ledger, not the browser.
3. Open Account → Coins. Pending (waiting period), locked, spendable, and expiring are separate numbers.
4. Open Account → Referral. Copy the link (`/signup?ref=CODE`). Open it in a private window with a new phone number and sign up: the code is pre-filled and applied during OTP verification. Logging in with an existing number and a code does nothing.
5. Start a booking payment. Leave wallet and coins off. The provider amount equals the order.
6. Start again with both on. Coin discount, then wallet, then the amount left to pay. Those three come from the server preview and the payment attempt.
7. Fail or abandon the attempt. Wallet available balance and spendable coins return.
8. Capture, then refund. The wallet share returns to the wallet. The provider share returns through the provider. Burned coins stay burned.
9. As Operations, open Wallet and loyalty. Publish a new burn policy or referral version. Do not edit a version that already has signups.
10. Complete the referred customer's first booking. The referral shows "Booking completed — reward on <date>" (default 7 days). In Operations → Wallet and loyalty → Settings, set the waiting period to 0 to see it pay on the next sweep (every 15 minutes) or on the next completion.
11. Refund a completed booking inside the waiting period. Its pending coins show as cancelled and the referral goes back to Pending.
12. Operations → Referral review: reject a pending referral, or reverse a paid one. Both need a reason and need the step-up confirmation. Operations → Customer lookup shows the ledger rows with booking and rule.
13. Operations → Earn rules: create a rule "By order value" with two tiers; overlapping tiers are refused.
