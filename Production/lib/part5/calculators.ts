/**
 * ASME BPVC Section VIII Division 2 (2025) Part 5 — deterministic calculators.
 * Every equation below was transcribed from the 2025 Part 5 PDF supplied by the owner and carries its
 * equation number. All arithmetic is plain code: no AI, no network.
 * Results are engineering aids: the licensed Code and the engineer of record govern.
 */
import type { CalcDef, CalcOutput, Field, ResultLine, Row, Step, UnitSystem, Values } from "./types.ts"
import { UNIT_LABELS } from "./types.ts"

// ---------------------------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------------------------
export function fmt(x: number, sig = 5): string {
  if (!Number.isFinite(x)) return "n/a"
  if (x === 0) return "0"
  const a = Math.abs(x)
  if (a >= 1e6 || a < 1e-3) return x.toExponential(Math.max(1, sig - 2)).replace(/e\+?/, "\\times 10^{") + "}"
  return Number(x.toPrecision(sig)).toString()
}
const plain = (x: number, sig = 5) => fmt(x, sig).replace(/\\times 10\^\{(-?\d+)\}/, "e$1")

function req(v: Values, key: string, label: string): number {
  const x = v[key]
  if (typeof x !== "number" || !Number.isFinite(x)) throw new Error(`Enter a value for ${label}.`)
  return x
}
function opt(v: Values, key: string): number | undefined {
  const x = v[key]
  return typeof x === "number" && Number.isFinite(x) ? x : undefined
}
function sel(v: Values, key: string, fallback: string): string {
  const x = v[key]
  return typeof x === "string" && x ? x : fallback
}
function rows(v: Values, key: string): Row[] {
  const x = v[key]
  return Array.isArray(x) ? x.filter((r) => r && Object.values(r).some((n) => Number.isFinite(n))) : []
}
function positive(x: number, label: string) {
  if (!(x > 0)) throw new Error(`${label} must be greater than zero.`)
}
const u = (kind: keyof typeof UNIT_LABELS, system: UnitSystem) => UNIT_LABELS[kind][system]
const out = (): CalcOutput => ({ results: [], steps: [], warnings: [] })
const num = (key: string, symbol: string, latex: string, label: string, unit: any, extra: Partial<Extract<Field, { kind: "number" }>> = {}): Field => ({
  kind: "number", key, symbol, latex, label, unit, ...extra,
})

/** von Mises equivalent stress, eq. (5.1) */
export function vonMises(s1: number, s2: number, s3: number): number {
  return (1 / Math.SQRT2) * Math.pow((s1 - s2) ** 2 + (s2 - s3) ** 2 + (s3 - s1) ** 2, 0.5)
}

const stressNote = "Use one stress unit throughout (the unit switch at the top sets the label)."

// ---------------------------------------------------------------------------------------------
// 5.2.2 — elastic stress analysis
// ---------------------------------------------------------------------------------------------
const vonMisesCalc: CalcDef = {
  id: "von-mises",
  title: "Equivalent (von Mises) stress",
  section: "5.2.2.1",
  equations: ["5.1"],
  summary: "Converts three principal stresses into the equivalent stress used for every Part 5 comparison.",
  fields: [
    num("s1", "σ1", "\\sigma_1", "First principal stress", "stress", { help: stressNote }),
    num("s2", "σ2", "\\sigma_2", "Second principal stress", "stress"),
    num("s3", "σ3", "\\sigma_3", "Third principal stress", "stress"),
  ],
  compute(v, sys) {
    const s1 = req(v, "s1", "σ1"), s2 = req(v, "s2", "σ2"), s3 = req(v, "s3", "σ3")
    const o = out()
    const se = vonMises(s1, s2, s3)
    o.steps.push({
      title: "Eq. (5.1) — von Mises equivalent stress",
      latex: [
        "\\sigma_e=\\frac{1}{\\sqrt2}\\left[(\\sigma_1-\\sigma_2)^2+(\\sigma_2-\\sigma_3)^2+(\\sigma_3-\\sigma_1)^2\\right]^{0.5}",
        `\\sigma_e=\\frac{1}{\\sqrt2}\\left[(${fmt(s1)}-${fmt(s2)})^2+(${fmt(s2)}-${fmt(s3)})^2+(${fmt(s3)}-${fmt(s1)})^2\\right]^{0.5}`,
        `\\sigma_e=\\frac{1}{\\sqrt2}\\left[${fmt((s1 - s2) ** 2)}+${fmt((s2 - s3) ** 2)}+${fmt((s3 - s1) ** 2)}\\right]^{0.5}=${fmt(se)}`,
      ],
    })
    o.results.push({ label: "Equivalent stress", latex: "\\sigma_e", value: plain(se), unit: u("stress", sys), status: "info" })
    return o
  },
}

const plasticCollapseElastic: CalcDef = {
  id: "plastic-collapse-elastic",
  title: "Plastic collapse — elastic stress limits",
  section: "5.2.2.4",
  equations: ["5.2", "5.3", "5.4", "5.5"],
  summary: "Checks Pm, PL and PL+Pb against S and S_PL (Table 5.3 load combinations).",
  fields: [
    { kind: "group", label: "Material (Annex 3-A / 3-D)" },
    num("S", "S", "S", "Allowable stress at the design temperature", "stress", { help: stressNote }),
    num("Sy", "Sy", "S_y", "Specified minimum yield strength (SMYS)", "stress"),
    num("UTS", "UTS", "S_u", "Specified minimum tensile strength", "stress"),
    { kind: "group", label: "Equivalent stresses from the analysis (already categorised and linearised)", help: "Each is an equivalent stress from eq. (5.1) applied to the summed stress tensors of that category." },
    num("Pm", "Pm", "P_m", "General primary membrane equivalent stress", "stress", { optional: true }),
    num("PL", "PL", "P_L", "Local primary membrane equivalent stress", "stress", { optional: true }),
    num("PLPb", "PL+Pb", "P_L+P_b", "Primary membrane + primary bending equivalent stress", "stress", { optional: true }),
  ],
  compute(v, sys) {
    const S = req(v, "S", "S"), Sy = req(v, "Sy", "Sy"), UTS = req(v, "UTS", "UTS")
    positive(S, "S"); positive(UTS, "UTS")
    const Pm = opt(v, "Pm"), PL = opt(v, "PL"), PLPb = opt(v, "PLPb")
    if (Pm === undefined && PL === undefined && PLPb === undefined) throw new Error("Enter at least one equivalent stress to check.")
    const o = out()
    const ratio = Sy / UTS
    const low = ratio <= 0.7
    const SPL = low ? Math.max(1.5 * S, Sy) : 1.5 * S
    o.steps.push({
      title: "Eq. (5.2) — allowable limit S_PL",
      latex: [
        "S_{PL}=\\begin{cases}\\max(1.5S,\\,S_y) & \\text{for } SMYS/UTS\\le 0.7\\\\ 1.5S & \\text{for } SMYS/UTS>0.7\\end{cases}",
        `SMYS/UTS=${fmt(Sy)}/${fmt(UTS)}=${fmt(ratio, 4)}\\;${low ? "\\le" : ">"}\\;0.7`,
        low ? `S_{PL}=\\max(1.5\\times${fmt(S)},\\,${fmt(Sy)})=\\max(${fmt(1.5 * S)},\\,${fmt(Sy)})=${fmt(SPL)}` : `S_{PL}=1.5\\times${fmt(S)}=${fmt(SPL)}`,
      ],
    })
    const checks: Array<{ name: string; eq: string; val: number | undefined; lim: number; limName: string; sym: string }> = [
      { name: "General primary membrane", eq: "5.3", val: Pm, lim: S, limName: "S", sym: "P_m" },
      { name: "Local primary membrane", eq: "5.4", val: PL, lim: SPL, limName: "S_{PL}", sym: "P_L" },
      { name: "Membrane + bending", eq: "5.5", val: PLPb, lim: SPL, limName: "S_{PL}", sym: "(P_L+P_b)" },
    ]
    let ok = true
    for (const c of checks) {
      if (c.val === undefined) continue
      const pass = c.val <= c.lim
      ok &&= pass
      o.steps.push({
        title: `Eq. (${c.eq}) — ${c.name}`,
        latex: [`${c.sym}\\le ${c.limName}\\;\\Rightarrow\\;${fmt(c.val)}\\le ${fmt(c.lim)}\\;\\Rightarrow\\;\\text{${pass ? "ACCEPTABLE" : "NOT ACCEPTABLE"}}`, `\\text{utilisation}=${fmt(c.val / c.lim, 4)}`],
      })
      o.results.push({ label: `${c.name} (eq. ${c.eq})`, value: `${plain(c.val)} ≤ ${plain(c.lim)}  (ratio ${plain(c.val / c.lim, 3)})`, unit: u("stress", sys), status: pass ? "pass" : "fail" })
    }
    o.results.unshift({ label: "S_PL", latex: "S_{PL}", value: plain(SPL), unit: u("stress", sys), status: "info" })
    o.verdict = { ok, text: ok ? "All entered limits are satisfied." : "At least one limit is exceeded — modify the design or use limit-load / elastic–plastic analysis (5.2.3, 5.2.4)." }
    o.warnings.push("Q and F need not be checked for plastic collapse. For heavy-wall components (R/t ≤ 4) elastic analysis may be non-conservative — see 5.2.1.3.1.")
    return o
  },
}

