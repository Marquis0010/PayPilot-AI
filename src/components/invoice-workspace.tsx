"use client";

import { useMemo, useRef, useState } from "react";

import {
  invoiceDraftSchema,
  invoiceCreationSuccessSchema,
  invoiceParseResultSchema,
  type InvoiceCreationSuccess,
  type InvoiceDraft,
  type InvoiceMissingField,
} from "@/lib/invoice/schema";

const examples = [
  "Invoice Sarah at sarah@example.com €450 for website design, due next Friday.",
  "Create a $1,200 invoice for Acme Studio at billing@acme.test for brand strategy, due in 14 days.",
  "Bill alex@example.com £275 for November consulting, due December 1.",
];

const flow = ["Understand", "Validate", "Preview", "Approve", "Execute", "Verify"];
const currencySymbols: Record<InvoiceDraft["currency"], string> = { USD: "$", EUR: "€", GBP: "£" };
const missingFieldLabels: Record<InvoiceMissingField, string> = {
  customerName: "Customer name",
  customerEmail: "Customer email",
  currency: "Currency",
  items: "Invoice item and price",
  dueDate: "Due date",
};

function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none">
      <path d="M4 10h12m-5-5 5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none">
      <path d="m5 10.5 3 3L15 6.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function formatTotal(draft: InvoiceDraft): string {
  const minorUnits = draft.items.reduce((total, item) => {
    const unitMinor = Math.round(Number(item.unitPrice) * 100);
    return Number.isFinite(unitMinor) ? total + unitMinor * item.quantity : total;
  }, 0);
  return new Intl.NumberFormat("en", { style: "currency", currency: draft.currency }).format(minorUnits / 100);
}

function normalizePrice(value: string): string {
  const amount = Number(value.replace(/,/g, ""));
  return Number.isFinite(amount) && amount > 0 ? amount.toFixed(2) : value;
}

