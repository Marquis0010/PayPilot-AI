import { z } from "zod";

export const supportedCurrencySchema = z.enum(["USD", "EUR", "GBP"]);

export const invoiceItemSchema = z.object({
  description: z.string().trim().min(1, "Description is required").max(1000),
  quantity: z.number().int("Quantity must be a whole number").positive("Quantity must be greater than zero").max(9999),
  unitPrice: z.string().regex(/^\d{1,12}\.\d{2}$/, "Use a positive amount with two decimal places"),
}).strict().superRefine((item, context) => {
  if (Number(item.unitPrice) <= 0) {
    context.addIssue({ code: "custom", path: ["unitPrice"], message: "Unit price must be greater than zero" });
  }
});

export const invoiceCreateInputSchema = z.object({
  customerName: z.string().trim().min(1, "Customer name is required").max(300),
  customerEmail: z.email("Enter a valid customer email").max(254),
  currency: supportedCurrencySchema,
  items: z.array(invoiceItemSchema).min(1, "At least one invoice item is required").max(100),
  dueDate: z.iso.date(),
}).strict();

export const invoiceDraftSchema = invoiceCreateInputSchema.extend({
  invoiceDate: z.iso.date(),
}).superRefine((invoice, context) => {
  if (invoice.dueDate < invoice.invoiceDate) {
    context.addIssue({ code: "custom", path: ["dueDate"], message: "Due date cannot precede invoice date" });
  }
});

export type InvoiceDraft = z.infer<typeof invoiceDraftSchema>;
export type InvoiceCreateInput = z.infer<typeof invoiceCreateInputSchema>;

export const invoiceMissingFieldSchema = z.enum([
  "customerName",
  "customerEmail",
  "currency",
  "items",
  "dueDate",
]);

export type InvoiceMissingField = z.infer<typeof invoiceMissingFieldSchema>;

export const invoiceParseResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("complete"),
    invoice: invoiceDraftSchema,
    referenceDate: z.iso.date(),
    timeZone: z.string().min(1),
  }).strict(),
  z.object({
    status: z.literal("needs_clarification"),
    missingFields: z.array(invoiceMissingFieldSchema).min(1),
    message: z.string().trim().min(1),
  }).strict(),
]);

export type InvoiceParseResult = z.infer<typeof invoiceParseResultSchema>;

export const invoiceCreationSuccessSchema = z.object({
  status: z.literal("success"),
  invoiceId: z.string().min(1),
  invoiceStatus: z.literal("DRAFT"),
  requestId: z.uuid(),
  total: z.string().regex(/^\d{1,16}\.\d{2}$/),
  currency: supportedCurrencySchema,
}).strict();

export type InvoiceCreationSuccess = z.infer<typeof invoiceCreationSuccessSchema>;