const additionalLimits: CalcDef = {
  id: "bearing-shear",
  title: "Bearing and shear stress limits",
  section: "5.2.2.5",
  equations: [],
  summary: "Limits on average bearing stress (Sy or 1.5Sy) and average primary shear (0.4Sy, 0.5Sy, 0.57Sy).",
  fields: [
    num("Sy", "Sy", "S_y", "Yield strength of the material", "stress", { help: stressNote }),
    { kind: "select", key: "edge", label: "Bearing: is the distance to a free edge greater than the bearing-load distance (or a pin ≥ 3 pin diameters from the edge)?", options: [{ value: "no", label: "No — limit = Sy" }, { value: "yes", label: "Yes — limit = 1.5 Sy" }], defaultValue: "no" },
    num("bearing", "σ_bearing", "\\sigma_{br}", "Average bearing stress", "stress", { optional: true }),
    num("shearP", "τ (primary)", "\\tau_P", "Average primary shear stress (keys, shear rings, threads, free-edge shear)", "stress", { optional: true }),
    num("shearPQ", "τ (primary+secondary)", "\\tau_{P+Q}", "Average shear, primary plus secondary (bearing at free edge)", "stress", { optional: true }),
    num("torsion", "τ (torsion max)", "\\tau_T", "Maximum primary shear, solid circular section in torsion", "stress", { optional: true }),
  ],
  compute(v, sys) {
    const Sy = req(v, "Sy", "Sy"); positive(Sy, "Sy")
    const o = out(); let ok = true; let any = false
    const bearingLim = sel(v, "edge", "no") === "yes" ? 1.5 * Sy : Sy
    const items = [
      { key: "bearing", name: "Average bearing stress", lim: bearingLim, tex: sel(v, "edge", "no") === "yes" ? "1.5S_y" : "S_y" },
      { key: "shearP", name: "Average primary shear", lim: 0.4 * Sy, tex: "0.4S_y" },
      { key: "shearPQ", name: "Average shear, primary + secondary", lim: 0.5 * Sy, tex: "0.5S_y" },
      { key: "torsion", name: "Max primary shear in torsion", lim: 0.57 * Sy, tex: "0.57S_y" },
    ]
    for (const it of items) {
      const val = opt(v, it.key)
      o.results.push({ label: `${it.name} — limit`, value: plain(it.lim), unit: u("stress", sys), status: "info" })
      if (val === undefined) continue
      any = true
      const pass = val <= it.lim; ok &&= pass
      o.steps.push({ title: it.name, latex: [`${fmt(val)}\\le ${it.tex}=${fmt(it.lim)}\\;\\Rightarrow\\;\\text{${pass ? "ACCEPTABLE" : "NOT ACCEPTABLE"}}`] })
      o.results.push({ label: `${it.name} — actual`, value: `${plain(val)} (ratio ${plain(val / it.lim, 3)})`, unit: u("stress", sys), status: pass ? "pass" : "fail" })
    }
    if (any) o.verdict = { ok, text: ok ? "Entered stresses are within the 5.2.2.5 limits." : "A 5.2.2.5 limit is exceeded." }
    return o
  },
}

// ---------------------------------------------------------------------------------------------
// 5.3 — local failure
// ---------------------------------------------------------------------------------------------
const triaxial: CalcDef = {
  id: "triaxial",
  title: "Local failure — triaxial stress limit",
  section: "5.3.2",
  equations: ["5.6"],
  summary: "Algebraic sum of the three linearised primary principal stresses must not exceed 4S (Design Load Combination 1).",
  fields: [
    num("S", "S", "S", "Allowable stress", "stress", { help: stressNote }),
    num("s1", "σ1", "\\sigma_1", "Linearised primary principal stress 1", "stress"),
    num("s2", "σ2", "\\sigma_2", "Linearised primary principal stress 2", "stress"),
    num("s3", "σ3", "\\sigma_3", "Linearised primary principal stress 3", "stress"),
  ],
  compute(v, sys) {
    const S = req(v, "S", "S"), s1 = req(v, "s1", "σ1"), s2 = req(v, "s2", "σ2"), s3 = req(v, "s3", "σ3")
    positive(S, "S")
    const sum = s1 + s2 + s3, lim = 4 * S, ok = sum <= lim
    const o = out()
    o.steps.push({ title: "Eq. (5.6)", latex: ["(\\sigma_1+\\sigma_2+\\sigma_3)\\le 4S", `(${fmt(s1)}+${fmt(s2)}+${fmt(s3)})=${fmt(sum)}\\;\\le\\;4\\times${fmt(S)}=${fmt(lim)}\\;\\Rightarrow\\;\\text{${ok ? "ACCEPTABLE" : "NOT ACCEPTABLE"}}`] })
    o.results.push({ label: "σ1+σ2+σ3", value: plain(sum), unit: u("stress", sys), status: ok ? "pass" : "fail" }, { label: "Limit 4S", value: plain(lim), unit: u("stress", sys), status: "info" }, { label: "Utilisation", value: plain(sum / lim, 3), status: ok ? "pass" : "fail" })
    o.verdict = { ok, text: ok ? "Triaxial stress limit satisfied." : "Triaxial limit exceeded — use the elastic–plastic strain-limit method (5.3.3)." }
    return o
  },
}

const MATERIALS = [
  { value: "ferritic", label: "Ferritic steel (≤ 480 °C / 900 °F)", a: 0.6, b: 1.0, c4: 2, asl: 2.2 },
  { value: "stainless", label: "Stainless steel & nickel-base alloys (≤ 480 °C / 900 °F)", a: 0.75, b: 1.0, c4: 3, asl: 0.6 },
  { value: "duplex", label: "Duplex stainless steel (≤ 480 °C / 900 °F)", a: 0.7, b: 0.95, c4: 2, asl: 2.2 },
  { value: "ph-nickel", label: "Precipitation-hardening nickel austenitic (≤ 540 °C / 1000 °F)", a: 1.09, b: 0.93, c4: 1, asl: 2.2 },
  { value: "aluminum", label: "Aluminum (≤ 120 °C / 250 °F)", a: 0.52, b: 0.98, c4: 1.3, asl: 2.2 },
  { value: "copper", label: "Copper (≤ 65 °C / 150 °F)", a: 0.5, b: 1.0, c4: 2, asl: 2.2 },
  { value: "titanium", label: "Titanium & zirconium (≤ 260 °C / 500 °F)", a: 0.5, b: 0.98, c4: 1.3, asl: 2.2 },
]
const matField: Field = { kind: "select", key: "mat", label: "Material (Table 5.7)", options: MATERIALS.map((m) => ({ value: m.value, label: m.label })), defaultValue: "ferritic" }
const strainMatFields: Field[] = [
  matField,
  num("R", "R", "R", "Ratio R from eq. (3-D.11) (Annex 3-D)", "none", { help: "Defined in Annex 3-D, not in Part 5. Used only for m₂ = a(b − R) in Table 5.7.", min: 0, max: 1 }),
  num("E", "E", "E", "Specified elongation (leave blank if not specified)", "percent", { optional: true, min: 0 }),
  num("RA", "RA", "R_A", "Specified reduction of area (leave blank if not specified)", "percent", { optional: true, min: 0, max: 99.9 }),
]
function strainProps(v: Values) {
  const m = MATERIALS.find((x) => x.value === sel(v, "mat", "ferritic")) ?? MATERIALS[0]
  const R = req(v, "R", "R")
  const m2 = m.a * (m.b - R)
  const E = opt(v, "E"), RA = opt(v, "RA")
  const cands: Array<{ name: string; val: number }> = [{ name: "m₂ (column 3)", val: m2 }]
  if (E !== undefined) cands.push({ name: "elongation (column 4)", val: m.c4 * Math.log(1 + E / 100) })
  if (RA !== undefined) cands.push({ name: "reduction of area (column 5)", val: Math.log(100 / (100 - RA)) })
  const best = cands.reduce((a, b) => (b.val > a.val ? b : a))
  const eLu = E === undefined && RA === undefined ? m2 : best.val
  return { m, R, m2, E, RA, eLu, basis: E === undefined && RA === undefined ? "m₂ (elongation and RA not specified)" : best.name }
}

