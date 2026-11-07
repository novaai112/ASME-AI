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


// ---------------------------------------------------------------------------------------------
// 4.6 flat unstayed heads, covers and blind flanges
// ---------------------------------------------------------------------------------------------
const C_PRESETS = [
  { value: "d1-017", label: "Detail 1 — forged/butt-welded, inside corner radius ≥ 3t: C = 0.17", c: () => 0.17 },
  { value: "d1-010", label: "Detail 1 — circular head with the long flange/taper conditions: C = 0.10", c: () => 0.1 },
  { value: "d2", label: "Detail 2 — forged integral, flange ≥ 2 × shell thickness: C = 0.17", c: () => 0.17 },
  { value: "d3", label: "Detail 3 — integral/butt welded, flange ≥ shell thickness: C = max[0.33m, 0.20]", c: (m: number) => Math.max(0.33 * m, 0.2) },
  { value: "d4", label: "Detail 4 — spun/upset small head (d ≤ 610 mm, 0.05 ≤ t/d ≤ 0.25): C = 0.13", c: () => 0.13 },
  { value: "d5", label: "Detail 5 — plate welded to shell end (t_s ≥ 1.25 t_r): C = 0.33", c: () => 0.33 },
  { value: "d6", label: "Detail 6 — inside fillet weld, throat ≥ 0.7 t_s: C = max[0.33m, 0.20]", c: (m: number) => Math.max(0.33 * m, 0.2) },
  { value: "manual", label: "Other detail (e.g. bolted Detail 7) — enter C from Table 4.6.1", c: (_m: number, manual: number) => manual },
]
function flatC(v: Values): { C: number; tex: string } {
  const pick = C_PRESETS.find((x) => x.value === sel(v, "cdetail", "d5")) ?? C_PRESETS[5]
  const m = opt(v, "m") ?? 1
  if ((pick.value === "d3" || pick.value === "d6") && opt(v, "m") === undefined) throw new Error("Enter m = t_r / t_s for Detail 3 / Detail 6.")
  const manual = opt(v, "Cman")
  if (pick.value === "manual" && manual === undefined) throw new Error("Enter the factor C from Table 4.6.1.")
  const C = pick.c(m, manual ?? 0)
  const tex = pick.value === "d3" || pick.value === "d6" ? `C=\\max[0.33m,\\,0.20]=\\max[0.33\\times${fmt(m)},\\,0.20]=${fmt(C)}` : `C=${fmt(C)}\\;\\text{(Table 4.6.1)}`
  return { C, tex }
}
const flatCFields = [
  { kind: "select" as const, key: "cdetail", label: "Attachment detail (Table 4.6.1) — gives the factor C", defaultValue: "d5", options: C_PRESETS.map((x) => ({ value: x.value, label: x.label })) },
  num("m", "m", "m", "Details 3 and 6: m = t_r / t_s (required seamless-shell thickness ÷ nominal shell thickness)", "none", { optional: true }),
  num("Cman", "C", "C", "Other detail: C taken from Table 4.6.1", "none", { optional: true }),
]

const flatCircular: CalcDef = {
  id: "div2-flat-circular",
  title: "Division 2 flat unstayed circular head / cover",
  section: "4.6.2",
  equations: ["4.6.1", "4.6.2", "4.6.3", "4.6.4"],
  summary: "Required thickness t = d√(CP/(S_ho·E)); with a bolted edge moment (Detail 7) the larger of the operating and gasket-seating thicknesses.",
  fields: [
    { kind: "select", key: "bolted", label: "Attachment", defaultValue: "no", options: [{ value: "no", label: "Not bolted — no edge moment (eq. 4.6.1)" }, { value: "yes", label: "Bolted with gasket inside the bolt circle — edge moment (eq. 4.6.2–4.6.4)" }] },
    num("d", "d", "d", "Diameter measured as shown in Table 4.6.1 (bolted: gasket diameter per 4.16)", "length"),
    num("P", "P", "P", "Internal design pressure", "pressure"),
    num("Sho", "S_ho", "S_{ho}", "Allowable stress of the head at the design temperature (Annex 3-A)", "stress", { help: stressNote }),
    num("E", "E", "E", "Weld joint efficiency (4.2)", "none", { min: 0.01, max: 1, defaultValue: 1 }),
    ...flatCFields,
    { kind: "group", label: "Bolted edge-moment inputs (Detail 7 only) — from the flange design of 4.16" },
    num("Wo", "W_o", "W_o", "Flange design bolt load, operating condition", "none", { optional: true, help: "Force: use N (SI) or lbf (US) consistently with the other units." }),
    num("Wg", "W_g", "W_g", "Flange design bolt load, gasket seating", "none", { optional: true }),
    num("hG", "h_G", "h_G", "Gasket moment arm (Table 4.16.6)", "length", { optional: true }),
    num("Shg", "S_hg", "S_{hg}", "Allowable stress of the head at the gasket-seating condition", "stress", { optional: true }),
    num("CA", "CA", "CA", "Corrosion allowance (only to report the nominal thickness)", "length", { optional: true, defaultValue: 0 }),
  ],
  compute(v, sys) {
    const d = req(v, "d", "d"), P = req(v, "P", "P"), S = req(v, "Sho", "S_ho"), E = req(v, "E", "E")
    ;[d, P, S, E].forEach((x) => positive(x, "Every input"))
    const CA = opt(v, "CA") ?? 0
    const { C, tex } = flatC(v)
    const o = out()
    o.steps.push({ title: "Factor C (Table 4.6.1)", latex: [tex] })
    let t: number
    if (sel(v, "bolted", "no") === "no") {
      t = d * Math.sqrt((C * P) / (S * E))
      o.steps.push({ title: "Eq. (4.6.1) — required thickness", latex: ["t=d\\sqrt{\\frac{CP}{S_{ho}E}}", `t=${fmt(d)}\\sqrt{\\frac{${fmt(C)}\\times${fmt(P)}}{${fmt(S)}\\times${fmt(E)}}}=${fmt(t)}`] })
    } else {
      const Wo = req(v, "Wo", "W_o"), Wg = req(v, "Wg", "W_g"), hG = req(v, "hG", "h_G"), Shg = req(v, "Shg", "S_hg")
      ;[Shg].forEach((x) => positive(x, "S_hg"))
      const to = d * Math.sqrt((C * P) / (S * E) + (1.9 * Wo * hG) / (S * E * d ** 3))
      const tg = d * Math.sqrt((1.9 * Wg * hG) / (Shg * E * d ** 3))
      t = Math.max(to, tg)
      o.steps.push(
        { title: "Eq. (4.6.3) — operating condition", latex: ["t_o=d\\sqrt{\\frac{CP}{S_{ho}E}+\\frac{1.9W_oh_G}{S_{ho}Ed^3}}", `t_o=${fmt(to)}`] },
        { title: "Eq. (4.6.4) — gasket seating", latex: ["t_g=d\\sqrt{\\frac{1.9W_gh_G}{S_{hg}Ed^3}}", `t_g=${fmt(tg)}`] },
        { title: "Eq. (4.6.2) — governing thickness", latex: [`t=\\max[t_o,t_g]=\\max[${fmt(to)},${fmt(tg)}]=${fmt(t)}`] },
      )
      o.results.push({ label: "t_o (operating)", value: plain(to), unit: u("length", sys), status: "info" }, { label: "t_g (gasket seating)", value: plain(tg), unit: u("length", sys), status: "info" })
    }
    o.results.unshift({ label: "Required thickness t", latex: "t", value: plain(t), unit: u("length", sys), status: "info" }, { label: "t + corrosion allowance", value: plain(t + CA), unit: u("length", sys), status: "info" })
    o.verdict = { ok: true, text: `Minimum required thickness ≈ ${plain(t + CA)} ${u("length", sys)} including corrosion allowance.` }
    o.warnings.push("These rules give strength only; a greater thickness may be needed for a deflection (leakage) criterion (4.6.1.2). Check the attachment-detail requirements in Table 4.6.1 and the weld sizes of 4.2. Heads with a large central opening (> ½ of the head diameter) follow 4.6.4.")
    return o
  },
}

