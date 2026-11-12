import "server-only";

import { z } from "zod";

import { invoiceDraftSchema, type InvoiceDraft } from "@/lib/invoice/schema";
import { paypalAccessTokenSchema, paypalInvoiceDetailsSchema, type PayPalDraftResult, type PayPalInvoicePayload } from "@/lib/paypal/types";

const SANDBOX_API_BASE = "https://api-m.sandbox.paypal.com";
const REQUEST_TIMEOUT_MS = 15_000;
type Fetcher = typeof fetch;
export type PayPalErrorKind = "configuration" | "authentication" | "rejected" | "uncertain" | "verification";
type PayPalSafeDiagnostics = {
  providerCode?: string;
  providerIssue?: string;
  debugId?: string;
};

const paypalEnvironmentSchema = z.object({
  PAYPAL_CLIENT_ID: z.string().min(1),
  PAYPAL_CLIENT_SECRET: z.string().min(1),
  PAYPAL_API_BASE: z.literal(SANDBOX_API_BASE).default(SANDBOX_API_BASE),
  PAYPAL_SANDBOX_MERCHANT_EMAIL: z.email(),
});

export class PayPalIntegrationError extends Error {
  constructor(
    message: string,
    public readonly kind: PayPalErrorKind,
    public readonly status?: number,
    public readonly invoiceId?: string,
    public readonly providerCode?: string,
    public readonly providerIssue?: string,
    public readonly debugId?: string,
  ) {
    super(message);
    this.name = "PayPalIntegrationError";
  }
}

function getPayPalEnvironment() {
  const result = paypalEnvironmentSchema.safeParse({
    PAYPAL_CLIENT_ID: process.env.PAYPAL_CLIENT_ID,
    PAYPAL_CLIENT_SECRET: process.env.PAYPAL_CLIENT_SECRET,
    PAYPAL_API_BASE: process.env.PAYPAL_API_BASE || SANDBOX_API_BASE,
    PAYPAL_SANDBOX_MERCHANT_EMAIL: process.env.PAYPAL_SANDBOX_MERCHANT_EMAIL,
  });
  if (!result.success) throw new PayPalIntegrationError("PayPal sandbox configuration is missing or invalid.", "configuration");
  return result.data;
}

