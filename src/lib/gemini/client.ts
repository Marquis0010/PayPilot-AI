import "server-only";

import { ApiError, GoogleGenAI } from "@google/genai";
import { z } from "zod";

import { geminiInvoiceResponseJsonSchema, type InvoiceTextGenerator } from "@/lib/invoice/interpretation";

const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";
const GEMINI_API_VERSION = "v1beta";

const geminiEnvironmentSchema = z.object({
  GEMINI_API_KEY: z.string().min(1),
  GEMINI_MODEL: z.string().trim().min(1).default(DEFAULT_GEMINI_MODEL),
});

export type GeminiErrorKind =
  | "authentication"
  | "configuration"
  | "invalid_request"
  | "malformed"
  | "model_unavailable"
  | "network"
  | "rate_limit"
  | "timeout"
  | "unavailable";

export class GeminiIntegrationError extends Error {
  constructor(public readonly kind: GeminiErrorKind, message: string) {
    super(message);
    this.name = "GeminiIntegrationError";
  }
}

function getGeminiEnvironment() {
  const result = geminiEnvironmentSchema.safeParse({
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_MODEL: process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL,
  });
  if (!result.success) {
    throw new GeminiIntegrationError("configuration", "Gemini is not configured on the server.");
  }
  return result.data;
}

function numericProperty(value: unknown, property: string): number | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const candidate = Reflect.get(value, property);
  return typeof candidate === "number" ? candidate : undefined;
}

function stringProperty(value: unknown, property: string): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const candidate = Reflect.get(value, property);
  return typeof candidate === "string" ? candidate : undefined;
}

function errorCause(error: unknown): unknown {
  return typeof error === "object" && error !== null ? Reflect.get(error, "cause") : undefined;
}

function safeErrorDetails(error: unknown) {
  const cause = errorCause(error);
  const status = error instanceof ApiError
    ? error.status
    : numericProperty(error, "status") ?? numericProperty(error, "statusCode") ?? numericProperty(cause, "status");
  const networkCode = stringProperty(cause, "code") ?? stringProperty(error, "code");

  let category = "unknown";
  if (status === 400) category = "invalid_request";
  else if (status === 401 || status === 403) category = "authentication";
  else if (status === 404) category = "model_unavailable";
  else if (status === 408 || status === 504 || networkCode === "ETIMEDOUT") category = "timeout";
  else if (status === 429) category = "rate_limit";
  else if (status && status >= 500) category = "provider_unavailable";
  else if (networkCode) category = "network";

  return { status, networkCode, category };
}

export function createGeminiInvoiceGenerator(): InvoiceTextGenerator {
  const environment = getGeminiEnvironment();
  const ai = new GoogleGenAI({
    apiKey: environment.GEMINI_API_KEY,
    httpOptions: { apiVersion: GEMINI_API_VERSION },
  });

  return async (prompt: string) => {
    try {
      const response = await ai.models.generateContent({
        model: environment.GEMINI_MODEL,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseJsonSchema: geminiInvoiceResponseJsonSchema,
          maxOutputTokens: 1200,
          automaticContinuation: false,
          httpOptions: {
            timeout: 15_000,
            retryOptions: {
              attempts: 2,
              initialDelay: 0.5,
              maxDelay: 1,
              httpStatusCodes: [408, 500, 502, 503, 504],
            },
          },
        },
      });

      if (!response.text) {
        throw new GeminiIntegrationError("malformed", "Gemini returned no invoice data.");
      }
      return response.text;
    } catch (error) {
      if (error instanceof GeminiIntegrationError) throw error;
      const details = safeErrorDetails(error);
      console.error("[Gemini] request failed", JSON.stringify({
        category: details.category,
        status: details.status ?? null,
        networkCode: details.networkCode ?? null,
        model: environment.GEMINI_MODEL,
      }));

      if (details.category === "rate_limit") {
        throw new GeminiIntegrationError("rate_limit", "Gemini is temporarily rate limited. Please try again shortly.");
      }
      if (details.category === "authentication") {
        throw new GeminiIntegrationError("authentication", "Gemini authentication failed on the server.");
      }
      if (details.category === "model_unavailable") {
        throw new GeminiIntegrationError("model_unavailable", "The configured Gemini model is unavailable for this project.");
      }
      if (details.category === "invalid_request") {
        throw new GeminiIntegrationError("invalid_request", "Gemini rejected the structured invoice request.");
      }
      if (details.category === "timeout") {
        throw new GeminiIntegrationError("timeout", "Gemini took too long to respond. Please try again.");
      }
      if (details.category === "network") {
        throw new GeminiIntegrationError("network", "The server could not reach Gemini. Please try again.");
      }
      throw new GeminiIntegrationError("unavailable", "Gemini is temporarily unavailable. Please try again.");
    }
  };
}
