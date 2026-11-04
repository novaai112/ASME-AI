/**
 * Part 5 Brain — answers Division 2 Part 5 questions with no AI and no network: it routes the question to the
 * right paragraphs of the structured outline, writes the procedure, lists the equations and offers the calculators.
 */
import { PART5_SECTIONS, getSection, type Part5Section } from "./outline.ts"
import { DIV2_DETAIL_SECTIONS } from "../div2/outline.ts"
import { getCalculator } from "../calc-registry.ts"

const ALL_SECTIONS: Part5Section[] = [...PART5_SECTIONS, ...DIV2_DETAIL_SECTIONS]

export interface Part5Answer {
  markdown: string
  sectionIds: string[]
  calculatorIds: string[]
}

const PART5_ONLY = /plastic collapse|local failure|local strain|triaxial stress|ratchet|fatigue screening|bree diagram|strain[- ]limit|stress categor|stress classification|design[- ]by[- ]analysis|\bpart\s*5\b|\bS_?PL\b|\bS_?PS\b|fatigue penalty|capacity reduction|creep[- ]fatigue|\b5\.(?:[1-9]|1[0-6])(?:\.\d+){0,4}\b(?!\s*(?:mm|in|psi|mpa|%))/i

/** Division 2 Part 4.3 head/shell thickness and Part 8 test-pressure questions that name Division 2. */
export function isDiv2RuleQuestion(question: string): boolean {
  const q = question.slice(0, 1500)
  if (!/\bdiv(?:ision)?\.?\s*(?:2|two)\b|VIII[- ]?2|BPVC\.VIII\.2/i.test(q)) return false
  if (/\bdiv(?:ision)?\.?\s*(?:1|3)\b/i.test(q) && !/\bdiv(?:ision)?\.?\s*(?:2|two)\b/i.test(q)) return false
  return /cylind|cone|conical|sphere|spherical|hemispher|torispherical|ellips|knuckle|head thickness|shell thickness|required thickness|hydro(?:static)?[\s-]*test|pneumatic[\s-]*test|test pressure|\b4\.3\.[1-7]\b|\b8\.[1-4]\b/i.test(q)
}

/** True when the question is about Division 2 Part 5 (design by analysis). */
export function isPart5Question(question: string): boolean {
  const q = question.slice(0, 1500)
  const div1 = /\bdiv(?:ision)?\.?\s*(?:1|3|one|three)\b/i.test(q) && !/\bdiv(?:ision)?\.?\s*(?:2|two)\b/i.test(q)
  if (div1) return false
  const div2 = /\bdiv(?:ision)?\.?\s*(?:2|two)\b|VIII[- ]?2|\bBPVC\.VIII\.2/i.test(q)
  if (div2 && /\b(?:analysis|stress|fatigue|buckling|ratchet|collapse|creep|failure|part\s*5|5\.\d)/i.test(q)) return true
  return /plastic collapse|ratchet|triaxial|fatigue screening|bree diagram|design[- ]by[- ]analysis|\bpart\s*5\b|local strain|stress categor|S_?PS\b|S_?PL\b|capacity reduction factor|fatigue penalty/i.test(q) || (PART5_ONLY.test(q) && /\b5\.\d+(\.\d+)+\b/.test(q))
}

function score(section: Part5Section, q: string): number {
  let s = 0
  for (const k of section.keywords) {
    try {
      if (new RegExp(k, "i").test(q)) s += k.includes("\\d") && /5\\\./.test(k) ? 3 : 2
    } catch { /* ignore bad pattern */ }
  }
  // exact clause mention, e.g. "5.5.4.2" -> section 5.5.4
  for (const m of q.matchAll(/\b5\.\d+(?:\.\d+){0,3}\b/g)) {
    const ref = m[0]
    if (section.id === ref || ref.startsWith(section.id + ".") || (section.id.includes("-") && false)) s += 6
  }
  return s
}