async function fetchWithTimeout(fetcher: Fetcher, input: string, init: RequestInit): Promise<Response> {
  return fetcher(input, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
}

async function readJson(response: Response): Promise<unknown> {
  try { return await response.json(); } catch { return null; }
}

function safeDiagnostic(value: unknown): string | undefined {
  return typeof value === "string" && /^[A-Za-z0-9_.:-]{1,100}$/.test(value) ? value : undefined;
}

function extractPayPalDiagnostics(body: unknown, headers: Headers): PayPalSafeDiagnostics {
  if (!body || typeof body !== "object") {
    return { debugId: safeDiagnostic(headers.get("paypal-debug-id")) };
  }
  const details = "details" in body && Array.isArray(body.details) ? body.details : [];
  const firstDetail = details.find((detail) => detail && typeof detail === "object");
  return {
    providerCode: "name" in body ? safeDiagnostic(body.name) : undefined,
    providerIssue: firstDetail && "issue" in firstDetail ? safeDiagnostic(firstDetail.issue) : undefined,
    debugId: "debug_id" in body
      ? safeDiagnostic(body.debug_id) ?? safeDiagnostic(headers.get("paypal-debug-id"))
      : safeDiagnostic(headers.get("paypal-debug-id")),
  };
}

export async function getPayPalAccessToken(fetcher: Fetcher = fetch): Promise<string> {
  const environment = getPayPalEnvironment();
  const credentials = Buffer.from(`${environment.PAYPAL_CLIENT_ID}:${environment.PAYPAL_CLIENT_SECRET}`).toString("base64");
  let response: Response;
  try {
    response = await fetchWithTimeout(fetcher, `${environment.PAYPAL_API_BASE}/v1/oauth2/token`, {
      method: "POST",
      headers: { Accept: "application/json", Authorization: `Basic ${credentials}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
      cache: "no-store",
    });
  } catch {
    throw new PayPalIntegrationError("PayPal authentication could not be reached.", "authentication");
  }
  const body = await readJson(response);
  if (!response.ok) {
    const diagnostics = extractPayPalDiagnostics(body, response.headers);
    throw new PayPalIntegrationError(
      "PayPal authentication failed. Verify the sandbox app configuration.",
      "authentication",
      response.status,
      undefined,
      diagnostics.providerCode,
      diagnostics.providerIssue,
      diagnostics.debugId,
    );
  }
  const parsed = paypalAccessTokenSchema.safeParse(body);
  if (!parsed.success) throw new PayPalIntegrationError("PayPal returned an unexpected authentication response.", "authentication", response.status);
  return parsed.data.access_token;
}

export function toPayPalInvoicePayload(draft: InvoiceDraft, invoicerEmail: string): PayPalInvoicePayload {
  const invoice = invoiceDraftSchema.parse(draft);
  const validatedInvoicerEmail = z.email().max(254).parse(invoicerEmail);
  return {
    detail: { currency_code: invoice.currency, invoice_date: invoice.invoiceDate, payment_term: { term_type: "DUE_ON_DATE_SPECIFIED", due_date: invoice.dueDate } },
    invoicer: { email_address: validatedInvoicerEmail },
    primary_recipients: [{ billing_info: { email_address: invoice.customerEmail, name: { full_name: invoice.customerName } } }],
    items: invoice.items.map((item) => ({ name: item.description, quantity: String(item.quantity), unit_amount: { currency_code: invoice.currency, value: item.unitPrice } })),
  };
}

function invoiceIdFromUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const segments = new URL(value).pathname.split("/").filter(Boolean);
    const index = segments.lastIndexOf("invoices");
    return index >= 0 && segments[index + 1] ? decodeURIComponent(segments[index + 1]) : null;
  } catch { return null; }
}

export function extractPayPalInvoiceId(body: unknown, headers: Headers): string | null {
  if (body && typeof body === "object") {
    if ("id" in body && typeof body.id === "string" && body.id) return body.id;
    if ("href" in body) {
      const id = invoiceIdFromUrl(body.href);
      if (id) return id;
    }
    if ("links" in body && Array.isArray(body.links)) {
      for (const link of body.links) {
        if (link && typeof link === "object" && "href" in link) {
          const id = invoiceIdFromUrl(link.href);
          if (id) return id;
        }
      }
    }
  }
  return invoiceIdFromUrl(headers.get("location"));
}

/** Creates a PayPal sandbox DRAFT only. It never sends or notifies the recipient. */
export async function createPayPalDraftInvoice(
  payload: PayPalInvoicePayload,
  options: { explicitlyApproved: boolean; requestId: string; fetcher?: Fetcher },
): Promise<PayPalDraftResult> {
  if (!options.explicitlyApproved) throw new PayPalIntegrationError("Explicit approval is required before creating an invoice draft.", "rejected");
  const requestId = z.uuid().parse(options.requestId);
  const fetcher = options.fetcher ?? fetch;
  const environment = getPayPalEnvironment();
  const accessToken = await getPayPalAccessToken(fetcher);
  let createResponse: Response;
  try {
    createResponse = await fetchWithTimeout(fetcher, `${environment.PAYPAL_API_BASE}/v2/invoicing/invoices`, {
      method: "POST",
      headers: { Accept: "application/json", Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", Prefer: "return=representation", "PayPal-Request-Id": requestId },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
  } catch {
    throw new PayPalIntegrationError("The PayPal creation outcome is uncertain. Do not submit this invoice again until the sandbox account is checked.", "uncertain");
  }
  const createBody = await readJson(createResponse);
  if (createResponse.status !== 201) {
    const diagnostics = extractPayPalDiagnostics(createBody, createResponse.headers);
    const kind: PayPalErrorKind = createResponse.status >= 500 ? "uncertain" : createResponse.status === 401 || createResponse.status === 403 ? "authentication" : "rejected";
    const message = kind === "uncertain" ? "The PayPal creation outcome is uncertain. Do not submit this invoice again until the sandbox account is checked." : "PayPal rejected the invoice draft request. Review the sandbox account and validated invoice details.";
    throw new PayPalIntegrationError(
      message,
      kind,
      createResponse.status,
      undefined,
      diagnostics.providerCode,
      diagnostics.providerIssue,
      diagnostics.debugId,
    );
  }
  const invoiceId = extractPayPalInvoiceId(createBody, createResponse.headers);
  if (!invoiceId) throw new PayPalIntegrationError("PayPal accepted the draft request, but its invoice identifier could not be verified.", "uncertain", createResponse.status);
  let detailsResponse: Response;
  try {
    detailsResponse = await fetchWithTimeout(fetcher, `${environment.PAYPAL_API_BASE}/v2/invoicing/invoices/${encodeURIComponent(invoiceId)}`, {
      method: "GET", headers: { Accept: "application/json", Authorization: `Bearer ${accessToken}` }, cache: "no-store",
    });
  } catch {
    throw new PayPalIntegrationError("The draft was created, but PayPal status verification failed.", "verification", undefined, invoiceId);
  }
  const details = paypalInvoiceDetailsSchema.safeParse(await readJson(detailsResponse));
  if (!detailsResponse.ok || !details.success || details.data.id !== invoiceId || details.data.status !== "DRAFT") {
    throw new PayPalIntegrationError("The draft was created, but its PayPal status could not be verified as DRAFT.", "verification", detailsResponse.status, invoiceId);
  }
  return { id: details.data.id, status: "DRAFT", requestId };
}

export async function createPayPalDraftFromInvoice(
  draft: InvoiceDraft,
  options: { explicitlyApproved: boolean; requestId: string; fetcher?: Fetcher },
): Promise<PayPalDraftResult> {
  const environment = getPayPalEnvironment();
  return createPayPalDraftInvoice(toPayPalInvoicePayload(draft, environment.PAYPAL_SANDBOX_MERCHANT_EMAIL), options);
}
