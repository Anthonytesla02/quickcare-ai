import { useMemo, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { GraduationCap, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Conversation, ConversationContent, ConversationEmptyState, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { PromptInput, PromptInputBody, PromptInputFooter, PromptInputSubmit, PromptInputTextarea } from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import type { ClinicalCase } from "../../types/clinical";
import { getCaseSite } from "../../data/anatomy";

function buildContext(c: ClinicalCase) {
  const v = c.initialVitals;
  return [
    `Title: ${c.title} (${c.category}, ${c.difficulty})`,
    `Patient: ${c.patient.name}, ${c.patient.age}y ${c.patient.gender}`,
    `Injury location: ${getCaseSite(c).label}`,
    `Complaint: ${c.presentingComplaint}`,
    `Patient says: ${c.patientStatement}`,
    c.caregiverStatement ? `Caregiver says: ${c.caregiverStatement}` : "",
    `Findings: ${c.visibleFindings.join("; ")}`,
    `Vitals: HR ${v.heartRate}, BP ${v.bloodPressure}, RR ${v.respiratoryRate}, SpO2 ${v.oxygenSaturation}%, Temp ${v.temperature}C, ${v.gcsOrAvpu}`,
    `History: ${c.medicalHistory.join(", ") || "none"}`,
    `Medications: ${c.currentMedications.join(", ") || "none"}`,
    `Allergies: ${c.knownAllergies.join(", ") || "NKDA"}`,
    `Guideline: ${c.stgReference.guidelineTitle} — ${c.stgReference.keyPoints.join("; ")}`,
    `Referral criteria: ${c.stgReference.referralCriteria.join("; ")}`,
    `Must escalate to EMS: ${c.rubric.mustEscalateToEMS ? "yes" : "no"}`,
  ].filter(Boolean).join("\n");
}

const SUGGESTIONS = ["What are the red flags here?", "What should I prioritise first?", "Why does this vital sign matter?"];

export function CaseTutor({ clinicalCase }: { clinicalCase: ClinicalCase }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const caseContext = useMemo(() => buildContext(clinicalCase), [clinicalCase]);
  const transport = useMemo(() => new DefaultChatTransport({
    api: "/api/case-tutor",
    body: { caseContext },
    headers: async (): Promise<Record<string, string>> => {
      const { data } = await supabase.auth.getSession();
      const t = data.session?.access_token;
      return t ? { Authorization: `Bearer ${t}` } : {};
    },
  }), [caseContext]);
  const { messages, sendMessage, status, stop } = useChat({
    id: `tutor-${clinicalCase.id}`,
    transport,
    onError: (e) => {
      const m = e.message || "";
      toast.error(m.includes("429") ? "Too many questions right now — wait a moment." : m.includes("402") ? "AI credits have run out." : "The tutor couldn't answer. Please try again.");
    },
  });
  const busy = status === "submitted" || status === "streaming";
  const send = (text: string) => { if (!text.trim() || busy) return; sendMessage({ text }); setInput(""); };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} data-testid="button-open-tutor"
        className="tutor-fab fixed bottom-24 right-4 z-50 flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-lg md:bottom-6">
        <GraduationCap size={18} /> Ask tutor
      </button>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-foreground/30 sm:items-center" onClick={() => setOpen(false)}>
          <div className="flex h-[85dvh] w-full max-w-lg flex-col rounded-t-3xl bg-background text-foreground shadow-xl sm:h-[70vh] sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-secondary text-secondary-foreground"><GraduationCap size={18} /></span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">Case tutor</p>
                  <p className="truncate text-xs text-muted-foreground">{clinicalCase.title}</p>
                </div>
              </div>
              <button type="button" aria-label="Close tutor" onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center rounded-full hover:bg-muted"><X size={18} /></button>
            </div>
            <Conversation className="flex-1">
              <ConversationContent>
                {messages.length === 0 ? (
                  <ConversationEmptyState title="Ask about this case" description="Get the clinical reasoning explained while you work.">
                    <div className="mt-2 flex flex-col gap-2">
                      {SUGGESTIONS.map((s) => (
                        <button key={s} type="button" onClick={() => send(s)} className="rounded-full border border-border px-3 py-1.5 text-xs hover:bg-muted">{s}</button>
                      ))}
                    </div>
                  </ConversationEmptyState>
                ) : messages.map((m) => (
                  <Message key={m.id} from={m.role}>
                    <MessageContent>
                      {m.parts.map((p, i) => p.type === "text" ? <MessageResponse key={i}>{p.text}</MessageResponse> : null)}
                    </MessageContent>
                  </Message>
                ))}
                {status === "submitted" && <Shimmer className="text-sm">Thinking...</Shimmer>}
              </ConversationContent>
              <ConversationScrollButton />
            </Conversation>
            <div className="border-t border-border p-3">
              <PromptInput onSubmit={(msg) => send(msg.text ?? "")}>
                <PromptInputBody>
                  <PromptInputTextarea autoFocus value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask why, what if, what next…" />
                </PromptInputBody>
                <PromptInputFooter className="justify-end">
                  <PromptInputSubmit status={status} onStop={stop} disabled={!busy && !input.trim()} />
                </PromptInputFooter>
              </PromptInput>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