const strainLimit: CalcDef = {
  id: "strain-limit",
  title: "Local failure — local strain limit (one load case)",
  section: "5.3.3.1",
  equations: ["5.7", "5.8"],
  summary: "Limiting triaxial strain ε_L versus equivalent plastic strain plus forming strain.",
  fields: [
    ...strainMatFields,
    { kind: "group", label: "Result at the point being checked (elastic–plastic analysis)" },
    num("s1", "σ1", "\\sigma_1", "Principal stress 1", "stress", { help: stressNote }),
    num("s2", "σ2", "\\sigma_2", "Principal stress 2", "stress"),
    num("s3", "σ3", "\\sigma_3", "Principal stress 3", "stress"),
    num("epeq", "ε_peq", "\\varepsilon_{peq}", "Equivalent plastic strain", "strain", { min: 0 }),
    num("ecf", "ε_cf", "\\varepsilon_{cf}", "Forming strain (0 if heat-treated per Part 6)", "strain", { optional: true, min: 0, defaultValue: 0 }),
  ],
  compute(v, sys) {
    const p = strainProps(v)
    const s1 = req(v, "s1", "σ1"), s2 = req(v, "s2", "σ2"), s3 = req(v, "s3", "σ3")
    const epeq = req(v, "epeq", "ε_peq"), ecf = opt(v, "ecf") ?? 0
    const se = vonMises(s1, s2, s3)
    if (!(se > 0)) throw new Error("The equivalent stress is zero — the limit cannot be evaluated.")
    const trix = (s1 + s2 + s3) / (3 * se)
    const eL = p.eLu * Math.exp(-(p.m.asl / (1 + p.m2)) * (trix - 1 / 3))
    const total = epeq + ecf, ok = total <= eL
    const o = out()
    o.steps.push(
      { title: "Table 5.7 — uniaxial strain limit ε_Lu", latex: [`m_2=${p.m.a}\\,(${p.m.b}-R)=${p.m.a}\\,(${p.m.b}-${fmt(p.R)})=${fmt(p.m2)}`, `\\varepsilon_{Lu}=${fmt(p.eLu)}\\;(\\text{basis: ${p.basis}}),\\quad \\alpha_{sl}=${p.m.asl}`] },
      { title: "Eq. (5.1) — equivalent stress", latex: [`\\sigma_e=${fmt(se)}`] },
      { title: "Eq. (5.7) — limiting triaxial strain", latex: ["\\varepsilon_L=\\varepsilon_{Lu}\\exp\\left\\{-\\left(\\frac{\\alpha_{sl}}{1+m_2}\\right)\\left[\\frac{\\sigma_1+\\sigma_2+\\sigma_3}{3\\sigma_e}-\\frac13\\right]\\right\\}", `\\frac{\\sigma_1+\\sigma_2+\\sigma_3}{3\\sigma_e}=${fmt(trix)}`, `\\varepsilon_L=${fmt(p.eLu)}\\exp\\{-(${p.m.asl}/${fmt(1 + p.m2)})(${fmt(trix)}-0.3333)\\}=${fmt(eL)}`] },
      { title: "Eq. (5.8) — strain check", latex: ["\\varepsilon_{peq}+\\varepsilon_{cf}\\le\\varepsilon_L", `${fmt(epeq)}+${fmt(ecf)}=${fmt(total)}\\;\\le\\;${fmt(eL)}\\;\\Rightarrow\\;\\text{${ok ? "ACCEPTABLE" : "NOT ACCEPTABLE"}}`] },
    )
    o.results.push({ label: "ε_Lu", latex: "\\varepsilon_{Lu}", value: plain(p.eLu), unit: u("strain", sys), status: "info" }, { label: "σ_e", latex: "\\sigma_e", value: plain(se), unit: u("stress", sys), status: "info" }, { label: "ε_L", latex: "\\varepsilon_L", value: plain(eL), unit: u("strain", sys), status: "info" }, { label: "ε_peq + ε_cf", value: plain(total), unit: u("strain", sys), status: ok ? "pass" : "fail" }, { label: "Utilisation", value: plain(total / eL, 3), status: ok ? "pass" : "fail" })
    o.verdict = { ok, text: ok ? "Local strain limit satisfied for this load case." : "Local strain limit exceeded." }
    return o
  },
}

const strainDamage: CalcDef = {
  id: "strain-damage",
  title: "Local failure — strain-limit damage over a load sequence",
  section: "5.3.3.2",
  equations: ["5.9", "5.10", "5.11", "5.12"],
  summary: "Accumulates strain-limit damage over load increments plus forming damage; must not exceed 1.0.",
  fields: [
    ...strainMatFields,
    num("ecf", "ε_cf", "\\varepsilon_{cf}", "Forming strain (0 if heat-treated per Part 6)", "strain", { optional: true, min: 0, defaultValue: 0 }),
    { kind: "table", key: "inc", label: "Load increments k = 1 … M", help: "Principal stresses and the change in equivalent plastic strain for each increment.", minRows: 2,
      columns: [
        { key: "s1", symbol: "σ1,k", latex: "\\sigma_{1,k}", label: "Principal stress 1", unit: "stress" },
        { key: "s2", symbol: "σ2,k", latex: "\\sigma_{2,k}", label: "Principal stress 2", unit: "stress" },
        { key: "s3", symbol: "σ3,k", latex: "\\sigma_{3,k}", label: "Principal stress 3", unit: "stress" },
        { key: "de", symbol: "Δε_peq,k", latex: "\\Delta\\varepsilon_{peq,k}", label: "Change in equivalent plastic strain", unit: "strain" },
      ] },
  ],
  compute(v, sys) {
    const p = strainProps(v)
    const ecf = opt(v, "ecf") ?? 0
    const inc = rows(v, "inc")
    if (inc.length === 0) throw new Error("Enter at least one load increment.")
    const o = out()
    const Dform = ecf / (p.eLu * Math.exp(-(1 / 3) * (p.m.asl / (1 + p.m2))))
    o.steps.push({ title: "Eq. (5.11) — forming damage", latex: ["D_{\\varepsilon form}=\\frac{\\varepsilon_{cf}}{\\varepsilon_{Lu}\\exp\\left[-\\frac13\\left(\\frac{\\alpha_{sl}}{1+m_2}\\right)\\right]}", `D_{\\varepsilon form}=${fmt(Dform)}\\quad(\\varepsilon_{Lu}=${fmt(p.eLu)},\\;m_2=${fmt(p.m2)},\\;\\alpha_{sl}=${p.m.asl})`] })
    let sum = 0
    inc.forEach((r, i) => {
      const se = vonMises(r.s1, r.s2, r.s3)
      if (!(se > 0)) throw new Error(`Increment ${i + 1}: equivalent stress is zero.`)
      const eLk = p.eLu * Math.exp(-(p.m.asl / (1 + p.m2)) * ((r.s1 + r.s2 + r.s3) / (3 * se) - 1 / 3))
      const Dk = (r.de ?? 0) / eLk
      sum += Dk
      o.steps.push({ title: `Increment k = ${i + 1}`, latex: [`\\sigma_{e,k}=${fmt(se)},\\quad \\varepsilon_{L,k}=${fmt(eLk)}\\;\\text{(eq. 5.9)}`, `D_{\\varepsilon,k}=\\frac{\\Delta\\varepsilon_{peq,k}}{\\varepsilon_{L,k}}=\\frac{${fmt(r.de ?? 0)}}{${fmt(eLk)}}=${fmt(Dk)}\\;\\text{(eq. 5.10)}`] })
    })
    const D = Dform + sum, ok = D <= 1
    o.steps.push({ title: "Eq. (5.12) — accumulated damage", latex: ["D_\\varepsilon=D_{\\varepsilon form}+\\sum_{k=1}^{M}D_{\\varepsilon,k}\\le 1.0", `D_\\varepsilon=${fmt(Dform)}+${fmt(sum)}=${fmt(D)}\\;\\Rightarrow\\;\\text{${ok ? "ACCEPTABLE" : "NOT ACCEPTABLE"}}`] })
    o.results.push({ label: "Forming damage", value: plain(Dform), status: "info" }, { label: "Σ increment damage", value: plain(sum), status: "info" }, { label: "D_ε total", value: plain(D), status: ok ? "pass" : "fail" })
    o.verdict = { ok, text: ok ? "Accumulated strain-limit damage is within 1.0." : "Accumulated strain-limit damage exceeds 1.0." }
    void sys
    return o
  },
}

// ---------------------------------------------------------------------------------------------
// 5.4 — buckling, Method A
// ---------------------------------------------------------------------------------------------
export function betaCr(kind: string, DoOverT?: number): { beta: number; eq: string } {
  if (kind === "cyl-axial") return DoOverT !== undefined && DoOverT >= 1247 ? { beta: 0.207, eq: "5.14" } : { beta: 338 / (389 + (DoOverT ?? 0)), eq: "5.15" }
  if (kind === "cyl-hoop") return { beta: 0.8, eq: "5.16" }
  return { beta: 0.124, eq: "5.17" }
}
const bucklingA: CalcDef = {
  id: "buckling-a",
  title: "Buckling — Method A (one load case)",
  section: "5.4.2",
  equations: ["5.13", "5.14", "5.15", "5.16", "5.17"],
  summary: "Capacity reduction factor β_cr, allowable buckling membrane stress S_c,k and the P_m,k ≤ S_c,k check.",
  fields: [
    { kind: "select", key: "loc", label: "Critical buckling location (from the eigenmode)", defaultValue: "cyl-axial", options: [{ value: "cyl-axial", label: "Cylinder or cone — axial stress component" }, { value: "cyl-hoop", label: "Cylinder or cone — hoop stress component" }, { value: "sphere", label: "Sphere or formed head" }] },
    num("Do", "Do", "D_o", "Outside diameter (axial case only)", "length", { optional: true }),
    num("t", "t", "t", "Wall thickness (axial case only)", "length", { optional: true }),
    num("Sy", "Sy", "S_y", "Yield strength at the temperature", "stress", { help: stressNote }),
    num("sEig", "σ_eig", "\\sigma_{eig}", "Step 3: equivalent membrane stress at the critical location, from the analysis with loads × eigenvalue", "stress"),
    num("Pmk", "Pm,k", "P_{m,k}", "Step 5: equivalent membrane stress at the critical location with β_b = 1.0", "stress"),
  ],
  compute(v, sys) {
    const loc = sel(v, "loc", "cyl-axial")
    const Sy = req(v, "Sy", "Sy"), sEig = req(v, "sEig", "σ_eig"), Pmk = req(v, "Pmk", "Pm,k")
    positive(Sy, "Sy")
    let ratio: number | undefined
    if (loc === "cyl-axial") {
      const Do = req(v, "Do", "Do"), t = req(v, "t", "t"); positive(t, "t"); ratio = Do / t
    }
    const { beta, eq } = betaCr(loc, ratio)
    const o = out()
    const lines = loc === "cyl-axial"
      ? [`D_o/t=${fmt(ratio ?? 0)}`, ratio! >= 1247 ? "\\beta_{cr}=0.207\\quad(D_o/t\\ge1247)\\;\\text{(eq. 5.14)}" : `\\beta_{cr}=\\frac{338}{389+D_o/t}=\\frac{338}{389+${fmt(ratio!)}}=${fmt(beta, 4)}\\;\\text{(eq. 5.15)}`]
      : [loc === "cyl-hoop" ? "\\beta_{cr}=0.80\\;\\text{(eq. 5.16)}" : "\\beta_{cr}=0.124\\;\\text{(eq. 5.17)}"]
    o.steps.push({ title: `Capacity reduction factor (eq. ${eq})`, latex: lines })
    const sCrit = sEig * beta
    const within = sCrit <= 0.55 * Sy
    const Sc = within ? sCrit / 2 : (0.55 * Sy) / 2
    o.steps.push(
      { title: "Step 3/4 — σ_crit", latex: [`\\sigma_{crit}=\\beta_{cr}\\,\\sigma_{eig}=${fmt(beta, 4)}\\times${fmt(sEig)}=${fmt(sCrit)}`, `0.55S_y=${fmt(0.55 * Sy)}`] },
      { title: "Step 4 — allowable S_c,k (design margin 2.0)", latex: within ? [`\\sigma_{crit}\\le0.55S_y\\Rightarrow S_{c,k}=\\sigma_{crit}/2.0=${fmt(Sc)}`] : [`\\sigma_{crit}>0.55S_y\\Rightarrow S_{c,k}=0.55S_y/2=${fmt(Sc)}\\;\\text{(or use Method B)}`] },
    )
    const ok = Pmk <= Sc
    o.steps.push({ title: "Eq. (5.13) — check", latex: ["P_{m,k}\\le S_{c,k}", `${fmt(Pmk)}\\le${fmt(Sc)}\\;\\Rightarrow\\;\\text{${ok ? "ACCEPTABLE" : "NOT ACCEPTABLE"}}`] })
    o.results.push({ label: "β_cr", latex: "\\beta_{cr}", value: plain(beta, 4), status: "info" }, { label: "σ_crit", value: plain(sCrit), unit: u("stress", sys), status: "info" }, { label: "S_c,k", latex: "S_{c,k}", value: plain(Sc), unit: u("stress", sys), status: "info" }, { label: "P_m,k ≤ S_c,k", value: `${plain(Pmk)} ≤ ${plain(Sc)}  (ratio ${plain(Pmk / Sc, 3)})`, unit: u("stress", sys), status: ok ? "pass" : "fail" })
    o.verdict = { ok, text: ok ? "Method A buckling check satisfied for this load case." : "Not satisfied — modify the component or use Method B (5.4.3)." }
    o.warnings.push("Method A is limited to the cases in 5.4.2.2 Step 3 (cylinder/cone, sphere/formed head); otherwise Method B applies. Load cases come from Table 5.15.")
    return o
  },
}