export function InvoiceWorkspace() {
  const [instruction, setInstruction] = useState(examples[0]);
  const [draft, setDraft] = useState<InvoiceDraft | null>(null);
  const [phase, setPhase] = useState<"idle" | "loading" | "ready" | "clarification" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [missingFields, setMissingFields] = useState<InvoiceMissingField[]>([]);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [creationPhase, setCreationPhase] = useState<"idle" | "loading" | "success" | "error" | "uncertain">("idle");
  const [creationMessage, setCreationMessage] = useState<string | null>(null);
  const [creationResult, setCreationResult] = useState<InvoiceCreationSuccess | null>(null);
  const creationPending = useRef(false);

  const validation = useMemo(() => draft ? invoiceDraftSchema.safeParse(draft) : null, [draft]);
  const fieldErrors = useMemo(() => {
    const errors = new Map<string, string>();
    if (validation && !validation.success) {
      for (const issue of validation.error.issues) errors.set(issue.path.join("."), issue.message);
    }
    return errors;
  }, [validation]);

  async function handleInterpret() {
    if (!instruction.trim()) {
      setPhase("error");
      setMessage("Enter an invoice instruction first.");
      return;
    }

    setPhase("loading");
    setMessage(null);
    setMissingFields([]);
    resetCreation();

    try {
      const response = await fetch("/api/invoices/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction }),
      });
      const body: unknown = await response.json();

      if (!response.ok) {
        const errorMessage = typeof body === "object" && body !== null && "message" in body && typeof body.message === "string"
          ? body.message
          : "The invoice could not be interpreted. Please try again.";
        throw new Error(errorMessage);
      }

      const result = invoiceParseResultSchema.safeParse(body);
      if (!result.success) throw new Error("The server returned an unexpected invoice response.");

      if (result.data.status === "needs_clarification") {
        setDraft(null);
        setPhase("clarification");
        setMissingFields(result.data.missingFields);
        setMessage(result.data.message);
        return;
      }

      setDraft(result.data.invoice);
      setPhase("ready");
      setMessage("Invoice details extracted and validated. Review every field before approval.");
    } catch (error) {
      setPhase("error");
      setMessage(error instanceof Error ? error.message : "A network error interrupted invoice interpretation.");
    }
  }

  function updateDraft(update: (current: InvoiceDraft) => InvoiceDraft) {
    setDraft((current) => current ? update(current) : current);
    setApprovalOpen(false);
    setRequestId(null);
    setCreationPhase("idle");
    setCreationMessage(null);
    setCreationResult(null);
  }

  function resetCreation() {
    creationPending.current = false;
    setApprovalOpen(false);
    setRequestId(null);
    setCreationPhase("idle");
    setCreationMessage(null);
    setCreationResult(null);
  }

  function openApproval() {
    if (!validation?.success || creationPhase === "loading") return;
    setRequestId(crypto.randomUUID());
    setApprovalOpen(true);
    setCreationPhase("idle");
    setCreationMessage(null);
  }

  async function handleCreateDraft() {
    if (!draft || !validation?.success || !approvalOpen || !requestId || creationPending.current) return;
    creationPending.current = true;
    setCreationPhase("loading");
    setCreationMessage(null);
    try {
      const response = await fetch("/api/invoices/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          approved: true,
          requestId,
          invoice: {
            customerName: draft.customerName,
            customerEmail: draft.customerEmail,
            currency: draft.currency,
            items: draft.items,
            dueDate: draft.dueDate,
          },
        }),
      });
      const body: unknown = await response.json();
      const success = invoiceCreationSuccessSchema.safeParse(body);
      if (response.ok && success.success) {
        setCreationResult(success.data);
        setCreationPhase("success");
        setApprovalOpen(false);
        return;
      }
      const errorBody = body && typeof body === "object" ? body as Record<string, unknown> : {};
      const serverMessage = typeof errorBody.message === "string" ? errorBody.message : "PayPal could not create the sandbox draft.";
      const outcome = errorBody.outcome;
      setCreationPhase(outcome === "unknown" || outcome === "created_unverified" ? "uncertain" : "error");
      setCreationMessage(serverMessage);
    } catch {
      setCreationPhase("uncertain");
      setCreationMessage("The response was interrupted. The outcome may be uncertain; do not resubmit until the PayPal sandbox account is checked.");
    } finally {
      creationPending.current = false;
    }
  }

  function beginNewInvoice() {
    setDraft(null);
    setInstruction("");
    setPhase("idle");
    setMessage(null);
    setMissingFields([]);
    resetCreation();
  }

  function updateItem(index: number, key: "description" | "quantity" | "unitPrice", value: string | number) {
    updateDraft((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item),
    }));
  }

  function addItem() {
    updateDraft((current) => ({
      ...current,
      items: [...current.items, { description: "", quantity: 1, unitPrice: "0.00" }],
    }));
  }

  function removeItem(index: number) {
    updateDraft((current) => ({ ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index) }));
  }

  const activeStep = creationPhase === "success" ? 5 : creationPhase === "loading" ? 4 : approvalOpen ? 3 : phase === "ready" ? 2 : 0;

  return (
    <main className="mx-auto min-h-screen w-full max-w-[1480px] px-5 pb-10 sm:px-8 lg:px-12">
      <header className="flex h-24 items-center justify-between border-b border-white/10">
        <a href="#top" className="flex items-center gap-3" aria-label="PayPilot AI home">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-[#6dc5ff] to-[#1766e8] shadow-[0_0_32px_rgba(49,137,255,.28)]">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none"><path d="M7 18V6h6.2a4 4 0 0 1 0 8H7m4-4h5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
          <span>
            <span className="block text-[15px] font-semibold tracking-[-0.01em]">PayPilot <span className="text-[#71bdff]">AI</span></span>
            <span className="block text-[10px] font-medium uppercase tracking-[0.2em] text-[#7890aa]">Payment operations</span>
          </span>
        </a>
        <div className="flex items-center gap-3 rounded-full border border-[#6baeff]/20 bg-[#102039]/70 px-4 py-2 text-xs font-medium text-[#aac0d9]">
          <span className="h-2 w-2 rounded-full bg-[#59b9ff] shadow-[0_0_10px_#59b9ff]" /> Gemini · Sandbox
        </div>
      </header>

      <section id="top" className="grid gap-10 py-14 lg:grid-cols-[.88fr_1.12fr] lg:items-end lg:py-18">
        <div>
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#66b7ff]/20 bg-[#10213a]/80 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7ec5ff]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#59b9ff]" /> Human-controlled automation
          </div>
          <h1 className="max-w-3xl text-5xl font-semibold leading-[1.02] tracking-[-0.055em] sm:text-6xl lg:text-[68px]">
            From intention<br /><span className="bg-gradient-to-r from-[#6fc5ff] via-[#55a8ff] to-[#8c91ff] bg-clip-text text-transparent">to transaction.</span>
          </h1>
          <p className="mt-7 max-w-xl text-base leading-7 text-[#98abc1] sm:text-lg">Turn a plain-English request into validated, editable invoice data—with a human approval gate before anything financial happens.</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0b1729]/80 p-4 shadow-[0_28px_100px_rgba(0,0,0,.28)] backdrop-blur-xl sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <label htmlFor="instruction" className="text-sm font-semibold">What would you like to invoice?</label>
            <span className="rounded-md bg-white/[.05] px-2 py-1 text-[10px] font-semibold uppercase tracking-[.12em] text-[#8297af]">Natural language</span>
          </div>
          <textarea
            id="instruction"
            value={instruction}
            onChange={(event) => { setInstruction(event.target.value); if (phase !== "loading") setPhase("idle"); setMessage(null); }}
            rows={4}
            maxLength={2000}
            disabled={phase === "loading"}
            className="w-full resize-none rounded-xl border border-[#82a7cf]/20 bg-[#07111f] px-4 py-4 text-[15px] leading-6 text-white shadow-inner placeholder:text-[#536982] disabled:opacity-60"
            placeholder="e.g. Invoice Sarah €450 for website design, due next Friday..."
          />
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-[#6f849c]">AI interprets first. PayPal runs only after a separate approval.</p>
            <button type="button" onClick={handleInterpret} disabled={phase === "loading"} className="inline-flex min-w-44 items-center justify-center gap-2 rounded-lg border border-[#73baff]/25 bg-[#1670e9] px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(16,105,227,.24)] transition hover:bg-[#217cf3] disabled:cursor-wait disabled:opacity-65">
              {phase === "loading" ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> Interpreting…</> : <>Interpret Request <ArrowIcon /></>}
            </button>
          </div>
          {message ? (
            <div role={phase === "error" ? "alert" : "status"} className={`mt-4 rounded-lg border px-4 py-3 text-sm ${phase === "error" ? "border-red-400/20 bg-red-400/10 text-red-100" : phase === "clarification" ? "border-amber-300/20 bg-amber-300/10 text-amber-100" : "border-[#64b7ff]/15 bg-[#10233d] text-[#a9c9e8]"}`}>
              <p>{message}</p>
              {missingFields.length > 0 ? <div className="mt-3 flex flex-wrap gap-2">{missingFields.map((field) => <span key={field} className="rounded-full bg-black/15 px-2.5 py-1 text-[11px] font-semibold">{missingFieldLabels[field]}</span>)}</div> : null}
            </div>
          ) : null}
        </div>
      </section>

      <section aria-label="Invoice workflow" className="rounded-2xl border border-white/[.08] bg-white/[.025] px-4 py-5 sm:px-6">
        <ol className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {flow.map((step, index) => {
            const completed = Boolean(draft && index < activeStep);
            const active = index === activeStep;
            return (
              <li key={step} className="flex items-center gap-3">
                <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border text-[11px] font-semibold ${active ? "border-[#63b8ff]/50 bg-[#1670e9]/20 text-[#76c2ff]" : completed ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : "border-white/10 bg-white/[.035] text-[#698099]"}`}>{completed ? <CheckIcon /> : index + 1}</span>
                <div><span className="block text-[10px] uppercase tracking-[.14em] text-[#526880]">Step {index + 1}</span><span className={`text-xs font-semibold ${active ? "text-white" : "text-[#8295aa]"}`}>{step}</span></div>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="grid gap-6 py-10 lg:grid-cols-[.68fr_1.32fr]">
        <div className="rounded-2xl border border-white/[.08] bg-[#0a1526]/70 p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[.16em] text-[#6ebcff]">Try an example</p>
          <div className="mt-4 space-y-3">
            {examples.map((example, index) => (
              <button type="button" key={example} disabled={phase === "loading"} onClick={() => { setInstruction(example); setPhase("idle"); setMessage(null); }} className="group flex w-full items-start gap-3 rounded-xl border border-white/[.07] bg-white/[.025] p-4 text-left text-sm leading-5 text-[#9bacc0] transition hover:border-[#66b7ff]/25 hover:bg-[#10213a] hover:text-white disabled:opacity-50">
                <span className="mt-0.5 text-[#4f92d2]">0{index + 1}</span><span className="flex-1">{example}</span><span className="mt-0.5 opacity-0 transition group-hover:opacity-100"><ArrowIcon /></span>
              </button>
            ))}
          </div>
          <div className="mt-6 border-t border-white/[.07] pt-5">
            {["Gemini and PayPal keys stay server-side", "Every model response is validated", "PayPal creates sandbox drafts only"].map((text) => <div key={text} className="mt-3 flex items-center gap-2 text-xs text-[#8195aa] first:mt-0"><span className="text-[#65bcff]"><CheckIcon /></span>{text}</div>)}
          </div>
        </div>

        {draft ? (
          <div className="overflow-hidden rounded-2xl border border-white/[.09] bg-[#f5f8fc] text-[#122033] shadow-[0_25px_80px_rgba(0,0,0,.22)]">
            <div className="flex flex-col gap-3 border-b border-[#dce5ef] px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div><p className="text-[10px] font-bold uppercase tracking-[.15em] text-[#64809d]">Editable invoice preview</p><p className="mt-1 text-sm font-semibold">Review every field before approval</p></div>
              <span className={`w-fit rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[.1em] ${validation?.success ? "border-emerald-500/25 bg-emerald-50 text-emerald-700" : "border-red-500/25 bg-red-50 text-red-700"}`}>{validation?.success ? "Validated" : "Needs attention"}</span>
            </div>
            <div className="space-y-7 p-6 sm:p-8">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-xs font-bold uppercase tracking-[.1em] text-[#64778b]">Customer name<input value={draft.customerName} onChange={(event) => updateDraft((current) => ({ ...current, customerName: event.target.value }))} className="mt-2 w-full rounded-lg border border-[#cbd7e3] bg-white px-3 py-2.5 text-sm font-medium normal-case tracking-normal outline-none focus:border-[#3187e8]" />{fieldErrors.get("customerName") ? <span className="mt-1 block text-[11px] font-medium normal-case tracking-normal text-red-600">{fieldErrors.get("customerName")}</span> : null}</label>
                <label className="text-xs font-bold uppercase tracking-[.1em] text-[#64778b]">Customer email<input type="email" value={draft.customerEmail} onChange={(event) => updateDraft((current) => ({ ...current, customerEmail: event.target.value }))} className="mt-2 w-full rounded-lg border border-[#cbd7e3] bg-white px-3 py-2.5 text-sm font-medium normal-case tracking-normal outline-none focus:border-[#3187e8]" />{fieldErrors.get("customerEmail") ? <span className="mt-1 block text-[11px] font-medium normal-case tracking-normal text-red-600">{fieldErrors.get("customerEmail")}</span> : null}</label>
                <label className="text-xs font-bold uppercase tracking-[.1em] text-[#64778b]">Currency<select value={draft.currency} onChange={(event) => updateDraft((current) => ({ ...current, currency: event.target.value as InvoiceDraft["currency"] }))} className="mt-2 w-full rounded-lg border border-[#cbd7e3] bg-white px-3 py-2.5 text-sm font-medium normal-case tracking-normal outline-none focus:border-[#3187e8]"><option value="EUR">EUR — Euro</option><option value="USD">USD — US Dollar</option><option value="GBP">GBP — Pound Sterling</option></select></label>
                <label className="text-xs font-bold uppercase tracking-[.1em] text-[#64778b]">Due date<input type="date" min={draft.invoiceDate} value={draft.dueDate} onChange={(event) => updateDraft((current) => ({ ...current, dueDate: event.target.value }))} className="mt-2 w-full rounded-lg border border-[#cbd7e3] bg-white px-3 py-2.5 text-sm font-medium normal-case tracking-normal outline-none focus:border-[#3187e8]" />{fieldErrors.get("dueDate") ? <span className="mt-1 block text-[11px] font-medium normal-case tracking-normal text-red-600">{fieldErrors.get("dueDate")}</span> : null}</label>
              </div>

              <div>
                <div className="mb-3 flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-[.1em] text-[#64778b]">Invoice items</p><button type="button" onClick={addItem} className="text-xs font-semibold text-[#126edc] hover:text-[#0b55aa]">+ Add item</button></div>
                <div className="space-y-3">
                  {draft.items.map((item, index) => (
                    <div key={index} className="grid gap-3 rounded-xl border border-[#dce5ef] bg-white p-4 sm:grid-cols-[1fr_90px_130px_auto] sm:items-start">
                      <label className="text-[10px] font-bold uppercase tracking-[.1em] text-[#7b8da0]">Description<input value={item.description} onChange={(event) => updateItem(index, "description", event.target.value)} className="mt-1.5 w-full rounded-md border border-[#d1dbe6] px-3 py-2 text-sm font-medium normal-case tracking-normal outline-none focus:border-[#3187e8]" />{fieldErrors.get(`items.${index}.description`) ? <span className="mt-1 block text-[10px] font-medium normal-case tracking-normal text-red-600">{fieldErrors.get(`items.${index}.description`)}</span> : null}</label>
                      <label className="text-[10px] font-bold uppercase tracking-[.1em] text-[#7b8da0]">Quantity<input type="number" min="1" step="1" value={item.quantity} onChange={(event) => updateItem(index, "quantity", Number(event.target.value))} className="mt-1.5 w-full rounded-md border border-[#d1dbe6] px-3 py-2 text-sm font-medium normal-case tracking-normal outline-none focus:border-[#3187e8]" />{fieldErrors.get(`items.${index}.quantity`) ? <span className="mt-1 block text-[10px] font-medium normal-case tracking-normal text-red-600">{fieldErrors.get(`items.${index}.quantity`)}</span> : null}</label>
                      <label className="text-[10px] font-bold uppercase tracking-[.1em] text-[#7b8da0]">Unit price<div className="relative mt-1.5"><span className="absolute left-3 top-2 text-sm text-[#6b7f93]">{currencySymbols[draft.currency]}</span><input inputMode="decimal" value={item.unitPrice} onChange={(event) => updateItem(index, "unitPrice", event.target.value)} onBlur={(event) => updateItem(index, "unitPrice", normalizePrice(event.target.value))} className="w-full rounded-md border border-[#d1dbe6] py-2 pl-7 pr-3 text-sm font-medium normal-case tracking-normal outline-none focus:border-[#3187e8]" /></div>{fieldErrors.get(`items.${index}.unitPrice`) ? <span className="mt-1 block text-[10px] font-medium normal-case tracking-normal text-red-600">{fieldErrors.get(`items.${index}.unitPrice`)}</span> : null}</label>
                      <button type="button" onClick={() => removeItem(index)} disabled={draft.items.length === 1} aria-label={`Remove item ${index + 1}`} className="mt-5 grid h-8 w-8 place-items-center rounded-md text-[#8293a5] hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30">×</button>
                    </div>
                  ))}
                </div>
                {fieldErrors.get("items") ? <p className="mt-2 text-xs font-medium text-red-600">{fieldErrors.get("items")}</p> : null}
              </div>

              <div className="flex flex-col gap-5 border-t border-[#dce5ef] pt-5 sm:flex-row sm:items-end sm:justify-between">
                <div className="text-xs text-[#718398]"><p>Invoice date: <span className="font-semibold text-[#394b5e]">{draft.invoiceDate}</span></p><p className="mt-2 max-w-md leading-5">Nothing has been created in PayPal. Invoice creation will require a separate explicit approval.</p></div>
                <div className="min-w-52 text-right"><p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#7c8da0]">Calculated total</p><p className="mt-1 text-3xl font-bold tracking-[-.04em]">{formatTotal(draft)}</p></div>
              </div>
            </div>
            <div className="border-t border-[#dce5ef] bg-[#edf3f9] px-6 py-5">
              {creationPhase === "success" && creationResult ? (
                <div className="rounded-xl border border-emerald-500/25 bg-emerald-50 p-5">
                  <p className="text-[10px] font-bold uppercase tracking-[.14em] text-emerald-700">PayPal sandbox draft verified</p>
                  <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
                    <div><span className="block text-xs text-[#65798d]">Invoice ID</span><span className="font-bold text-[#17344f]">{creationResult.invoiceId}</span></div>
                    <div><span className="block text-xs text-[#65798d]">PayPal status</span><span className="font-bold text-emerald-700">{creationResult.invoiceStatus}</span></div>
                    <div><span className="block text-xs text-[#65798d]">Verified total</span><span className="font-bold text-[#17344f]">{creationResult.currency} {creationResult.total}</span></div>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-[#587086]">This is genuine data returned and verified through PayPal. The draft was not sent.</p>
                  <button type="button" onClick={beginNewInvoice} className="mt-4 rounded-lg bg-[#1670e9] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#1264d4]">Begin New Invoice</button>
                </div>
              ) : (
                <>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div><p className="text-xs font-bold text-[#30475e]">PayPal execution is a separate, human-controlled step.</p><p className="mt-1 text-xs text-[#6a7f94]">Review the final values, then open the approval confirmation.</p></div>
                    <button type="button" onClick={openApproval} disabled={!validation?.success || creationPhase === "loading"} className="rounded-lg bg-[#1670e9] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#1264d4] disabled:cursor-not-allowed disabled:bg-[#c8d5e2] disabled:text-[#708397]">Review &amp; Approve</button>
                  </div>

                  {approvalOpen ? (
                    <div className="mt-5 rounded-xl border border-[#9bb4cc] bg-white p-5 shadow-sm">
                      <p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#126edc]">Explicit approval required</p>
                      <h3 className="mt-1 text-base font-bold text-[#172b3e]">Authorize one PayPal sandbox draft</h3>
                      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                        <div><dt className="text-xs text-[#73869a]">Recipient</dt><dd className="font-semibold text-[#263c50]">{draft.customerName}<span className="block break-all text-xs font-normal">{draft.customerEmail}</span></dd></div>
                        <div><dt className="text-xs text-[#73869a]">Currency and total</dt><dd className="font-semibold text-[#263c50]">{draft.currency} · {formatTotal(draft)}</dd></div>
                        <div><dt className="text-xs text-[#73869a]">Due date</dt><dd className="font-semibold text-[#263c50]">{draft.dueDate}</dd></div>
                      </dl>
                      <div className="mt-4 border-y border-[#e1e8ef] py-3">
                        {draft.items.map((item, index) => <div key={`${item.description}-${index}`} className="flex justify-between gap-4 py-1 text-xs text-[#4c6277]"><span>{item.quantity} × {item.description}</span><span className="font-semibold">{draft.currency} {item.unitPrice}</span></div>)}
                      </div>
                      <p className="mt-4 text-xs leading-5 text-[#5e7488]">This action creates a draft in the PayPal sandbox. It does not send the invoice, notify the recipient, or capture a payment.</p>
                      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <button type="button" onClick={() => { setApprovalOpen(false); setRequestId(null); }} disabled={creationPhase === "loading"} className="rounded-lg border border-[#cbd7e3] px-4 py-2.5 text-xs font-bold text-[#526a80] disabled:opacity-50">Cancel</button>
                        <button type="button" onClick={handleCreateDraft} disabled={creationPhase === "loading" || creationPhase === "uncertain"} className="inline-flex min-w-56 items-center justify-center gap-2 rounded-lg bg-[#126edc] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#0f5fbe] disabled:cursor-not-allowed disabled:opacity-65">{creationPhase === "loading" ? <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" /> Creating sandbox draft…</> : "Create PayPal Sandbox Draft"}</button>
                      </div>
                    </div>
                  ) : null}

                  {creationMessage ? <div role="alert" className={`mt-4 rounded-lg border px-4 py-3 text-xs leading-5 ${creationPhase === "uncertain" ? "border-amber-500/30 bg-amber-50 text-amber-900" : "border-red-500/25 bg-red-50 text-red-800"}`}><strong>{creationPhase === "uncertain" ? "Outcome requires checking. " : "Draft not created. "}</strong>{creationMessage}</div> : null}
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="grid min-h-[540px] place-items-center rounded-2xl border border-dashed border-white/[.12] bg-[#0a1526]/55 p-8 text-center">
            <div className="max-w-sm"><span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-[#66b7ff]/20 bg-[#10233d] text-[#69bbff]"><svg aria-hidden="true" viewBox="0 0 24 24" className="h-7 w-7" fill="none"><path d="M7 3h7l4 4v14H7V3Zm7 0v5h4M10 12h5m-5 4h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></span><h2 className="mt-5 text-lg font-semibold">Your validated preview appears here</h2><p className="mt-2 text-sm leading-6 text-[#7e93aa]">Enter a complete invoice request. PayPilot will ask for missing details instead of making them up.</p></div>
          </div>
        )}
      </section>

      <footer className="flex flex-col gap-2 border-t border-white/[.08] py-6 text-xs text-[#5f748c] sm:flex-row sm:items-center sm:justify-between"><p>PayPilot AI · From Intention to Transaction.</p><p>Gemini interpretation · PayPal sandbox only</p></footer>
    </main>
  );
}
