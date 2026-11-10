// Canonical anatomical sites. Every case has ONE primary `anatomicalSite`; the
// coarse `affectedBodyRegion` (used for targeting, highlighting and diagrams) is
// always derived from it, so labels, diagrams and treatment targets can't drift apart.
import type { BodyRegion, ClinicalCase } from '../types/clinical';

export type LimbZone = 'thigh' | 'knee' | 'lower_leg' | 'ankle_foot' | 'upper_arm' | 'forearm' | 'hand';

export interface AnatomicalSiteDef {
  id: string;
  region: BodyRegion;
  label: string;
  side?: 'right' | 'left';
  zone?: LimbZone;
}

type LimbBase = { limb: 'leg' | 'arm' | 'hand'; zone: LimbZone; label: string; keywords: RegExp[] };

// Ordered most-specific first: inference picks the first match.
const LIMB_BASES: Record<string, LimbBase> = {
  popliteal_fossa: { limb: 'leg', zone: 'knee', label: 'Popliteal Fossa (Back of Knee)', keywords: [/\bpopliteal\b/, /\bbehind (the )?knee\b/] },
  anterior_thigh: { limb: 'leg', zone: 'thigh', label: 'Anterior Thigh', keywords: [/\banterior thigh\b/] },
  hip: { limb: 'leg', zone: 'thigh', label: 'Hip & Proximal Femur', keywords: [/\bhip\b/] },
  thigh: { limb: 'leg', zone: 'thigh', label: 'Thigh', keywords: [/\bthigh\b/, /\bfemoral\b/, /\bfemur\b/] },
  knee: { limb: 'leg', zone: 'knee', label: 'Knee', keywords: [/\bknee\b/] },
  shin: { limb: 'leg', zone: 'lower_leg', label: 'Shin (Anterior Lower Leg)', keywords: [/\bshin\b/] },
  calf: { limb: 'leg', zone: 'lower_leg', label: 'Calf', keywords: [/\bcalf\b/, /\btibial\b/] },
  foot_ankle: { limb: 'leg', zone: 'ankle_foot', label: 'Foot & Ankle', keywords: [/\bfoot and ankle\b/, /\bankle and foot\b/] },
  ankle: { limb: 'leg', zone: 'ankle_foot', label: 'Ankle', keywords: [/\bankle\b/] },
  foot: { limb: 'leg', zone: 'ankle_foot', label: 'Foot', keywords: [/\bfoot\b/, /\bheel\b/, /\btoes?\b/, /\bstepped on\b/] },
  lower_leg: { limb: 'leg', zone: 'lower_leg', label: 'Lower Leg', keywords: [/\blower (leg|limb)\b/, /\bleg\b/] },
  upper_arm: { limb: 'arm', zone: 'upper_arm', label: 'Upper Arm (Brachial)', keywords: [/\bbrachial\b/, /\bhumerus\b/, /\bupper arm\b/] },
  forearm: { limb: 'arm', zone: 'forearm', label: 'Forearm', keywords: [/\bforearm\b/, /\belbow\b/, /\barm\b/] },
  dorsal_hand: { limb: 'hand', zone: 'hand', label: 'Back of Hand', keywords: [/\bdors(al|um of)( right| left)? hand\b/] },
  wrist: { limb: 'hand', zone: 'hand', label: 'Wrist', keywords: [/\bwrist\b/] },
  hand: { limb: 'hand', zone: 'hand', label: 'Hand', keywords: [/\bhands?\b/, /\bfingers?\b/, /\bthumb\b/, /\bpalm\b/] },
};

const NON_LIMB_SITES: AnatomicalSiteDef[] = [
  { id: 'nose', region: 'head_face', label: 'Nose & Nasal Passages' },
  { id: 'mouth_teeth', region: 'head_face', label: 'Mouth & Upper Front Teeth' },
  { id: 'upper_airway', region: 'head_face', label: 'Mouth, Throat & Upper Airway' },
  { id: 'head_systemic', region: 'head_face', label: 'Head & Level of Consciousness' },
  { id: 'eye', region: 'eye_ear', label: 'Eye' },
  { id: 'chest', region: 'chest', label: 'Chest & Heart' },
  { id: 'abdomen', region: 'abdomen', label: 'Abdomen' },
];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const ANATOMICAL_SITES: Record<string, AnatomicalSiteDef> = (() => {
  const out: Record<string, AnatomicalSiteDef> = {};
  for (const side of ['right', 'left'] as const) {
    for (const [key, b] of Object.entries(LIMB_BASES)) {
      const id = `${side}_${key}`;
      const label = key === 'dorsal_hand' ? `Back of ${cap(side)} Hand` : `${cap(side)} ${b.label}`;
      out[id] = { id, region: `${side}_${b.limb}` as BodyRegion, label, side, zone: b.zone };
    }
  }
  for (const s of NON_LIMB_SITES) out[s.id] = s;
  return out;
})();

/** Site used when nothing more specific is known for a region. */
export const REGION_DEFAULT_SITE: Record<BodyRegion, string> = {
  right_leg: 'right_lower_leg', left_leg: 'left_lower_leg',
  right_arm: 'right_forearm', left_arm: 'left_forearm',
  right_hand: 'right_hand', left_hand: 'left_hand',
  head_face: 'head_systemic', eye_ear: 'eye', chest: 'chest', abdomen: 'abdomen',
};

