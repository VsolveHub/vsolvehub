# Wallet, V Coins, and referral smoke

Closed-loop customer balance. Coins are a checkout discount. The payment provider is charged only what is left.

1. Sign in as a customer on `http://localhost:3000`.
2. Open Account → Wallet. Top up within the Operations min and max. The balance comes from the ledger, not the browser.
3. Open Account → Coins. Promised, locked, spendable, and expiring are separate numbers.
4. Open Account → Referral. Copy the code. A new signup can apply it once. A second code for the same person is refused.
5. Start a booking payment. Leave wallet and coins off. The provider amount equals the order.
6. Start again with both on. Coin discount, then wallet, then the amount left to pay. Those three come from the server preview and the payment attempt.
7. Fail or abandon the attempt. Wallet available balance and spendable coins return.
8. Capture, then refund. The wallet share returns to the wallet. The provider share returns through the provider. Burned coins stay burned.
9. As Operations, open Wallet and loyalty. Publish a new burn policy or referral version. Do not edit a version that already has signups.
