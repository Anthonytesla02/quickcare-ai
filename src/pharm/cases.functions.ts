import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CHALLENGE_TOPICS, buildCaseFromTopicAndVariation, type ChallengeTopicDefinition } from "./data/caseLibrary";
import type { ClinicalCase } from "./types/clinical";

type Variation = ChallengeTopicDefinition["variations"][number];

const GROQ_MODEL = "openai/gpt-oss-120b";

async function generateVariationWithGroq(topic: ChallengeTopicDefinition): Promise<{
  variation: Variation;
  education: ClinicalCase["educationalExplanations"] | undefined;
}> {
  const apiKey = process.env["GROQ_API_KEY"];
  if (!apiKey) throw new Error("AI generation is not configured");
  const example = topic.variations[0]!;
  const prompt = `You write realistic community-pharmacy emergency training cases for Ghana (Ghana STG 7th Ed).
Topic: ${topic.topicTitle} (category: ${topic.category}, injury type: ${topic.injuryType}).
Base complaint: ${topic.baseComplaint}
Correct management sequence (supply ids): ${topic.recommendedSequence.join(", ")}
Safety rules: ${topic.criticalSafetyRules.join(" ")}
Existing patient names to AVOID: ${topic.variations.map((v) => v.patientName).join(", ")}

Create ONE brand-new patient variation. Respond ONLY with JSON of this exact shape:
{
 "patientName": string (Ghanaian name), "gender": "male"|"female", "ageGroup": "child"|"adult"|"elderly", "age": number,
 "skinTone": hex colour string like "#7a4a2b", "caregiverPresent": boolean, "caregiverName": string or null,
 "expression": "in_pain"|"gasping"|"distressed"|"confused"|"unconscious"|"relieved",
 "scenarioContext": string (1-2 sentences of how they arrived), "patientStatement": string (first-person quote),
 "vitals": {"heartRate": number, "bloodPressure": "120/80", "respiratoryRate": number, "oxygenSaturation": number, "temperature": number, "gcsOrAvpu": "Alert"|"Voice"|"Pain"|"Unresponsive"},
 "medicalHistory": string[], "currentMeds": string[], "allergies": string[], "twistSummary": string (one clinical twist),
 "whyCorrect": string, "commonPitfalls": string, "safetyPearls": string
}
Example of style (do not copy): ${JSON.stringify(example)}`;

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.9,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error("Groq error", res.status, text);
    throw new Error(res.status === 429 ? "AI is busy right now, please try again shortly" : "AI generation failed");
  }
  const json = (await res.json()) as { choices: { message: { content: string } }[] };
  const raw = JSON.parse(json.choices[0]?.message.content ?? '{}');
  const v = raw.vitals ?? {};
  const variation: Variation = {
    variationIndex: 0,
    patientName: String(raw.patientName ?? example.patientName),
    gender: raw.gender === "female" ? "female" : "male",
    ageGroup: ["child", "adult", "elderly"].includes(raw.ageGroup) ? raw.ageGroup : example.ageGroup,
    age: Number(raw.age) || example.age,
    skinTone: typeof raw.skinTone === "string" ? raw.skinTone : example.skinTone,
    caregiverPresent: Boolean(raw.caregiverPresent),
    caregiverName: raw.caregiverName ?? undefined,
    expression: ["in_pain", "gasping", "distressed", "confused", "unconscious", "relieved"].includes(raw.expression)
      ? raw.expression
      : example.expression,
    scenarioContext: String(raw.scenarioContext ?? example.scenarioContext),
    patientStatement: String(raw.patientStatement ?? example.patientStatement),
    vitals: {
      heartRate: Number(v.heartRate) || example.vitals.heartRate,
      bloodPressure: typeof v.bloodPressure === "string" ? v.bloodPressure : example.vitals.bloodPressure,
      respiratoryRate: Number(v.respiratoryRate) || example.vitals.respiratoryRate,
      oxygenSaturation: Number(v.oxygenSaturation) || example.vitals.oxygenSaturation,
      temperature: Number(v.temperature) || example.vitals.temperature,
      gcsOrAvpu: ["Alert", "Voice", "Pain", "Unresponsive"].includes(v.gcsOrAvpu) ? v.gcsOrAvpu : example.vitals.gcsOrAvpu,
    },
    medicalHistory: Array.isArray(raw.medicalHistory) ? raw.medicalHistory.map(String) : [],
    currentMeds: Array.isArray(raw.currentMeds) ? raw.currentMeds.map(String) : [],
    allergies: Array.isArray(raw.allergies) ? raw.allergies.map(String) : [],
    twistSummary: String(raw.twistSummary ?? ""),
  };
  const education =
    raw.whyCorrect && raw.commonPitfalls && raw.safetyPearls
      ? { whyCorrect: String(raw.whyCorrect), commonPitfalls: String(raw.commonPitfalls), safetyPearls: String(raw.safetyPearls) }
      : undefined;
  return { variation, education };
}

/**
 * Returns up to `count` cases for the caller: first shared cases from the global pool
 * that this user hasn't solved (and doesn't already have), then new AI cases for the rest.
 * New AI cases are saved to the global pool so every other account can reuse them.
 */
export const getNextCases = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { count?: number; excludeIds?: string[] }) => ({
    count: Math.min(Math.max(Number(input?.count) || 5, 1), 5),
    excludeIds: Array.isArray(input?.excludeIds) ? input.excludeIds.map(String).slice(0, 500) : [],
  }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: attempts, error: attErr } = await supabase
      .from("user_case_attempts")
      .select("case_id")
      .eq("user_id", userId);
    if (attErr) throw new Error(attErr.message);
    const skip = new Set<string>([...data.excludeIds, ...(attempts ?? []).map((a) => a.case_id)]);

    const { data: pool, error: poolErr } = await supabase
      .from("global_cases")
      .select("id, case_data")
      .order("created_at", { ascending: true })
      .limit(1000);
    if (poolErr) throw new Error(poolErr.message);

    const result: ClinicalCase[] = [];
    for (const row of pool ?? []) {
      if (result.length >= data.count) break;
      if (!skip.has(row.id)) result.push(row.case_data as unknown as ClinicalCase);
    }
    const reused = result.length;

    const needed = data.count - result.length;
    if (needed > 0) {
      const topics = [...CHALLENGE_TOPICS].sort(() => Math.random() - 0.5).slice(0, needed);
      const generated = await Promise.allSettled(topics.map((t) => generateVariationWithGroq(t).then((r) => ({ t, r }))));
      const now = Date.now();
      const rows = [];
      for (let i = 0; i < generated.length; i++) {
        const g = generated[i];
        if (!g || g.status !== "fulfilled") continue;
        const { t, r } = g.value;
        const base = buildCaseFromTopicAndVariation({ ...t, variations: [r.variation] }, 0, now + i);
        const c: ClinicalCase = {
          ...base,
          id: `ai-${crypto.randomUUID()}`,
          ...(r.education ? { educationalExplanations: r.education } : {}),
        };
        result.push(c);
        rows.push({ id: c.id, category: c.category, title: c.title, case_data: c as never, created_by: userId });
      }
      if (rows.length) {
        const { error: insErr } = await supabase.from("global_cases").insert(rows);
        if (insErr) throw new Error(insErr.message);
      }
      if (result.length === 0) {
        const firstErr = generated.find((g) => g.status === "rejected") as PromiseRejectedResult | undefined;
        throw new Error(firstErr?.reason?.message ?? "Could not create new cases");
      }
    }
    return { cases: result, reused, generated: result.length - reused };
  });
