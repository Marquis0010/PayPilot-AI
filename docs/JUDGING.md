# Judge Reproduction Guide

PayPilot AI runs locally without a database. Automated tests use mocked provider responses and do not create PayPal resources.

## Requirements

- Node.js 20.9 or newer
- npm
- A Google Gemini API key for live interpretation
- Optional: a PayPal sandbox Business account and REST application with Invoicing enabled for draft testing

## Install and run

```bash
git clone <repository-url>
cd PayPal-Hackathon
npm ci
copy .env.example .env.local
npm run dev
```

On macOS or Linux, replace `copy` with `cp`. Open [http://localhost:3000](http://localhost:3000).

Configure `.env.local`:

```dotenv
PAYPAL_CLIENT_ID=<sandbox REST app client ID>
PAYPAL_CLIENT_SECRET=<sandbox REST app secret>
PAYPAL_API_BASE=https://api-m.sandbox.paypal.com
PAYPAL_SANDBOX_MERCHANT_EMAIL=<matching sandbox Business account email>

GEMINI_API_KEY=<Gemini API key>
GEMINI_MODEL=gemini-3.8-flash
```

Never commit `.env.local`. The application rejects every PayPal base URL except `https://api-m.sandbox.paypal.com`.

## Verify the repository

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

The tests mock Gemini and PayPal, covering valid extraction, clarification, edited-invoice validation, explicit approval, PayPal failures, duplicate prevention, response parsing, and draft verification.

## Reproduce the AI workflow

1. Start the development server with `npm run dev`.
2. Enter a complete invoice instruction with a fictional recipient.
3. Select **Interpret Request**.
4. Review and edit the structured fields.
5. Confirm validation messages and the calculated total.
6. Stop before PayPal execution unless you control the configured sandbox accounts and deliberately authorize one draft.

## Optional PayPal sandbox verification

1. In PayPal Developer Dashboard, select the sandbox REST application matching `PAYPAL_CLIENT_ID`.
2. Confirm the application is associated with the configured sandbox Business account.
3. Enable **Invoicing** and save.
4. Request a fresh OAuth token and verify its scope contains `https://api.paypal.com/v1/invoicing:*`.
5. Make a read-only `GET /v2/invoicing/invoices` request; proceed only if it returns successfully.
6. Use fictional customer data and a sandbox Personal recipient.
7. Review the final invoice and explicitly approve **Create PayPal Sandbox Draft** once.
8. Confirm that PayPilot displays a genuine PayPal invoice ID and verified `DRAFT` status.

PayPilot does not call PayPal’s send endpoint and does not capture payments. If a creation response is uncertain, do not retry automatically; inspect the sandbox account using the stable request identifier.

## Current known limitation

At publication preparation time, the PayPal draft path is implemented and mocked tests pass, but successful live draft creation has not been verified. The latest read-only PayPal check returned `403 NOT_AUTHORIZED` because the issued token still lacked the Invoicing scope after the feature was enabled. No invoice was created or sent.