const flatNonCircular: CalcDef = {
  id: "div2-flat-noncircular",
  title: "Division 2 flat unstayed non-circular head / cover",
  section: "4.6.3",
  equations: ["4.6.5", "4.6.6", "4.6.7", "4.6.8", "4.6.9"],
  summary: "t = d√(Z·C·P/(S_ho·E)) with Z = min[2.5, 3.4 − 2.4d/D]; bolted covers use the larger of t_o and t_g.",
  fields: [
    { kind: "select", key: "bolted", label: "Attachment", defaultValue: "no", options: [{ value: "no", label: "Not bolted — no edge moment (eq. 4.6.5)" }, { value: "yes", label: "Bolted — edge moment (eq. 4.6.7–4.6.9)" }] },
    num("d", "d", "d", "Short span measured as in Table 4.6.1", "length"),
    num("D", "D", "D", "Long span, measured perpendicular to the short span", "length"),
    num("P", "P", "P", "Internal design pressure", "pressure"),
    num("Sho", "S_ho", "S_{ho}", "Allowable stress of the head at the design temperature", "stress", { help: stressNote }),
    num("E", "E", "E", "Weld joint efficiency", "none", { min: 0.01, max: 1, defaultValue: 1 }),
    ...flatCFields,
    { kind: "group", label: "Bolted inputs only" },
    num("L", "L", "L", "Perimeter of the bolted head along the bolt-hole centres", "length", { optional: true }),
    num("Wo", "W_o", "W_o", "Bolt load, operating", "none", { optional: true }),
    num("Wg", "W_g", "W_g", "Bolt load, gasket seating", "none", { optional: true }),
    num("hG", "h_G", "h_G", "Gasket moment arm", "length", { optional: true }),
    num("Shg", "S_hg", "S_{hg}", "Allowable stress at gasket seating", "stress", { optional: true }),
    num("CA", "CA", "CA", "Corrosion allowance", "length", { optional: true, defaultValue: 0 }),
  ],
  compute(v, sys) {
    const d = req(v, "d", "d"), D = req(v, "D", "D"), P = req(v, "P", "P"), S = req(v, "Sho", "S_ho"), E = req(v, "E", "E")
    ;[d, D, P, S, E].forEach((x) => positive(x, "Every input"))
    if (D < d) throw new Error("D (long span) must not be smaller than d (short span).")
    const CA = opt(v, "CA") ?? 0
    const { C, tex } = flatC(v)
    const Z = Math.min(2.5, 3.4 - (2.4 * d) / D)
    const o = out()
    o.steps.push({ title: "Factor C (Table 4.6.1)", latex: [tex] }, { title: "Eq. (4.6.6) — shape factor Z", latex: ["Z=\\min\\left[2.5,\\;3.4-\\frac{2.4d}{D}\\right]", `Z=\\min[2.5,\\;3.4-\\frac{2.4\\times${fmt(d)}}{${fmt(D)}}]=${fmt(Z)}`] })
    let t: number
    if (sel(v, "bolted", "no") === "no") {
      t = d * Math.sqrt((Z * C * P) / (S * E))
      o.steps.push({ title: "Eq. (4.6.5) — required thickness", latex: ["t=d\\sqrt{\\frac{ZCP}{S_{ho}E}}", `t=${fmt(t)}`] })
    } else {
      const L = req(v, "L", "L"), Wo = req(v, "Wo", "W_o"), Wg = req(v, "Wg", "W_g"), hG = req(v, "hG", "h_G"), Shg = req(v, "Shg", "S_hg")
      positive(L, "L"); positive(Shg, "S_hg")
      const to = d * Math.sqrt((Z * C * P) / (S * E) + (6 * Wo * hG) / (S * E * L * d ** 2))
      const tg = d * Math.sqrt((6 * Wg * hG) / (Shg * E * L * d ** 2))
      t = Math.max(to, tg)
      o.steps.push({ title: "Eq. (4.6.8) — operating", latex: ["t_o=d\\sqrt{\\frac{ZCP}{S_{ho}E}+\\frac{6W_oh_G}{S_{ho}ELd^2}}", `t_o=${fmt(to)}`] }, { title: "Eq. (4.6.9) — gasket seating", latex: ["t_g=d\\sqrt{\\frac{6W_gh_G}{S_{hg}ELd^2}}", `t_g=${fmt(tg)}`] }, { title: "Eq. (4.6.7)", latex: [`t=\\max[t_o,t_g]=${fmt(t)}`] })
      o.results.push({ label: "t_o (operating)", value: plain(to), unit: u("length", sys), status: "info" }, { label: "t_g (gasket seating)", value: plain(tg), unit: u("length", sys), status: "info" })
    }
    o.results.unshift({ label: "Z", value: plain(Z, 4), status: "info" }, { label: "Required thickness t", latex: "t", value: plain(t), unit: u("length", sys), status: "info" }, { label: "t + corrosion allowance", value: plain(t + CA), unit: u("length", sys), status: "info" })
    o.verdict = { ok: true, text: `Minimum required thickness ≈ ${plain(t + CA)} ${u("length", sys)} including corrosion allowance.` }
    return o
  },
}

// ---------------------------------------------------------------------------------------------
// 4.4 shells under external pressure (cylinder 4.4.5; sphere, torispherical and ellipsoidal heads 4.4.7–4.4.9)
// ---------------------------------------------------------------------------------------------
/** Design factor FS, eq. (4.4.1)–(4.4.3). */
export function designFactorFS(Fic: number, Sy: number): { FS: number; eq: string } {
  if (Fic <= 0.55 * Sy) return { FS: 2.0, eq: "4.4.1" }
  if (Fic < Sy) return { FS: 2.407 - 0.741 * (Fic / Sy), eq: "4.4.2" }
  return { FS: 1.667, eq: "4.4.3" }
}
/** Cylinder: C_h per eq. (4.4.19)–(4.4.22). */
export function cylinderCh(Mx: number, Do: number, t: number): { Ch: number; eq: string } {
  const limit = 2 * (Do / t) ** 0.94
  if (Mx >= limit) return { Ch: 0.55 * (t / Do), eq: "4.4.19" }
  if (Mx > 13) return { Ch: 1.12 * Mx ** -1.058, eq: "4.4.20" }
  if (Mx > 1.5) return { Ch: 0.92 / (Mx - 0.579), eq: "4.4.21" }
  return { Ch: 1.0, eq: "4.4.22" }
}
/** Ellipsoidal head equivalent-sphere factor K_o, eq. (4.4.51). */
export function ellipsoidKo(Do: number, ho: number): number {
  const x = Do / (2 * ho)
  return 0.25346 + 0.13995 * x + 0.12238 * x ** 2 - 0.015297 * x ** 3
}

const extMaterialFields = [
  num("Ey", "E_y", "E_y", "Modulus of elasticity at the design temperature (Annex 3-E)", "modulus", { help: stressNote }),
  num("Sy", "S_y", "S_y", "Minimum specified yield strength at the design temperature", "stress"),
  { kind: "select" as const, key: "ficMode", label: "Predicted inelastic buckling stress F_ic (4.4.3)", defaultValue: "manual", options: [{ value: "manual", label: "I will enter F_ic (from the 4.4.3 iteration with the Annex 3-D.5.1 tangent modulus, or 3-D.5.2 charts)" }, { value: "elastic", label: "Buckling is elastic (E_t = E): use F_ic = F_he — only valid below the proportional limit" }] },
  num("Fic", "F_ic", "F_{ic}", "F_ic — leave blank on the first pass to see F_he and A_e = F_he/E first", "stress", { optional: true }),
  num("P", "P_ext", "P", "External design pressure to check against (optional)", "pressure", { optional: true }),
]

function externalFinish(o: CalcOutput, v: Values, sys: UnitSystem, p: { Fhe: number; Ey: number; Sy: number; geom: number; geomTex: string; eqF: string; eqP: string }) {
  const Ae = p.Fhe / p.Ey
  o.results.push({ label: "F_he (elastic buckling stress)", latex: "F_{he}", value: plain(p.Fhe), unit: u("stress", sys), status: "info" }, { label: "A_e = F_he / E_y", value: plain(Ae, 4), status: "info" })
  o.steps.push({ title: "Eq. (4.4.4) — elastic buckling ratio", latex: [`A_e=\\frac{F_{he}}{E_y}=\\frac{${fmt(p.Fhe)}}{${fmt(p.Ey)}}=${fmt(Ae)}`] })
  const elastic = sel(v, "ficMode", "manual") === "elastic"
  const Fic = elastic ? p.Fhe : opt(v, "Fic")
  if (Fic === undefined) {
    o.warnings.push(`Next step (4.4.3, eq. 4.4.5): find F_ic from F_ic / E_t = A_e = ${plain(Ae, 4)} using the tangent modulus E_t of Annex 3-D.5.1 (or E_t = 2B/A from the Section II-D charts, 3-D.5.2), then enter F_ic and calculate again to get P_a.`)
    return
  }
  if (Fic > p.Fhe * 1.0001) o.warnings.push("F_ic is greater than F_he — the inelastic buckling stress cannot exceed the elastic one. Check the iteration.")
  const { FS, eq } = designFactorFS(Fic, p.Sy)
  const Fha = Fic / FS
  const Pa = (2 * Fha) * p.geom
  o.steps.push(
    { title: `Eq. (${eq}) — design factor FS`, latex: [eq === "4.4.1" ? `F_{ic}=${fmt(Fic)}\\le0.55S_y=${fmt(0.55 * p.Sy)}\\Rightarrow FS=2.0` : eq === "4.4.2" ? `FS=2.407-0.741\\frac{F_{ic}}{S_y}=2.407-0.741\\times${fmt(Fic / p.Sy, 4)}=${fmt(FS)}` : `F_{ic}\\ge S_y\\Rightarrow FS=1.667`] },
    { title: `Eq. (${p.eqF}) — allowable stress`, latex: [`F_{ha}=\\frac{F_{ic}}{FS}=\\frac{${fmt(Fic)}}{${fmt(FS)}}=${fmt(Fha)}`] },
    { title: `Eq. (${p.eqP}) — allowable external pressure`, latex: [p.geomTex, `P_a=2\\times${fmt(Fha)}\\times${fmt(p.geom, 5)}=${fmt(Pa)}`] },
  )
  o.results.push({ label: "F_ic", latex: "F_{ic}", value: plain(Fic), unit: u("stress", sys), status: "info" }, { label: "Design factor FS", value: plain(FS, 4), status: "info" }, { label: "F_ha = F_ic / FS", value: plain(Fha), unit: u("stress", sys), status: "info" }, { label: "Allowable external pressure P_a", latex: "P_a", value: plain(Pa), unit: u("pressure", sys), status: "info" })
  const P = opt(v, "P")
  if (P !== undefined) {
    const ok = Pa >= P
    o.steps.push({ title: "Step 6 — compare with the external design pressure", latex: [`P_a=${fmt(Pa)}\\;${ok ? "\\ge" : "<"}\\;P=${fmt(P)}\\;\\Rightarrow\\;${verdictTxt(ok)}`] })
    o.results.push({ label: "P_a ≥ P", value: `${plain(Pa)} vs ${plain(P)}  (ratio ${plain(P / Pa, 3)})`, unit: u("pressure", sys), status: ok ? "pass" : "fail" })
    o.verdict = { ok, text: ok ? "The shell is adequate for the external design pressure." : "Allowable external pressure is below the design pressure — increase the thickness (or add stiffening) and repeat." }
  } else o.verdict = { ok: true, text: `Allowable external pressure P_a ≈ ${plain(Pa)} ${u("pressure", sys)}.` }
}

