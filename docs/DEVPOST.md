# PayPilot AI — Devpost Description

## From Intention to Transaction

PayPilot AI is a human-controlled payment operations assistant for freelancers and independent professionals. It converts a plain-English request—such as “Invoice Sarah €450 for website design, due next Friday”—into structured, validated, and editable invoice data.

The product follows a deliberate financial workflow:

**Understand → Validate → Preview → Approve → Execute → Verify**

Google Gemini interprets the request using structured output and an explicit reference date and timezone. Zod validates every model response, while incomplete instructions produce clarification prompts instead of invented emails, prices, currencies, or dates. The user can edit every field and review the server-calculated total before any financial action becomes available.

PayPal execution is isolated behind a second, explicit approval screen. The server uses sandbox-only OAuth, maps the validated invoice to PayPal Invoicing v2, attaches a stable `PayPal-Request-Id`, and prevents rapid duplicate submissions. After creation, PayPilot reads the invoice back from PayPal and displays only the genuine invoice ID and verified `DRAFT` status. It never sends an invoice or captures a payment.

## How we built it

- Next.js App Router, React, and TypeScript
- Tailwind CSS for the responsive fintech interface
- Google Gemini through the official Google Gen AI SDK
- Zod for AI, API, and edited-invoice validation
- PayPal REST OAuth and Invoicing v2 sandbox APIs
- Vitest with mocked Gemini and PayPal responses

## Why it matters

Small independent businesses lose time translating informal client conversations into payment administration. Fully autonomous financial agents introduce unacceptable risk. PayPilot occupies the useful middle: AI handles interpretation and repetitive structuring, while a person retains control over the exact recipient, amount, due date, and execution decision.

## Current verification status

The complete PayPal sandbox draft workflow is implemented and covered by automated tests. A successful live sandbox draft has not yet been claimed: the first authorized attempt was rejected because the sandbox OAuth token lacked the Invoicing permission. Invoicing has since been enabled, but the latest read-only check still returned `403 NOT_AUTHORIZED`, consistent with permission propagation or token caching. No invoice was created or sent.

## What’s next

After sandbox permission propagation is confirmed through a read-only API check, the next milestone is one controlled draft verification. Deployment, invoice sending, payment capture, persistence, and production PayPal access remain intentionally outside the current MVP.
