/**
 * ASME Engine — the built-in answer writer.
 *
 * Runs on the server with ZERO external AI calls, so the website still gives a useful, sourced answer
 * when every AI provider is out of quota, rejected, or timing out. It does three things:
 *
 *  1. Deterministic calculators (Division 1 UG-27 shell thickness, UG-99/UG-100 test pressure).
 *  2. A small reference glossary of well-established pressure-vessel terms (general knowledge, NOT Code text).
 *  3. An extractive composer: it reads the PDF passages the retrieval step already found, ranks the
 *     sentences against the question, and writes a structured, cited answer — never inventing a clause.
 *
 * It has no imports at runtime so it can be unit-tested with plain Node.
 */

export interface EngineChunk {
  source: string
  page: number
  text: string
  edition?: string | null
  clause?: string | null
}

export interface EngineWebSource {
  title: string
  url: string
}

export type EngineReason = "providers-down" | "no-provider-configured" | "resume-incomplete"

export interface EngineInput {
  question: string
  chunks: EngineChunk[]
  web?: EngineWebSource[]
  reason: EngineReason
  /** When a model already wrote part of the answer, only add what is still useful (no greeting/intro). */
  continuing?: boolean
}

// ------------------------------------------------------------------------------------------------
// Source labelling
// ------------------------------------------------------------------------------------------------

export interface SourceInfo {
  title: string
  division: string | null
  edition: string | null
  isNotes: boolean
}

export function describeSource(source: string, edition?: string | null): SourceInfo {
  const title = source.replace(/\.pdf$/i, "")
  const div = /div(?:ision)?\.?\s*([123])/i.exec(title)
  const year = /\b(19[89]\d|20[0-3]\d)\b/.exec(title)
  return {
    title,
    division: div ? div[1] : null,
    edition: edition?.trim() || (year ? year[1] : null),
    // The owner's own study notes are useful but are not the Code.
    isNotes: /(?:^|[^a-z])notes?(?:[^a-z]|$)/i.test(title),
  }
}

function citation(chunk: EngineChunk): string {
  const info = describeSource(chunk.source, chunk.edition)
  const clause = chunk.clause ? `, ${chunk.clause}` : ""
  const notes = info.isNotes ? " (user notes, not the Code)" : ""
  return `[${info.title}${clause}, page ${chunk.page}]${notes}`
}

// ------------------------------------------------------------------------------------------------
// Text helpers
// ------------------------------------------------------------------------------------------------

const STOP_WORDS = new Set(
  (
    "a about above after again all also an and any are as at be been being below between both but by can could define " +
    "did do does doing down during each explain few for from further give had has have having he her here him his how i " +
    "if in into is it its me more most my no nor not of off on once only or other our out over own please read same she " +
    "should show so some such tell than that the their them then there these they this those through to too under until " +
    "up very was we were what when where which while who whom why will with would you your pdf asme code section"
  ).split(" "),
)

export function queryTerms(question: string): string[] {
  const raw = question.toLowerCase().match(/[a-z][a-z0-9-]*(?:\.[0-9]+)?|\d+(?:\.\d+)+/g) ?? []
  const terms = new Set<string>()
  for (const word of raw) {
    if (STOP_WORDS.has(word) || word.length < 3) continue
    terms.add(word.replace(/(?:ies)$/, "y").replace(/(?<=[a-z]{3,})s$/, ""))
  }
  return [...terms]
}

function cleanText(text: string): string {
  return text
    .replace(/\u00ad/g, "")
    .replace(/-\s*\n\s*/g, "-")
    .replace(/\s+/g, " ")
    .trim()
}