const extCylinder: CalcDef = {
  id: "div2-ext-cylinder",
  title: "Division 2 cylinder under external pressure",
  section: "4.4.5",
  equations: ["4.4.1", "4.4.2", "4.4.3", "4.4.4", "4.4.17", "4.4.18", "4.4.19", "4.4.20", "4.4.21", "4.4.22", "4.4.23", "4.4.24"],
  summary: "Elastic buckling stress F_he, design factor FS and allowable external pressure P_a for an unstiffened cylindrical shell (D_o/t ≤ 2000).",
  fields: [
    num("Do", "D_o", "D_o", "Outside diameter", "length"),
    num("t", "t", "t", "Wall thickness (corroded) to check", "length"),
    num("L", "L", "L", "Unsupported length (Figures 4.4.1 and 4.4.2 — includes one-third of head depth)", "length"),
    ...extMaterialFields,
  ],
  compute(v, sys) {
    const Do = req(v, "Do", "D_o"), t = req(v, "t", "t"), L = req(v, "L", "L"), Ey = req(v, "Ey", "E_y"), Sy = req(v, "Sy", "S_y")
    ;[Do, t, L, Ey, Sy].forEach((x) => positive(x, "Every input"))
    if (t >= Do / 2) throw new Error("t must be smaller than D_o / 2.")
    const o = out()
    const Ro = Do / 2
    const Mx = L / Math.sqrt(Ro * t)
    const { Ch, eq } = cylinderCh(Mx, Do, t)
    const Fhe = (1.6 * Ch * Ey * t) / Do
    const slender = Do / t
    o.steps.push(
      { title: "Applicability (4.4.1.4)", latex: [`D_o/t=${fmt(slender)}\\;\\le\\;2000\\Rightarrow ${verdictTxt(slender <= 2000)}`] },
      { title: "Eq. (4.4.18) — length parameter", latex: [`M_x=\\frac{L}{\\sqrt{R_ot}}=\\frac{${fmt(L)}}{\\sqrt{${fmt(Ro)}\\times${fmt(t)}}}=${fmt(Mx)}`, `2\\left(\\frac{D_o}{t}\\right)^{0.94}=${fmt(2 * slender ** 0.94)}`] },
      { title: `Eq. (${eq}) — coefficient C_h`, latex: [eq === "4.4.19" ? `M_x\\ge2(D_o/t)^{0.94}\\Rightarrow C_h=0.55\\frac{t}{D_o}=${fmt(Ch)}` : eq === "4.4.20" ? `13<M_x<2(D_o/t)^{0.94}\\Rightarrow C_h=1.12M_x^{-1.058}=${fmt(Ch)}` : eq === "4.4.21" ? `1.5<M_x\\le13\\Rightarrow C_h=\\frac{0.92}{M_x-0.579}=${fmt(Ch)}` : `M_x\\le1.5\\Rightarrow C_h=1.0`] },
      { title: "Eq. (4.4.17) — predicted elastic buckling stress", latex: ["F_{he}=\\frac{1.6C_hE_yt}{D_o}", `F_{he}=\\frac{1.6\\times${fmt(Ch)}\\times${fmt(Ey)}\\times${fmt(t)}}{${fmt(Do)}}=${fmt(Fhe)}`] },
    )
    o.results.push({ label: "D_o / t (≤ 2000)", value: plain(slender), status: slender <= 2000 ? "pass" : "fail" }, { label: "M_x", value: plain(Mx, 4), status: "info" }, { label: `C_h (eq. ${eq})`, value: plain(Ch, 5), status: "info" })
    externalFinish(o, v, sys, { Fhe, Ey, Sy, geom: t / Do, geomTex: "P_a=2F_{ha}\\left(\\frac{t}{D_o}\\right)", eqF: "4.4.24", eqP: "4.4.23" })
    if (slender > 2000) o.verdict = { ok: false, text: "D_o/t exceeds 2000 — design per Part 5." }
    o.warnings.push("Unstiffened cylinder, external pressure only. Check the tolerance rules (4.4.4), combined loadings (4.4.12), stiffening-ring sizing (4.4.5.2) and, if the shell is also under axial compression or bending, the interaction rules.")
    return o
  },
}

const extHead: CalcDef = {
  id: "div2-ext-sphere-head",
  title: "Division 2 sphere / torispherical / ellipsoidal head under external pressure",
  section: "4.4.7",
  equations: ["4.4.48", "4.4.49", "4.4.50", "4.4.51", "4.4.1", "4.4.2", "4.4.3"],
  summary: "Spherical shells and hemispherical heads use F_he = 0.075 E_y t/R_o; torispherical heads use the outside crown radius; ellipsoidal heads use R_o = K_o D_o.",
  fields: [
    { kind: "select", key: "shape", label: "Shape", defaultValue: "sph", options: [{ value: "sph", label: "Spherical shell or hemispherical head (4.4.7)" }, { value: "tori", label: "Torispherical head (4.4.8): R_o = outside crown radius" }, { value: "ell", label: "Ellipsoidal head (4.4.9): R_o = K_o D_o" }] },
    num("Ro", "R_o", "R_o", "Outside radius (sphere) or outside crown radius (torispherical)", "length", { optional: true }),
    num("Do", "D_o", "D_o", "Ellipsoidal head: outside diameter", "length", { optional: true }),
    num("ho", "h_o", "h_o", "Ellipsoidal head: outside depth of the head", "length", { optional: true }),
    num("t", "t", "t", "Wall thickness (corroded) to check", "length"),
    ...extMaterialFields,
  ],
  compute(v, sys) {
    const shape = sel(v, "shape", "sph"), t = req(v, "t", "t"), Ey = req(v, "Ey", "E_y"), Sy = req(v, "Sy", "S_y")
    ;[t, Ey, Sy].forEach((x) => positive(x, "Every input"))
    const o = out()
    let Ro: number
    if (shape === "ell") {
      const Do = req(v, "Do", "D_o"), ho = req(v, "ho", "h_o"); positive(Do, "D_o"); positive(ho, "h_o")
      const Ko = ellipsoidKo(Do, ho)
      Ro = Ko * Do
      o.steps.push({ title: "Eq. (4.4.51) — equivalent sphere factor K_o", latex: ["K_o=0.25346+0.13995\\left(\\frac{D_o}{2h_o}\\right)+0.12238\\left(\\frac{D_o}{2h_o}\\right)^2-0.015297\\left(\\frac{D_o}{2h_o}\\right)^3", `\\frac{D_o}{2h_o}=${fmt(Do / (2 * ho), 4)}\\Rightarrow K_o=${fmt(Ko, 5)},\\quad R_o=K_oD_o=${fmt(Ro)}`] })
      o.results.push({ label: "K_o", value: plain(Ko, 5), status: "info" }, { label: "Equivalent R_o = K_o D_o", value: plain(Ro), unit: u("length", sys), status: "info" })
    } else {
      Ro = req(v, "Ro", "R_o"); positive(Ro, "R_o")
    }
    const Fhe = (0.075 * Ey * t) / Ro
    o.steps.push({ title: "Eq. (4.4.48) — predicted elastic buckling stress", latex: ["F_{he}=0.075E_y\\left(\\frac{t}{R_o}\\right)", `F_{he}=0.075\\times${fmt(Ey)}\\times\\frac{${fmt(t)}}{${fmt(Ro)}}=${fmt(Fhe)}`] })
    externalFinish(o, v, sys, { Fhe, Ey, Sy, geom: t / Ro, geomTex: "P_a=2F_{ha}\\left(\\frac{t}{R_o}\\right)", eqF: "4.4.50", eqP: "4.4.49" })
    if (shape === "tori") o.warnings.push("Torispherical heads must also satisfy the geometry restrictions of 4.3.6 (4.4.8.2); heads with different dome and knuckle thicknesses are designed per Part 5.")
    o.warnings.push("External pressure only — combined loadings follow 4.4.12.")
    return o
  },
}