// ---------------------------------------------------------------------------------------------
// 5.5.3 — fatigue screening
// ---------------------------------------------------------------------------------------------
export function tempFactor(dT: number, sys: UnitSystem): number {
  const c = sys === "SI" ? dT : (dT * 5) / 9 // Table 5.8 bands are given in both; convert to °C difference
  if (sys === "US") {
    if (dT <= 50) return 0; if (dT <= 100) return 1; if (dT <= 150) return 2; if (dT <= 250) return 4; if (dT <= 350) return 8; if (dT <= 450) return 12; return 20
  }
  if (c <= 28) return 0; if (c <= 56) return 1; if (c <= 83) return 2; if (c <= 139) return 4; if (c <= 194) return 8; if (c <= 250) return 12; return 20
}
const screeningA: CalcDef = {
  id: "screening-a",
  title: "Fatigue screening — Method A",
  section: "5.5.3.3",
  equations: [],
  summary: "Counts cycles (with the Table 5.8 temperature factors) and compares with the Table 5.9 limit.",
  fields: [
    { kind: "select", key: "constr", label: "Type of construction", defaultValue: "integral", options: [{ value: "integral", label: "Integral construction" }, { value: "nonintegral", label: "Nonintegral construction" }] },
    { kind: "select", key: "comp", label: "Component", defaultValue: "other", options: [{ value: "knuckle", label: "Attachments & nozzles in the knuckle region of formed heads" }, { value: "other", label: "All other components" }] },
    num("UTS", "UTS", "S_u", "Specified minimum tensile strength (Method A only for ≤ 552 MPa / 80 ksi)", "stress", { optional: true }),
    num("NFP", "NΔFP", "N_{\\Delta FP}", "Full-range pressure cycles incl. start-up/shutdown/emergency", "cycles", { min: 0 }),
    num("NPO", "NΔPO", "N_{\\Delta PO}", "Significant operating pressure cycles (see 5.5.3.2(a))", "cycles", { min: 0 }),
    num("NTa", "NΔTα", "N_{\\Delta T\\alpha}", "Cycles with (α1 − α2)×ΔT > 0.00034 between different materials", "cycles", { optional: true, min: 0, defaultValue: 0 }),
    { kind: "table", key: "dT", label: "Metal-temperature differences between adjacent points", help: "Enter each ΔT and its number of cycles; Table 5.8 gives the factor.", minRows: 1,
      columns: [{ key: "dT", symbol: "ΔT", latex: "\\Delta T", label: "Temperature difference", unit: "temperature" }, { key: "n", symbol: "n", latex: "n", label: "Number of cycles", unit: "cycles" }] },
  ],
  compute(v, sys) {
    const constr = sel(v, "constr", "integral"), comp = sel(v, "comp", "other")
    const NFP = req(v, "NFP", "NΔFP"), NPO = req(v, "NPO", "NΔPO"), NTa = opt(v, "NTa") ?? 0
    const o = out()
    let NTE = 0
    const trows = rows(v, "dT")
    trows.forEach((r, i) => {
      const f = tempFactor(r.dT ?? 0, sys)
      NTE += f * (r.n ?? 0)
      o.steps.push({ title: `ΔT row ${i + 1} (Table 5.8)`, latex: [`\\Delta T=${fmt(r.dT ?? 0)}\\,${u("temperature", sys)}\\Rightarrow \\text{factor}=${f};\\quad ${f}\\times${fmt(r.n ?? 0)}=${fmt(f * (r.n ?? 0))}`] })
    })
    const limit = constr === "integral" ? (comp === "knuckle" ? 350 : 1000) : comp === "knuckle" ? 60 : 400
    const total = NFP + NPO + NTE + NTa, ok = total <= limit
    o.steps.push({ title: "Table 5.9 — screening criterion", latex: ["N_{\\Delta FP}+N_{\\Delta PO}+N_{\\Delta TE}+N_{\\Delta T\\alpha}\\le N_{limit}", `${fmt(NFP)}+${fmt(NPO)}+${fmt(NTE)}+${fmt(NTa)}=${fmt(total)}\\;${ok ? "\\le" : ">"}\\;${limit}\\;\\Rightarrow\\;\\text{${ok ? "FATIGUE ANALYSIS NOT REQUIRED" : "FATIGUE ANALYSIS REQUIRED"}}`] })
    o.results.push({ label: "N_ΔTE (effective temperature cycles)", value: plain(NTE), unit: "cycles", status: "info" }, { label: "Total cycles", value: plain(total), unit: "cycles", status: ok ? "pass" : "fail" }, { label: "Table 5.9 limit", value: String(limit), unit: "cycles", status: "info" })
    o.verdict = { ok, text: ok ? "Method A screening satisfied — a detailed fatigue analysis is not required." : "Screening not satisfied — perform Method B/C screening or a fatigue analysis (5.5.4)." }
    const uts = opt(v, "UTS")
    if (uts !== undefined && uts > (sys === "SI" ? 552 : 80)) o.warnings.push("UTS exceeds 552 MPa (80 ksi): Method A may not be used for this material (5.5.3.3.1).")
    if (NFP + NPO > 1e6) o.warnings.push("More than 10⁶ significant cycles: screening criteria are not applicable (5.5.3.2(d)).")
    o.warnings.push("Method A applies only to steel and only to cyclic pressure and temperature loads — not to externally applied cyclic loads (e.g. agitator loads).")
    return o
  },
}

const lfs: CalcDef = {
  id: "adjacent-distance",
  title: "Adjacent-point distance L_fs",
  section: "5.5.3.3.1",
  equations: ["5.18", "5.19"],
  summary: "Distance within which two points count as adjacent for surface temperature differences.",
  fields: [
    { kind: "select", key: "geo", label: "Geometry", defaultValue: "shell", options: [{ value: "shell", label: "Shell or dished head (meridional / circumferential)" }, { value: "flat", label: "Flat plate with a hot spot" }] },
    num("R", "R", "R", "Shell: mean radius of curvature", "length", { optional: true }),
    num("t", "t", "t", "Shell: wall thickness", "length", { optional: true }),
    num("RHS", "R_HS", "R_{HS}", "Flat plate: radius of the hot spot / heated area", "length", { optional: true }),
  ],
  compute(v, sys) {
    const o = out()
    if (sel(v, "geo", "shell") === "shell") {
      const R = req(v, "R", "R"), t = req(v, "t", "t"); positive(R, "R"); positive(t, "t")
      const L = 2.5 * Math.sqrt(R * t)
      o.steps.push({ title: "Eq. (5.18)", latex: ["L_{fs}=2.5\\sqrt{Rt}", `L_{fs}=2.5\\sqrt{${fmt(R)}\\times${fmt(t)}}=${fmt(L)}`] })
      o.results.push({ label: "L_fs", latex: "L_{fs}", value: plain(L), unit: u("length", sys), status: "info" })
    } else {
      const r = req(v, "RHS", "R_HS"); positive(r, "R_HS")
      o.steps.push({ title: "Eq. (5.19)", latex: ["L_{fs}=3.5R_{HS}", `L_{fs}=3.5\\times${fmt(r)}=${fmt(3.5 * r)}`] })
      o.results.push({ label: "L_fs", latex: "L_{fs}", value: plain(3.5 * r), unit: u("length", sys), status: "info" })
    }
    return o
  },
}

