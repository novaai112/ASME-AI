/**
 * ASME BPVC VIII-2 (2025) Part 4 (design by rule) and Part 8 (pressure testing) calculators.
 * Equations transcribed from the owner's 2025 PDF with their equation numbers. Plain code, no AI.
 */
import type { CalcDef, CalcOutput, UnitSystem, Values } from "../part5/types.ts"
import { fmt, num, opt, out, plain, positive, req, sel, stressNote, u } from "../part5/calculators.ts"

const DEG = Math.PI / 180
const verdictTxt = (ok: boolean) => `\\text{${ok ? "OK" : "NOT OK"}}`

// ---------------------------------------------------------------------------------------------
// 4.3.3 / 4.3.4 / 4.3.5 — cylinder, cone, sphere (exponential thickness equations)
// ---------------------------------------------------------------------------------------------
type Shape = "cyl" | "cone" | "sph"
const SHAPES: Record<Shape, { eq: string; title: string; t: string; P: string; k: (a: number) => number; half: number }> = {
  cyl: { eq: "4.3.1", title: "cylindrical shell", t: "t=\\frac{D}{2}\\left(\\exp\\left[\\frac{P}{SE}\\right]-1\\right)", P: "P=SE\\,\\ln\\left(1+\\frac{2t}{D}\\right)", k: () => 1, half: 1 },
  cone: { eq: "4.3.2", title: "conical shell", t: "t=\\frac{D}{2\\cos\\alpha}\\left(\\exp\\left[\\frac{P}{SE}\\right]-1\\right)", P: "P=SE\\,\\ln\\left(1+\\frac{2t\\cos\\alpha}{D}\\right)", k: (a) => 1 / Math.cos(a), half: 1 },
  sph: { eq: "4.3.4", title: "spherical shell / hemispherical head", t: "t=\\frac{D}{2}\\left(\\exp\\left[\\frac{0.5P}{SE}\\right]-1\\right)", P: "P=2SE\\,\\ln\\left(1+\\frac{2t}{D}\\right)", k: () => 1, half: 0.5 },
}