// ---------------------------------------------------------------------------------------------
// 4.16.6 flange design bolt loads (+ Table 4.16.1 gasket factors) and 4.16.7 step 5 flange forces
// ---------------------------------------------------------------------------------------------
/** Table 4.16.1 — suggested gasket factors m and y (y in MPa and psi). Values are "suggested only, not mandatory". */
export const GASKETS: Array<{ id: string; label: string; m: number; yMPa: number; yPsi: number }> = [
  { id: "self", label: "Self-energizing types (O-rings, metallic, elastomer, self-sealing)", m: 0, yMPa: 0, yPsi: 0 },
  { id: "elast-lt75", label: "Elastomer without fabric or high mineral fibre, below 75 A Shore", m: 0.5, yMPa: 0, yPsi: 0 },
  { id: "elast-ge75", label: "Elastomer without fabric or high mineral fibre, 75 A Shore or higher", m: 1.0, yMPa: 1.4, yPsi: 200 },
  { id: "fibre-3", label: "Mineral fibre with suitable binder, 3.2 mm (1/8 in.) thick", m: 2.0, yMPa: 11, yPsi: 1600 },
  { id: "fibre-16", label: "Mineral fibre with suitable binder, 1.6 mm (1/16 in.) thick", m: 2.75, yMPa: 26, yPsi: 3700 },
  { id: "fibre-08", label: "Mineral fibre with suitable binder, 0.8 mm (1/32 in.) thick", m: 3.5, yMPa: 45, yPsi: 6500 },
  { id: "cotton", label: "Elastomer with cotton fabric insertion", m: 1.25, yMPa: 2.8, yPsi: 400 },
  { id: "ins3", label: "Elastomer with mineral fibre insertion, 3-ply", m: 2.25, yMPa: 15, yPsi: 2200 },
  { id: "ins2", label: "Elastomer with mineral fibre insertion, 2-ply", m: 2.5, yMPa: 20, yPsi: 2900 },
  { id: "ins1", label: "Elastomer with mineral fibre insertion, 1-ply", m: 2.75, yMPa: 26, yPsi: 3700 },
  { id: "veg", label: "Vegetable fibre", m: 1.75, yMPa: 7.6, yPsi: 1100 },
  { id: "spiral-cs", label: "Spiral-wound metal, mineral fibre filler — carbon steel", m: 2.5, yMPa: 69, yPsi: 10000 },
  { id: "spiral-ss", label: "Spiral-wound metal, mineral fibre filler — stainless, Monel, nickel-base", m: 3.0, yMPa: 69, yPsi: 10000 },
  { id: "corrJ-al", label: "Corrugated metal, fibre inserted / jacketed fibre filled — soft aluminium", m: 2.5, yMPa: 20, yPsi: 2900 },
  { id: "corrJ-cu", label: "Corrugated metal, fibre inserted / jacketed fibre filled — soft copper or brass", m: 2.75, yMPa: 26, yPsi: 3700 },
  { id: "corrJ-fe", label: "Corrugated metal, fibre inserted / jacketed fibre filled — iron or soft steel", m: 3.0, yMPa: 31, yPsi: 4500 },
  { id: "corrJ-mo", label: "Corrugated metal, fibre inserted / jacketed fibre filled — Monel or 4–6% chrome", m: 3.25, yMPa: 38, yPsi: 5500 },
  { id: "corrJ-ss", label: "Corrugated metal, fibre inserted / jacketed fibre filled — stainless, nickel-base", m: 3.5, yMPa: 45, yPsi: 6500 },
  { id: "corr-al", label: "Corrugated metal — soft aluminium", m: 2.75, yMPa: 26, yPsi: 3700 },
  { id: "corr-cu", label: "Corrugated metal — soft copper or brass", m: 3.0, yMPa: 31, yPsi: 4500 },
  { id: "corr-fe", label: "Corrugated metal — iron or soft steel", m: 3.25, yMPa: 38, yPsi: 5500 },
  { id: "corr-mo", label: "Corrugated metal — Monel or 4–6% chrome", m: 3.5, yMPa: 45, yPsi: 6500 },
  { id: "corr-ss", label: "Corrugated metal — stainless, nickel-base", m: 3.75, yMPa: 52, yPsi: 7600 },
  { id: "flatJ-al", label: "Flat metal, jacketed mineral fibre filled — soft aluminium", m: 3.25, yMPa: 38, yPsi: 5500 },
  { id: "flatJ-cu", label: "Flat metal, jacketed mineral fibre filled — soft copper or brass", m: 3.5, yMPa: 45, yPsi: 6500 },
  { id: "flatJ-fe", label: "Flat metal, jacketed mineral fibre filled — iron or soft steel", m: 3.75, yMPa: 52, yPsi: 7600 },
  { id: "flatJ-mo", label: "Flat metal, jacketed mineral fibre filled — Monel", m: 3.5, yMPa: 55, yPsi: 8000 },
  { id: "flatJ-cr", label: "Flat metal, jacketed mineral fibre filled — 4–6% chrome", m: 3.75, yMPa: 62, yPsi: 9000 },
  { id: "flatJ-ss", label: "Flat metal, jacketed mineral fibre filled — stainless, nickel-base", m: 3.75, yMPa: 62, yPsi: 9000 },
  { id: "groove-al", label: "Grooved metal — soft aluminium", m: 3.25, yMPa: 38, yPsi: 5500 },
  { id: "groove-cu", label: "Grooved metal — soft copper or brass", m: 3.5, yMPa: 45, yPsi: 6500 },
  { id: "groove-fe", label: "Grooved metal — iron or soft steel", m: 3.75, yMPa: 52, yPsi: 7600 },
  { id: "groove-mo", label: "Grooved metal — Monel or 4–6% chrome", m: 3.75, yMPa: 62, yPsi: 9000 },
  { id: "groove-ss", label: "Grooved metal — stainless, nickel-base", m: 4.25, yMPa: 70, yPsi: 10100 },
  { id: "solid-al", label: "Solid flat metal — soft aluminium", m: 4.0, yMPa: 61, yPsi: 8800 },
  { id: "solid-cu", label: "Solid flat metal — soft copper or brass", m: 4.75, yMPa: 90, yPsi: 13000 },
  { id: "solid-fe", label: "Solid flat metal — iron or soft steel", m: 5.5, yMPa: 124, yPsi: 18000 },
  { id: "solid-mo", label: "Solid flat metal — Monel or 4–6% chrome", m: 6.0, yMPa: 150, yPsi: 21800 },
  { id: "solid-ss", label: "Solid flat metal — stainless, nickel-base", m: 6.5, yMPa: 180, yPsi: 26000 },
  { id: "ring-fe", label: "Ring joint — iron or soft steel", m: 5.5, yMPa: 124, yPsi: 18000 },
  { id: "ring-mo", label: "Ring joint — Monel or 4–6% chrome", m: 6.0, yMPa: 150, yPsi: 21800 },
  { id: "ring-ss", label: "Ring joint — stainless, nickel-base", m: 6.5, yMPa: 180, yPsi: 26000 },
  { id: "manual", label: "Other gasket — enter m and y yourself", m: NaN, yMPa: NaN, yPsi: NaN },
]

const flangeBolts: CalcDef = {
  id: "div2-flange-bolt-loads",
  title: "Division 2 flange design bolt loads and flange forces",
  section: "4.16.6",
  equations: ["4.16.1", "4.16.2", "4.16.3", "4.16.4", "4.16.5", "4.16.6", "4.16.7", "4.16.8", "4.16.9", "4.16.10", "4.16.11", "4.16.12", "4.16.13"],
  summary: "Gasket width b and reaction diameter G, operating and gasket-seating bolt loads W_o and W_g, the required bolt area A_m, and the hydrostatic end forces H_D, H, H_T and H_G (Table 4.16.1 gasket factors built in).",
  fields: [
    { kind: "group", label: "Gasket (Table 4.16.1, suggested values)" },
    { kind: "select", key: "gasket", label: "Gasket material", defaultValue: "spiral-ss", options: GASKETS.map((g) => ({ value: g.id, label: g.label })) },
    num("mMan", "m", "m", "Other gasket: gasket factor m", "none", { optional: true }),
    num("yMan", "y", "y", "Other gasket: seating stress y", "stress", { optional: true }),
    { kind: "select", key: "selfE", label: "Gasket type", defaultValue: "no", options: [{ value: "no", label: "Non-self-energized (eq. 4.16.4 and 4.16.8)" }, { value: "yes", label: "Self-energized (eq. 4.16.5 and 4.16.9)" }] },
    { kind: "group", label: "Geometry (Table 4.16.3, Figure 4.16.8)" },
    num("b0", "b₀", "b_0", "Basic gasket seating width b₀ (from Table 4.16.3 for your facing sketch and N)", "length"),
    num("Gc", "G_c", "G_c", "Outside diameter of the gasket contact area (Figure 4.16.8)", "length"),
    num("Gmean", "G", "G", "Only if b₀ ≤ 6 mm (0.25 in.): G is the mean diameter of the gasket contact face", "length", { optional: true }),
    num("B", "B", "B", "Flange bore (inside diameter) — only for H_D, H_T and H_G", "length", { optional: true }),
    { kind: "group", label: "Loads and bolting" },
    num("P", "P", "P", "Design pressure (absolute value for vacuum)", "pressure"),
    num("Sbo", "S_bo", "S_{bo}", "Bolt allowable stress at the design temperature (Annex 3-A)", "stress", { help: stressNote }),
    num("Sbg", "S_bg", "S_{bg}", "Bolt allowable stress at the gasket seating (ambient) temperature", "stress"),
    num("Ab", "A_b", "A_b", "Actual total bolt root area selected (leave blank to size from A_m)", "none", { optional: true, help: "Area in length² units (mm² or in²)." }),
    num("FA", "F_A", "F_A", "External tensile net-section axial force (0 if none)", "none", { optional: true, defaultValue: 0, help: "Force: N (SI) or lbf (US), consistent with the other units." }),
    num("ME", "M_E", "M_E", "External bending moment on the joint (0 if none)", "none", { optional: true, defaultValue: 0, help: "N·mm (SI) or lbf·in (US)." }),
  ],
  compute(v, sys) {
    const g = GASKETS.find((x) => x.id === sel(v, "gasket", "spiral-ss")) ?? GASKETS[0]
    const m = g.id === "manual" ? req(v, "mMan", "m") : g.m
    const y = g.id === "manual" ? req(v, "yMan", "y") : sys === "SI" ? g.yMPa : g.yPsi
    const b0 = req(v, "b0", "b₀"), Gc = req(v, "Gc", "G_c"), P = req(v, "P", "P"), Sbo = req(v, "Sbo", "S_bo"), Sbg = req(v, "Sbg", "S_bg")
    ;[b0, Gc, Sbo, Sbg].forEach((x) => positive(x, "Every input"))
    if (P < 0) throw new Error("Use the absolute value of the design pressure.")
    const selfE = sel(v, "selfE", "no") === "yes"
    const FA = opt(v, "FA") ?? 0, ME = opt(v, "ME") ?? 0
    const Cul = sys === "SI" ? 25.4 : 1.0, limit = sys === "SI" ? 6 : 0.25
    const o = out()
    o.steps.push({ title: `Gasket factors — ${g.label}`, latex: [`m=${fmt(m)},\\quad y=${fmt(y)}\\;${u("stress", sys)}`] })
    let b: number, G: number
    if (b0 <= limit) {
      b = b0
      G = req(v, "Gmean", "G (mean diameter of the contact face)")
      o.steps.push({ title: "Eq. (4.16.1) — effective width (b₀ ≤ 6 mm)", latex: [`b=b_0=${fmt(b)},\\quad G=${fmt(G)}\\text{ (mean diameter of the contact face)}`] })
    } else {
      b = 0.5 * Cul * Math.sqrt(b0 / Cul)
      G = Gc - 2 * b
      o.steps.push({ title: "Eq. (4.16.2) and (4.16.3) — effective width and reaction diameter", latex: ["b=0.5C_{ul}\\sqrt{\\frac{b_0}{C_{ul}}}", `b=0.5\\times${fmt(Cul)}\\sqrt{\\frac{${fmt(b0)}}{${fmt(Cul)}}}=${fmt(b)}`, `G=G_c-2b=${fmt(Gc)}-2\\times${fmt(b)}=${fmt(G)}`] })
    }
    const H = 0.785 * G * G * P
    const Wo = selfE ? H : H + 2 * b * Math.PI * G * m * P
    const Wgs = selfE ? 0 : Math.PI * b * G * y
    const Am = Math.max((Wo + FA + (4 * ME) / G) / Sbo, Wgs / Sbg)
    const Ab = opt(v, "Ab") ?? Am
    const Wg = ((Am + Ab) / 2) * Sbg
    o.steps.push(
      { title: selfE ? "Eq. (4.16.5) — operating bolt load (self-energized)" : "Eq. (4.16.4) — operating bolt load", latex: selfE ? ["W_o=0.785G^2P", `W_o=${fmt(Wo)}`] : ["W_o=0.785G^2P+2b\\pi GmP", `W_o=0.785\\times${fmt(G)}^2\\times${fmt(P)}+2\\times${fmt(b)}\\times\\pi\\times${fmt(G)}\\times${fmt(m)}\\times${fmt(P)}=${fmt(Wo)}`] },
      { title: selfE ? "Eq. (4.16.9) — gasket seating load" : "Eq. (4.16.8) — gasket seating load", latex: selfE ? ["W_{gs}=0"] : ["W_{gs}=\\pi bGy", `W_{gs}=\\pi\\times${fmt(b)}\\times${fmt(G)}\\times${fmt(y)}=${fmt(Wgs)}`] },
      { title: "Eq. (4.16.7) — required bolt area", latex: ["A_m=\\max\\left[\\frac{W_o+F_A+4M_E/G}{S_{bo}},\\;\\frac{W_{gs}}{S_{bg}}\\right]", `A_m=\\max\\left[\\frac{${fmt(Wo)}+${fmt(FA)}+4\\times${fmt(ME)}/${fmt(G)}}{${fmt(Sbo)}},\\;\\frac{${fmt(Wgs)}}{${fmt(Sbg)}}\\right]=${fmt(Am)}`] },
      { title: "Eq. (4.16.6) — gasket seating bolt load", latex: ["W_g=\\left(\\frac{A_m+A_b}{2}\\right)S_{bg}", `W_g=\\frac{${fmt(Am)}+${fmt(Ab)}}{2}\\times${fmt(Sbg)}=${fmt(Wg)}`] },
    )
    o.results.push({ label: "b (effective gasket width)", value: plain(b), unit: u("length", sys), status: "info" }, { label: "G (gasket reaction diameter)", value: plain(G), unit: u("length", sys), status: "info" }, { label: "W_o (operating bolt load)", latex: "W_o", value: plain(Wo), unit: sys === "SI" ? "N" : "lbf", status: "info" }, { label: "W_gs", value: plain(Wgs), unit: sys === "SI" ? "N" : "lbf", status: "info" }, { label: "A_m (required bolt area)", latex: "A_m", value: plain(Am), unit: sys === "SI" ? "mm²" : "in²", status: "info" }, { label: "W_g (gasket seating bolt load)", latex: "W_g", value: plain(Wg), unit: sys === "SI" ? "N" : "lbf", status: "info" })
    let ok = true
    if (opt(v, "Ab") !== undefined) {
      ok = Ab >= Am
      o.results.push({ label: "A_b ≥ A_m", value: `${plain(Ab)} vs ${plain(Am)}  (ratio ${plain(Am / Ab, 3)})`, unit: sys === "SI" ? "mm²" : "in²", status: ok ? "pass" : "fail" })
    }
    const Bd = opt(v, "B")
    if (Bd !== undefined) {
      positive(Bd, "B")
      const HD = 0.785 * Bd * Bd * P, HT = H - HD, HG = Wo - H
      o.steps.push({ title: "Eq. (4.16.10)–(4.16.13) — hydrostatic end forces", latex: [`H_D=0.785B^2P=${fmt(HD)}`, `H=0.785G^2P=${fmt(H)}`, `H_T=H-H_D=${fmt(HT)}`, `H_G=W_o-H=${fmt(HG)}`] })
      o.results.push({ label: "H_D", value: plain(HD), unit: sys === "SI" ? "N" : "lbf", status: "info" }, { label: "H", value: plain(H), unit: sys === "SI" ? "N" : "lbf", status: "info" }, { label: "H_T = H − H_D", value: plain(HT), unit: sys === "SI" ? "N" : "lbf", status: "info" }, { label: "H_G = W_o − H", value: plain(HG), unit: sys === "SI" ? "N" : "lbf", status: "info" })
    }
    o.verdict = { ok, text: ok ? `Required bolt area A_m ≈ ${plain(Am)} ${sys === "SI" ? "mm²" : "in²"}; design bolt loads W_o = ${plain(Wo)} and W_g = ${plain(Wg)}.` : "The selected bolt area is smaller than the required A_m — select larger or more bolts." }
    o.warnings.push("This is the bolt-load step (4.16.6) only. The flange moments, stress factors (Tables 4.16.4–4.16.5), stress limits (Table 4.16.9) and rigidity check (Table 4.16.10) of 4.16.7 are not calculated here. The m and y values are suggested only (Table 4.16.1 note) and gasket width should meet Table 4.16.2.")
    return o
  },
}