const screeningB: CalcDef = {
  id: "screening-b",
  title: "Fatigue screening — Method B (smooth-bar curve)",
  section: "5.5.3.4",
  equations: ["5.20", "5.21", "5.22", "5.23", "5.24", "5.25", "5.26"],
  summary: "Stress amplitudes for each damage term; enter N from the Annex 3-F.1 curve to get damage and the D_f ≤ 1.0 check.",
  fields: [
    { kind: "group", label: "Construction factors (Table 5.10)" },
    { kind: "select", key: "kfbType", label: "Kfb construction", defaultValue: "welded", options: [{ value: "welded", label: "Integral welded — enter Kfb from Tables 5.12/5.13 (max 3.0)" }, { value: "nonwelded", label: "Integral nonwelded — Kfb = 1.0" }, { value: "nonintegral", label: "Nonintegral — Kfb = 3.0" }] },
    num("kfbW", "Kfb", "K_{fb}", "Kfb for integral welded construction", "none", { optional: true, min: 1 }),
    { kind: "select", key: "hc", label: "Hc", defaultValue: "1", options: [{ value: "1.35", label: "Attachments/nozzles in knuckle region of formed head or toriconical transition — 1.35" }, { value: "1", label: "All other attachments — 1.0" }] },
    num("S", "S", "S", "Allowable stress (design temperature)", "stress", { help: stressNote }),
    num("P", "P", "P", "Specified design pressure", "pressure", { optional: true }),
    { kind: "group", label: "D_FP — full-range pressure cycles (eq. 5.20)" },
    num("nFP", "NΔFP", "N_{\\Delta FP}", "Design number of full-range pressure cycles", "cycles", { optional: true }),
    num("NFP", "N(…)", "N", "Permissible cycles at the amplitude shown after calculation (Annex 3-F.1)", "cycles", { optional: true }),
    { kind: "group", label: "D_PN — pressure fluctuation in normal operation (eq. 5.21)" },
    num("dPN", "ΔPN", "\\Delta P_N", "Maximum pressure range in normal operation", "pressure", { optional: true }),
    num("nPN", "NΔP", "N_{\\Delta P}", "Significant cycles", "cycles", { optional: true }),
    num("NPN", "N(…)", "N", "Permissible cycles at the amplitude shown", "cycles", { optional: true }),
    { kind: "group", label: "D_TN / D_TR — temperature difference (eq. 5.22, 5.23)" },
    num("Eym", "Eym", "E_{ym}", "Young’s modulus at the mean cycle temperature", "modulus", { optional: true }),
    num("ab", "αb", "\\alpha_b", "Thermal expansion coefficient at the mean temperature of adjacent points", "expansion", { optional: true }),
    num("dTN", "ΔTN", "\\Delta T_N", "Start-up/shutdown max temperature difference", "temperature", { optional: true }),
    num("nTN", "NΔTN", "N_{\\Delta TN}", "Cycles", "cycles", { optional: true }),
    num("NTN", "N(…)", "N", "Permissible cycles at the amplitude shown", "cycles", { optional: true }),
    num("dTR", "ΔTR", "\\Delta T_R", "Normal-operation max temperature difference", "temperature", { optional: true }),
    num("nTR", "NΔTR", "N_{\\Delta TR}", "Significant cycles", "cycles", { optional: true }),
    num("NTR", "N(…)", "N", "Permissible cycles at the amplitude shown", "cycles", { optional: true }),
    { kind: "group", label: "D_TM — dissimilar materials (eq. 5.24)" },
    num("Ey1", "Ey1", "E_{y1}", "Modulus, material 1", "modulus", { optional: true }),
    num("a1", "α1", "\\alpha_1", "Expansion coefficient, material 1", "expansion", { optional: true }),
    num("Ey2", "Ey2", "E_{y2}", "Modulus, material 2", "modulus", { optional: true }),
    num("a2", "α2", "\\alpha_2", "Expansion coefficient, material 2", "expansion", { optional: true }),
    num("dTM", "ΔTM", "\\Delta T_M", "Max temperature range between the two materials", "temperature", { optional: true }),
    num("nTM", "NΔTM", "N_{\\Delta TM}", "Significant cycles", "cycles", { optional: true }),
    num("NTM", "N(…)", "N", "Permissible cycles at the amplitude shown", "cycles", { optional: true }),
    { kind: "group", label: "D_ML — mechanical loads excluding pressure (eq. 5.25)" },
    num("dSML", "ΔSML", "\\Delta S_{ML}", "Equivalent stress range from full-range mechanical loads", "stress", { optional: true }),
    num("nML", "NΔS", "N_{\\Delta S}", "Significant cycles", "cycles", { optional: true }),
    num("NML", "N(…)", "N", "Permissible cycles at the amplitude shown", "cycles", { optional: true }),
  ],
  compute(v, sys) {
    const kt = sel(v, "kfbType", "welded")
    const Kfb = kt === "nonwelded" ? 1 : kt === "nonintegral" ? 3 : Math.min(3, req(v, "kfbW", "Kfb"))
    const Hc = Number(sel(v, "hc", "1"))
    const S = req(v, "S", "S"); positive(S, "S")
    const o = out()
    o.steps.push({ title: "Factors", latex: [`K_{fb}=${fmt(Kfb)},\\quad H_c=${fmt(Hc)},\\quad 3S=${fmt(3 * S)}`] })
    type Term = { name: string; tag: string; eq: string; amp?: number; ampTex: string; n?: number; N?: number }
    const terms: Term[] = []
    const nFP = opt(v, "nFP")
    if (nFP !== undefined) { const a = (Kfb * Hc * 3 * S) / 2; terms.push({ name: "D_FP", tag: "FP", eq: "5.20", amp: a, ampTex: `S_{alt}=\\frac{K_{fb}H_c(3S)}{2}=\\frac{${fmt(Kfb)}\\times${fmt(Hc)}\\times${fmt(3 * S)}}{2}=${fmt(a)}`, n: nFP, N: opt(v, "NFP") }) }
    const dPN = opt(v, "dPN"), nPN = opt(v, "nPN")
    if (dPN !== undefined && nPN !== undefined) { const P = req(v, "P", "P"); positive(P, "P"); const a = (dPN * Kfb * Hc * 3 * S) / (2 * P); terms.push({ name: "D_PN", tag: "PN", eq: "5.21", amp: a, ampTex: `S_{alt}=\\frac{\\Delta P_N K_{fb}H_c(3S)}{2P}=${fmt(a)}`, n: nPN, N: opt(v, "NPN") }) }
    const Eym = opt(v, "Eym"), ab = opt(v, "ab")
    for (const [t, eq, tag] of [["TN", "5.22", "TN"], ["TR", "5.23", "TR"]] as const) {
      const dT = opt(v, `d${t}`), n = opt(v, `n${t}`)
      if (dT !== undefined && n !== undefined) {
        if (Eym === undefined || ab === undefined) throw new Error("Enter Eym and αb for the temperature-difference terms.")
        const a = (Kfb * Hc * 2 * Eym * ab * dT) / 2
        terms.push({ name: `D_${t}`, tag, eq, amp: a, ampTex: `S_{alt}=\\frac{K_{fb}H_c(2E_{ym}\\alpha_b\\Delta T_{${t.slice(1)}})}{2}=${fmt(a)}`, n, N: opt(v, `N${t}`) })
      }
    }
    const dTM = opt(v, "dTM"), nTM = opt(v, "nTM")
    if (dTM !== undefined && nTM !== undefined) {
      const E1 = req(v, "Ey1", "Ey1"), a1 = req(v, "a1", "α1"), E2 = req(v, "Ey2", "Ey2"), a2 = req(v, "a2", "α2")
      const a = (Kfb * Hc * (2 * E1 * a1 * dTM - 2 * E2 * a2 * dTM)) / 2
      terms.push({ name: "D_TM", tag: "TM", eq: "5.24", amp: a, ampTex: `S_{alt}=\\frac{K_{fb}H_c(2E_{y1}\\alpha_1\\Delta T_M-2E_{y2}\\alpha_2\\Delta T_M)}{2}=${fmt(a)}`, n: nTM, N: opt(v, "NTM") })
    }
    const dSML = opt(v, "dSML"), nML = opt(v, "nML")
    if (dSML !== undefined && nML !== undefined) { const a = (Kfb * Hc * dSML) / 2; terms.push({ name: "D_ML", tag: "ML", eq: "5.25", amp: a, ampTex: `S_{alt}=\\frac{K_{fb}H_c\\Delta S_{ML}}{2}=${fmt(a)}`, n: nML, N: opt(v, "NML") }) }
    if (terms.length === 0) throw new Error("Fill in at least one damage term (cycles and its inputs).")
    let Df = 0, complete = true
    for (const t of terms) {
      const dmg = t.N !== undefined && t.N > 0 ? (t.n ?? 0) / t.N : undefined
      if (dmg === undefined) complete = false; else Df += dmg
      o.steps.push({ title: `${t.name} — eq. (${t.eq})`, latex: [t.ampTex, dmg === undefined ? "\\text{Read } N \\text{ from the Annex 3-F.1 smooth-bar curve at this amplitude, then re-calculate.}" : `${t.name}=\\frac{n}{N}=\\frac{${fmt(t.n ?? 0)}}{${fmt(t.N!)}}=${fmt(dmg)}`] })
      o.results.push({ label: `${t.name} amplitude`, value: plain(t.amp ?? 0), unit: t.tag === "FP" || t.tag === "PN" || t.tag === "ML" || t.tag === "TN" || t.tag === "TR" || t.tag === "TM" ? u("stress", sys) : "", status: "info" })
      if (dmg !== undefined) o.results.push({ label: t.name, value: plain(dmg), status: "info" })
    }
    if (complete) {
      const ok = Df <= 1
      o.steps.push({ title: "Eq. (5.26) — total damage", latex: ["D_f=D_{FP}+D_{PN}+D_{TN}+D_{TR}+D_{TM}+D_{ML}\\le 1.0", `D_f=${fmt(Df)}\\;\\Rightarrow\\;\\text{${ok ? "DETAILED FATIGUE ANALYSIS NOT REQUIRED" : "FATIGUE ANALYSIS REQUIRED"}}`] })
      o.results.push({ label: "D_f", value: plain(Df), status: ok ? "pass" : "fail" })
      o.verdict = { ok, text: ok ? "Method B screening satisfied." : "D_f exceeds 1.0 — perform a fatigue analysis (5.5.4)." }
    } else o.warnings.push("Enter the permissible cycles N for every term (from the Annex 3-F.1 curve at the amplitudes shown) to obtain D_f.")
    return o
  },
}