function shellCalc(shape: Shape): CalcDef {
  const info = SHAPES[shape]
  const isCone = shape === "cone"
  return {
    id: `div2-${shape === "cyl" ? "cylinder" : shape === "cone" ? "cone" : "sphere"}`,
    title: `Division 2 ${info.title} — internal pressure`,
    section: shape === "cone" ? "4.3.4" : shape === "sph" ? "4.3.5" : "4.3.3",
    equations: shape === "cone" ? ["4.3.2", "4.3.3"] : [info.eq],
    summary: "Required thickness for a design pressure, or the allowable pressure for a given thickness (rearranged form).",
    fields: [
      { kind: "select", key: "mode", label: "What do you want to find?", defaultValue: "t", options: [{ value: "t", label: "Required thickness t from design pressure P" }, { value: "P", label: "Allowable pressure P from thickness t (rearranged)" }] },
      num("D", "D", "D", "Inside diameter (corroded condition)", "length"),
      num("S", "S", "S", "Allowable stress at the design temperature (Annex 3-A)", "stress", { help: stressNote }),
      num("E", "E", "E", "Weld joint efficiency (Table 7.2)", "none", { min: 0.01, max: 1, defaultValue: 1 }),
      num("P", "P", "P", "Design pressure (mode: required thickness)", "pressure", { optional: true }),
      num("t", "t", "t", "Wall thickness provided, corroded (mode: allowable pressure)", "length", { optional: true }),
      ...(isCone ? [num("alpha", "α", "\\alpha", "Cone half-apex angle (degrees)", "none", { min: 0.1, max: 89 }), num("alpha2", "α2", "\\alpha_2", "Offset cone only: second half-angle in degrees (α = max(α1, α2), eq. 4.3.3)", "none", { optional: true })] : []),
      num("CA", "CA", "CA", "Corrosion allowance (added to the required thickness)", "length", { optional: true, defaultValue: 0 }),
    ],
    compute(v, sys): CalcOutput {
      const D = req(v, "D", "D"), S = req(v, "S", "S"), E = req(v, "E", "E")
      positive(D, "D"); positive(S, "S"); positive(E, "E")
      if (E > 1) throw new Error("E cannot exceed 1.0.")
      const CA = opt(v, "CA") ?? 0
      let a = 0
      const o = out()
      if (isCone) {
        const a1 = req(v, "alpha", "α"), a2 = opt(v, "alpha2")
        const deg = a2 !== undefined ? Math.max(a1, a2) : a1
        if (a2 !== undefined) o.steps.push({ title: "Eq. (4.3.3) — offset transition", latex: [`\\alpha=\\max[\\alpha_1,\\alpha_2]=\\max[${fmt(a1)},${fmt(a2)}]=${fmt(deg)}^\\circ`] })
        a = deg * DEG
      }
      const k = info.k(a), h = info.half
      if (sel(v, "mode", "t") === "t") {
        const P = req(v, "P", "P"); positive(P, "P")
        const t = (D / 2) * k * (Math.exp((h * P) / (S * E)) - 1)
        o.steps.push({ title: `Eq. (${shape === "cone" ? "4.3.2" : info.eq}) — required thickness`, latex: [info.t, `t=\\frac{${fmt(D)}}{2${isCone ? `\\cos ${fmt(a / DEG)}^\\circ` : ""}}\\left(\\exp\\left[\\frac{${h === 0.5 ? "0.5\\times" : ""}${fmt(P)}}{${fmt(S)}\\times${fmt(E)}}\\right]-1\\right)=${fmt(t)}`] }, { title: "Add corrosion allowance", latex: [`t_{nom,min}=t+CA=${fmt(t)}+${fmt(CA)}=${fmt(t + CA)}`] })
        o.results.push({ label: "Required thickness t", latex: "t", value: plain(t), unit: u("length", sys), status: "info" }, { label: "t + corrosion allowance", value: plain(t + CA), unit: u("length", sys), status: "info" })
        o.verdict = { ok: true, text: `Minimum required thickness ≈ ${plain(t + CA)} ${u("length", sys)} including corrosion allowance (before mill tolerance and other loadings).` }
      } else {
        const t = req(v, "t", "t"); positive(t, "t")
        const P = (S * E / h) * Math.log(1 + (2 * t) / (D * k))
        o.steps.push({ title: "Equation rearranged for P", latex: [info.P, `P=${h === 0.5 ? "2" : ""}\\times${fmt(S)}\\times${fmt(E)}\\ln\\left(1+\\frac{2\\times${fmt(t)}${isCone ? `\\cos ${fmt(a / DEG)}^\\circ` : ""}}{${fmt(D)}}\\right)=${fmt(P)}`] })
        o.results.push({ label: "Allowable pressure P", latex: "P", value: plain(P), unit: u("pressure", sys), status: "info" })
      }
      o.warnings.push("These equations cover pressure loading only. Combined loadings, cone-to-cylinder junctions (4.3.11–4.3.12), tolerances (4.3.2), minimum thickness and corrosion/mill allowances are separate checks.")
      return o
    },
  }
}

// ---------------------------------------------------------------------------------------------
// 4.3.6 torispherical and 4.3.7 ellipsoidal heads
// ---------------------------------------------------------------------------------------------
export interface TorisphericalResult {
  LD: number; rD: number; Lt: number
  checks: Array<{ name: string; ok: boolean; eq: string }>
  beta: number; phi: number; Rth: number; C1: number; C2: number; Peth: number; C3: number; Py: number; G: number; Pck: number; Pak: number; Pac: number; Pa: number
}
export function torisphericalPressure(p: { D: number; L: number; r: number; t: number; S: number; E: number; ET: number; C3: number }): TorisphericalResult {
  const { D, L, r, t, S, E, ET, C3 } = p
  const LD = L / D, rD = r / D, Lt = L / t
  const checks = [
    { name: "0.7 ≤ L/D ≤ 1.0", ok: LD >= 0.7 && LD <= 1.0, eq: "4.3.5" },
    { name: "r/D ≥ 0.06", ok: rD >= 0.06, eq: "4.3.6" },
    { name: "20 ≤ L/t ≤ 2000", ok: Lt >= 20 && Lt <= 2000, eq: "4.3.7" },
  ]
  const cosArg = (0.5 * D - r) / (L - r)
  if (!(cosArg >= -1 && cosArg <= 1)) throw new Error("Geometry is not valid: (0.5D − r)/(L − r) must lie between −1 and 1.")
  const beta = Math.acos(cosArg)
  const phi = Math.sqrt(L * t) / r
  const Rth = phi < beta ? (0.5 * D - r) / Math.cos(beta - phi) + r : 0.5 * D
  const C1 = rD <= 0.08 ? 9.31 * rD - 0.086 : 0.692 * rD + 0.605
  const C2 = rD <= 0.08 ? 1.25 : 1.46 - 2.6 * rD
  const Peth = (C1 * ET * t * t) / (C2 * Rth * (Rth / 2 - r))
  const Py = (C3 * t) / (C2 * Rth * (Rth / (2 * r) - 1))
  const G = Peth / Py
  const Pck = G <= 1 ? 0.6 * Peth : ((0.77508 * G - 0.20354 * G ** 2 + 0.019274 * G ** 3) / (1 + 0.19014 * G - 0.089534 * G ** 2 + 0.0093965 * G ** 3)) * Py
  const Pak = Pck / 1.5
  const Pac = (2 * S * E) / (L / t + 0.5)
  return { LD, rD, Lt, checks, beta, phi, Rth, C1, C2, Peth, C3, Py, G, Pck, Pak, Pac, Pa: Math.min(Pak, Pac) }
}