// ---------------------------------------------------------------------------------------------
// 4.5.16 inspection and access openings (from the rule text)
// ---------------------------------------------------------------------------------------------
const inspectionOpenings: CalcDef = {
  id: "div2-inspection-openings",
  title: "Division 2 inspection / access openings required",
  section: "4.5.16",
  equations: [],
  summary: "What inspection openings a vessel needs by inside diameter (4.5.16.4–4.5.16.6) and the minimum opening sizes (4.5.16.7).",
  fields: [
    num("ID", "ID", "ID", "Vessel inside diameter", "length"),
    { kind: "select", key: "service", label: "Service (4.5.16.1)", defaultValue: "corrosive", options: [{ value: "corrosive", label: "Compressed air, or internal corrosion / erosion / abrasion expected — openings required" }, { value: "other", label: "Non-corrosive service — 4.5.16.1 does not require them (statement “for noncorrosive service” on the Data Report)" }] },
  ],
  compute(v, sys) {
    const idm = req(v, "ID", "ID") * (sys === "SI" ? 1 : 25.4) // mm
    positive(idm, "ID")
    const o = out()
    let rule: string, text: string
    if (sel(v, "service", "corrosive") === "other") {
      rule = "4.5.16.1"; text = "Inspection openings are required only for compressed air and for vessels subject to internal corrosion, erosion or abrasion. If none applies, the Data Report notes “for noncorrosive service”."
    } else if (idm <= 300) {
      rule = "4.5.16.4"; text = "Openings for inspection only may be omitted if there are at least two removable pipe connections of not less than DN 20 (NPS ¾)."
    } else if (idm < 400) {
      rule = "4.5.16.5 / 4.5.16.6(a)"; text = "At least two handholes or two threaded pipe-plug inspection openings of not less than DN 40 (NPS 1½). Openings for inspection only may be omitted if the vessel cannot be inspected without removal from its assembly and has at least two removable pipe connections of not less than DN 40."
    } else if (idm < 450) {
      rule = "4.5.16.6(a)"; text = "At least two handholes or two plugged, threaded inspection openings of not less than DN 40 (NPS 1½)."
    } else if (idm <= 900) {
      rule = "4.5.16.6(b)"; text = "A manhole, or at least two handholes, or two plugged threaded inspection openings of not less than DN 50 (NPS 2)."
    } else {
      rule = "4.5.16.6(c)"; text = "A manhole — except where the shape or use makes one impracticable, in which case at least two handholes 100 mm × 150 mm (4 in. × 6 in.) or two equal openings of equivalent area."
    }
    o.steps.push({ title: `Rule ${rule}`, text })
    o.results.push({ label: "Inside diameter", value: plain(idm), unit: "mm", status: "info" }, { label: "Governing rule", value: rule, status: "info" })
    o.results.push({ label: "Minimum manhole", value: "circular ≥ 400 mm (16 in.) ID; elliptical/obround ≥ 300 × 400 mm (12 × 16 in.)", status: "info" }, { label: "Minimum handhole", value: "≥ 50 × 75 mm (2 × 3 in.), larger if the vessel allows", status: "info" })
    o.verdict = { ok: true, text }
    o.warnings.push("Other options (4.5.16.6(d)–(g)): with handholes or plugs, one opening in each head (or the shell near each head); a single removable-cover opening or removable piping connections of at least equal size and view may replace the smaller openings. All access openings are designed to the Part 4 opening rules (4.5.16.8); manholes closed by internal pressure against a flat gasket need a gasket bearing width of at least 17 mm (0.6875 in.) (4.5.16.10).")
    return o
  },
}

