import { describe, expect, it, vi } from "vitest";

import { getReferenceDate, interpretInvoiceInstruction, InvoiceInterpretationError } from "@/lib/invoice/interpretation";
import { invoiceDraftSchema } from "@/lib/invoice/schema";

const referenceDate = "2026-11-11";
const timeZone = "Europe/Budapest";

function completeResponse(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    status: "complete",
    customerName: "Sarah",
    customerEmail: "sarah@example.com",
    currency: "EUR",
    items: [{ description: "Website design", quantity: 1, unitPrice: "450.00" }],
    dueDate: "2026-11-20",
    missingFields: [],
    clarificationQuestion: "",
    ...overrides,
  });
}

describe("invoice interpretation", () => {
  it("accepts a valid structured invoice extraction", async () => {
    const generate = vi.fn().mockResolvedValue(completeResponse());

    const result = await interpretInvoiceInstruction({
      instruction: "Invoice Sarah at sarah@example.com €450 for website design, due next Friday.",
      generate,
      referenceDate,
      timeZone,
    });

    expect(result).toEqual({
      status: "complete",
      invoice: {
        customerName: "Sarah",
        customerEmail: "sarah@example.com",
        currency: "EUR",
        items: [{ description: "Website design", quantity: 1, unitPrice: "450.00" }],
        invoiceDate: referenceDate,
        dueDate: "2026-11-20",
      },
      referenceDate,
      timeZone,
    });
  });

  it("returns clarification when required information is missing", async () => {
    const generate = vi.fn().mockResolvedValue(completeResponse({
      status: "needs_clarification",
      customerEmail: "",
      missingFields: ["customerEmail"],
      clarificationQuestion: "What email address should receive the invoice?",
    }));

    const result = await interpretInvoiceInstruction({
      instruction: "Invoice Sarah €450 for website design, due next Friday.",
      generate,
      referenceDate,
      timeZone,
    });

    expect(result).toEqual({
      status: "needs_clarification",
      missingFields: ["customerEmail"],
      message: "Please provide the customer email.",
    });
  });

  it("rejects an unsupported currency even when the model marks it complete", async () => {
    const generate = vi.fn().mockResolvedValue(completeResponse({ currency: "CAD" }));

    const result = await interpretInvoiceInstruction({
      instruction: "Invoice Sarah at sarah@example.com C$450 for website design, due next Friday.",
      generate,
      referenceDate,
      timeZone,
    });

    expect(result.status).toBe("needs_clarification");
    if (result.status === "needs_clarification") expect(result.missingFields).toContain("currency");
  });

  it("rejects an invalid customer email", async () => {
    const generate = vi.fn().mockResolvedValue(completeResponse({ customerEmail: "not-an-email" }));

    const result = await interpretInvoiceInstruction({
      instruction: "Invoice Sarah at not-an-email €450 for website design, due next Friday.",
      generate,
      referenceDate,
      timeZone,
    });

    expect(result.status).toBe("needs_clarification");
    if (result.status === "needs_clarification") expect(result.missingFields).toContain("customerEmail");
  });

  it("asks for a missing price instead of inventing one", async () => {
    const generate = vi.fn().mockResolvedValue(completeResponse({
      status: "needs_clarification",
      items: [{ description: "Website design", quantity: 1, unitPrice: "" }],
      missingFields: ["items"],
      clarificationQuestion: "",
    }));

    const result = await interpretInvoiceInstruction({
      instruction: "Invoice Sarah at sarah@example.com for website design, due next Friday.",
      generate,
      referenceDate,
      timeZone,
    });

    expect(result.status).toBe("needs_clarification");
    if (result.status === "needs_clarification") expect(result.missingFields).toContain("items");
  });

  it("rejects an invalid due date", async () => {
    const generate = vi.fn().mockResolvedValue(completeResponse({ dueDate: "2026-99-99" }));

    const result = await interpretInvoiceInstruction({
      instruction: "Invoice Sarah at sarah@example.com EUR 450 for design on an invalid date.",
      generate,
      referenceDate,
      timeZone,
    });

    expect(result.status).toBe("needs_clarification");
    if (result.status === "needs_clarification") expect(result.missingFields).toContain("dueDate");
  });

  it("supplies an explicit reference date and timezone for relative dates", async () => {
    const generate = vi.fn().mockResolvedValue(completeResponse());

    const result = await interpretInvoiceInstruction({
      instruction: "Invoice Sarah at sarah@example.com €450 for website design, due next Friday.",
      generate,
      referenceDate,
      timeZone,
    });

    const prompt = generate.mock.calls[0]?.[0] as string;
    expect(prompt).toContain(`Reference date: ${referenceDate}`);
    expect(prompt).toContain(`Reference timezone: ${timeZone}`);
    expect(prompt).toContain('Interpret "next <weekday>" as that weekday in the following calendar week.');
    expect(result.status === "complete" && result.invoice.dueDate).toBe("2026-11-20");
  });

  it("rejects malformed model responses instead of trusting them", async () => {
    const generate = vi.fn().mockResolvedValue('{"customerName":"Sarah"}');

    await expect(interpretInvoiceInstruction({
      instruction: "Invoice Sarah.",
      generate,
      referenceDate,
      timeZone,
    })).rejects.toBeInstanceOf(InvoiceInterpretationError);
  });

  it("derives the reference date in the configured timezone", () => {
    expect(getReferenceDate(new Date("2026-11-10T23:30:00.000Z"), timeZone)).toBe("2026-11-11");
  });
});

describe("edited invoice validation", () => {
  it("validates edited customer, item, amount, and due-date values", () => {
    const invalidEdit = invoiceDraftSchema.safeParse({
      customerName: "Sarah",
      customerEmail: "invalid",
      currency: "EUR",
      items: [{ description: "Website design", quantity: 0, unitPrice: "free" }],
      invoiceDate: referenceDate,
      dueDate: "2026-11-10",
    });

    expect(invalidEdit.success).toBe(false);
    if (!invalidEdit.success) {
      const paths = invalidEdit.error.issues.map((issue) => issue.path.join("."));
      expect(paths).toEqual(expect.arrayContaining(["customerEmail", "items.0.quantity", "items.0.unitPrice", "dueDate"]));
    }
  });
});
