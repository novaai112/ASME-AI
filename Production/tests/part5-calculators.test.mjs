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
