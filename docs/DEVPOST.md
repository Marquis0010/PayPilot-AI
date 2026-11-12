
# PayPilot AI
## From Intention to Transaction

**PayPilot AI is a human-controlled, AI-powered invoicing assistant that transforms natural-language requests into structured, validated, and editable PayPal invoice drafts.**

Designed for freelancers, creators, and independent professionals, PayPilot reduces the administrative friction between agreeing on work and preparing an invoice.

Instead of manually entering invoice details, users can simply write:

> Invoice Sarah €450 for website design, due November 20.

PayPilot interprets the instruction, extracts the relevant details, validates the information, and prepares an editable invoice for human review.

Our guiding principle is simple:

**AI should accelerate financial operations without removing human accountability.**

---

## Inspiration

Freelancers and independent professionals frequently manage client relationships through informal conversations, messages, and project agreements.

However, translating those conversations into accurate invoices requires repetitive administrative work.

We wanted to explore a simple question:

**What if creating an invoice were as easy as describing what you wanted to do?**

At the same time, we recognized that fully autonomous financial agents introduce serious risks.

An AI system should not independently decide who receives an invoice, how much they owe, or when a financial action should occur.

PayPilot was built around a more responsible approach: combining AI assistance with explicit human authorization.

---

## What It Does

PayPilot follows a six-stage workflow:

**Understand → Validate → Preview → Approve → Execute → Verify**

### 1. Understand

Google Gemini interprets natural-language instructions and converts them into structured invoice information.

### 2. Validate

Zod validates the AI-generated data against strict schemas.

Missing or ambiguous information triggers clarification rather than fabricated recipients, prices, currencies, or dates.

### 3. Preview

Users receive an editable invoice preview showing the recipient, description, amount, currency, and due date.

Invoice totals are recalculated server-side.

### 4. Approve

Before any PayPal operation, the user must explicitly review and approve the invoice.

AI-generated instructions alone cannot authorize execution.

### 5. Execute

The backend integrates with PayPal's REST OAuth and Invoicing v2 sandbox APIs to create invoice drafts.

Requests use a stable `PayPal-Request-Id` and safeguards against rapid duplicate submissions.

### 6. Verify

PayPilot retrieves the created invoice from PayPal to verify its genuine invoice ID and `DRAFT` status.

The MVP deliberately does not send invoices, capture payments, or initiate financial transfers.

---

## How We Built It

Our technology stack includes:

- **Next.js App Router, React, and TypeScript** — Application architecture and server-side endpoints.
- **Tailwind CSS** — Responsive financial interface.
- **Google Gemini** — Natural-language interpretation through the official Google Gen AI SDK.
- **Zod** — Structured validation of AI responses, API requests, and edited invoice data.
- **PayPal REST OAuth and Invoicing v2** — Sandbox invoice creation and verification.
- **Vitest** — Automated testing with mocked AI and PayPal responses.

The architecture separates AI interpretation from financial execution, ensuring that generated content cannot bypass validation or human approval.

---

## Challenges We Overcame

One significant challenge was establishing a working PayPal sandbox integration.

Our initial invoice creation attempt was blocked because the sandbox application lacked the required Invoicing OAuth permission.

After enabling the permission and resolving the local TLS trust configuration, we successfully authenticated with PayPal and created a genuine sandbox invoice draft.

We subsequently tested the full workflow through the PayPilot application itself, successfully creating an invoice draft that appeared in the PayPal sandbox business dashboard.

This process reinforced an important design principle:

**Financial integrations must handle permissions, authentication, validation, and verification explicitly rather than assuming an API request succeeded.**

---

## Accomplishments

We successfully implemented and tested PayPilot AI's complete invoicing workflow, from natural-language interpretation to PayPal sandbox invoice creation.

During live testing:

1. A natural-language invoice request was entered into the PayPilot application.
2. Gemini interpreted the instruction into structured invoice data.
3. The generated invoice was presented for review and editing.
4. The user explicitly approved the invoice.
5. PayPilot successfully created an invoice draft through PayPal's sandbox API.
6. The resulting invoice appeared in the PayPal sandbox business dashboard.

We also completed a controlled direct API integration test, which returned:

- **Invoice creation:** HTTP 201
- **Invoice verification:** HTTP 200
- **Verified status:** `DRAFT`
- **Test amount:** €1.00

The application includes automated tests covering core validation and integration behavior.

**No invoice was sent, and no payment was captured.**

These results demonstrate that PayPilot's core concept works beyond a simulated interface.

---

## Why It Matters

Small independent businesses lose valuable time translating informal client conversations into payment administration.

PayPilot demonstrates how AI can reduce that friction while preserving the safeguards necessary for financial operations.

Rather than pursuing fully autonomous financial agents, PayPilot explores a more practical model:

**AI handles interpretation and preparation. Humans retain authority over financial execution.**

The result is a workflow designed to make invoicing faster, more accessible, and more deliberate.

---

## What's Next

With the core AI-to-PayPal workflow functioning, future development will focus on:

- Secure user authentication and persistent invoice histories.
- Deployment and improved production readiness.
- Broader automated and end-to-end testing.
- Support for more complex invoice formats and recurring workflows.
- Additional PayPal capabilities with appropriate authorization and safeguards.

Our long-term vision is to make PayPilot a reliable financial operations assistant that reduces repetitive administrative work without compromising human control.

---

## Project Links

**Source code:** https://github.com/Marquis0010/PayPilot-AI

**Demo video:** [Insert public YouTube video URL]

---

**PayPilot AI — From Intention to Transaction.**