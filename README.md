# PayPilot AI

**From Intention to Transaction.**

PayPilot AI is a human-controlled payment operations assistant for freelancers and independent professionals. The product is being built for the PayPal AI Hackathon 2026.

## The problem

Independent professionals repeatedly translate informal client agreements into structured invoices. The process is slow, error-prone, and risky to automate without a clear review boundary.

## The proposed solution

PayPilot AI turns a natural-language instruction into validated, editable invoice data through a deliberate workflow:

**Understand → Validate → Preview → Approve → Execute → Verify**

Financial actions remain behind explicit human approval. PayPal results are displayed only when returned by the real sandbox API.

## Core features

- Gemini structured-output interpretation with clarification instead of invented financial data
- Strict Zod validation before and after AI interpretation
- Editable customer, due-date, currency, and line-item preview
- Server-calculated totals using integer minor units
- Deliberate human approval immediately before PayPal execution
- Sandbox-only PayPal OAuth and Invoicing v2 integration
- Stable PayPal request IDs and duplicate-submission protection
- Genuine invoice-ID extraction and follow-up `DRAFT` status verification
- Sanitized provider errors that retain safe status, issue, and debug identifiers

## Technology

- Next.js App Router and TypeScript
- Tailwind CSS
- Zod validation
- PayPal REST APIs (sandbox, Invoicing v2)
- Google Gemini structured output through the official Google Gen AI SDK

No database or authentication layer is required for the MVP.

## Local setup

Requirements: Node.js 20.9 or newer and npm.

```bash
git clone <repository-url>
cd PayPal-Hackathon
npm ci
copy .env.example .env.local
npm run dev
```

On macOS or Linux, use `cp .env.example .env.local` instead of `copy`.

Open [http://localhost:3000](http://localhost:3000).

## Environment variables

| Variable | Purpose |
| --- | --- |
| `PAYPAL_CLIENT_ID` | PayPal sandbox application client ID |
| `PAYPAL_CLIENT_SECRET` | PayPal sandbox application secret |
| `PAYPAL_API_BASE` | Must remain `https://api-m.sandbox.paypal.com` |
| `PAYPAL_SANDBOX_MERCHANT_EMAIL` | Email of the sandbox Business account associated with the OAuth app |
| `GEMINI_API_KEY` | Server-only Gemini Developer API key |
| `GEMINI_MODEL` | Structured-output model; defaults to `gemini-3.8-flash` |

Never commit `.env.local`, paste credentials into issues or chat, or use live PayPal credentials in this project.

### PayPal sandbox configuration

1. Create or select a sandbox Business account in the PayPal Developer Dashboard.
2. Create a sandbox REST application associated with that Business account.
3. Enable **Invoicing** in the application features and save the change.
4. Place only the sandbox Client ID, secret, and matching Business-account email in `.env.local`.
5. Keep `PAYPAL_API_BASE` set exactly to `https://api-m.sandbox.paypal.com`.

PayPal may temporarily issue a cached token after permissions change. Before testing draft creation, confirm the token contains `https://api.paypal.com/v1/invoicing:*` and that a read-only `GET /v2/invoicing/invoices` succeeds.

## Commands

```bash
npm run dev        # start the development server
npm run lint       # run ESLint
npm run typecheck  # run TypeScript without emitting files
npm test           # run focused mocked tests
npm run build      # create a production build
npm start          # serve the production build
```

Automated tests mock Gemini and PayPal; they do not create invoices or require live provider calls.

## Current implementation status

Implemented:

- Responsive fintech invoice workspace
- Server-side Gemini structured-output interpretation
- Clarification responses for missing or invalid invoice details
- Editable invoice preview with live validation and calculated totals
- Invoice item schema and PayPal payload mapper
- Sandbox-only PayPal OAuth helper with sanitized failures
- Explicit approval confirmation showing recipient, line items, due date, and total
- Guarded PayPal draft creation endpoint with server-side validation and total calculation
- Stable `PayPal-Request-Id` idempotency keys and in-process duplicate suppression
- Genuine invoice ID extraction followed by a PayPal detail lookup that verifies `DRAFT` status
- Mocked automated tests that do not require Gemini credentials

Not implemented: invoice sending, payment capture, live PayPal operation, authentication, persistence, and deployment.

### Known limitations and current authorization status

- PayPal execution is hard-limited to the sandbox base URL.
- The PayPal draft-creation workflow is implemented and covered by mocked tests, but a successful live sandbox draft has **not** been verified.
- The single authorized sandbox creation attempt returned an authorization failure because the OAuth token lacked `https://api.paypal.com/v1/invoicing:*`.
- Invoicing has since been enabled for the sandbox REST application, but the latest read-only verification still returned PayPal HTTP `403 NOT_AUTHORIZED`, consistent with permission propagation or a cached token.
- No invoice was created or sent during that failed attempt.

## Planned demonstration workflow

1. Enter a natural-language invoice request.
2. Use AI structured output to extract invoice fields.
3. Validate and edit the draft in the browser.
4. Explicitly approve draft creation.
5. After sandbox authorization is verified, create one approved PayPal sandbox invoice in `DRAFT` status.
6. Display the genuine PayPal invoice ID and status returned by PayPal.

Sending will remain a separate, explicit action. The application will never manufacture PayPal results.

## Reproducing the project

Detailed judge setup, validation-only usage, and the optional authorized sandbox flow are documented in [`docs/JUDGING.md`](docs/JUDGING.md).

Submission materials:

- [`docs/DEVPOST.md`](docs/DEVPOST.md) — concise English project description
- [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md) — demonstration script capped at 2 minutes 45 seconds

## PayPal integration notes

PayPal Invoicing v2 creates a draft with `POST /v2/invoicing/invoices`. PayPilot then reads `GET /v2/invoicing/invoices/{invoice_id}` to verify the actual status. Sending is a separate API call that this application does not invoke. The authenticated sandbox business account must be in good standing, and `PAYPAL_SANDBOX_MERCHANT_EMAIL` must exactly match the business account associated with the access token.

Official references:

- [PayPal Invoicing v2 API](https://developer.paypal.com/api/invoicing/v2/)
- [PayPal Invoicing quick start](https://developer.paypal.com/api/invoicing/)
- [PayPal REST authentication](https://developer.paypal.com/api/rest/authentication)
- [PayPal Invoicing troubleshooting](https://developer.paypal.com/invoicing/troubleshooting)

## License

MIT