// ---------------------------------------------------------------------------------------------
// Table lookups read from the PDF text: Table 7.2 (weld joint efficiency + NDE extent), Tables 6.8–6.10 (PWHT), Table 6.6
// ---------------------------------------------------------------------------------------------
const EXAM_GROUPS = [
  { id: "1a", E: 1.0, mats: "all materials permitted in Annex 3-A" },
  { id: "1b", E: 1.0, mats: "material groups 1.1, 1.2, 8.1, 11.1" },
  { id: "2a", E: 1.0, mats: "material groups 8.2, 9.1, 9.2, 9.3, 10" },
  { id: "2b", E: 1.0, mats: "material groups 1.1, 1.2, 8.1, 11.1" },
  { id: "3a", E: 0.85, mats: "material groups 8.2, 9.1, 9.2, 10" },
  { id: "3b", E: 0.85, mats: "material groups 1.1, 1.2, 8.1, 11.1" },
]
type Ext = string // "100%", "25%", "NP", "NA", "0"
/** Rows of Table 7.2, columns in the order 1a, 1b, 2a, 2b, 3a, 3b. */
const NDE_ROWS: Array<{ id: string; cat: string; label: string; rt: Ext[]; mt: Ext[] }> = [
  { id: "A-long", cat: "A", label: "Full-penetration butt weld, longitudinal joints (Type 1)", rt: ["100", "100", "100", "100", "25", "10"], mt: ["10", "10", "10", "0", "0", "0"] },
  { id: "B-circ", cat: "B", label: "Circumferential joints on a shell, incl. shell to non-hemispherical head (Type 1)", rt: ["25", "10", "25", "10", "10", "5"], mt: ["10", "10", "10", "0", "0", "0"] },
  { id: "B-circ-back", cat: "B", label: "Circumferential joints on a shell with backing strip (Types 2, 3; limited by 4.2.5.3)", rt: ["NP", "100", "NP", "25", "NP", "25"], mt: ["NP", "10", "NP", "10", "NP", "10"] },
  { id: "B-noz-big", cat: "B", label: "Circumferential joints on a nozzle, d > 150 mm (6 in.) and tn > 16 mm (5/8 in.) (Type 1)", rt: ["25", "10", "25", "10", "10", "5"], mt: ["10", "10", "10", "10", "10", "10"] },
  { id: "B-noz-big-back", cat: "B", label: "Same nozzle joints with backing strip (Types 2, 3)", rt: ["NP", "100", "NP", "100", "NA", "25"], mt: ["NP", "10", "NP", "10", "100", "10"] },
  { id: "B-noz-small", cat: "B", label: "Circumferential joints on a nozzle, d ≤ 150 mm (6 in.) or tn ≤ 16 mm (5/8 in.) (Type 1)", rt: ["NA", "NA", "NA", "NA", "NA", "NA"], mt: ["25", "10", "25", "10", "10", "5"] },
  { id: "A-heads", cat: "A", label: "All welds in spheres, heads and hemispherical heads to shells (Type 1)", rt: ["100", "100", "100", "100", "25", "10"], mt: ["10", "10", "10", "0", "0", "0"] },
  { id: "A-tubesheet", cat: "A", label: "All butt welds in flat tubesheets (Type 1)", rt: ["100", "100", "100", "100", "100", "100"], mt: ["—", "—", "—", "—", "—", "—"] },
  { id: "B-cone", cat: "B", label: "Cone-to-cylinder attachment without a knuckle, large end of the cone (Type 1)", rt: ["100", "25", "100", "25", "10", "10"], mt: ["100", "100", "100", "100", "100", "100"] },
  { id: "D-full-big", cat: "D", label: "Nozzle or branch, full penetration, d > 150 mm (6 in.) (Types 1, 2, 3, 7)", rt: ["25", "10", "25", "10", "10", "5"], mt: ["10", "10", "10", "10", "10", "10"] },
  { id: "D-full-small", cat: "D", label: "Nozzle or branch, full penetration, d ≤ 150 mm (6 in.) (Types 1, 2, 3, 7)", rt: ["NA", "NA", "NA", "NA", "NA", "NA"], mt: ["100", "10", "100", "10", "10", "10"] },
  { id: "D-partial-big-a", cat: "D", label: "Full or partial penetration, any d, a > 16 mm (5/8 in.) (Types 7, 9, 10)", rt: ["NA", "NA", "NA", "NA", "NA", "NA"], mt: ["100", "10", "100", "10", "10", "10"] },
  { id: "D-partial-big-d", cat: "D", label: "Full or partial penetration, d > 150 mm, a ≤ 16 mm (Types 7, 9, 10)", rt: ["NP", "NP", "NP", "NP", "NA", "NA"], mt: ["NP", "NP", "NP", "NP", "10", "10"] },
  { id: "D-partial-small-d", cat: "D", label: "Full or partial penetration, d ≤ 150 mm, a ≤ 16 mm (Types 7, 9, 10)", rt: ["NA", "NA", "NA", "NA", "NA", "NA"], mt: ["100", "10", "100", "10", "10", "10"] },
  { id: "D-pad", cat: "D", label: "Welds with reinforcing pads", rt: ["—", "—", "—", "—", "—", "—"], mt: ["25", "10", "10", "10", "10", "5"] },
  { id: "D-pad-joint", cat: "D", label: "Weld joints in reinforcing pads", rt: ["100", "100", "100", "100", "25", "10"], mt: ["100", "10", "10", "10", "0", "0"] },
  { id: "E-attach", cat: "E", label: "Permanent attachments, full or partial penetration (Types 1, 7, 9, 10)", rt: ["—", "—", "—", "—", "—", "—"], mt: ["100", "10", "100", "10", "10", "10"] },
  { id: "F-tube", cat: "F", label: "Tube-to-tubesheet welds (Figures 4.21.1, 4.21.2)", rt: ["—", "—", "—", "—", "—", "—"], mt: ["100", "100", "100", "100", "100", "100"] },
  { id: "clad", cat: "—", label: "Cladding by welding", rt: ["see 7.4.8.1", "see 7.4.8.1", "see 7.4.8.1", "see 7.4.8.1", "see 7.4.8.1", "see 7.4.8.1"], mt: ["100", "100", "100", "100", "100", "100"] },
]
const ext = (x: string) => (x === "NP" ? "not permitted (NP)" : x === "NA" ? "not applicable (NA)" : x === "—" ? "no requirement listed" : /^\d/.test(x) ? `${x}%` : x)

const ndeEfficiency: CalcDef = {
  id: "div2-nde-efficiency",
  title: "Division 2 weld joint efficiency and NDE extent (Table 7.2)",
  section: "7.4",
  equations: [],
  summary: "Pick the examination group and the weld joint: get the weld joint efficiency E used in the design equations and the required RT/UT and MT/PT extent.",
  fields: [
    { kind: "select", key: "group", label: "Examination group (1a … 3b)", defaultValue: "1b", options: EXAM_GROUPS.map((g) => ({ value: g.id, label: `${g.id} — E = ${g.E.toFixed(2)} — ${g.mats}` })) },
    { kind: "select", key: "joint", label: "Weld joint (Table 7.2 row)", defaultValue: "A-long", options: NDE_ROWS.map((r) => ({ value: r.id, label: `Cat. ${r.cat} — ${r.label}` })) },
  ],
  compute(v) {
    const gi = Math.max(0, EXAM_GROUPS.findIndex((g) => g.id === sel(v, "group", "1b")))
    const g = EXAM_GROUPS[gi]
    const row = NDE_ROWS.find((r) => r.id === sel(v, "joint", "A-long")) ?? NDE_ROWS[0]
    const o = out()
    const rt = row.rt[gi], mt = row.mt[gi]
    o.steps.push({ title: "Table 7.2 header — weld joint efficiency", text: `Examination group ${g.id} (${g.mats}) carries a weld joint efficiency E = ${g.E.toFixed(2)}.` }, { title: `Table 7.2 row — ${row.label}`, text: `RT or UT: ${ext(rt)}.  MT or PT: ${ext(mt)}.` })
    o.results.push({ label: "Weld joint efficiency E", latex: "E", value: g.E.toFixed(2), status: "info" }, { label: "RT or UT extent", value: ext(rt), status: rt === "NP" ? "fail" : "info" }, { label: "MT or PT extent", value: ext(mt), status: mt === "NP" ? "fail" : "info" })
    o.verdict = rt === "NP" || mt === "NP" ? { ok: false, text: "This joint type is not permitted in this examination group (NP)." } : { ok: true, text: `Use E = ${g.E.toFixed(2)} in the design equations; examine ${ext(rt)} by RT/UT and ${ext(mt)} by MT/PT.` }
    o.warnings.push("Table 7.2 has notes (1)–(10) that qualify these entries (for example how the percentages are applied and which methods are acceptable) — read them in the page viewer. NA means not applicable and NP not permitted. Which group applies is set by the User’s Design Specification and 7.4.")
    return o
  },
}