export function getSite(id: string | undefined): AnatomicalSiteDef | undefined {
  return id ? ANATOMICAL_SITES[id] : undefined;
}

export function sitesForRegions(regions: BodyRegion[]): string[] {
  return Object.values(ANATOMICAL_SITES).filter(s => regions.includes(s.region)).map(s => s.id);
}

type Mention = { key: string; limb: 'leg' | 'arm' | 'hand'; side?: 'right' | 'left'; text: string; index: number };

function stripIgnored(text: string, ignored: string[] = []): string {
  let t = ` ${text.toLowerCase()} `;
  for (const phrase of ignored) t = t.split(phrase.toLowerCase()).join(' ');
  return t;
}

/** Finds every limb location mentioned in free text (with its side, if stated just before it). */
export function findLimbMentions(text: string, ignored: string[] = []): Mention[] {
  let t = stripIgnored(text, ignored);
  const found: Mention[] = [];
  for (const [key, b] of Object.entries(LIMB_BASES)) {
    for (const re of b.keywords) {
      const g = new RegExp(re.source, 'g');
      let m: RegExpExecArray | null;
      while ((m = g.exec(t))) {
        const before = t.slice(Math.max(0, m.index - 25), m.index);
        const sideMatch = before.match(/\b(right|left)\b(?!.*\b(right|left)\b)/);
        found.push({ key, limb: b.limb, side: sideMatch?.[1] as Mention['side'], text: m[0], index: m.index });
      }
      // Blank out matched spans so less specific keywords don't double count.
      t = t.replace(new RegExp(re.source, 'g'), (s) => ' '.repeat(s.length));
    }
  }
  return found.sort((a, b) => a.index - b.index);
}

function textOf(c: ClinicalCase): string {
  return [c.presentingComplaint, c.patientStatement, c.caregiverStatement ?? '', ...(c.visibleFindings ?? [])].join(' \n ');
}

/** Infer a canonical site from a case's text (used for AI/legacy cases without one). */
export function inferSiteFromText(text: string, region: BodyRegion, ignored: string[] = []): string {
  const regionSide = region.startsWith('left') ? 'left' : region.startsWith('right') ? 'right' : undefined;
  const mentions = findLimbMentions(text, ignored);
  const first = mentions[0];
  if (first && (regionSide || ['right_leg', 'left_leg', 'right_arm', 'left_arm', 'right_hand', 'left_hand'].includes(region))) {
    const side = first.side ?? regionSide ?? 'right';
    return `${side}_${first.key}`;
  }
  return REGION_DEFAULT_SITE[region] ?? 'head_systemic';
}

/** Returns the case with a valid canonical site and a body region derived from it. */
export function normalizeCaseAnatomy<T extends ClinicalCase>(c: T): T {
  if (!c) return c;
  let siteId = getSite(c.anatomicalSite) ? c.anatomicalSite! : inferSiteFromText(textOf(c), c.affectedBodyRegion, c.nonInjuredMentions);
  const site = getSite(siteId) ?? getSite(REGION_DEFAULT_SITE[c.affectedBodyRegion])!;
  siteId = site.id;
  return { ...c, anatomicalSite: siteId, affectedBodyRegion: site.region };
}

export function getCaseSite(c: ClinicalCase): AnatomicalSiteDef {
  return getSite(normalizeCaseAnatomy(c).anatomicalSite)!;
}

/** Human label for a body region; uses the case's precise site when it's the affected region. */
export function regionLabel(c: ClinicalCase, region: BodyRegion): string {
  const site = getCaseSite(c);
  if (region === site.region) return site.label;
  return region.replace('_', ' ');
}

/**
 * Detects conflicting anatomical locations across a case's fields.
 * Returns a list of human-readable problems (empty = consistent).
 */
export function validateCaseAnatomy(c: ClinicalCase): string[] {
  const problems: string[] = [];
  const label = `${c.id}`;
  const site = getSite(c.anatomicalSite);
  if (!site) {
    problems.push(`${label}: missing or unknown anatomicalSite "${c.anatomicalSite}"`);
    return problems;
  }
  if (site.region !== c.affectedBodyRegion) {
    problems.push(`${label}: anatomicalSite "${site.id}" belongs to ${site.region} but affectedBodyRegion is ${c.affectedBodyRegion}`);
  }
  const allowed = [site, ...(c.secondarySites ?? []).map(getSite)].filter(Boolean) as AnatomicalSiteDef[];
  for (const id of c.secondarySites ?? []) if (!getSite(id)) problems.push(`${label}: unknown secondary site "${id}"`);

  for (const m of findLimbMentions(textOf(c), c.nonInjuredMentions)) {
    const ok = allowed.some(s => {
      if (!s.zone) return false;
      const sLimb = s.region.endsWith('_leg') ? 'leg' : s.region.endsWith('_arm') ? 'arm' : s.region.endsWith('_hand') ? 'hand' : undefined;
      if (sLimb !== m.limb) return false;
      if (m.side && s.side && m.side !== s.side) return false;
      return true;
    });
    if (!ok) {
      problems.push(`${label}: text mentions "${m.side ? m.side + ' ' : ''}${m.text}" but the case is located at ${site.label}`);
    }
  }
  return problems;
}