function c3Value(v: Values, S: number): { c3: number; text: string } {
  const how = sel(v, "c3", "sy")
  if (how === "sy") return { c3: req(v, "Sy", "Sy"), text: "C_3=S_y" }
  if (how === "90") return { c3: 1.1 * S, text: "C_3=1.1S" }
  return { c3: 1.5 * S, text: "C_3=1.5S" }
}
const headFields = [
  num("S", "S", "S", "Allowable stress at the design temperature", "stress", { help: stressNote }),
  num("E", "E", "E", "Weld joint efficiency (Table 7.2)", "none", { min: 0.01, max: 1, defaultValue: 1 }),
  num("ET", "E_T", "E_T", "Modulus of elasticity at the design temperature", "modulus"),
  { kind: "select" as const, key: "c3", label: "C3 (eq. 4.3.17) — how the allowable stress is governed", defaultValue: "sy", options: [{ value: "sy", label: "Time-independent properties: C3 = Sy" }, { value: "90", label: "Time-dependent, 90% yield criterion: C3 = 1.1 S" }, { value: "67", label: "Time-dependent, 67% yield criterion: C3 = 1.5 S" }] },
  num("Sy", "Sy", "S_y", "Yield strength at the design temperature (needed when C3 = Sy)", "stress", { optional: true }),
  num("P", "P", "P", "Design pressure to check against (optional)", "pressure", { optional: true }),
  num("CA", "CA", "CA", "Corrosion allowance (only to report the nominal thickness)", "length", { optional: true, defaultValue: 0 }),
]