const PWHT_MATS = [
  { id: "p1", label: "P-No. 1, Groups 1, 2, 3 (Table 6.8)", si: { T: 595, thr: 50, perMm: 0.04, min: 0.25, base: 2 }, us: { T: 1100, thr: 2, perIn: 1, min: 0.25, base: 2 } },
  { id: "p3", label: "P-No. 3, Groups 1, 2, 3 (Table 6.9)", si: { T: 595, thr: 50, perMm: 0.04, min: 0.25, base: 2 }, us: { T: 1100, thr: 2, perIn: 1, min: 0.25, base: 2 } },
  { id: "p4", label: "P-No. 4, Groups 1, 2 (Table 6.10)", si: { T: 650, thr: 125, perMm: 0.04, min: 1, base: 5 }, us: { T: 1200, thr: 5, perIn: 1, min: 1, base: 5 } },
]
const pwht: CalcDef = {
  id: "div2-pwht",
  title: "Division 2 PWHT — when required and holding temperature/time",
  section: "6.4",
  equations: [],
  summary: "Postweld heat treatment holding temperature and time for P-No. 1, 3 and 4 steels (Tables 6.8–6.10), with the mandatory-PWHT thickness conditions.",
  fields: [
    { kind: "select", key: "mat", label: "Material", defaultValue: "p1", options: PWHT_MATS.map((m) => ({ value: m.id, label: m.label })) },
    { kind: "select", key: "group3", label: "P-No. 3 only: Group", defaultValue: "12", options: [{ value: "12", label: "Group 1 or 2" }, { value: "3", label: "Group 3 (PWHT mandatory in all thicknesses)" }] },
    num("tn", "t_n", "t_n", "Nominal thickness at the welded joint", "length"),
    { kind: "select", key: "fired", label: "Pressure part subject to direct firing?", defaultValue: "no", options: [{ value: "no", label: "No" }, { value: "yes", label: "Yes" }] },
    { kind: "select", key: "preheat", label: "Minimum preheat of 95 °C (200 °F) applied during welding?", defaultValue: "no", options: [{ value: "no", label: "No" }, { value: "yes", label: "Yes" }] },
  ],
  compute(v, sys) {
    const m = PWHT_MATS.find((x) => x.id === sel(v, "mat", "p1")) ?? PWHT_MATS[0]
    const t = req(v, "tn", "t_n"); positive(t, "t_n")
    const tmm = sys === "SI" ? t : t * 25.4
    const fired = sel(v, "fired", "no") === "yes", preheat = sel(v, "preheat", "no") === "yes"
    const o = out()
    // 1) is PWHT mandatory?
    let mandatory: boolean | "conditional" = false; let why = ""
    if (m.id === "p1") {
      if (tmm > 38) { mandatory = true; why = "welded joint over 38 mm (1½ in.) nominal thickness (Table 6.8(a)(1))" }
      else if (tmm > 32) { mandatory = preheat ? false : true; why = preheat ? "32–38 mm joints are exempt when a 95 °C (200 °F) minimum preheat is applied (Table 6.8(a)(2))" : "32–38 mm (1¼–1½ in.) joint without 95 °C (200 °F) minimum preheat (Table 6.8(a)(2))" }
      if (fired && tmm > 16) { mandatory = true; why = "pressure part subject to direct firing with joint thickness over 16 mm (5/8 in.) (Table 6.8(a)(3))" + (why ? `; also: ${why}` : "") }
      if (!mandatory && !why) why = "none of the thickness conditions of Table 6.8(a) is met"
    } else if (m.id === "p3") {
      if (sel(v, "group3", "12") === "3") { mandatory = true; why = "P-No. 3 Group 3 material — all thicknesses (Table 6.9(a))" }
      else if (tmm > 16) { mandatory = true; why = "P-No. 3 Group 1 or 2 over 16 mm (5/8 in.) nominal thickness (Table 6.9(b)(1))" }
      else { mandatory = "conditional"; why = "P-No. 3 Group 1/2 up to 16 mm: mandatory unless the deposited weld-metal thickness qualified without PWHT in the procedure qualification is at least the production weld-metal thickness (Table 6.9(b)(1)); the exemptions of (c) may also apply" }
      if (fired) { mandatory = true; why += "; pressure part subject to direct firing (Table 6.9(b)(2))" }
    } else {
      mandatory = true; why = fired ? "all thicknesses for pressure parts subject to direct firing (Table 6.10(a)(1))" : "all other P-No. 4 Group 1 and 2 materials (Table 6.10(a)(2)) — unless a Table 6.10(b) exemption applies"
    }
    o.steps.push({ title: "Is PWHT mandatory?", text: `${mandatory === "conditional" ? "Conditionally" : mandatory ? "Yes" : "Not by the thickness rules"} — ${why}.` })
    // 2) holding temperature and time
    let hours: number, T: number
    if (sys === "SI") {
      const c = m.si; T = c.T
      hours = tmm <= c.thr ? Math.max(c.perMm * tmm, c.min) : c.base + (0.6 * (tmm - c.thr)) / 60
      o.steps.push({ title: `Holding temperature and time — SI (${m.label})`, latex: tmm <= c.thr ? [`t_n=${fmt(tmm)}\\le${c.thr}\\text{ mm}:\\;\\; ${T}\\,^\\circ C,\\;\\; \\max[0.04\\times${fmt(tmm)},\\;${c.min}]\\text{ h}=${fmt(hours)}\\text{ h}`] : [`t_n=${fmt(tmm)}>${c.thr}\\text{ mm}:\\;\\; ${T}\\,^\\circ C,\\;\\; ${c.base}\\text{ h}+0.6\\text{ min}\\times(${fmt(tmm)}-${c.thr})=${fmt(hours)}\\text{ h}`] })
    } else {
      const c = m.us; T = c.T
      hours = t <= c.thr ? Math.max(c.perIn * t, c.min) : c.base + (0.25 * (t - c.thr))
      o.steps.push({ title: `Holding temperature and time — US (${m.label})`, latex: t <= c.thr ? [`t_n=${fmt(t)}\\le${c.thr}\\text{ in.}:\\;\\; ${T}\\,^\\circ F,\\;\\; \\max[1\\text{ h/in.}\\times${fmt(t)},\\;${c.min}]\\text{ h}=${fmt(hours)}\\text{ h}`] : [`t_n=${fmt(t)}>${c.thr}\\text{ in.}:\\;\\; ${T}\\,^\\circ F,\\;\\; ${c.base}\\text{ h}+15\\text{ min}\\times(${fmt(t)}-${c.thr})=${fmt(hours)}\\text{ h}`] })
    }
    o.results.push({ label: "PWHT mandatory", value: mandatory === "conditional" ? "conditional" : mandatory ? "yes" : "no (thickness rules)", status: mandatory === true ? "info" : "info" }, { label: "Holding temperature", value: `${T}`, unit: sys === "SI" ? "°C" : "°F", status: "info" }, { label: "Minimum holding time", value: plain(hours, 4), unit: "h", status: "info" }, { label: "…in hours and minutes", value: `${Math.floor(hours)} h ${Math.round((hours - Math.floor(hours)) * 60)} min`, status: "info" })
    o.verdict = { ok: true, text: `${mandatory === true ? "PWHT is required" : mandatory === "conditional" ? "PWHT may be required" : "PWHT is not required by the thickness rules"}; if performed, hold at ${T} ${sys === "SI" ? "°C" : "°F"} for at least ${Math.floor(hours)} h ${Math.round((hours - Math.floor(hours)) * 60)} min.` }
    o.warnings.push("When PWHT at these temperatures is impractical, lower temperatures with longer holding times are permitted under Table 6.16 (and the vessel test plate gets the same treatment). The exemptions for attachments, small pipe joints, studs and overlays (conditions on carbon content, weld size and preheat) are listed in each table’s notes. Other P-numbers are in Tables 6.11–6.15; not included here.")
    return o
  },
}

const REINF_ROWS = [
  { lo: 0, hi: 2.5, b: 2.5, o: 0.8, loUS: 0, hiUS: 0.09375, bUS: 0.09375, oUS: 0.03125 },
  { lo: 2.5, hi: 5, b: 2.5, o: 1.5, loUS: 0.09375, hiUS: 0.1875, bUS: 0.09375, oUS: 0.0625 },
  { lo: 5, hi: 13, b: 3, o: 2.5, loUS: 0.1875, hiUS: 0.5, bUS: 0.125, oUS: 0.09375 },
  { lo: 13, hi: 25, b: 4, o: 2.5, loUS: 0.5, hiUS: 1, bUS: 0.15625, oUS: 0.09375 },
  { lo: 25, hi: 50, b: 4, o: 3, loUS: 1, hiUS: 2, bUS: 0.15625, oUS: 0.125 },
  { lo: 50, hi: 76, b: 4, o: 4, loUS: 2, hiUS: 3, bUS: 0.15625, oUS: 0.15625 },
  { lo: 76, hi: 100, b: 5.5, o: 5.5, loUS: 3, hiUS: 4, bUS: 0.21875, oUS: 0.21875 },
  { lo: 100, hi: 125, b: 6, o: 6, loUS: 4, hiUS: 5, bUS: 0.25, oUS: 0.25 },
  { lo: 125, hi: Infinity, b: 8, o: 8, loUS: 5, hiUS: Infinity, bUS: 0.3125, oUS: 0.3125 },
]
const weldReinforcement: CalcDef = {
  id: "div2-weld-reinforcement",
  title: "Division 2 maximum weld reinforcement (Table 6.6)",
  section: "6.2",
  equations: [],
  summary: "Maximum permitted reinforcement for Category B and C butt welds and for other welds, from the nominal thickness of the thinner section at the joint.",
  fields: [
    num("t", "t", "t", "Nominal thickness of the thinner section at the weld joint", "length"),
    num("actual", "R_actual", "R", "Measured reinforcement to check (optional)", "length", { optional: true }),
    { kind: "select", key: "type", label: "Weld type for the check", defaultValue: "bc", options: [{ value: "bc", label: "Category B and C butt welds" }, { value: "other", label: "Other welds" }] },
  ],
  compute(v, sys) {
    const t = req(v, "t", "t"); positive(t, "t")
    const row = REINF_ROWS.find((r) => (sys === "SI" ? t >= r.lo && t < r.hi : t >= r.loUS && t < r.hiUS)) ?? REINF_ROWS[REINF_ROWS.length - 1]
    const bc = sys === "SI" ? row.b : row.bUS, other = sys === "SI" ? row.o : row.oUS
    const o = out()
    o.steps.push({ title: "Table 6.6 — row for this thickness", text: `t = ${plain(t)} ${u("length", sys)} → Category B and C butt welds: ${plain(bc, 4)} ${u("length", sys)}; other welds: ${plain(other, 4)} ${u("length", sys)}.` })
    o.results.push({ label: "Max reinforcement, Category B/C butt welds", value: plain(bc, 4), unit: u("length", sys), status: "info" }, { label: "Max reinforcement, other welds", value: plain(other, 4), unit: u("length", sys), status: "info" })
    const actual = opt(v, "actual")
    if (actual !== undefined) {
      const lim = sel(v, "type", "bc") === "bc" ? bc : other, ok = actual <= lim
      o.results.push({ label: "Measured ≤ limit", value: `${plain(actual, 4)} ≤ ${plain(lim, 4)}`, unit: u("length", sys), status: ok ? "pass" : "fail" })
      o.verdict = { ok, text: ok ? "Reinforcement is within the Table 6.6 limit." : "Reinforcement exceeds the Table 6.6 limit — dress the weld." }
    } else o.verdict = { ok: true, text: `Maximum reinforcement: ${plain(bc, 4)} ${u("length", sys)} (Category B/C butt) or ${plain(other, 4)} ${u("length", sys)} (other welds).` }
    return o
  },
}

