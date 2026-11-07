import assert from "node:assert/strict"
import test from "node:test"
import { runCalculator, vonMises, betaCr, fatiguePenalty, tempFactor, PART5_CALCULATORS } from "../lib/part5/calculators.ts"

const near = (a, b, tol = 1e-3) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} vs ${b}`)
const res = (r) => { assert.ok(r.ok, r.error); return r.output }

test("von Mises eq 5.1", () => near(vonMises(100, 50, 0), 86.6025))

test("S_PL eq 5.2 both branches and checks 5.3-5.5", () => {
  let o = res(runCalculator("plastic-collapse-elastic", { S: 138, Sy: 250, UTS: 450, Pm: 130, PL: 200, PLPb: 260 }, "SI"))
  assert.equal(o.results[0].value, "250")
  assert.equal(o.results.find((r) => r.label.includes("5.5")).status, "fail")
  o = res(runCalculator("plastic-collapse-elastic", { S: 200, Sy: 380, UTS: 440, Pm: 100 }, "SI")) // ratio .86 -> 1.5S
  assert.equal(o.results[0].value, "300")
})

test("triaxial eq 5.6", () => {
  const o = res(runCalculator("triaxial", { S: 100, s1: 200, s2: 100, s3: 50 }, "SI"))
  assert.equal(o.verdict.ok, true)
  assert.equal(res(runCalculator("triaxial", { S: 100, s1: 200, s2: 150, s3: 100 }, "SI")).verdict.ok, false)
})

test("strain limit eq 5.7/5.8 (ferritic, uniaxial state => exp(0)=1)", () => {
  // uniaxial: s1=100 -> (s1+s2+s3)/(3 se) = 1/3 -> eL = eLu
  const o = res(runCalculator("strain-limit", { mat: "ferritic", R: 0.6, s1: 100, s2: 0, s3: 0, epeq: 0.1 }, "SI"))
  near(Number(o.results.find((r) => r.label === "ε_L").value), 0.24) // 0.6*(1-0.6)
  assert.equal(o.verdict.ok, true)
})

test("eps_Lu takes the maximum of the specified columns", () => {
  const o = res(runCalculator("strain-limit", { mat: "ferritic", R: 0.6, E: 20, RA: 50, s1: 100, s2: 0, s3: 0, epeq: 0.1 }, "SI"))
  // col4 = 2 ln(1.2)=0.3646 ; col5 = ln(2)=0.6931 -> 0.6931
  near(Number(o.results.find((r) => r.label === "ε_Lu").value), 0.6931, 2e-3)
})

test("strain damage sums", () => {
  const o = res(runCalculator("strain-damage", { mat: "ferritic", R: 0.6, ecf: 0, inc: [{ s1: 100, s2: 0, s3: 0, de: 0.06 }, { s1: 100, s2: 0, s3: 0, de: 0.06 }] }, "SI"))
  near(Number(o.results.find((r) => r.label === "D_ε total").value), 0.5) // 0.12/0.24
})

test("buckling beta_cr eqs 5.14-5.17 and Method A check", () => {
  near(betaCr("cyl-axial", 200).beta, 338 / 589)
  assert.equal(betaCr("cyl-axial", 1300).beta, 0.207)
  assert.equal(betaCr("cyl-hoop").beta, 0.8)
  assert.equal(betaCr("sphere").beta, 0.124)
  const o = res(runCalculator("buckling-a", { loc: "cyl-hoop", Sy: 250, sEig: 100, Pmk: 30 }, "SI"))
  // sigma_crit = 80 <= 137.5 -> Sc = 40 ; 30 <= 40
  near(Number(o.results.find((r) => r.label === "S_c,k").value), 40)
  assert.equal(o.verdict.ok, true)
})

test("temperature factors table 5.8 and screening A table 5.9", () => {
  assert.equal(tempFactor(28, "SI"), 0); assert.equal(tempFactor(50, "SI"), 1); assert.equal(tempFactor(222, "SI"), 12); assert.equal(tempFactor(400, "US"), 12)
  // Table 5.8 worked example: 1000(0)+250(1)+5(12) = 310
  const o = res(runCalculator("screening-a", { constr: "integral", comp: "other", NFP: 100, NPO: 100, dT: [{ dT: 50, n: 1000 }, { dT: 90, n: 250 }, { dT: 400, n: 5 }] }, "US"))
  near(Number(o.results[0].value), 310)
  assert.equal(o.results.find((r) => r.label === "Table 5.9 limit").value, "1000")
})

test("L_fs eq 5.18/5.19", () => {
  near(Number(res(runCalculator("adjacent-distance", { geo: "shell", R: 1000, t: 25 }, "SI")).results[0].value), 2.5 * Math.sqrt(25000))
  near(Number(res(runCalculator("adjacent-distance", { geo: "flat", RHS: 100 }, "SI")).results[0].value), 350)
})

test("fatigue penalty factor eq 5.43-5.45", () => {
  assert.equal(fatiguePenalty(100, 200, 3, 0.2).Ke, 1)
  near(fatiguePenalty(400, 200, 3, 0.2).Ke, 3.0) // 1 + 0.8/(0.2*2)*(2-1)
  near(fatiguePenalty(900, 200, 3, 0.2).Ke, 5)
})

test("elastic fatigue option 1 and damage", () => {
  const o = res(runCalculator("fatigue-elastic", { mat: "carbon", option: "1", dSp: 800, dSn: 400, SyC: 100, SyH: 100, nk: 1000, Nk: 5000 }, "SI"))
  near(Number(o.results.find((r) => r.label === "K_e,k").value), 3)
  near(Number(o.results.find((r) => r.label === "S_alt,k").value), 1200) // 3*800/2
  near(Number(o.results.find((r) => r.label.startsWith("D_f,k")).value), 0.2)
})

test("method B screening damage", () => {
  const o = res(runCalculator("screening-b", { kfbType: "nonwelded", hc: "1", S: 138, nFP: 500, NFP: 2000 }, "SI"))
  near(Number(o.results.find((r) => r.label === "D_FP amplitude").value), 207)
  near(Number(o.results.find((r) => r.label === "D_f").value), 0.25)
})

test("ratcheting A eq 5.95/5.96", () => {
  assert.equal(res(runCalculator("ratcheting-a", { dSn: 400, SyC: 250, SyH: 200 }, "SI")).verdict.ok, true)
  assert.equal(res(runCalculator("ratcheting-a", { dSn: 500, SyC: 250, SyH: 200 }, "SI")).verdict.ok, false)
})

test("thermal ratcheting eq 5.98-5.105", () => {
  const o = res(runCalculator("ratcheting-thermal", { dist: "linear", Pm: 50, SyAvg: 250, dQm: 100, dQmb: 400 }, "SI"))
  // Xs=.2 -> SQmb=250/.2=1250 ; SQm=2*250*.8=400
  near(Number(o.results.find((r) => r.label.startsWith("S_Qm ")).value), 400)
  near(Number(o.results.find((r) => r.label.startsWith("S_Qmb")).value), 1250)
  const p = res(runCalculator("ratcheting-thermal", { dist: "linear", Pm: 150, SyAvg: 250, dQm: 10, dQmb: 10 }, "SI")) // Xs=.6 -> 4*250*.4=400
  near(Number(p.results.find((r) => r.label.startsWith("S_Qmb")).value), 400)
})

test("friendly errors, every calculator has fields", () => {
  assert.equal(runCalculator("triaxial", {}, "SI").ok, false)
  for (const c of PART5_CALCULATORS) assert.ok(c.fields.length > 0 && c.id && c.section)
})

test("creep screening 5.113-5.115", () => {
  assert.equal(res(runCalculator("creep-fatigue-screen", { NFP: 200, NP: 100, NTR: 100 }, "SI")).verdict.ok, true)
  assert.equal(res(runCalculator("creep-fatigue-screen", { NFP: 300, NP: 0, NTR: 0 }, "SI")).verdict.ok, false)
  near(Number(res(runCalculator("creep-ratcheting", { dSn: 300, SyC: 200, S: 100 }, "SI")).results[0].value), 300)
})

import { isPart5Question, composePart5Answer, matchSections } from "../lib/part5/brain.ts"
test("part 5 detection", () => {
  assert.equal(isPart5Question("Explain ratcheting assessment in Division 2"), true)
  assert.equal(isPart5Question("what is 5.5.5.2.1 method A"), true)
  assert.equal(isPart5Question("Division 1 UG-27 shell thickness"), false)
  assert.equal(isPart5Question("What is MAWP?"), false)
  assert.equal(isPart5Question("Division 2 part 5 overview"), true)
})
test("part 5 routing and answer", () => {
  assert.equal(matchSections("buckling method A capacity reduction factor")[0].id, "5.4")
  assert.equal(matchSections("fatigue penalty factor Ke")[0].id, "5.5.4")
  const a = composePart5Answer("How do I check ratcheting with S_PS in Div 2?")
  assert.ok(a.sectionIds.includes("5.5.5")); assert.ok(a.calculatorIds.includes("ratcheting-a"))
  assert.match(a.markdown, /Eq\. \(5\.96\)/)
})

import { runCalculator as runAny, ALL_CALCULATORS, getCalculator as getAny } from "../lib/calc-registry.ts"
import { torisphericalPressure } from "../lib/div2/calculators.ts"
import { isDiv2RuleQuestion } from "../lib/part5/brain.ts"

test("Division 2 cylinder / sphere / cone (eq 4.3.1, 4.3.4, 4.3.2) and the rearranged pressure", () => {
  const cyl = res(runAny("div2-cylinder", { mode: "t", D: 1000, S: 138, E: 1, P: 2, CA: 3 }, "SI"))
  near(Number(cyl.results[0].value), 7.2991, 1e-3); near(Number(cyl.results[1].value), 10.2991, 1e-3)
  near(Number(res(runAny("div2-sphere", { mode: "t", D: 1000, S: 138, E: 1, P: 2 }, "SI")).results[0].value), 3.6363, 1e-3)
  near(Number(res(runAny("div2-cone", { mode: "t", D: 1000, S: 138, E: 1, P: 2, alpha: 30 }, "SI")).results[0].value), 8.4283, 1e-3)
  // inverse: thickness 7.2991 should give back ~2 MPa
  near(Number(res(runAny("div2-cylinder", { mode: "P", D: 1000, S: 138, E: 1, t: 7.2991413816 }, "SI")).results[0].value), 2, 1e-4)
})

test("torispherical head procedure 4.3.6 matches an independent calculation", () => {
  const r = torisphericalPressure({ D: 2000, L: 2000, r: 200, t: 12, S: 138, E: 1, ET: 200000, C3: 240 })
  near(r.beta, 1.1102, 1e-3); near(r.Rth, 1047.28, 1e-3); near(r.C1, 0.6742, 1e-3); near(r.Peth, 47.739, 2e-3); near(r.Py, 1.416, 2e-3)
  near(r.Pak, 1.895, 2e-3); near(r.Pac, 1.651, 2e-3); near(r.Pa, 1.651, 2e-3)
  const o = res(runAny("div2-torispherical", { D: 2000, L: 2000, r: 200, t: 12, S: 138, E: 1, ET: 200000, c3: "sy", Sy: 240, P: 1.5 }, "SI"))
  assert.equal(o.verdict.ok, true)
  assert.equal(res(runAny("div2-torispherical", { D: 2000, L: 2000, r: 200, t: 12, S: 138, E: 1, ET: 200000, c3: "sy", Sy: 240, P: 2.0 }, "SI")).verdict.ok, false)
  assert.equal(runAny("div2-torispherical", { D: 2000, L: 1000, r: 200, t: 12, S: 138, E: 1, ET: 200000, c3: "sy", Sy: 240 }, "SI").output.verdict.ok, false) // L/D outside 0.7-1.0
})

test("ellipsoidal 2:1 head and its k limit", () => {
  const o = res(runAny("div2-ellipsoidal", { D: 2000, h: 500, t: 12, S: 138, E: 1, ET: 200000, c3: "sy", Sy: 240 }, "SI")) // k = 2
  assert.match(o.results[0].label, /Aspect ratio/); assert.equal(o.results[0].status, "pass")
  assert.equal(res(runAny("div2-ellipsoidal", { D: 2000, h: 300, t: 12, S: 138, E: 1, ET: 200000, c3: "sy", Sy: 240 }, "SI")).verdict.ok, false) // k = 3.3
})

test("Division 2 test pressure eq 8.1 (Table 4.1.3 factors)", () => {
  near(Number(res(runAny("div2-test-pressure", { medium: "hydro", MAWP: 2, St: 138, S: 120 }, "SI")).results[1].value), 1.25 * 2 * (138 / 120))
  near(Number(res(runAny("div2-test-pressure", { medium: "pneu", MAWP: 300, St: 20, S: 20, MDMT: -20 }, "US")).results[1].value), 345)
})

test("registry and Div 2 question routing", () => {
  assert.ok(ALL_CALCULATORS.length >= 34); assert.ok(getAny("div2-torispherical") && getAny("von-mises"))
  assert.equal(isDiv2RuleQuestion("Division 2 torispherical head thickness"), true)
  assert.equal(isDiv2RuleQuestion("Division 1 UG-27 cylinder thickness"), false)
  assert.equal(isDiv2RuleQuestion("hydrotest pressure"), false)
  assert.equal(isDiv2RuleQuestion("what is the hydrostatic test pressure in Division 2"), true)
})

test("flat heads 4.6: circular unbolted, Detail 3 C, bolted max(to,tg), non-circular Z", () => {
  // t = d*sqrt(C P/(S E)) with C=0.33, d=500, P=1, S=138, E=1 -> 500*sqrt(0.33/138)=24.45
  near(Number(res(runAny("div2-flat-circular", { bolted: "no", d: 500, P: 1, Sho: 138, E: 1, cdetail: "d5" }, "SI")).results[0].value), 500 * Math.sqrt(0.33 / 138), 1e-4)
  // Detail 3, m = 0.5 -> C = max(0.165, 0.2) = 0.2
  near(Number(res(runAny("div2-flat-circular", { bolted: "no", d: 500, P: 1, Sho: 138, E: 1, cdetail: "d3", m: 0.5 }, "SI")).results[0].value), 500 * Math.sqrt(0.2 / 138), 1e-4)
  const b = res(runAny("div2-flat-circular", { bolted: "yes", d: 500, P: 1, Sho: 138, E: 1, cdetail: "manual", Cman: 0.3, Wo: 400000, Wg: 300000, hG: 40, Shg: 138 }, "SI"))
  const to = 500 * Math.sqrt((0.3 * 1) / 138 + (1.9 * 400000 * 40) / (138 * 500 ** 3)), tg = 500 * Math.sqrt((1.9 * 300000 * 40) / (138 * 500 ** 3))
  near(Number(b.results[0].value), Math.max(to, tg), 1e-4)
  // non-circular: d=300, D=600 -> Z = min(2.5, 3.4-1.2)=2.2
  const n = res(runAny("div2-flat-noncircular", { bolted: "no", d: 300, D: 600, P: 1, Sho: 138, E: 1, cdetail: "d5" }, "SI"))
  near(Number(n.results[0].value), 2.2, 1e-4); near(Number(n.results[1].value), 300 * Math.sqrt((2.2 * 0.33) / 138), 1e-4)
  assert.equal(runAny("div2-flat-circular", { bolted: "no", d: 500, P: 1, Sho: 138, E: 1, cdetail: "d3" }, "SI").ok, false) // needs m
})

import { cylinderCh, designFactorFS, ellipsoidKo } from "../lib/div2/calculators.ts"
test("external pressure 4.4: FS, C_h ranges, cylinder and head allowable pressure", () => {
  assert.equal(designFactorFS(100, 250).FS, 2.0); near(designFactorFS(200, 250).FS, 2.407 - 0.741 * 0.8, 1e-9); assert.equal(designFactorFS(250, 250).FS, 1.667)
  near(designFactorFS(0.55 * 250, 250).FS, 2.0, 1e-9); near(designFactorFS(249.99, 250).FS, 1.667, 1e-3) // continuity at both ends
  assert.equal(cylinderCh(1.0, 1000, 10).Ch, 1.0); near(cylinderCh(5, 1000, 10).Ch, 0.92 / (5 - 0.579), 1e-9)
  near(cylinderCh(42.43, 1000, 10).Ch, 1.12 * 42.43 ** -1.058, 1e-9); near(cylinderCh(400, 1000, 10).Ch, 0.55 * 0.01, 1e-9)
  // independent calculation: Do=1000, t=10, L=3000, Ey=200000, elastic buckling
  const Mx = 3000 / Math.sqrt(500 * 10), Ch = 1.12 * Mx ** -1.058, Fhe = 1.6 * Ch * 200000 * 10 / 1000
  const o = res(runAny("div2-ext-cylinder", { Do: 1000, t: 10, L: 3000, Ey: 200000, Sy: 250, ficMode: "elastic", P: 0.1 }, "SI"))
  near(Number(o.results.find((r) => r.label.startsWith("F_he")).value), Fhe, 1e-3)
  near(Number(o.results.find((r) => r.label.startsWith("Allowable external")).value), 2 * (Fhe / 2) * (10 / 1000), 1e-3) // FS = 2 since F_he < .55 Sy
  // first pass without F_ic only reports F_he / A_e and guidance
  const first = res(runAny("div2-ext-cylinder", { Do: 1000, t: 10, L: 3000, Ey: 200000, Sy: 250, ficMode: "manual" }, "SI"))
  assert.ok(first.warnings.some((w) => /tangent modulus/.test(w))); assert.equal(first.verdict, undefined)
  // sphere and ellipsoidal head
  near(Number(res(runAny("div2-ext-sphere-head", { shape: "sph", Ro: 1000, t: 10, Ey: 200000, Sy: 250, ficMode: "elastic" }, "SI")).results.find((r) => r.label.startsWith("F_he")).value), 0.075 * 200000 * 10 / 1000, 1e-6)
  near(ellipsoidKo(2000, 500), 0.25346 + 0.13995 * 2 + 0.12238 * 4 - 0.015297 * 8, 1e-9) // k=2 -> ~0.9
  assert.equal(runAny("div2-ext-cylinder", { Do: 1000, t: 600, L: 3000, Ey: 200000, Sy: 250 }, "SI").ok, false)
})

test("flange bolt loads 4.16: widths, W_o, W_gs, A_m, W_g, forces, gasket table", () => {
  const G0 = 500, b0 = 10, Cul = 25.4
  const b = 0.5 * Cul * Math.sqrt(b0 / Cul), G = G0 - 2 * b
  const P = 2, m = 3.0, y = 69
  const Wo = 0.785 * G * G * P + 2 * b * Math.PI * G * m * P, Wgs = Math.PI * b * G * y
  const Am = Math.max(Wo / 138, Wgs / 138)
  const o = res(runAny("div2-flange-bolt-loads", { gasket: "spiral-ss", selfE: "no", b0, Gc: G0, B: 450, P, Sbo: 138, Sbg: 138, Ab: Am * 1.1 }, "SI"))
  const val = (label) => Number(o.results.find((r) => r.label.startsWith(label)).value)
  near(val("b ("), b, 1e-3); near(val("G ("), G, 1e-3); near(val("W_o"), Wo, 1e-3); near(val("W_gs"), Wgs, 1e-3); near(val("A_m"), Am, 1e-3)
  near(val("W_g ("), ((Am + Am * 1.1) / 2) * 138, 1e-3); near(val("H_G"), Wo - 0.785 * G * G * P, 1e-3)
  assert.equal(o.verdict.ok, true)
  assert.equal(res(runAny("div2-flange-bolt-loads", { gasket: "spiral-ss", selfE: "no", b0, Gc: G0, P, Sbo: 138, Sbg: 138, Ab: Am * 0.8 }, "SI")).verdict.ok, false)
  // small b0 needs the mean diameter G; self-energized gasket has W_gs = 0 and no gasket term
  assert.equal(runAny("div2-flange-bolt-loads", { gasket: "spiral-ss", b0: 5, Gc: 500, P, Sbo: 138, Sbg: 138 }, "SI").ok, false)
  const se = res(runAny("div2-flange-bolt-loads", { gasket: "self", selfE: "yes", b0: 5, Gc: 500, Gmean: 495, P: 2, Sbo: 138, Sbg: 138 }, "SI"))
  near(Number(se.results.find((r) => r.label.startsWith("W_o")).value), 0.785 * 495 * 495 * 2, 1e-3)
})

test("inspection openings 4.5.16 by diameter", () => {
  const rule = (id, s = "SI", svc = "corrosive") => res(runAny("div2-inspection-openings", { ID: id, service: svc }, s)).results.find((r) => r.label === "Governing rule").value
  assert.match(rule(250), /4\.5\.16\.4/); assert.match(rule(350), /4\.5\.16\.5/); assert.match(rule(420), /4\.5\.16\.6\(a\)/)
  assert.match(rule(600), /4\.5\.16\.6\(b\)/); assert.match(rule(1200), /4\.5\.16\.6\(c\)/); assert.match(rule(48, "US"), /4\.5\.16\.6\(c\)/); assert.match(rule(1200, "SI", "other"), /4\.5\.16\.1/)
})

test("Brain routes nozzle, flange and external-pressure questions", async () => {
  const { composePart5Answer, isDiv2RuleQuestion } = await import("../lib/part5/brain.ts")
  assert.equal(isDiv2RuleQuestion("Division 2 nozzle reinforcement limits"), true)
  assert.equal(isDiv2RuleQuestion("Division 2 flange bolt load W_o"), true)
  assert.ok(composePart5Answer("Division 2 flange gasket bolt loads").calculatorIds.includes("div2-flange-bolt-loads"))
  assert.ok(composePart5Answer("Division 2 manhole inspection opening requirements").sectionIds.includes("4.5"))
})

test("table lookups: Table 7.2, PWHT (Tables 6.8-6.10), Table 6.6", () => {
  const n = res(runAny("div2-nde-efficiency", { group: "3a", joint: "A-long" }, "SI"))
  assert.equal(n.results[0].value, "0.85"); assert.equal(n.results[1].value, "25%"); assert.equal(n.results[2].value, "0%")
  const n2 = res(runAny("div2-nde-efficiency", { group: "1a", joint: "B-circ-back" }, "SI"))
  assert.equal(n2.verdict.ok, false) // NP in group 1a
  assert.equal(res(runAny("div2-nde-efficiency", { group: "2b", joint: "A-tubesheet" }, "SI")).results[1].value, "100%")
  const h = (mat, t, sys = "SI", extra = {}) => res(runAny("div2-pwht", { mat, tn: t, group3: "12", fired: "no", preheat: "no", ...extra }, sys))
  const hours = (o) => Number(o.results.find((r) => r.label === "Minimum holding time").value)
  near(hours(h("p1", 60)), 2.1); near(hours(h("p1", 30)), 1.2); near(hours(h("p1", 5)), 0.25); near(hours(h("p4", 50)), 2); near(hours(h("p4", 150)), 5.25); near(hours(h("p1", 3, "US")), 2.25); near(hours(h("p4", 6, "US")), 5.25)
  assert.match(h("p1", 40).results[0].value, /yes/); assert.match(h("p1", 35).results[0].value, /yes/); assert.match(h("p1", 35, "SI", { preheat: "yes" }).results[0].value, /no/)
  assert.match(h("p1", 20).results[0].value, /no/); assert.match(h("p1", 20, "SI", { fired: "yes" }).results[0].value, /yes/); assert.match(h("p3", 10).results[0].value, /conditional/)
  assert.match(h("p3", 5, "SI", { group3: "3" }).results[0].value, /yes/)
  const r = (t, sys = "SI") => res(runAny("div2-weld-reinforcement", { t, type: "bc" }, sys)).results.map((x) => Number(x.value))
  assert.deepEqual(r(20), [4, 2.5]); assert.deepEqual(r(2.4), [2.5, 0.8]); assert.deepEqual(r(125), [8, 8]); assert.deepEqual(r(10), [3, 2.5]); near(r(1.5, "US")[0], 0.15625, 1e-3); near(r(1.5, "US")[1], 0.125, 1e-3)
  assert.equal(res(runAny("div2-weld-reinforcement", { t: 20, type: "bc", actual: 5 }, "SI")).verdict.ok, false)
})
test("Brain routes weld efficiency, PWHT and reinforcement questions", async () => {
  const { composePart5Answer, isDiv2RuleQuestion } = await import("../lib/part5/brain.ts")
  assert.equal(isDiv2RuleQuestion("Division 2 PWHT holding time for P-No. 1"), true)
  assert.equal(isDiv2RuleQuestion("Division 2 weld joint efficiency for spot RT"), true)
  assert.ok(composePart5Answer("Division 2 PWHT requirements").calculatorIds.includes("div2-pwht"))
  assert.ok(composePart5Answer("Division 2 weld joint efficiency NDE extent").calculatorIds.includes("div2-nde-efficiency"))
})

test("ligament efficiency 4.10.1 / 4.10.2", () => {
  near(Number(res(runAny("div2-ligament", { pitch: "equal", d: 20, p: 50 }, "SI")).results[0].value), 0.6, 1e-3)
  near(Number(res(runAny("div2-ligament", { pitch: "unequal", d: 20, p1: 120, n: 2, Edes: 0.7 }, "SI")).results[0].value), (120 - 40) / 120, 1e-3)
  assert.equal(res(runAny("div2-ligament", { pitch: "equal", d: 20, p: 50, Edes: 0.7 }, "SI")).verdict.ok, false)
  assert.equal(runAny("div2-ligament", { pitch: "equal", d: 60, p: 50 }, "SI").ok, false)
})

test("4.1.6 test-condition stress limits and S_PS", () => {
  const o = res(runAny("div2-test-stress-limits", { medium: "hydro", Sy: 250, Pm: 200, Pb: 150 }, "SI"))
  // Pm=200 > Sy/1.5=166.7 -> eq 4.1.5 limit = (1.5*0.95+1)*250 - 1.5*200 = 606.25-300 = 306.25 ; Pm+Pb=350 > limit
  assert.equal(o.results[2].status, "fail"); assert.match(o.results[2].label, /4\.1\.5/); near(Number(o.results[2].value.split("≤ ")[1].split(" ")[0]), 306.25, 1e-3)
  const p = res(runAny("div2-test-stress-limits", { medium: "pneu", Sy: 250, Pm: 150, Pb: 100 }, "SI")) // Pm<=166.7 -> 1.5*0.8*250=300, sum 250 ok
  assert.match(p.results[2].label, /4\.1\.4/); assert.equal(p.verdict.ok, true)
  assert.equal(res(runAny("div2-test-stress-limits", { medium: "hydro", Sy: 250, Pm: 240 }, "SI")).verdict.ok, false) // 240 > 237.5
  near(Number(res(runAny("div2-sps", { S: 138, Sy: 250, SyRT: 250, SuRT: 450, td: "no" }, "SI")).results[0].value), 500, 1e-3) // max(414,500)
  near(Number(res(runAny("div2-sps", { S: 138, Sy: 250, SyRT: 380, SuRT: 450, td: "no" }, "SI")).results[0].value), 414, 1e-3) // ratio .84 > .7
  near(Number(res(runAny("div2-sps", { S: 138, Sy: 250, SyRT: 250, SuRT: 450, td: "yes" }, "SI")).results[0].value), 414, 1e-3)
})