function torisphericalSteps(o: CalcOutput, rr: TorisphericalResult, p: { D: number; L: number; r: number; t: number; S: number; E: number; ET: number }, c3text: string) {
  o.steps.push(
    { title: "Eq. (4.3.5)–(4.3.7) — applicability", latex: [`L/D=${fmt(rr.LD, 4)},\\;\\; r/D=${fmt(rr.rD, 4)},\\;\\; L/t=${fmt(rr.Lt)}`, ...rr.checks.map((c) => `\\text{${c.name}}\\;(4.3.${c.eq.split(".")[2]}):\\;${verdictTxt(c.ok)}`)] },
    { title: "Eq. (4.3.8)–(4.3.11) — geometric constants", latex: [`\\beta_{th}=\\arccos\\left[\\frac{0.5D-r}{L-r}\\right]=\\arccos\\left[\\frac{${fmt(0.5 * p.D - p.r)}}{${fmt(p.L - p.r)}}\\right]=${fmt(rr.beta)}\\text{ rad}`, `\\phi_{th}=\\frac{\\sqrt{Lt}}{r}=\\frac{\\sqrt{${fmt(p.L)}\\times${fmt(p.t)}}}{${fmt(p.r)}}=${fmt(rr.phi)}\\text{ rad}`, rr.phi < rr.beta ? `\\phi_{th}<\\beta_{th}\\Rightarrow R_{th}=\\frac{0.5D-r}{\\cos(\\beta_{th}-\\phi_{th})}+r=${fmt(rr.Rth)}` : `\\phi_{th}\\ge\\beta_{th}\\Rightarrow R_{th}=0.5D=${fmt(rr.Rth)}`] },
    { title: "Eq. (4.3.12)–(4.3.15) — coefficients C1 and C2", latex: [rr.rD <= 0.08 ? `C_1=9.31(r/D)-0.086=${fmt(rr.C1)},\\;\\; C_2=1.25` : `C_1=0.692(r/D)+0.605=${fmt(rr.C1)},\\;\\; C_2=1.46-2.6(r/D)=${fmt(rr.C2)}`] },
    { title: "Eq. (4.3.16) — elastic knuckle buckling pressure", latex: ["P_{eth}=\\frac{C_1E_Tt^2}{C_2R_{th}\\left(\\frac{R_{th}}{2}-r\\right)}", `P_{eth}=${fmt(rr.Peth)}`] },
    { title: "Eq. (4.3.17) — pressure for yield at the knuckle", latex: [`P_y=\\frac{C_3t}{C_2R_{th}\\left(\\frac{R_{th}}{2r}-1\\right)},\\quad ${c3text}=${fmt(rr.C3)}`, `P_y=${fmt(rr.Py)}`] },
    { title: "Eq. (4.3.18)–(4.3.20) — knuckle buckling failure", latex: [`G=\\frac{P_{eth}}{P_y}=${fmt(rr.G)}`, rr.G <= 1 ? `G\\le1.0\\Rightarrow P_{ck}=0.6P_{eth}=${fmt(rr.Pck)}` : `G>1.0\\Rightarrow P_{ck}=\\frac{0.77508G-0.20354G^2+0.019274G^3}{1+0.19014G-0.089534G^2+0.0093965G^3}P_y=${fmt(rr.Pck)}`] },
    { title: "Eq. (4.3.21) — allowable pressure, knuckle buckling", latex: [`P_{ak}=\\frac{P_{ck}}{1.5}=${fmt(rr.Pak)}`] },
    { title: "Eq. (4.3.22) — allowable pressure, crown rupture", latex: [`P_{ac}=\\frac{2SE}{L/t+0.5}=\\frac{2\\times${fmt(p.S)}\\times${fmt(p.E)}}{${fmt(rr.Lt)}+0.5}=${fmt(rr.Pac)}`] },
    { title: "Eq. (4.3.23) — maximum allowable internal pressure", latex: [`P_a=\\min[P_{ak},P_{ac}]=\\min[${fmt(rr.Pak)},${fmt(rr.Pac)}]=${fmt(rr.Pa)}`] },
  )
}

const torispherical: CalcDef = {
  id: "div2-torispherical",
  title: "Division 2 torispherical head — allowable pressure",
  section: "4.3.6",
  equations: ["4.3.5", "4.3.6", "4.3.7", "4.3.8", "4.3.9", "4.3.10", "4.3.11", "4.3.12", "4.3.13", "4.3.14", "4.3.15", "4.3.16", "4.3.17", "4.3.18", "4.3.19", "4.3.20", "4.3.21", "4.3.22", "4.3.23"],
  summary: "The full 4.3.6.1 procedure for a torispherical head (same crown and knuckle thickness): knuckle buckling, knuckle yield and crown rupture, giving P_a.",
  fields: [
    num("D", "D", "D", "Inside diameter of the head skirt", "length"),
    num("L", "L", "L", "Inside crown radius", "length"),
    num("r", "r", "r", "Inside knuckle radius", "length"),
    num("t", "t", "t", "Head thickness (corroded) to check", "length"),
    ...headFields,
  ],
  compute(v, sys) {
    const D = req(v, "D", "D"), L = req(v, "L", "L"), r = req(v, "r", "r"), t = req(v, "t", "t"), S = req(v, "S", "S"), E = req(v, "E", "E"), ET = req(v, "ET", "E_T")
    ;[D, L, r, t, S, E, ET].forEach((x) => positive(x, "Every input"))
    const { c3, text } = c3Value(v, S)
    const rr = torisphericalPressure({ D, L, r, t, S, E, ET, C3: c3 })
    const o = out()
    torisphericalSteps(o, rr, { D, L, r, t, S, E, ET }, text)
    finishHead(o, rr, v, sys)
    return o
  },
}

