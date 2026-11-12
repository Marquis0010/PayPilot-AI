import { z } from "zod";

import {
  invoiceCreateInputSchema,
  invoiceDraftSchema,
  type InvoiceCreateInput,
  type InvoiceDraft,
} from "@/lib/invoice/schema";

export const invoiceCreateRequestSchema = z.object({
  approved: z.literal(true, { error: "Explicit approval is required" }),
  requestId: z.uuid("A valid request identifier is required"),
  invoice: invoiceCreateInputSchema,
}).strict();

export type InvoiceCreateRequest = z.infer<typeof invoiceCreateRequestSchema>;

export function buildApprovedInvoiceDraft(invoice: InvoiceCreateInput, invoiceDate: string): InvoiceDraft {
  return invoiceDraftSchema.parse({ ...invoice, invoiceDate });
}

export function calculateInvoiceTotal(invoice: Pick<InvoiceDraft, "items">): string {
  const minorUnits = invoice.items.reduce((total, item) => {
    const [whole, fractional] = item.unitPrice.split(".");
    const unitMinor = BigInt(whole) * BigInt(100) + BigInt(fractional);
    return total + unitMinor * BigInt(item.quantity);
  }, BigInt(0));

  const whole = minorUnits / BigInt(100);
  const fractional = (minorUnits % BigInt(100)).toString().padStart(2, "0");
  return `${whole}.${fractional}`;
}

type StoredOperation<T> = {
  promise: Promise<T>;
  expiresAt: number;
};

export class SingleFlightRegistry<T> {
  private readonly operations = new Map<string, StoredOperation<T>>();

  constructor(private readonly retentionMs = 10 * 60 * 1000) {}

  run(requestId: string, operation: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const existing = this.operations.get(requestId);
    if (existing && existing.expiresAt > now) return existing.promise;

    const promise = operation();
    this.operations.set(requestId, { promise, expiresAt: now + this.retentionMs });
    return promise;
  }

  clear() {
    this.operations.clear();
  }
}
