# PayPilot AI Demo Script

Target duration: **2:40**. Hard limit: **2:45**.

> Recording rule: show a PayPal success result only after a real sandbox draft has been created and retrieved successfully. Never substitute mock data or a rehearsed invoice ID.

## 0:00–0:15 — Problem and promise

**Narration:** “Freelancers spend too much time turning informal client requests into payment administration. PayPilot AI moves from intention to transaction while keeping a human in control.”

**Screen:** Product identity, tagline, and six-step workflow.

## 0:15–0:45 — Natural-language interpretation

**Action:** Enter: “Create an invoice for PayPilot Demo Customer at the designated sandbox recipient for €1 for PayPilot Hackathon Integration Test, due November 20.” Select **Interpret Request**.

**Narration:** “Gemini extracts structured invoice data using an explicit date and timezone. The server validates the model response with Zod. Missing financial information triggers clarification instead of fabrication.”

## 0:45–1:15 — Review and edit

**Action:** Highlight the editable recipient, currency, description, quantity, unit price, and due date. Make one small edit and show live validation and the recalculated total.

**Narration:** “AI proposes; the user decides. Every field remains editable, and totals are recalculated rather than trusted from the browser or model.”

## 1:15–1:42 — Human approval boundary

**Action:** Select **Review & Approve**. Pause on the confirmation panel.

**Narration:** “Interpretation and execution are separate operations. Editing invalidates approval. This screen shows the exact recipient, items, total, due date, and authorized action before PayPal can be called.”

## 1:42–2:12 — PayPal sandbox execution

**Action:** Only when live sandbox authorization has already been verified, select **Create PayPal Sandbox Draft** once.

**Narration:** “The server authenticates with PayPal sandbox credentials, uses Invoicing v2, and supplies a stable request ID to reduce duplicate risk. It creates a draft only—it never sends the invoice or captures payment.”

**Fallback if permission remains unavailable:** Do not click. State: “The execution path is complete and mocked tests pass, but today’s sandbox token still lacks propagated Invoicing permission, so we will not fabricate a result.”

## 2:12–2:32 — Genuine verification

**Action:** If successful, show the returned PayPal invoice ID and verified `DRAFT` status, then briefly show the same draft in the PayPal sandbox dashboard.

**Narration:** “PayPilot reads the resource back from PayPal and displays only the genuine ID and verified status.”

## 2:32–2:40 — Close

**Narration:** “PayPilot AI: the speed of AI, the trust of explicit human approval—from intention to transaction.”