function splitSentences(text: string): string[] {
  return cleanText(text)
    .split(/(?<=[.;])\s+(?=[A-Z(“"0-9])/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 40 && s.length <= 700)
}

function looksLikeNoise(sentence: string): boolean {
  if (/\.{4,}/.test(sentence)) return true // table-of-contents leaders
  const letters = sentence.replace(/[^A-Za-z]/g, "")
  if (letters.length > 20 && letters === letters.toUpperCase() && sentence.length < 140) return true // running headers
  const digits = sentence.replace(/[^0-9]/g, "").length
  return digits / sentence.length > 0.4
}

function scoreSentence(sentence: string, terms: string[]): number {
  const lower = sentence.toLowerCase()
  let hits = 0
  for (const term of terms) if (lower.includes(term)) hits += 1
  if (hits === 0) return 0
  let score = hits * 2
  if (/\b(shall|required|requirements?|not exceed|minimum|maximum|permitted|allowable)\b/i.test(sentence)) score += 1
  if (sentence.length > 320) score -= 1
  return score
}

function excerpt(sentence: string, max = 300): string {
  if (sentence.length <= max) return sentence
  const cut = sentence.slice(0, max)
  const lastSpace = cut.lastIndexOf(" ")
  return `${cut.slice(0, lastSpace > 200 ? lastSpace : max).trim()}…`
}

function fmt(value: number, digits = 4): string {
  if (!Number.isFinite(value)) return "n/a"
  const abs = Math.abs(value)
  const d = abs >= 1000 ? 1 : abs >= 100 ? 2 : abs >= 1 ? 3 : digits
  return Number(value.toFixed(d)).toString()
}

// ------------------------------------------------------------------------------------------------
// 1. Calculators
// ------------------------------------------------------------------------------------------------

export interface CalcResult {
  title: string
  markdown: string
  /** One-line plain summary for injecting into an AI prompt as verified arithmetic. */
  summary: string
}

interface Quantity {
  value: number
  unit: string
}

function numberFrom(text: string): number | null {
  const n = Number(text.replace(/,/g, ""))
  return Number.isFinite(n) ? n : null
}

const PRESSURE_UNIT = "(psi|psig|mpa|kpa|bar|kg\\/cm2|pa)"
const LENGTH_UNIT = "(mm|cm|in|inch|inches|m)"

function findQuantity(text: string, labels: string[], unitPattern: string): Quantity | null {
  for (const label of labels) {
    const withUnit = new RegExp(`${label}\\s*(?:is|=|:|of|-)?\\s*(-?\\d[\\d,]*\\.?\\d*)\\s*${unitPattern}\\b`, "i").exec(text)
    if (withUnit) {
      const value = numberFrom(withUnit[1])
      if (value !== null) return { value, unit: withUnit[2].toLowerCase().replace("psig", "psi").replace("inches", "in").replace("inch", "in") }
    }
  }
  return null
}

function findPlain(text: string, labels: string[]): number | null {
  for (const label of labels) {
    const m = new RegExp(`${label}\\s*(?:is|=|:|of|-)?\\s*(-?\\d[\\d,]*\\.?\\d*)`, "i").exec(text)
    if (m) {
      const value = numberFrom(m[1])
      if (value !== null) return value
    }
  }
  return null
}

/**
 * Division 1 UG-27(c) thickness of shells under internal pressure (cylinder: circumferential and longitudinal
 * stress; sphere). Returns null when the question does not contain enough numbers to compute.
 */
export function solveShellThickness(question: string): CalcResult | null {
  if (!/\b(?:thickness|UG-?27|shell|cylind|sphere|spherical|vessel)\b/i.test(question)) return null
  if (!/\b(?:calculate|compute|find|determine|required|what(?:'s| is)|size|minimum)\b/i.test(question)) return null

  const P = findQuantity(question, ["design pressure", "internal pressure", "pressure", "\\bP"], PRESSURE_UNIT)
  const S = findQuantity(question, ["allowable stress", "stress value", "maximum allowable stress", "\\bS"], PRESSURE_UNIT)
  const radius = findQuantity(question, ["inside radius", "inner radius", "radius", "\\bR"], LENGTH_UNIT)
  const diameter = findQuantity(question, ["inside diameter", "inner diameter", "diameter", "\\bID", "\\bD"], LENGTH_UNIT)
  const E = findPlain(question, ["joint efficiency", "weld efficiency", "efficiency", "\\bE"])
  const CA = findQuantity(question, ["corrosion allowance", "\\bCA"], LENGTH_UNIT)

  if (!P || !S || (!radius && !diameter)) return null
  if (P.unit !== S.unit) return null // refuse to guess a unit conversion
  const efficiency = E ?? 1
  if (efficiency <= 0 || efficiency > 1) return null

  const lengthUnit = radius?.unit ?? diameter?.unit ?? "mm"
  const corrosion = CA && CA.unit === lengthUnit ? CA.value : 0
  const insideRadius = radius ? radius.value : (diameter as Quantity).value / 2
  const Rc = insideRadius + corrosion // UG-27 uses the corroded inside radius
  const spherical = /\b(?:sphere|spherical|hemispherical)\b/i.test(question) && !/\bcylind/i.test(question)

  const p = P.value
  const s = S.value
  const lines: string[] = []
  let governing: number
  let summary: string

  if (spherical) {
    const tSph = (p * Rc) / (2 * s * efficiency - 0.2 * p)
    const valid = tSph <= 0.356 * Rc || p <= 0.665 * s * efficiency
    governing = tSph
    lines.push(
      "**Spherical shell** — Division 1 UG-27(c)(3):",
      "",
      "$$t = \\frac{P R}{2 S E - 0.2 P}$$",
      "",
      `$t = (${fmt(p)} \\times ${fmt(Rc)}) / (2 \\times ${fmt(s)} \\times ${fmt(efficiency)} - 0.2 \\times ${fmt(p)}) = ${fmt(tSph)}$ ${lengthUnit}`,
      "",
      valid
        ? "Thin-shell limits are satisfied ($t \\le 0.356R$ or $P \\le 0.665SE$)."
        : "⚠️ The thin-shell limits ($t \\le 0.356R$ or $P \\le 0.665SE$) are **not** met — the UG-27 formula is not valid; use the thick-shell rules in Mandatory Appendix 1.",
    )
    summary = `Spherical shell UG-27(c)(3): t = ${fmt(tSph)} ${lengthUnit} (before corrosion allowance).`
  } else {
    const tCirc = (p * Rc) / (s * efficiency - 0.6 * p)
    const tLong = (p * Rc) / (2 * s * efficiency + 0.4 * p)
    governing = Math.max(tCirc, tLong)
    const validCirc = tCirc <= 0.5 * Rc || p <= 0.385 * s * efficiency
    const validLong = tLong <= 0.5 * Rc || p <= 1.25 * s * efficiency
    lines.push(
      "**Cylindrical shell** — Division 1 UG-27(c)(1) and (c)(2):",
      "",
      "$$t_{circ} = \\frac{P R}{S E - 0.6 P} \\qquad t_{long} = \\frac{P R}{2 S E + 0.4 P}$$",
      "",
      `- Circumferential (hoop) stress governs: $t_{circ} = (${fmt(p)} \\times ${fmt(Rc)}) / (${fmt(s)} \\times ${fmt(efficiency)} - 0.6 \\times ${fmt(p)}) = ${fmt(tCirc)}$ ${lengthUnit}`,
      `- Longitudinal stress: $t_{long} = (${fmt(p)} \\times ${fmt(Rc)}) / (2 \\times ${fmt(s)} \\times ${fmt(efficiency)} + 0.4 \\times ${fmt(p)}) = ${fmt(tLong)}$ ${lengthUnit}`,
      "",
      validCirc && validLong
        ? "Thin-shell limits are satisfied, so the formulas are applicable."
        : "⚠️ A thin-shell limit ($t \\le 0.5R$ or $P \\le 0.385SE$ for hoop; $P \\le 1.25SE$ for longitudinal) is **not** met — use the thick-shell rules in Mandatory Appendix 1.",
    )
    summary = `Cylindrical shell UG-27(c): t_circ = ${fmt(tCirc)} ${lengthUnit}, t_long = ${fmt(tLong)} ${lengthUnit}; governing ${fmt(governing)} ${lengthUnit} (before corrosion allowance).`
  }

  const total = governing + corrosion
  const markdown = [
    "### Shell thickness calculation (Division 1, UG-27)",
    "",
    "| Input | Value |",
    "|---|---|",
    `| Design pressure $P$ | ${fmt(p)} ${P.unit} |`,
    `| Allowable stress $S$ | ${fmt(s)} ${S.unit} |`,
    `| Joint efficiency $E$ | ${fmt(efficiency)}${E === null ? " (assumed 1.0 — not given)" : ""} |`,
    `| Inside radius $R$ | ${fmt(insideRadius)} ${lengthUnit}${diameter && !radius ? " (from the diameter you gave)" : ""} |`,
    `| Corrosion allowance | ${fmt(corrosion)} ${lengthUnit}${CA ? "" : " (none given)"} |`,
    `| Corroded radius used in the formula | ${fmt(Rc)} ${lengthUnit} |`,
    "",
    ...lines,
    "",
    `**Minimum required thickness including corrosion allowance: ≈ ${fmt(total)} ${lengthUnit}.** Round up to the next available plate thickness and check mill under-tolerance, minimum thickness rules (UG-16), and external-pressure/loadings that may govern.`,
    "",
    "*Arithmetic done by the built-in engine. These are the Division 1 formulas; Division 2 uses its own Part 4 rules and allowable stresses. Confirm the equations, the limits and the allowable stress against the exact edition of your PDF before using the result.*",
  ].join("\n")

  return { title: "Shell thickness (UG-27)", markdown, summary: `${summary} Total with corrosion allowance ≈ ${fmt(total)} ${lengthUnit}.` }
}

/** Division 1 UG-99 hydrostatic and UG-100 pneumatic test pressure from MAWP. */
export function solveTestPressure(question: string): CalcResult | null {
  const hydro = /\bhydro(?:static)?[\s-]*test|\bhydrostatic\b|UG-?99/i.test(question)
  const pneu = /\bpneumatic\b|UG-?100/i.test(question)
  if (!hydro && !pneu) return null
  if (/\bdiv(?:ision)?\.?\s*(?:2|3)\b/i.test(question)) return null // different factors in Div 2/3
  const mawp = findQuantity(question, ["MAWP", "maximum allowable working pressure", "design pressure"], PRESSURE_UNIT)
  if (!mawp) return null
  const ratio = findPlain(question, ["stress ratio", "lowest stress ratio", "LSR"]) ?? 1
  const rows: string[] = []
  if (hydro) rows.push(`- Hydrostatic (UG-99(b)): $P_T = 1.3 \\times MAWP \\times LSR = 1.3 \\times ${fmt(mawp.value)} \\times ${fmt(ratio)} = ${fmt(1.3 * mawp.value * ratio)}$ ${mawp.unit}`)
  if (pneu) rows.push(`- Pneumatic (UG-100(b)): $P_T = 1.1 \\times MAWP \\times LSR = 1.1 \\times ${fmt(mawp.value)} \\times ${fmt(ratio)} = ${fmt(1.1 * mawp.value * ratio)}$ ${mawp.unit}`)
  const markdown = [
    "### Test pressure (Division 1)",
    "",
    ...rows,
    "",
    `$LSR$ is the lowest ratio of the allowable stress at test temperature to the allowable stress at design temperature among the pressure-boundary materials${findPlain(question, ["stress ratio", "lowest stress ratio", "LSR"]) === null ? " (taken as 1.0 because none was given)" : ""}.`,
    "",
    "*Confirm the multipliers and any exceptions against the edition you are working to (they changed between old and current editions), and note that Divisions 2 and 3 use different test rules.*",
  ].join("\n")
  return { title: "Test pressure (UG-99/UG-100)", markdown, summary: rows.join(" ").replace(/\$/g, "") }
}

export function solveCalculation(question: string): CalcResult | null {
  if (/\bdiv(?:ision)?\.?\s*(?:2|3)\b/i.test(question) && /\b(?:thickness|UG-?27)\b/i.test(question)) return null
  return solveTestPressure(question) ?? solveShellThickness(question)
}

// ------------------------------------------------------------------------------------------------
// 2. Reference glossary (general knowledge — never presented as Code text)
// ------------------------------------------------------------------------------------------------

interface GlossaryEntry {
  id: string
  match: RegExp
  title: string
  body: string
}

const GLOSSARY: GlossaryEntry[] = [
  {
    id: "ug27",
    match: /UG-?27|thickness of shells? under internal pressure|minimum required thickness.*(?:cylind|shell)/i,
    title: "Division 1 UG-27 — thickness of shells under internal pressure",
    body: "The required thickness is found from the design pressure $P$, the **corroded** inside radius $R$, the allowable stress $S$ at the design temperature and the weld joint efficiency $E$, then the corrosion allowance is added back. For a cylinder the thicker result of the circumferential-stress and longitudinal-stress formulas governs: $$t=\\frac{PR}{SE-0.6P}\\qquad t=\\frac{PR}{2SE+0.4P}$$ and for a sphere $$t=\\frac{PR}{2SE-0.2P}$$ The thin-shell formulas apply only within their limits (roughly $t\\le 0.5R$ or $P\\le 0.385SE$ for hoop stress); beyond them the thick-shell rules of Mandatory Appendix 1 are used. Minimum thickness rules (UG-16), external pressure and other loadings can still govern, and the final thickness is rounded up with the mill under-tolerance considered. Give $P$, $S$, $R$ (or diameter), $E$ and the corrosion allowance with units and the engine will calculate it for you.",
  },
  {
    id: "mawp",
    match: /\bMAWP\b|maximum allowable working pressure/i,
    title: "MAWP — maximum allowable working pressure",
    body: "The maximum gauge pressure permitted at the top of the completed vessel in its normal operating position at the designated coincident temperature. It is set by the weakest essential part (shell, head, nozzle, flange…), calculated in the corroded condition, and is the basis for the pressure-relief set point and the test pressure.",
  },
  {
    id: "mdmt",
    match: /\bMDMT\b|minimum design metal temperature/i,
    title: "MDMT — minimum design metal temperature",
    body: "The lowest metal temperature at which the vessel may be loaded to pressure. It is established with the Code's material-toughness (impact-test exemption) rules, so thickness, material grade, stress level and heat treatment all affect it.",
  },
  {
    id: "design-pressure",
    match: /design pressure/i,
    title: "Design pressure",
    body: "The pressure, with its coincident temperature, used in the design calculations — set by the user or designer at or above the highest pressure expected in service, including static head and any relief-device overpressure effect on the part being checked.",
  },
  {
    id: "joint-efficiency",
    match: /joint efficiency|weld(?:ed)? joint efficiency/i,
    title: "Joint efficiency (E)",
    body: "A factor (1.0 or below) applied to the allowable stress of a welded joint that reflects how much of the weld has been examined — fuller radiography allows a higher E and therefore a thinner wall. Division 1 ties the values to the weld joint category/type and examination extent.",
  },
  {
    id: "corrosion-allowance",
    match: /corrosion allowance/i,
    title: "Corrosion allowance",
    body: "Extra wall thickness added beyond the calculated minimum to cover metal loss in service. Calculations are made in the corroded condition, then the allowance is added back to give the nominal thickness required.",
  },
  {
    id: "hydrotest",
    match: /hydro(?:static)?[\s-]*test|pressure test/i,
    title: "Hydrostatic pressure test",
    body: "A strength and leak test with water (or another suitable liquid) at a pressure above MAWP. In Division 1 the standard multiplier is 1.3 × MAWP × the lowest stress ratio; Divisions 2 and 3 use their own factors and procedures, so the exact figure depends on Division and edition.",
  },
  {
    id: "pneumatic",
    match: /pneumatic[\s-]*test/i,
    title: "Pneumatic test",
    body: "A test with gas, permitted only when a hydrostatic test is impractical, because the stored energy of compressed gas is far greater. It uses a lower multiplier than the hydrostatic test and has additional safety and examination requirements.",
  },
  {
    id: "pwht",
    match: /\bPWHT\b|post[\s-]*weld heat treatment/i,
    title: "PWHT — post-weld heat treatment",
    body: "Controlled heating and holding of a completed weld to relieve residual stress and temper the heat-affected zone. Whether it is mandatory depends on the material group, thickness, service (for example lethal service) and the specific Division rules.",
  },
  {
    id: "dba",
    match: /design[\s-]*by[\s-]*analysis|\bDBA\b|part\s*5\b/i,
    title: "Design-by-analysis (Division 2, Part 5)",
    body: "Part 5 of Division 2 qualifies a component by stress or strain analysis rather than by formulas. It covers protection against four failure modes: plastic collapse (5.2), local failure (5.3), buckling (5.4) and cyclic loading — fatigue and ratcheting (5.5). Each mode has its own accepted analysis routes (elastic, limit-load, or elastic-plastic).",
  },
  {
    id: "plastic-collapse",
    match: /plastic[\s-]*collapse/i,
    title: "Protection against plastic collapse",
    body: "Ensures the structure cannot undergo gross plastic deformation under a single load application. Division 2 allows elastic stress analysis with stress classification, limit-load analysis, or elastic-plastic analysis, each with its own load-case factors.",
  },
  {
    id: "local-failure",
    match: /local[\s-]*failure/i,
    title: "Protection against local failure",
    body: "Checks for failure at a local region (for example a notch or nozzle junction) where the stress state is highly triaxial. Division 2 offers an elastic triaxial-stress limit and an elastic-plastic strain-limit assessment.",
  },
  {
    id: "buckling",
    match: /buckling/i,
    title: "Buckling",
    body: "Sudden loss of stability of a thin component under compression, external pressure or shear. Rules apply a design factor to the theoretical capacity, and Division 2 permits numerical (collapse) analysis with imperfections for complex geometry.",
  },
  {
    id: "ratcheting",
    match: /ratchet/i,
    title: "Ratcheting",
    body: "Progressive, incremental plastic deformation that accumulates cycle after cycle when a steady primary load is combined with a cyclically varying secondary load. It is assessed separately from fatigue in the Part 5 cyclic-loading rules.",
  },
  {
    id: "fatigue",
    match: /\bfatigue\b/i,
    title: "Fatigue",
    body: "Crack initiation and growth from repeated load cycles at stresses well below yield. Division 2 first applies a screening test; if the vessel does not pass, a detailed fatigue evaluation (elastic or elastic-plastic stress, S-N curves, usage factor) is required.",
  },
  {
    id: "stress-categories",
    match: /\bP_?m\b|\bP_?L\b|\bP_?b\b|membrane stress|stress classification|stress categor|primary stress|secondary stress|peak stress/i,
    title: "Stress categories (Pm, PL, Pb, Q, F)",
    body: "Pm is the general primary membrane stress, PL the local primary membrane stress, Pb the primary bending stress, Q the secondary stress (self-limiting, from constraint or thermal gradients) and F the peak stress (local concentration, relevant to fatigue). Each category has its own allowable limit relative to the allowable stress S.",
  },
  {
    id: "u-stamp",
    match: /\bU[\s-]*stamp\b|certificate of authorization/i,
    title: "U-stamp",
    body: "The Code symbol stamp that an ASME-accredited manufacturer applies to a Section VIII Division 1 pressure vessel built and inspected under its Certificate of Authorization. Division 2 vessels carry the U2 symbol and Division 3 the U3 symbol.",
  },
  {
    id: "r-stamp",
    match: /\bR[\s-]*stamp\b/i,
    title: "R-stamp",
    body: "The National Board symbol for organizations authorized to repair or alter pressure-retaining items under the National Board Inspection Code (NBIC), not for new construction.",
  },
  {
    id: "nbic",
    match: /\bNBIC\b|national board inspection code/i,
    title: "NBIC",
    body: "The National Board Inspection Code — rules for in-service inspection, repair, alteration and rerating of boilers and pressure vessels. It complements, but is separate from, ASME Section VIII construction rules.",
  },
  {
    id: "code-case",
    match: /code[\s-]*case/i,
    title: "Code Case",
    body: "An ASME-approved alternative or addition to the Code rules for a specific material, design or method. A Code Case may be used only when it is current, its use is accepted by the jurisdiction, and it is documented in the Manufacturer’s Data Report.",
  },
  {
    id: "divisions",
    match: /division\s*1.*division\s*2|difference between (?:div|division)|div\s*1\s*(?:vs|versus|and)\s*div\s*2|divisions?\b.*\b(?:differ|compare)/i,
    title: "Section VIII Division 1 vs 2 vs 3",
    body: "Division 1 is design-by-rule with conservative allowable stresses and the simplest documentation. Division 2 (Alternative Rules) permits higher allowable stresses in return for more rigorous design, materials, examination and fatigue rules, and adds design-by-analysis. Division 3 (Alternative Rules for High-Pressure Vessels) covers very high pressures, with fracture-mechanics-based fatigue and leak-before-burst evaluation.",
  },
  {
    id: "div2-parts",
    match: /division\s*2.*\bparts?\b|div\s*2.*\bparts?\b|parts? of division 2/i,
    title: "Division 2 — how the Parts are organized",
    body: "Part 1 General · Part 2 Responsibilities and Documentation · Part 3 Materials · Part 4 Design by Rule · Part 5 Design by Analysis · Part 6 Fabrication · Part 7 Examination and Inspection · Part 8 Pressure Testing · Part 9 Pressure Vessel Overpressure Protection. Check the table of contents of your edition for the exact numbering.",
  },
]

export function lookupGlossary(question: string, max = 2): GlossaryEntry[] {
  return GLOSSARY.filter((entry) => entry.match.test(question)).slice(0, max)
}

// ------------------------------------------------------------------------------------------------
// 3. Extractive composer
// ------------------------------------------------------------------------------------------------

interface Picked {
  chunk: EngineChunk
  sentence: string
  score: number
}

function pickSentences(chunks: EngineChunk[], terms: string[]): Picked[] {
  const picked: Picked[] = []
  const seen = new Set<string>()
  for (const chunk of chunks.slice(0, 10)) {
    const scored = splitSentences(chunk.text)
      .filter((s) => !looksLikeNoise(s))
      .map((sentence) => ({ chunk, sentence, score: scoreSentence(sentence, terms) }))
      .filter((item) => item.score >= (terms.length > 2 ? 4 : 2))
      .sort((a, b) => b.score - a.score)
      .slice(0, 2)
    for (const item of scored) {
      const key = item.sentence.slice(0, 60).toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      picked.push(item)
    }
  }
  return picked.sort((a, b) => b.score - a.score).slice(0, 8)
}

function askedEditions(question: string): string[] {
  return [...new Set(question.match(/\b(?:19[89]\d|20[0-3]\d)\b/g) ?? [])]
}

function askedDivisions(question: string): string[] {
  const found = new Set<string>()
  for (const m of question.matchAll(/\bdiv(?:ision)?\.?\s*([123])\b/gi)) found.add(m[1])
  return [...found]
}

function reasonLine(reason: EngineReason): string {
  if (reason === "no-provider-configured") {
    return "No AI provider key is configured on the server, so this answer was written by the built-in ASME Engine."
  }
  if (reason === "resume-incomplete") {
    return "The AI writers stopped before finishing, so the built-in ASME Engine added the remaining source evidence below."
  }
  return "All AI writers are unavailable right now (quota reached, key rejected or timed out), so the built-in ASME Engine wrote this answer directly from your Code library."
}

export function composeEngineAnswer(input: EngineInput): string {
  const { question, chunks, web = [], reason } = input
  const terms = queryTerms(question)
  const out: string[] = []

  if (input.continuing) {
    out.push("---", "", "### Remaining evidence (added by the built-in ASME Engine)", "")
  } else {
    out.push(`> **Built-in ASME Engine** — ${reasonLine(reason)}`, "")
  }

  const calc = solveCalculation(question)
  if (calc) out.push(calc.markdown, "")

  const glossary = lookupGlossary(question, calc ? 1 : 2)
  const picked = pickSentences(chunks, terms)

  // ---- Direct answer -------------------------------------------------------------------------
  if (!calc && !input.continuing) {
    if (picked.length > 0) {
      const best = picked[0]
      out.push("### Direct answer from your PDFs", "", `> ${excerpt(best.sentence)} ${citation(best.chunk)}`, "")
    } else if (glossary.length > 0) {
      out.push("### Quick answer", "")
    }
  }

  for (const entry of glossary) {
    out.push(`**${entry.title}.** ${entry.body}`, "", "*General engineering reference, not a Code clause — verify the governing wording in the PDF excerpts below or the licensed Code.*", "")
  }

  // ---- Supporting requirements -----------------------------------------------------------------
  const rest = picked.slice(calc || input.continuing ? 0 : 1)
  if (rest.length > 0) {
    out.push("### Other relevant requirements found", "")
    for (const item of rest.slice(0, 6)) out.push(`- ${excerpt(item.sentence, 260)} ${citation(item.chunk)}`)
    out.push("")
  }

  // ---- Where the evidence came from -------------------------------------------------------------
  if (chunks.length > 0) {
    const bySource = new Map<string, { info: SourceInfo; pages: Set<number> }>()
    for (const chunk of chunks) {
      const entry = bySource.get(chunk.source) ?? { info: describeSource(chunk.source, chunk.edition), pages: new Set<number>() }
      entry.pages.add(chunk.page)
      bySource.set(chunk.source, entry)
    }
    out.push("### Where this came from", "", "| Document | Division | Edition | Pages |", "|---|---|---|---|")
    for (const { info, pages } of bySource.values()) {
      const list = [...pages].sort((a, b) => a - b).slice(0, 8).join(", ")
      out.push(`| ${info.title}${info.isNotes ? " *(notes, not the Code)*" : ""} | ${info.division ?? "—"} | ${info.edition ?? "—"} | ${list} |`)
    }
    out.push("")

    // Edition / Division coverage check
    const foundEditions = new Set([...bySource.values()].map((s) => s.info.edition).filter(Boolean) as string[])
    const foundDivisions = new Set([...bySource.values()].map((s) => s.info.division).filter(Boolean) as string[])
    const missingEditions = askedEditions(question).filter((year) => !foundEditions.has(year))
    const missingDivisions = askedDivisions(question).filter((d) => !foundDivisions.has(d))
    if (missingEditions.length > 0 || missingDivisions.length > 0) {
      const parts = [
        missingEditions.length ? `edition${missingEditions.length > 1 ? "s" : ""} ${missingEditions.join(", ")}` : "",
        missingDivisions.length ? `Division${missingDivisions.length > 1 ? "s" : ""} ${missingDivisions.join(", ")}` : "",
      ].filter(Boolean)
      out.push(`⚠️ **Not covered:** no passage was retrieved for ${parts.join(" and ")}, so nothing above should be read as a statement about ${missingEditions.length ? "that edition" : "that Division"}.`, "")
    } else if (foundEditions.size > 1 || foundDivisions.size > 1) {
      out.push("⚠️ These passages come from more than one edition/Division — compare them only like-for-like and confirm which one governs your project.", "")
    } else if (askedEditions(question).length === 0 && foundEditions.size === 1) {
      out.push(`ℹ️ You did not name an edition; the passages above are from **${[...foundEditions][0]}**. Confirm the edition that governs your project.`, "")
    }
  } else if (!calc && glossary.length === 0) {
    out.push(
      "### I could not verify this against your Code PDFs",
      "",
      "No PDF passages could be retrieved for this question (the laptop library may be offline, or the wording did not match the indexed text) and no AI writer was available, so I will not guess at a Code requirement.",
      "",
      "**Try one of these:**",
      "",
      "- Confirm the laptop retrieval service and tunnel are running (`/health` should list every PDF).",
      "- Name the Division, edition and topic, for example *“Division 2 2025 — protection against ratcheting”*.",
      "- Ask for one section or one calculation at a time (for example *“UG-27 thickness, P = 2 MPa, S = 138 MPa, R = 600 mm, E = 0.85”*).",
      "",
    )
  }

  if (web.length > 0) {
    out.push("**Supplementary web research (not Code authority)**", "")
    for (const source of web.slice(0, 4)) out.push(`- [${source.title}](${source.url})`)
    out.push("")
  }

  out.push(
    "*Excerpts are shortened. ASME Code text is copyrighted and edition-controlled — verify every requirement against the licensed edition that governs your project, and have final design decisions reviewed by qualified personnel. Ask again in a minute for a fully written AI explanation.*",
  )
  return out.join("\n")
}