export function matchSections(question: string, max = 3): Part5Section[] {
  const scored = ALL_SECTIONS.map((s) => ({ s, n: score(s, question) })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n)
  if (scored.length === 0) return []
  // General / reference paragraphs only answer when nothing more specific matched.
  const specific = scored.filter((x) => x.s.id !== "5.1" && x.s.group !== "reference")
  if (specific.length > 0) { scored.length = 0; scored.push(...specific) }
  const top = scored[0].n
  // Keep only paragraphs that are about as relevant as the best one (drops incidental keyword hits).
  return scored.filter((x) => x.n >= top * 0.55).slice(0, max).map((x) => x.s)
}

function overview(): string {
  return [
    "### Part 5 at a glance — what must be checked",
    "",
    "| Failure mode | Paragraph | Ways to satisfy it |",
    "|---|---|---|",
    "| Plastic collapse | 5.2 | Elastic stress analysis + classification (5.2.2), limit-load analysis (5.2.3), elastic–plastic analysis (5.2.4) |",
    "| Local failure | 5.3 | Triaxial stress limit (5.3.2) or local strain limit (5.3.3) |",
    "| Buckling | 5.4 | Method A (eigenvalue + capacity reduction) or Method B (elastic–plastic with imperfections) |",
    "| Cyclic loading | 5.5 | Fatigue: exemption/screening (A, B, C) or analysis (A, B, C); Ratcheting: elastic A/B or elastic–plastic |",
    "| Creep | 5.6 | Stress rupture, creep buckling, creep-fatigue, creep ratcheting (only when time-dependent allowables govern) |",
    "| Supplemental | 5.7–5.12 | Nozzle-neck classification, bolts, perforated plates, layered vessels, experimental analysis, fracture mechanics |",
    "",
  ].join("\n")
}

export function composePart5Answer(question: string): Part5Answer {
  const matches = matchSections(question)
  const broad = /\bpart\s*5\b|design[- ]by[- ]analysis|overview|summary|explain.*part 5|all of part 5/i.test(question)
  const sections = matches.length > 0 ? matches : [getSection("5.1")!]
  const calcIds = new Set<string>()
  const out: string[] = []
  out.push("> **Division 2 Brain** — answered instantly from the structured map of ASME BPVC VIII-2 (2025), with no AI. Equations are shown with their numbers; open a calculator to enter the variables and get a worked solution.", "")
  if (broad || matches.length === 0) out.push(overview())

  for (const s of sections) {
    out.push(`## ${s.id} — ${s.title}`, `*2025 edition, printed page ${s.page}*`, "", s.summary, "")
    if (s.points.length) { out.push("**Key requirements**", ""); for (const p of s.points) out.push(`- ${p}`); out.push("") }
    if (s.equations.length) {
      out.push("**Equations**", "")
      for (const e of s.equations) out.push(`**Eq. (${e.no})** — ${e.meaning}`, "", `$$${e.latex}$$`, "")
    }
    s.calculators.forEach((id) => calcIds.add(id))
  }

  const calcs = [...calcIds].map(getCalculator).filter(Boolean)
  if (calcs.length) {
    out.push("### Calculators for this topic", "")
    for (const c of calcs) out.push(`- **${c!.title}** (${c!.section}${c!.equations.length ? `, eq. ${c!.equations.join(", ")}` : ""}) — ${c!.summary}`)
    out.push("", "Tap a calculator card below this answer to enter the variables (name, symbol and units are shown for each) and get the worked calculation.", "")
  }
  out.push(
    "*This is a structured guide written in our own words from the 2025 Division 2 text, not a reproduction of it. Open **Full text** or **View PDF pages** in the Division 2 Library to read the exact paragraph from your own PDF, and always confirm against the licensed Code edition that governs your project.*",
  )
  return { markdown: out.join("\n"), sectionIds: sections.map((s) => s.id), calculatorIds: [...calcIds] }
}
