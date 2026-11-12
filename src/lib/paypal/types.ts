import { z } from "zod";

export const paypalAccessTokenSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.literal("Bearer"),
  expires_in: z.number().int().positive(),
});

export const paypalInvoiceDetailsSchema = z.object({
  id: z.string().min(1),
  status: z.string().min(1),
}).passthrough();

export type PayPalInvoiceDetails = z.infer<typeof paypalInvoiceDetailsSchema>;

export type PayPalDraftResult = {
  id: string;
  status: "DRAFT";
  requestId: string;
};

export type PayPalInvoicePayload = {
  detail: {
    currency_code: string;
    invoice_date: string;
    payment_term: {
      term_type: "DUE_ON_DATE_SPECIFIED";
      due_date: string;
    };
  };
  invoicer: {
    email_address: string;
  };
  primary_recipients: Array<{
    billing_info: {
      email_address: string;
      name: { full_name: string };
    };
  }>;
  items: Array<{
    name: string;
    quantity: string;
    unit_amount: { currency_code: string; value: string };
  }>;
};