// ---------------------------------------------------------------------------------------------
// 5.5.4 — elastic fatigue (Method A)
// ---------------------------------------------------------------------------------------------
const KE_MATS = [
  { value: "low-alloy", label: "Low alloy steel", m: 2.0, n: 0.2, tc: 371, tf: 700 },
  { value: "martensitic", label: "Martensitic stainless steel", m: 2.0, n: 0.2, tc: 371, tf: 700 },
  { value: "carbon", label: "Carbon steel", m: 3.0, n: 0.2, tc: 371, tf: 700 },
  { value: "austenitic", label: "Austenitic stainless steel", m: 1.7, n: 0.3, tc: 427, tf: 800 },
  { value: "ni-cr-fe", label: "Nickel-chromium-iron", m: 1.7, n: 0.3, tc: 427, tf: 800 },
  { value: "ni-cu", label: "Nickel-copper", m: 1.7, n: 0.3, tc: 427, tf: 800 },
]
export function fatiguePenalty(dS: number, SPS: number, m: number, n: number): { Ke: number; eq: string } {
  if (dS <= SPS) return { Ke: 1, eq: "5.43" }
  if (dS <= m * SPS) return { Ke: 1 + ((1 - n) / (n * (m - 1))) * (dS / SPS - 1), eq: "5.44" }
  return { Ke: 1 / n, eq: "5.45" }
}
const fatigueElastic: CalcDef = {
  id: "fatigue-elastic",
  title: "Fatigue analysis — elastic stress, one cycle",
  section: "5.5.4.2",
  equations: ["5.41", "5.42", "5.43", "5.44", "5.45", "5.46", "5.47", "5.48", "5.49"],
  summary: "Fatigue penalty factor K_e (Table 5.14), alternating stress S_alt, and damage n/N for a cycle.",
  fields: [
    { kind: "select", key: "mat", label: "Material (Table 5.14)", options: KE_MATS.map((m) => ({ value: m.value, label: m.label })), defaultValue: "carbon" },
    { kind: "select", key: "option", label: "Option (5.5.4.2.2 Step 4)", defaultValue: "1", options: [{ value: "1", label: "Option 1 — local thermal stress not separated" }, { value: "2", label: "Option 2 — local thermal stress separated" }] },
    { kind: "group", label: "Stress ranges for the k-th cycle (eq. 5.36 – 5.40)" },
    num("dSp", "ΔSp (or ΔSP−LT)", "\\Delta S_{P,k}", "Primary+secondary+peak equivalent stress range (Option 2: minus the local thermal range, ΔSP−LT)", "stress", { help: stressNote }),
    num("dSn", "ΔSn", "\\Delta S_{n,k}", "Primary+secondary equivalent stress range, linearised (eq. 5.37)", "stress"),
    num("dSlt", "ΔSLT", "\\Delta S_{LT,k}", "Option 2 only: local thermal equivalent stress range (eq. 5.38)", "stress", { optional: true }),
    { kind: "group", label: "Ratcheting limit S_PS,k (eq. 5.95)" },
    num("SyC", "Sy-cold", "S_{y\\text{-}cold,k}", "Yield strength at the cold (lowest) temperature of the cycle", "stress"),
    num("SyH", "Sy-hot", "S_{y\\text{-}hot,k}", "Yield strength at the hot (highest) temperature of the cycle", "stress"),
    { kind: "group", label: "Option 2 Poisson correction (eq. 5.46, 5.47)" },
    num("nu", "ν", "\\nu", "Poisson’s ratio", "none", { optional: true, defaultValue: 0.3 }),
    num("Syk", "Sy,k", "S_{y,k}", "Yield strength at the mean cycle temperature", "stress", { optional: true }),
    num("Sak", "Sa,k", "S_{a,k}", "Alternating stress from the design fatigue curve at the specified number of cycles", "stress", { optional: true }),
    { kind: "group", label: "Life (eq. 5.48)" },
    num("nk", "nk", "n_k", "Actual repetitions of this cycle", "cycles", { optional: true }),
    num("Nk", "Nk", "N_k", "Permissible cycles at S_alt from the Annex 3-F.1 curve", "cycles", { optional: true }),
    num("Tmax", "Tmax", "T_{max}", "Maximum temperature in the cycle (checked against Table 5.14)", "temperature", { optional: true }),
    num("smys", "SMYS", "SMYS", "Specified minimum yield strength (for the SMYS/UTS ≤ 0.80 check)", "stress", { optional: true }),
    num("uts", "UTS", "UTS", "Specified minimum tensile strength", "stress", { optional: true }),
  ],
  compute(v, sys) {
    const mat = KE_MATS.find((m) => m.value === sel(v, "mat", "carbon")) ?? KE_MATS[2]
    const option = sel(v, "option", "1")
    const dSp = req(v, "dSp", "ΔSp"), dSn = req(v, "dSn", "ΔSn")
    const SyC = req(v, "SyC", "Sy-cold"), SyH = req(v, "SyH", "Sy-hot")
    const o = out()
    const SPS = SyC + SyH
    o.steps.push({ title: "Eq. (5.95) — S_PS,k", latex: ["S_{PS,k}=S_{y\\text{-}cold,k}+S_{y\\text{-}hot,k}", `S_{PS,k}=${fmt(SyC)}+${fmt(SyH)}=${fmt(SPS)}`] })
    const { Ke, eq } = fatiguePenalty(dSn, SPS, mat.m, mat.n)
    const keLine = eq === "5.43" ? `\\Delta S_{n,k}=${fmt(dSn)}\\le S_{PS,k}\\Rightarrow K_e=1.0` : eq === "5.44" ? `K_e=1+\\frac{1-n}{n(m-1)}\\left(\\frac{\\Delta S_{n,k}}{S_{PS,k}}-1\\right)=1+\\frac{${fmt(1 - mat.n)}}{${fmt(mat.n * (mat.m - 1))}}\\left(\\frac{${fmt(dSn)}}{${fmt(SPS)}}-1\\right)=${fmt(Ke)}` : `\\Delta S_{n,k}>mS_{PS,k}\\Rightarrow K_e=\\frac1n=${fmt(Ke)}`
    o.steps.push({ title: `Eq. (${eq}) — fatigue penalty factor (Table 5.14: m = ${mat.m}, n = ${mat.n})`, latex: [keLine] })
    let Salt: number
    if (option === "1") {
      Salt = (Ke * dSp) / 2
      o.steps.push({ title: "Eq. (5.41) — Option 1", latex: ["S_{alt,k}=\\frac{K_{e,k}\\,\\Delta S_{P,k}}{2}", `S_{alt,k}=\\frac{${fmt(Ke)}\\times${fmt(dSp)}}{2}=${fmt(Salt)}`] })
    } else {
      const dSlt = req(v, "dSlt", "ΔSLT"), nu = opt(v, "nu") ?? 0.3
      const Syk = req(v, "Syk", "Sy,k"), Sak = req(v, "Sak", "Sa,k"); positive(Sak, "Sa,k")
      const vp = Math.max(0.5 - 0.2 * (Syk / Sak), nu)
      const Kv = (1 - nu) / (1 - vp)
      Salt = (Ke * dSp + Kv * dSlt) / 2
      o.steps.push({ title: "Eq. (5.47), (5.46) — Poisson correction", latex: [`\\nu_p=\\max\\left[0.5-0.2\\frac{S_{y,k}}{S_{a,k}},\\,\\nu\\right]=\\max[${fmt(0.5 - 0.2 * (Syk / Sak))},${fmt(nu)}]=${fmt(vp)}`, `K_{v,k}=\\frac{1-\\nu}{1-\\nu_p}=\\frac{${fmt(1 - nu)}}{${fmt(1 - vp)}}=${fmt(Kv)}`] },
        { title: "Eq. (5.42) — Option 2", latex: ["S_{alt,k}=\\frac{K_{e,k}\\Delta S_{P-LT,k}+K_{v,k}\\Delta S_{LT,k}}{2}", `S_{alt,k}=\\frac{${fmt(Ke)}\\times${fmt(dSp)}+${fmt(Kv)}\\times${fmt(dSlt)}}{2}=${fmt(Salt)}`] })
    }
    o.results.push({ label: "S_PS,k", value: plain(SPS), unit: u("stress", sys), status: "info" }, { label: "K_e,k", value: plain(Ke, 4), status: "info" }, { label: "S_alt,k", latex: "S_{alt,k}", value: plain(Salt), unit: u("stress", sys), status: "info" })
    const smys = opt(v, "smys"), uts = opt(v, "uts")
    if (Ke > 1) {
      if (smys !== undefined && uts !== undefined && smys / uts > 0.8) { o.warnings.push("K_e > 1.0 and SMYS/UTS > 0.80 — Method A cannot be used for the fatigue assessment (5.5.4.2.2 Step 4(d))."); o.verdict = { ok: false, text: "Method A not permitted for this material." } }
      else o.warnings.push("K_e > 1.0: the component must not exhibit ratcheting and SMYS/UTS must be ≤ 0.80.")
    }
    const Tmax = opt(v, "Tmax")
    if (Tmax !== undefined && Tmax > (sys === "SI" ? mat.tc : mat.tf)) o.warnings.push(`The fatigue penalty factor may only be used up to ${sys === "SI" ? mat.tc + " °C" : mat.tf + " °F"} for this material (Table 5.14 Note 2).`)
    const nk = opt(v, "nk"), Nk = opt(v, "Nk")
    if (nk !== undefined && Nk !== undefined && Nk > 0) {
      const D = nk / Nk, ok = D <= 1
      o.steps.push({ title: "Eq. (5.48), (5.49) — damage", latex: ["D_{f,k}=\\frac{n_k}{N_k},\\quad D_f=\\sum_{k=1}^{M}D_{f,k}\\le1.0", `D_{f,k}=\\frac{${fmt(nk)}}{${fmt(Nk)}}=${fmt(D)}`] })
      o.results.push({ label: "D_f,k (this cycle)", value: plain(D), status: ok ? "pass" : "fail" })
      o.verdict ??= { ok, text: ok ? "This cycle’s damage is below 1.0 — add the damage of every other cycle (eq. 5.49)." : "Damage exceeds 1.0." }
    } else o.warnings.push(`Read N_k from the Annex 3-F.1 fatigue curve at S_alt = ${plain(Salt)} ${u("stress", sys)} and enter it with n_k to get the damage.`)
    return o
  },
}

