import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { invoiceCreateRequestSchema, SingleFlightRegistry } from "@/lib/invoice/creation";
import { createPayPalDraftFromInvoice, PayPalIntegrationError } from "@/lib/paypal/client";

const requestId = "11111111-1111-4111-8111-111111111111";
const invoice = {
  customerName: "Demo Customer",
  customerEmail: "recipient@example.test",
  currency: "EUR" as const,
  items: [{ description: "Hackathon integration test", quantity: 1, unitPrice: "1.00" }],
  dueDate: "2026-11-20",
};
const draft = { ...invoice, invoiceDate: "2026-11-11" };

function mockFetch(...responses: Response[]) {
  return vi.fn(async () => {
    const response = responses.shift();
    if (!response) throw new Error("Unexpected fetch call");
    return response;
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  process.env.PAYPAL_CLIENT_ID = "sandbox-client";
  process.env.PAYPAL_CLIENT_SECRET = "sandbox-secret";
  process.env.PAYPAL_API_BASE = "https://api-m.sandbox.paypal.com";
  process.env.PAYPAL_SANDBOX_MERCHANT_EMAIL = "merchant@example.test";
});

describe("approved invoice creation request", () => {
  it("accepts a valid approved invoice", () => {
    expect(invoiceCreateRequestSchema.safeParse({ approved: true, requestId, invoice }).success).toBe(true);
  });

  it("rejects missing approval", () => {
    expect(invoiceCreateRequestSchema.safeParse({ requestId, invoice }).success).toBe(false);
  });

  it("rejects an invalid invoice", () => {
    expect(invoiceCreateRequestSchema.safeParse({ approved: true, requestId, invoice: { ...invoice, customerEmail: "invalid" } }).success).toBe(false);
  });
});

describe("PayPal sandbox draft execution", () => {
  it("categorizes PayPal authentication failure", async () => {
    const fetcher = mockFetch(new Response("{}", { status: 401 }));
    await expect(createPayPalDraftFromInvoice(draft, { explicitlyApproved: true, requestId, fetcher }))
      .rejects.toMatchObject<Partial<PayPalIntegrationError>>({ kind: "authentication", status: 401 });
  });

  it("categorizes a PayPal invoice creation rejection", async () => {
    const fetcher = mockFetch(
      Response.json({ access_token: "token", token_type: "Bearer", expires_in: 3600 }),
      Response.json({
        name: "UNPROCESSABLE_ENTITY",
        details: [{ issue: "INVALID_REQUEST" }],
        debug_id: "debug-safe-123",
      }, { status: 422 }),
    );
    await expect(createPayPalDraftFromInvoice(draft, { explicitlyApproved: true, requestId, fetcher }))
      .rejects.toMatchObject<Partial<PayPalIntegrationError>>({
        kind: "rejected",
        status: 422,
        providerCode: "UNPROCESSABLE_ENTITY",
        providerIssue: "INVALID_REQUEST",
        debugId: "debug-safe-123",
      });
  });

  it("prevents duplicate in-process submissions", async () => {
    const registry = new SingleFlightRegistry<string>();
    let executions = 0;
    let resolveOperation: ((value: string) => void) | undefined;
    const operation = () => {
      executions += 1;
      return new Promise<string>((resolve) => { resolveOperation = resolve; });
    };
    const first = registry.run(requestId, operation);
    const second = registry.run(requestId, operation);
    expect(executions).toBe(1);
    resolveOperation?.("created");
    await expect(Promise.all([first, second])).resolves.toEqual(["created", "created"]);
  });

  it("extracts the real ID, sends an idempotency key, and verifies DRAFT status", async () => {
    const fetcher = mockFetch(
      Response.json({ access_token: "token", token_type: "Bearer", expires_in: 3600 }),
      Response.json({ href: "https://api-m.sandbox.paypal.com/v2/invoicing/invoices/INV2-DEMO" }, { status: 201 }),
      Response.json({ id: "INV2-DEMO", status: "DRAFT" }),
    );
    await expect(createPayPalDraftFromInvoice(draft, { explicitlyApproved: true, requestId, fetcher })).resolves.toEqual({
      id: "INV2-DEMO",
      status: "DRAFT",
      requestId,
    });
    const calls = vi.mocked(fetcher).mock.calls;
    expect(calls[1]?.[0]).toBe("https://api-m.sandbox.paypal.com/v2/invoicing/invoices");
    expect(new Headers(calls[1]?.[1]?.headers).get("PayPal-Request-Id")).toBe(requestId);
    expect(calls[2]?.[0]).toBe("https://api-m.sandbox.paypal.com/v2/invoicing/invoices/INV2-DEMO");
  });
});
