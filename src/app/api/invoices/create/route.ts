import { calculateInvoiceTotal, buildApprovedInvoiceDraft, invoiceCreateRequestSchema, SingleFlightRegistry } from "@/lib/invoice/creation";
import { getReferenceDate } from "@/lib/invoice/interpretation";
import { createPayPalDraftFromInvoice, PayPalIntegrationError } from "@/lib/paypal/client";

export const runtime = "nodejs";
const MAX_REQUEST_BYTES = 20_000;
const operations = new SingleFlightRegistry<Awaited<ReturnType<typeof createPayPalDraftFromInvoice>>>();

function errorResponse(message: string, status: number, extra: Record<string, unknown> = {}) {
  return Response.json({ status: "error", message, ...extra }, { status });
}

function safePayPalDiagnostics(error: PayPalIntegrationError): Record<string, string | number> {
  return Object.fromEntries(Object.entries({
    providerStatus: error.status,
    paypalError: error.providerCode,
    paypalIssue: error.providerIssue,
    paypalDebugId: error.debugId,
    transportErrorType: error.transport?.errorType,
    transportCategory: error.transport?.category,
    transportCode: error.transport?.code,
    transportErrno: error.transport?.errno,
  }).filter((entry): entry is [string, string | number] => entry[1] !== undefined));
}

export async function POST(request: Request) {
  let text: string;
  try {
    text = await request.text();
  } catch {
    return errorResponse("The request body could not be read.", 400);
  }
  if (!text || text.length > MAX_REQUEST_BYTES) return errorResponse("The invoice request is empty or too large.", 400);

  let body: unknown;
  try { body = JSON.parse(text); } catch { return errorResponse("The invoice request must be valid JSON.", 400); }

  const parsed = invoiceCreateRequestSchema.safeParse(body);
  if (!parsed.success) {
    const approvalMissing = !body || typeof body !== "object" || !("approved" in body) || body.approved !== true;
    return errorResponse(
      approvalMissing ? "Explicit approval is required before creating a PayPal draft." : "The invoice contains invalid or missing fields.",
      approvalMissing ? 403 : 400,
      { issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })) },
    );
  }

  let draft;
  try {
    draft = buildApprovedInvoiceDraft(parsed.data.invoice, getReferenceDate());
  } catch {
    return errorResponse("The invoice due date or other fields are no longer valid. Review the invoice and approve it again.", 400);
  }
  const total = calculateInvoiceTotal(draft);

  try {
    const result = await operations.run(parsed.data.requestId, () => createPayPalDraftFromInvoice(draft, {
      explicitlyApproved: true,
      requestId: parsed.data.requestId,
    }));
    return Response.json({
      status: "success",
      invoiceId: result.id,
      invoiceStatus: result.status,
      requestId: result.requestId,
      total,
      currency: draft.currency,
    }, { status: 201 });
  } catch (error) {
    if (!(error instanceof PayPalIntegrationError)) return errorResponse("The PayPal sandbox request failed safely.", 500);
    const diagnostics = safePayPalDiagnostics(error);
    if (error.kind === "uncertain") {
      return errorResponse(error.message, 502, { outcome: "unknown", requestId: parsed.data.requestId, ...diagnostics });
    }
    if (error.kind === "verification") {
      return errorResponse(error.message, 502, { outcome: "created_unverified", invoiceId: error.invoiceId, requestId: parsed.data.requestId, ...diagnostics });
    }
    if (error.kind === "rejected") return errorResponse(error.message, 422, diagnostics);
    if (error.kind === "authentication") return errorResponse(error.message, 502, diagnostics);
    return errorResponse(error.message, 503, diagnostics);
  }
}
