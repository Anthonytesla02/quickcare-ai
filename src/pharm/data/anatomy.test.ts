import { describe, it, expect } from "vitest";
import { CHALLENGE_TOPICS, buildCaseFromTopicAndVariation } from "./caseLibrary";
import { validateCaseAnatomy, normalizeCaseAnatomy, getCaseSite } from "./anatomy";

const allCases = CHALLENGE_TOPICS.flatMap((t) => t.variations.map((_, i) => buildCaseFromTopicAndVariation(t, i)));

describe("case anatomy consistency", () => {
  it.each(allCases.map((c) => [c.id, c]))("%s has no conflicting locations", (_id, c) => {
    expect(validateCaseAnatomy(c as never)).toEqual([]);
  });

  it("Kojo Antwi is located at the right anterior thigh", () => {
    const kojo = allCases.find((c) => c.patient.name === "Kojo Antwi")!;
    expect(kojo.anatomicalSite).toBe("right_anterior_thigh");
    expect(kojo.affectedBodyRegion).toBe("right_leg");
    expect(getCaseSite(kojo).label).toBe("Right Anterior Thigh");
  });

  it("flags a case whose text names a different limb", () => {
    const kojo = allCases.find((c) => c.patient.name === "Kojo Antwi")!;
    const bad = { ...kojo, presentingComplaint: "Glass cut deep into left forearm." };
    expect(validateCaseAnatomy(bad).length).toBeGreaterThan(0);
  });

  it("repairs legacy cases without a site from their text", () => {
    const kojo = allCases.find((c) => c.patient.name === "Kojo Antwi")!;
    const { anatomicalSite: _drop, ...rest } = kojo;
    const legacy = { ...rest, affectedBodyRegion: "right_leg" as const };
    expect(normalizeCaseAnatomy(legacy).anatomicalSite).toBe("right_anterior_thigh");
    const arm = { ...legacy, presentingComplaint: "Windshield glass slashed brachial artery of right arm." };
    expect(normalizeCaseAnatomy(arm).affectedBodyRegion).toBe("right_arm");
  });
});
