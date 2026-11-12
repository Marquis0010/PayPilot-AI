import { z } from "zod";

import { createGeminiInvoiceGenerator, GeminiIntegrationError } from "@/lib/gemini/client";
import { interpretInvoiceInstruction, InvoiceInterpretationError } from "@/lib/invoice/interpretation";

export const runtime = "nodejs";

const parseRequestSchema = z.object({
  instruction: z.string().trim().min(1, "Enter an invoice instruction").max(2000, "Keep the instruction under 2,000 characters"),
}).strict();

export async function POST(request: Request) {
  let requestText: string;
  try {
    requestText = await request.text();
  } catch {
    return Response.json({ status: "error", message: "The request body could not be read." }, { status: 400 });
  }

  if (requestText.length > 10_000) {
    return Response.json({ status: "error", message: "The invoice instruction is too large." }, { status: 413 });
  }

  let requestJson: unknown;
  try {
    requestJson = JSON.parse(requestText);
  } catch {
    return Response.json({ status: "error", message: "Send a valid JSON request." }, { status: 400 });
  }

  const parsedRequest = parseRequestSchema.safeParse(requestJson);
  if (!parsedRequest.success) {
    return Response.json({ status: "error", message: parsedRequest.error.issues[0]?.message ?? "Invalid invoice instruction." }, { status: 400 });
  }

  try {
    const result = await interpretInvoiceInstruction({
      instruction: parsedRequest.data.instruction,
      generate: createGeminiInvoiceGenerator(),
    });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof GeminiIntegrationError) {
      const status = error.kind === "rate_limit"
        ? 429
        : error.kind === "invalid_request" || error.kind === "malformed"
          ? 502
          : 503;
      return Response.json({ status: "error", message: error.message }, { status });
    }
    if (error instanceof InvoiceInterpretationError) {
      return Response.json({ status: "error", message: error.message }, { status: 502 });
    }
    return Response.json({ status: "error", message: "The invoice could not be interpreted. Please try again." }, { status: 500 });
  }
}