function finishHead(o: CalcOutput, rr: TorisphericalResult, v: Values, sys: UnitSystem) {
  const P = opt(v, "P")
  o.results.push(
    ...rr.checks.map((c) => ({ label: `Applicability ${c.name} (eq. ${c.eq})`, value: c.ok ? "satisfied" : "NOT satisfied", status: (c.ok ? "pass" : "fail") as "pass" | "fail" })),
    { label: "R_th", value: plain(rr.Rth), unit: u("length", sys), status: "info" },
    { label: "P_eth (elastic buckling)", value: plain(rr.Peth), unit: u("pressure", sys), status: "info" },
    { label: "P_y (yield)", value: plain(rr.Py), unit: u("pressure", sys), status: "info" },
    { label: "P_ak (knuckle buckling)", value: plain(rr.Pak), unit: u("pressure", sys), status: "info" },
    { label: "P_ac (crown rupture)", value: plain(rr.Pac), unit: u("pressure", sys), status: "info" },
    { label: "P_a = min(P_ak, P_ac)", latex: "P_a", value: plain(rr.Pa), unit: u("pressure", sys), status: "info" },
  )
  const geomOk = rr.checks.every((c) => c.ok)
  if (P !== undefined) {
    const ok = rr.Pa >= P && geomOk
    o.steps.push({ title: "Step 11 — compare with the design pressure", latex: [`P_a=${fmt(rr.Pa)}\\;${rr.Pa >= P ? "\\ge" : "<"}\\;P=${fmt(P)}\\;\\Rightarrow\\;${verdictTxt(rr.Pa >= P)}`] })
    o.results.push({ label: "P_a ≥ P", value: `${plain(rr.Pa)} vs ${plain(P)}  (ratio ${plain(P / rr.Pa, 3)})`, unit: u("pressure", sys), status: ok ? "pass" : "fail" })
    o.verdict = { ok, text: !geomOk ? "Geometry is outside the 4.3.6 limits — design the head per Part 5." : ok ? "The head thickness is adequate for the design pressure." : "Allowable pressure is below the design pressure — increase the thickness and repeat Steps 2–10." }
  } else o.verdict = { ok: geomOk, text: geomOk ? `Maximum allowable internal pressure P_a ≈ ${plain(rr.Pa)} ${u("pressure", sys)}.` : "Geometry is outside the 4.3.6 limits — design the head per Part 5." }
  o.warnings.push("Rules apply to internal pressure only; combined loadings use 4.3.10 with the head approximated as a sphere of radius L. To find the thickness for a given pressure, increase t until P_a ≥ P (the procedure is iterative).")
}

const ellipsoidal: CalcDef = {
  id: "div2-ellipsoidal",
  title: "Division 2 ellipsoidal head — allowable pressure",
  section: "4.3.7",
  equations: ["4.3.24", "4.3.25", "4.3.26", "4.3.27", "4.3.5", "4.3.23"],
  summary: "Ellipsoidal heads are checked with the torispherical procedure using the equivalent r and L from the aspect ratio k = D/2h (1.7 ≤ k ≤ 2.2).",
  fields: [
    num("D", "D", "D", "Inside diameter of the head skirt", "length"),
    num("h", "h", "h", "Inside depth of the head, measured from the tangent line", "length"),
    num("t", "t", "t", "Head thickness (corroded) to check", "length"),
    ...headFields,
  ],
  compute(v, sys) {
    const D = req(v, "D", "D"), h = req(v, "h", "h"), t = req(v, "t", "t"), S = req(v, "S", "S"), E = req(v, "E", "E"), ET = req(v, "ET", "E_T")
    ;[D, h, t, S, E, ET].forEach((x) => positive(x, "Every input"))
    const k = D / (2 * h), r = D * (0.5 / k - 0.08), L = D * (0.44 * k + 0.02)
    const kOk = k >= 1.7 && k <= 2.2
    const { c3, text } = c3Value(v, S)
    const o = out()
    o.steps.push({ title: "Eq. (4.3.24)–(4.3.27) — equivalent torispherical geometry", latex: [`k=\\frac{D}{2h}=\\frac{${fmt(D)}}{2\\times${fmt(h)}}=${fmt(k, 4)},\\quad 1.7\\le k\\le2.2:\\;${verdictTxt(kOk)}`, `r=D\\left(\\frac{0.5}{k}-0.08\\right)=${fmt(r)},\\quad L=D(0.44k+0.02)=${fmt(L)}`] })
    o.results.push({ label: "Aspect ratio k = D/2h (1.7–2.2)", value: plain(k, 4), status: kOk ? "pass" : "fail" })
    const rr = torisphericalPressure({ D, L, r, t, S, E, ET, C3: c3 })
    torisphericalSteps(o, rr, { D, L, r, t, S, E, ET }, text)
    finishHead(o, rr, v, sys)
    if (!kOk) { o.verdict = { ok: false, text: "k is outside 1.7–2.2 — design this ellipsoidal head per Part 5." } }
    return o
  },
}

