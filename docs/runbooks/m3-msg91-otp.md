# M3 MSG91 OTP Integration Runbook

## Environment Variables
Configure the following environment variables to set up MSG91 for OTP delivery:
- `OTP_PROVIDER`: Set to `msg91` for production or `development` for local testing.
- `MSG91_AUTH_KEY`: Your authentication key from the MSG91 dashboard.
- `MSG91_OTP_TEMPLATE_ID`: The specific template ID approved for your OTP messages.
- `MSG91_API_BASE_URL`: The base URL for MSG91 API (default usually: `https://api.msg91.com/api/v5`).

*(Never include actual secret values in your configuration repositories.)*

## Development Fallback
For local development, set:
`OTP_PROVIDER=development`
When using the development provider, MSG91 is not contacted. Instead, the generated OTP is logged and returned directly in the API response or terminal, allowing developers to test authentication flows seamlessly.

## Production Mode
For production environments, set:
`OTP_PROVIDER=msg91`
This requires `MSG91_AUTH_KEY` and `MSG91_OTP_TEMPLATE_ID` to be present. Real SMS messages will be delivered to the provided phone numbers.

## Template Setup on MSG91 Dashboard
1. Log in to the MSG91 Dashboard.
2. Navigate to the OTP/SMS section and select "Templates".
3. Create a new template for OTP delivery (e.g., "Your Vsolve Hub verification code is {#var#}. Do not share this.").
4. Submit for DLT (Distributed Ledger Technology) approval if operating in India.
5. Once approved, copy the Template ID and set it as `MSG91_OTP_TEMPLATE_ID`.

## Error Handling and Failure Codes
- Network timeouts or MSG91 API downtime will raise a delivery exception in the backend.
- Invalid phone numbers or unapproved templates will result in MSG91 API error codes (e.g., 400 Bad Request or MSG91 specific error codes).
- If OTP sending fails, the system logs the error and surfaces a safe "Failed to send OTP" message to the user, prompting them to try again.
