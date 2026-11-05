import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { convertToModelMessages, type UIMessage } from "ai";
import { createResponsesCall } from "@/lib/ai/responses.server";

const MODEL = "openai/gpt-6-astra";

function json(status: number, error: string) {
  return new Response(JSON.stringify({ error }), { status, headers: { "Content-Type": "application/json" } });
}

async function verifyUser(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const url = process.env["SUPABASE_URL"]!;
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  const sb = createClient(url, key, {
    auth: { persistSession: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
  const { data, error } = await sb.auth.getClaims(token);
  return error || !data?.claims?.sub ? null : data.claims.sub;
}

export const Route = createFileRoute("/api/case-tutor")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await verifyUser(request))) return json(401, "Please sign in again.");
        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) return json(500, "AI tutor is not configured.");

        let body: { messages?: UIMessage[]; caseContext?: string };
        try { body = await request.json(); } catch { return json(400, "Invalid request."); }
        const messages = Array.isArray(body.messages) ? body.messages.slice(-30) : [];
        if (!messages.length) return json(400, "Ask a question first.");
        const caseContext = String(body.caseContext ?? "").slice(0, 12000);

        const instructions = `You are a friendly clinical tutor for pharmacy learners working through an emergency first-aid / pharmacy simulation case.
Explain clinical reasoning clearly and concisely: what the findings mean, why certain actions are prioritised, red flags, drug safety, and when to escalate.
Guide the learner to think it through — coach with reasoning and hints rather than listing the exact full answer sequence, because they are mid-case.
Keep answers short (under ~200 words), use plain language and simple markdown. Stay on topic of this case and related clinical learning.

CURRENT CASE:
${caseContext}`;

        const { response } = createResponsesCall(
          request,
          { baseURL: "https://ai.gateway.lovable.dev/v1", apiKey, model: MODEL },
          await convertToModelMessages(messages),
          instructions,
        );
        return response();
      },
    },
  },
});