// ---------------------------------------------------------------------------------------------
// 5.5.5 — ratcheting
// ---------------------------------------------------------------------------------------------
const ratchetA: CalcDef = {
  id: "ratcheting-a",
  title: "Ratcheting — Method A (elastic)",
  section: "5.5.5.2.1.1",
  equations: ["5.95", "5.96"],
  summary: "Primary+secondary stress range ΔSn,k versus S_PS,k = Sy-cold + Sy-hot.",
  fields: [
    num("dSn", "ΔSn,k", "\\Delta S_{n,k}", "Primary + secondary equivalent stress range", "stress", { help: stressNote }),
    num("SyC", "Sy-cold", "S_{y\\text{-}cold,k}", "Yield strength at the lowest temperature of the cycle", "stress"),
    num("SyH", "Sy-hot", "S_{y\\text{-}hot,k}", "Yield strength at the highest temperature of the cycle", "stress"),
  ],
  compute(v, sys) {
    const dSn = req(v, "dSn", "ΔSn"), SyC = req(v, "SyC", "Sy-cold"), SyH = req(v, "SyH", "Sy-hot")
    const SPS = SyC + SyH, ok = dSn <= SPS
    const o = out()
    o.steps.push({ title: "Eq. (5.95)", latex: ["S_{PS,k}=S_{y\\text{-}cold,k}+S_{y\\text{-}hot,k}", `S_{PS,k}=${fmt(SyC)}+${fmt(SyH)}=${fmt(SPS)}`] }, { title: "Eq. (5.96)", latex: ["\\Delta S_{n,k}\\le S_{PS,k}", `${fmt(dSn)}\\le${fmt(SPS)}\\;\\Rightarrow\\;\\text{${ok ? "PROTECTED AGAINST RATCHETING" : "NOT SATISFIED"}}`] })
    o.results.push({ label: "S_PS,k", value: plain(SPS), unit: u("stress", sys), status: "info" }, { label: "ΔSn,k ≤ S_PS,k", value: `${plain(dSn)} ≤ ${plain(SPS)}  (ratio ${plain(dSn / SPS, 3)})`, unit: u("stress", sys), status: ok ? "pass" : "fail" })
    o.verdict = { ok, text: ok ? "Protection against ratcheting is demonstrated (Method A)." : "Not satisfied — modify the design/loads, or use the simplified elastic–plastic procedure, Bree diagram (Method B) or elastic–plastic analysis." }
    o.warnings.push("If the material cyclically softens, derate the monotonic yield strength (5.5.5.2.1.1 Step 2).")
    return o
  },
}

const ratchetThermal: CalcDef = {
  id: "ratcheting-thermal",
  title: "Ratcheting — thermal stress limits (simplified elastic–plastic)",
  section: "5.5.5.2.1.2",
  equations: ["5.97", "5.98", "5.99", "5.100", "5.101", "5.102", "5.103", "5.104", "5.105"],
  summary: "X_s, S_Qmb and S_Qm for a secondary thermal stress range acting with steady primary membrane stress.",
  fields: [
    { kind: "select", key: "dist", label: "Through-wall thermal distribution", defaultValue: "linear", options: [{ value: "linear", label: "Linear variation" }, { value: "parabolic", label: "Parabolic, constantly increasing or decreasing" }] },
    num("Pm", "Pm", "P_m", "Steady primary membrane equivalent stress", "stress", { help: stressNote }),
    num("SyAvg", "Sy-avg", "S_{y\\text{-}avg}", "Yield strength at the average temperature of the cycle", "stress"),
    num("dQm", "ΔQm", "\\Delta Q_m", "Secondary membrane equivalent stress range", "stress"),
    num("dQmb", "ΔQmb", "\\Delta Q_{mb}", "Secondary membrane + bending equivalent thermal stress range", "stress"),
    num("a97", "Δ(PL+Pb+Qm)", "\\Delta(P_L+P_b+Q_m)", "Optional (eq. 5.97): range excluding thermal stress", "stress", { optional: true }),
    num("SPS", "S_PS,k", "S_{PS,k}", "Optional (eq. 5.97): limit from eq. 5.95", "stress", { optional: true }),
    num("smys", "SMYS", "SMYS", "Optional: for the SMYS/UTS ≤ 0.80 condition", "stress", { optional: true }),
    num("uts", "UTS", "UTS", "Optional", "stress", { optional: true }),
  ],
  compute(v, sys) {
    const Pm = req(v, "Pm", "Pm"), Sy = req(v, "SyAvg", "Sy-avg"), dQm = req(v, "dQm", "ΔQm"), dQmb = req(v, "dQmb", "ΔQmb")
    positive(Sy, "Sy-avg")
    const Xs = Pm / Sy
    if (!(Xs > 0 && Xs < 1)) throw new Error("X_s = Pm/Sy-avg must lie between 0 and 1 for this procedure.")
    const o = out()
    const dist = sel(v, "dist", "linear")
    let Smb: number, eqn: string, tex: string
    if (dist === "linear") {
      if (Xs < 0.5) { Smb = Sy / Xs; eqn = "5.99"; tex = `S_{Qmb}=S_{y\\text{-}avg}\\frac{1}{X_s}=${fmt(Sy)}/${fmt(Xs, 4)}=${fmt(Smb)}` }
      else { Smb = 4 * Sy * (1 - Xs); eqn = "5.100"; tex = `S_{Qmb}=4.0\\,S_{y\\text{-}avg}(1-X_s)=4.0\\times${fmt(Sy)}\\times${fmt(1 - Xs, 4)}=${fmt(Smb)}` }
    } else if (Xs < 0.615) { Smb = Sy / (0.1224 + 0.9944 * Xs * Xs); eqn = "5.101"; tex = `S_{Qmb}=\\frac{S_{y\\text{-}avg}}{0.1224+0.9944X_s^2}=${fmt(Smb)}` }
    else { Smb = 5.2 * Sy * (1 - Xs); eqn = "5.102"; tex = `S_{Qmb}=5.2\\,S_{y\\text{-}avg}(1-X_s)=${fmt(Smb)}` }
    const Sqm = 2 * Sy * (1 - Xs)
    const ok1 = dQm <= Sqm, ok2 = dQmb <= Smb
    o.steps.push(
      { title: "Eq. (5.98)", latex: [`X_s=\\frac{P_m}{S_{y\\text{-}avg}}=\\frac{${fmt(Pm)}}{${fmt(Sy)}}=${fmt(Xs, 4)}`] },
      { title: `Eq. (${eqn}) — S_Qmb`, latex: [tex] },
      { title: "Eq. (5.103) — S_Qm", latex: [`S_{Qm}=2.0\\,S_{y\\text{-}avg}(1-X_s)=2.0\\times${fmt(Sy)}\\times${fmt(1 - Xs, 4)}=${fmt(Sqm)}`] },
      { title: "Eq. (5.104), (5.105) — criteria", latex: [`\\Delta Q_m\\le S_{Qm}:\\;${fmt(dQm)}\\le${fmt(Sqm)}\\;\\Rightarrow\\;\\text{${ok1 ? "OK" : "NOT OK"}}`, `\\Delta Q_{mb}\\le S_{Qmb}:\\;${fmt(dQmb)}\\le${fmt(Smb)}\\;\\Rightarrow\\;\\text{${ok2 ? "OK" : "NOT OK"}}`] },
    )
    o.results.push({ label: "X_s", value: plain(Xs, 4), status: "info" }, { label: `S_Qmb (eq. ${eqn})`, value: plain(Smb), unit: u("stress", sys), status: "info" }, { label: "S_Qm (eq. 5.103)", value: plain(Sqm), unit: u("stress", sys), status: "info" }, { label: "ΔQm ≤ S_Qm", value: `${plain(dQm)} ≤ ${plain(Sqm)}`, unit: u("stress", sys), status: ok1 ? "pass" : "fail" }, { label: "ΔQmb ≤ S_Qmb", value: `${plain(dQmb)} ≤ ${plain(Smb)}`, unit: u("stress", sys), status: ok2 ? "pass" : "fail" })
    let ok = ok1 && ok2
    const a97 = opt(v, "a97"), sps = opt(v, "SPS")
    if (a97 !== undefined && sps !== undefined) { const p = a97 <= sps; ok &&= p; o.results.push({ label: "Δ(PL+Pb+Qm) ≤ S_PS,k (eq. 5.97)", value: `${plain(a97)} ≤ ${plain(sps)}`, unit: u("stress", sys), status: p ? "pass" : "fail" }) }
    const smys = opt(v, "smys"), uts = opt(v, "uts")
    if (smys !== undefined && uts !== undefined && smys / uts > 0.8) { ok = false; o.warnings.push("SMYS/UTS exceeds 0.80 — the simplified elastic–plastic procedure is not permitted (5.5.5.2.1.2(c)).") }
    o.warnings.push("This procedure also requires a fatigue analysis with K_e applied (5.5.5.2.1.2(b)) and is limited to linear or parabolic secondary stress distributions.")
    o.verdict = { ok, text: ok ? "Thermal-stress ratcheting criteria satisfied." : "A ratcheting criterion is not satisfied." }
    return o
  },
}