// ---------------------------------------------------------------------------------------------
// 8.2.1 test pressure
// ---------------------------------------------------------------------------------------------
const testPressure: CalcDef = {
  id: "div2-test-pressure",
  title: "Division 2 minimum test pressure",
  section: "8.2.1",
  equations: ["8.1"],
  summary: "P_T = γ_St/S × MAWP × (S_t/S) with γ from Table 4.1.3 (hydrostatic or pneumatic), and the minimum test metal temperature of 8.2.4.1.",
  fields: [
    { kind: "select", key: "medium", label: "Test medium (Table 4.1.3)", defaultValue: "hydro", options: [{ value: "hydro", label: "Hydrostatic — 1.25" }, { value: "pneu", label: "Pneumatic — 1.15" }] },
    num("MAWP", "MAWP", "MAWP", "Maximum allowable working pressure", "pressure"),
    num("St", "S_t", "S_t", "Allowable stress at the test temperature (lowest ratio material)", "stress", { help: stressNote }),
    num("S", "S", "S", "Allowable stress at the design temperature (same material)", "stress"),
    num("MDMT", "MDMT", "MDMT", "Vessel minimum design metal temperature (optional)", "temperature", { optional: true }),
  ],
  compute(v, sys) {
    const MAWP = req(v, "MAWP", "MAWP"), St = req(v, "St", "S_t"), S = req(v, "S", "S")
    positive(MAWP, "MAWP"); positive(S, "S"); positive(St, "S_t")
    const gamma = sel(v, "medium", "hydro") === "hydro" ? 1.25 : 1.15
    const PT = gamma * MAWP * (St / S)
    const o = out()
    o.steps.push({ title: "Eq. (8.1) — minimum test pressure", latex: ["P_T=\\gamma_{St/S}\\cdot MAWP\\left[\\frac{S_t}{S}\\right]", `P_T=${gamma}\\times${fmt(MAWP)}\\times\\frac{${fmt(St)}}{${fmt(S)}}=${fmt(PT)}`] })
    o.results.push({ label: "γ (Table 4.1.3)", value: String(gamma), status: "info" }, { label: "Minimum test pressure P_T", latex: "P_T", value: plain(PT), unit: u("pressure", sys), status: "info" })
    const mdmt = opt(v, "MDMT")
    if (mdmt !== undefined) {
      const dT = sys === "SI" ? 17 : 30, tmin = mdmt + dT
      o.steps.push({ title: "8.2.4.1(a) — minimum test metal temperature (materials not covered by 3.11.2)", latex: [`T_{test,min}=MDMT+${dT}=${fmt(mdmt)}+${dT}=${fmt(tmin)}\\,${u("temperature", sys)}`] })
      o.results.push({ label: "Coldest metal temperature during the test ≥", value: plain(tmin), unit: u("temperature", sys), status: "info" })
      o.warnings.push("For materials covered by 3.11.2 the minimum test temperature may be reduced using 3.11.2.5 (8.2.4.1(b)–(c)); the metal temperature need not exceed 50 °C (120 °F).")
    }
    o.warnings.push("S_t/S must be the lowest ratio among the pressure-boundary materials, excluding bolting (8.2.1(b)). The upper limit of the test pressure is set by 4.1.6.2, 5.2.2.6, 5.2.3.5 or 5.2.4.5, and the test head must be added to the pressure at the top. Vessels for vacuum only use 8.1.3.1.")
    o.verdict = { ok: true, text: `Minimum test pressure at the top of the vessel ≈ ${plain(PT)} ${u("pressure", sys)}.` }
    return o
  },
}

export const DIV2_CALCULATORS: CalcDef[] = [shellCalc("cyl"), shellCalc("cone"), shellCalc("sph"), torispherical, ellipsoidal, testPressure]