// ---------------------------------------------------------------------------------------------
// 4.10 ligament efficiency (tube holes in a line parallel to the shell axis)
// ---------------------------------------------------------------------------------------------
const ligament: CalcDef = {
  id: "div2-ligament",
  title: "Division 2 ligament efficiency (tube holes along the shell)",
  section: "4.10.2",
  equations: ["4.10.1", "4.10.2"],
  summary: "Efficiency of the ligaments between tube holes drilled in a line parallel to the axis: equal pitch (4.10.1) or unequal pitch over a repeating length (4.10.2).",
  fields: [
    { kind: "select", key: "pitch", label: "Hole pattern", defaultValue: "equal", options: [{ value: "equal", label: "Equal pitch on every row (eq. 4.10.1)" }, { value: "unequal", label: "Unequal pitch — repeating length p₁ with n holes (eq. 4.10.2)" }] },
    num("d", "d", "d", "Hole (tube-hole) diameter", "length"),
    num("p", "p", "p", "Equal pitch: centre-to-centre spacing of the holes", "length", { optional: true }),
    num("p1", "p₁", "p_1", "Unequal pitch: length of the repeating unit (longest pitch)", "length", { optional: true }),
    num("n", "n", "n", "Unequal pitch: number of holes in the length p₁", "none", { optional: true }),
    num("Edes", "E_req", "E", "Efficiency your design needs (optional) — e.g. the E the MAWP or thickness was based on", "none", { optional: true, min: 0.01, max: 1 }),
  ],
  compute(v, sys) {
    const d = req(v, "d", "d"); positive(d, "d")
    const o = out()
    let E: number
    if (sel(v, "pitch", "equal") === "equal") {
      const p = req(v, "p", "p"); positive(p, "p")
      if (d >= p) throw new Error("The hole diameter must be smaller than the pitch.")
      E = (p - d) / p
      o.steps.push({ title: "Eq. (4.10.1) — equal pitch", latex: ["E=\\frac{p-d}{p}", `E=\\frac{${fmt(p)}-${fmt(d)}}{${fmt(p)}}=${fmt(E, 4)}`] })
    } else {
      const p1 = req(v, "p1", "p₁"), n = req(v, "n", "n"); positive(p1, "p₁"); positive(n, "n")
      if (n * d >= p1) throw new Error("n × d must be smaller than p₁.")
      E = (p1 - n * d) / p1
      o.steps.push({ title: "Eq. (4.10.2) — unequal pitch", latex: ["E=\\frac{p_1-nd}{p_1}", `E=\\frac{${fmt(p1)}-${fmt(n)}\\times${fmt(d)}}{${fmt(p1)}}=${fmt(E, 4)}`] })
    }
    o.results.push({ label: "Ligament efficiency E", latex: "E", value: plain(E, 4), status: "info" })
    const need = opt(v, "Edes")
    if (need !== undefined) {
      const ok = E >= need
      o.results.push({ label: "E ≥ required E", value: `${plain(E, 4)} vs ${plain(need, 4)}`, status: ok ? "pass" : "fail" })
      o.verdict = { ok, text: ok ? "Ligament efficiency meets the required value." : "Ligament efficiency is below the value the design is based on." }
    } else o.verdict = { ok: true, text: `Ligament efficiency E ≈ ${plain(E, 4)} — use it with the weld joint efficiency (the lower governs) in the 4.3 thickness equations.` }
    o.warnings.push(`Also check, per 4.10.2.1: the least equivalent efficiency of diagonal and circumferential ligaments (Figures 4.10.5 and 4.10.6), and the averaging rules — over a length of one inside diameter (at most 1 520 mm / 60 in.) the efficiency must not be below the design value, and over one inside radius (at most 760 mm / 30 in.) not below 80% of it. Symmetric groups extending beyond one inside diameter use 4.10.2.1(e).`)
    void sys
    return o
  },
}

// ---------------------------------------------------------------------------------------------
// 4.1.6 test-condition stress limits and allowable primary + secondary stress
// ---------------------------------------------------------------------------------------------
const BETA_T = { hydro: 0.95, pneu: 0.8 } // Table 4.1.3
const testStressLimits: CalcDef = {
  id: "div2-test-stress-limits",
  title: "Division 2 test-condition stress limits (4.1.6.2)",
  section: "4.1.6.2",
  equations: ["4.1.3", "4.1.4", "4.1.5"],
  summary: "Upper limit on the selected test pressure: P_m ≤ β_T·S_y and the P_m + P_b limit (two ranges), with β_T = 0.95 hydrostatic or 0.8 pneumatic (Table 4.1.3).",
  fields: [
    { kind: "select", key: "medium", label: "Test medium (Table 4.1.3)", defaultValue: "hydro", options: [{ value: "hydro", label: "Hydrostatic — β_T = 0.95" }, { value: "pneu", label: "Pneumatic — β_T = 0.8" }] },
    num("Sy", "S_y", "S_y", "Yield strength at the test temperature", "stress", { help: stressNote }),
    num("Pm", "P_m", "P_m", "Calculated primary membrane stress under the selected test pressure", "stress"),
    num("Pb", "P_b", "P_b", "Calculated primary bending stress (optional)", "stress", { optional: true }),
  ],
  compute(v, sys) {
    const bT = BETA_T[sel(v, "medium", "hydro") as "hydro" | "pneu"] ?? 0.95
    const Sy = req(v, "Sy", "S_y"), Pm = req(v, "Pm", "P_m"); positive(Sy, "S_y")
    const o = out()
    const lim1 = bT * Sy, ok1 = Pm <= lim1
    o.steps.push({ title: "Eq. (4.1.3) — primary membrane", latex: ["P_m\\le\\beta_TS_y", `${fmt(Pm)}\\le${fmt(bT)}\\times${fmt(Sy)}=${fmt(lim1)}\\;\\Rightarrow\\;${verdictTxt(ok1)}`] })
    o.results.push({ label: "β_T (Table 4.1.3)", value: String(bT), status: "info" }, { label: "P_m ≤ β_T S_y", value: `${plain(Pm)} ≤ ${plain(lim1)}  (ratio ${plain(Pm / lim1, 3)})`, unit: u("stress", sys), status: ok1 ? "pass" : "fail" })
    let ok = ok1
    const Pb = opt(v, "Pb")
    if (Pb !== undefined) {
      const first = Pm <= Sy / 1.5
      const lim2 = first ? 1.5 * bT * Sy : (1.5 * bT + 1) * Sy - 1.5 * Pm
      const sum = Pm + Pb, ok2 = sum <= lim2
      ok &&= ok2
      o.steps.push({ title: first ? "Eq. (4.1.4) — P_m + P_b, for P_m ≤ S_y/1.5" : "Eq. (4.1.5) — P_m + P_b, for S_y/1.5 < P_m ≤ β_T S_y", latex: first ? ["P_m+P_b\\le1.5\\beta_TS_y", `${fmt(sum)}\\le1.5\\times${fmt(bT)}\\times${fmt(Sy)}=${fmt(lim2)}\\;\\Rightarrow\\;${verdictTxt(ok2)}`] : ["P_m+P_b\\le(1.5\\beta_T+1)S_y-1.5P_m", `${fmt(sum)}\\le(1.5\\times${fmt(bT)}+1)\\times${fmt(Sy)}-1.5\\times${fmt(Pm)}=${fmt(lim2)}\\;\\Rightarrow\\;${verdictTxt(ok2)}`] })
      o.results.push({ label: `P_m + P_b limit (eq. ${first ? "4.1.4" : "4.1.5"})`, value: `${plain(sum)} ≤ ${plain(lim2)}  (ratio ${plain(sum / lim2, 3)})`, unit: u("stress", sys), status: ok2 ? "pass" : "fail" })
    }
    o.verdict = { ok, text: ok ? "The selected test pressure satisfies the 4.1.6.2 stress limits." : "A limit is exceeded — reduce the test pressure, but not below the minimum test pressure of Part 8." }
    o.warnings.push("For components designed by analysis, the test condition is evaluated with 5.2.2.6, 5.2.3.5 or 5.2.4.5. Stresses are calculated at the selected test pressure plus the static head of the test fluid.")
    return o
  },
}

const sps: CalcDef = {
  id: "div2-sps",
  title: "Division 2 allowable primary + secondary stress S_PS (4.1.6.3)",
  section: "4.1.6.3",
  equations: ["4.1.6"],
  summary: "S_PS = max[3S, 2S_y], limited to 3S when S_y/S_u exceeds 0.70 at room temperature or the allowable stress is time-dependent.",
  fields: [
    num("S", "S", "S", "Allowable stress at the design temperature (Annex 3-A)", "stress", { help: stressNote }),
    num("Sy", "S_y", "S_y", "Yield strength at the design temperature", "stress"),
    num("SyRT", "S_y,RT", "S_{y}", "Minimum specified yield strength at room temperature (Annex 3-D)", "stress"),
    num("SuRT", "S_u,RT", "S_u", "Minimum specified tensile strength at room temperature (Annex 3-D)", "stress"),
    { kind: "select", key: "td", label: "Is the allowable stress governed by time-dependent properties (creep range)?", defaultValue: "no", options: [{ value: "no", label: "No" }, { value: "yes", label: "Yes" }] },
    num("Dn", "ΔS_n", "\\Delta S_n", "Primary + secondary stress range to check (optional)", "stress", { optional: true }),
  ],
  compute(v, sys) {
    const S = req(v, "S", "S"), Sy = req(v, "Sy", "S_y"), SyRT = req(v, "SyRT", "S_y,RT"), SuRT = req(v, "SuRT", "S_u,RT")
    ;[S, Sy, SyRT, SuRT].forEach((x) => positive(x, "Every input"))
    const td = sel(v, "td", "no") === "yes", ratio = SyRT / SuRT
    const base = Math.max(3 * S, 2 * Sy), limited = ratio > 0.7 || td
    const SPS = limited ? 3 * S : base
    const o = out()
    o.steps.push({ title: "Eq. (4.1.6)", latex: ["S_{PS}=\\max[3S,\\,2S_y]", `S_{PS}=\\max[${fmt(3 * S)},\\,${fmt(2 * Sy)}]=${fmt(base)}`] }, { title: "Limit to 3S?", latex: [`S_y/S_u=${fmt(ratio, 4)}${ratio > 0.7 ? ">0.70" : "\\le0.70"},\\quad\\text{time-dependent: ${td ? "yes" : "no"}}\\;\\Rightarrow\\;${limited ? `S_{PS}=3S=${fmt(SPS)}` : `S_{PS}=${fmt(SPS)}`}`] })
    o.results.push({ label: "S_PS", latex: "S_{PS}", value: plain(SPS), unit: u("stress", sys), status: "info" })
    const d = opt(v, "Dn")
    if (d !== undefined) { const ok = d <= SPS; o.results.push({ label: "ΔS_n ≤ S_PS", value: `${plain(d)} ≤ ${plain(SPS)}  (ratio ${plain(d / SPS, 3)})`, unit: u("stress", sys), status: ok ? "pass" : "fail" }); o.verdict = { ok, text: ok ? "Primary plus secondary stress range is within S_PS." : "The range exceeds S_PS — evaluate shakedown/ratcheting per Part 5 or revise the design." } }
    else o.verdict = { ok: true, text: `S_PS = ${plain(SPS)} ${u("stress", sys)}.` }
    o.warnings.push("This is the 4.1.6.3 limit used by the design-by-rule loading checks. The ratcheting limit of Part 5 (S_PS = S_y-cold + S_y-hot, eq. 5.95) is a different quantity.")
    return o
  },
}

export const DIV2_CALCULATORS: CalcDef[] = [shellCalc("cyl"), shellCalc("cone"), shellCalc("sph"), torispherical, ellipsoidal, flatCircular, flatNonCircular, extCylinder, extHead, flangeBolts, inspectionOpenings, ndeEfficiency, pwht, weldReinforcement, ligament, testStressLimits, sps, testPressure]