// ---------------------------------------------------------------------------------------------
// 5.6 — creep
// ---------------------------------------------------------------------------------------------
const creepFatigueScreen: CalcDef = {
  id: "creep-fatigue-screen",
  title: "Creep-fatigue screening based on cycles",
  section: "5.6.4.3",
  equations: ["5.113", "5.114"],
  summary: "Only cycles with at least one end in the creep regime count. N_ΔFP ≤ 250 and N_ΔFP + N_ΔP + N_ΔTR ≤ 500.",
  fields: [
    num("NFP", "NΔFP", "N_{\\Delta FP}", "Full-range pressure cycles incl. start-up/shutdown (creep-regime cycles only)", "cycles", { min: 0 }),
    num("NP", "NΔP", "N_{\\Delta P}", "Significant pressure-fluctuation cycles in normal operation", "cycles", { min: 0 }),
    num("NTR", "NΔTR", "N_{\\Delta TR}", "Significant temperature-difference cycles (range exceeds 25% of design temperature)", "cycles", { min: 0 }),
  ],
  compute(v) {
    const a = req(v, "NFP", "NΔFP"), b = req(v, "NP", "NΔP"), c = req(v, "NTR", "NΔTR")
    const o = out(); const ok1 = a <= 250, sum = a + b + c, ok2 = sum <= 500
    o.steps.push({ title: "Eq. (5.113)", latex: ["N_{\\Delta FP}\\le 250", `${fmt(a)}\\le250\\;\\Rightarrow\\;\\text{${ok1 ? "OK — go to Step 3" : "creep-fatigue analysis REQUIRED"}}`] }, { title: "Eq. (5.114)", latex: ["N_{\\Delta FP}+N_{\\Delta P}+N_{\\Delta TR}\\le 500", `${fmt(a)}+${fmt(b)}+${fmt(c)}=${fmt(sum)}\\;\\Rightarrow\\;\\text{${ok2 ? "SCREENING SATISFIED" : "creep-fatigue analysis REQUIRED"}}`] })
    o.results.push({ label: "N_ΔFP ≤ 250", value: plain(a), unit: "cycles", status: ok1 ? "pass" : "fail" }, { label: "Sum ≤ 500", value: plain(sum), unit: "cycles", status: ok2 ? "pass" : "fail" })
    const ok = ok1 && ok2
    o.verdict = { ok, text: ok ? "Creep-fatigue screening satisfied — no creep-fatigue analysis required." : "A creep-fatigue analysis is required." }
    return o
  },
}
const creepRatchet: CalcDef = {
  id: "creep-ratcheting",
  title: "Creep ratcheting — S_PS limit",
  section: "5.6.5.1",
  equations: ["5.115", "5.96"],
  summary: "For cycles with an end in the creep regime, S_PS = Sy-cold + S (time-dependent allowable), then ΔSn ≤ S_PS.",
  fields: [
    num("dSn", "ΔSn,k", "\\Delta S_{n,k}", "Primary + secondary equivalent stress range", "stress", { help: stressNote }),
    num("SyC", "Sy-cold", "S_{y\\text{-}cold,k}", "Yield strength at the cold temperature of the cycle", "stress"),
    num("S", "S", "S", "Time-dependent allowable stress from Annex 3-A", "stress"),
  ],
  compute(v, sys) {
    const d = req(v, "dSn", "ΔSn"), y = req(v, "SyC", "Sy-cold"), S = req(v, "S", "S")
    const sps = y + S, ok = d <= sps; const o = out()
    o.steps.push({ title: "Eq. (5.115)", latex: ["S_{PS}=S_{y\\text{-}cold,k}+S", `S_{PS}=${fmt(y)}+${fmt(S)}=${fmt(sps)}`] }, { title: "Eq. (5.96) check", latex: [`${fmt(d)}\\le${fmt(sps)}\\;\\Rightarrow\\;\\text{${ok ? "OK" : "NOT OK"}}`] })
    o.results.push({ label: "S_PS (creep)", value: plain(sps), unit: u("stress", sys), status: "info" }, { label: "ΔSn,k ≤ S_PS", value: `${plain(d)} ≤ ${plain(sps)}`, unit: u("stress", sys), status: ok ? "pass" : "fail" })
    o.verdict = { ok, text: ok ? "Creep-ratcheting limit satisfied." : "Not satisfied." }
    return o
  },
}


const boltService: CalcDef = {
  id: "bolt-service",
  title: "Bolts — service stress limits",
  section: "5.8.2",
  equations: [],
  summary: "Average bolt service stress ≤ 2S; peripheral (tension + bending) stress ≤ 3S (≤ 2.7S for the high-strength-bolt fatigue route).",
  fields: [
    num("S", "S", "S", "Bolt allowable stress (Annex 3-A.2)", "stress", { help: stressNote }),
    num("avg", "σ_avg", "\\sigma_{avg}", "Maximum service stress averaged across the bolt section", "stress"),
    num("per", "σ_per", "\\sigma_{per}", "Maximum service stress at the periphery (tension + bending)", "stress", { optional: true }),
    { kind: "select", key: "hs", label: "High-strength bolt fatigue route of 5.8.3.1(b) (higher fatigue curve)?", defaultValue: "no", options: [{ value: "no", label: "No — peripheral limit 3S" }, { value: "yes", label: "Yes — peripheral limit 2.7S" }] },
  ],
  compute(v, sys) {
    const S = req(v, "S", "S"), avg = req(v, "avg", "σ_avg"); positive(S, "S")
    const o = out(); let ok = avg <= 2 * S
    o.steps.push({ title: "5.8.2(a) — average stress", latex: [`\\sigma_{avg}\\le 2S:\\;${fmt(avg)}\\le${fmt(2 * S)}\\;\\Rightarrow\\;\\text{${avg <= 2 * S ? "OK" : "NOT OK"}}`] })
    o.results.push({ label: "σ_avg ≤ 2S", value: `${plain(avg)} ≤ ${plain(2 * S)}`, unit: u("stress", sys), status: avg <= 2 * S ? "pass" : "fail" })
    const per = opt(v, "per")
    if (per !== undefined) {
      const k = sel(v, "hs", "no") === "yes" ? 2.7 : 3, p = per <= k * S; ok &&= p
      o.steps.push({ title: "5.8.2(b) — peripheral stress", latex: [`\\sigma_{per}\\le ${k}S:\\;${fmt(per)}\\le${fmt(k * S)}\\;\\Rightarrow\\;\\text{${p ? "OK" : "NOT OK"}}`] })
      o.results.push({ label: `σ_per ≤ ${k}S`, value: `${plain(per)} ≤ ${plain(k * S)}`, unit: u("stress", sys), status: p ? "pass" : "fail" })
    }
    o.verdict = { ok, text: ok ? "Bolt service-stress limits satisfied." : "A bolt service-stress limit is exceeded." }
    o.warnings.push("When bolts are tightened without heaters/stretchers, use the equivalent stress of eq. (5.1) as the stress measure. Bolt fatigue uses 5.5.4.2 with a fatigue strength reduction factor not less than 4.0 (5.8.3.1).")
    return o
  },
}

// ---------------------------------------------------------------------------------------------
export const PART5_CALCULATORS: CalcDef[] = [
  vonMisesCalc, plasticCollapseElastic, additionalLimits, triaxial, strainLimit, strainDamage, bucklingA,
  screeningA, lfs, screeningB, fatigueElastic, ratchetA, ratchetThermal, creepFatigueScreen, creepRatchet, boltService,
]
export const getCalculator = (id: string) => PART5_CALCULATORS.find((c) => c.id === id)

export function runCalculator(id: string, values: Values, system: UnitSystem): { ok: true; output: CalcOutput } | { ok: false; error: string } {
  const def = getCalculator(id)
  if (!def) return { ok: false, error: "Unknown calculator." }
  try {
    return { ok: true, output: def.compute(values, system) }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Calculation failed." }
  }
}
export type { Step, ResultLine }
