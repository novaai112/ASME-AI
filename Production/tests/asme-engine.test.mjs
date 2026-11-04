import assert from "node:assert/strict"
import test from "node:test"
import { composeEngineAnswer, solveCalculation, describeSource, lookupGlossary } from "../lib/asme-engine.ts"

const chunks = [
  {
    source: "ASME Sec VIII Div2 2025.pdf",
    page: 700,
    clause: "5.5.5",
    text: "5.5.5 Ratcheting assessment. Ratcheting is progressive inelastic deformation that occurs when a component is subjected to a sustained load and cyclic secondary loading. The ratcheting assessment shall be performed for all components subject to cyclic loading unless the fatigue screening criteria are satisfied. Table of contents ........ 700",
  },
  {
    source: "Asme sec viii div 1_ Mk_notes (4).pdf",
    page: 12,
    text: "Study note: ratcheting is checked with elastic stress analysis in Division 2 and is not a Division 1 rule for most vessels.",
  },
]

test("UG-27 cylinder thickness is computed correctly", () => {
  const r = solveCalculation("Calculate the required thickness of a cylindrical shell, P = 2 MPa, S = 138 MPa, inside radius 600 mm, E = 0.85, corrosion allowance 3 mm")
  assert.ok(r)
  // Rc = 603; t_circ = 2*603/(138*0.85-1.2) = 1206/116.1 = 10.388
  assert.match(r.markdown, /10\.388/)
  assert.match(r.markdown, /13\.388/) // + 3 mm CA
})

test("refuses to calculate when units mismatch or inputs are missing", () => {
  assert.equal(solveCalculation("thickness of shell P = 300 psi, S = 20 MPa, R = 24 in"), null)
  assert.equal(solveCalculation("what is the shell thickness"), null)
})

test("does not apply Division 1 formulas to a Division 2 thickness question", () => {
  assert.equal(solveCalculation("Division 2 shell thickness P = 2 MPa, S = 138 MPa, R = 600 mm"), null)
})

test("Division 1 hydrotest pressure", () => {
  const r = solveCalculation("hydrotest pressure for MAWP = 300 psi")
  assert.ok(r)
  assert.match(r.markdown, /390/)
})

test("composes a cited answer from passages, drops TOC noise, flags missing edition", () => {
  const out = composeEngineAnswer({
    question: "Explain ratcheting assessment in Division 2 2017 edition",
    chunks,
    reason: "providers-down",
  })
  assert.match(out, /Built-in ASME Engine/)
  assert.match(out, /\[ASME Sec VIII Div2 2025, 5\.5\.5, page 700\]/)
  assert.doesNotMatch(out, /\.{4,}/)
  assert.match(out, /not the Code/)
  assert.match(out, /Not covered:.*2017/)
})

test("never invents a Code answer when there is no evidence", () => {
  const out = composeEngineAnswer({ question: "xyzzy flange bolt torque limits", chunks: [], reason: "no-provider-configured" })
  assert.match(out, /could not verify/i)
  assert.match(out, /No AI provider key is configured/)
})

test("glossary + source labelling", () => {
  assert.equal(lookupGlossary("what is MAWP")[0].id, "mawp")
  assert.deepEqual(describeSource("ASME Sec VIII Div3 2025.pdf"), { title: "ASME Sec VIII Div3 2025", division: "3", edition: "2025", isNotes: false })
})

test("UG-27 overview question is answered with no PDF evidence and no AI", () => {
  const out = composeEngineAnswer({ question: "How is minimum required thickness of a cylindrical shell under internal pressure determined in Division 1 (UG-27)?", chunks: [], reason: "providers-down" })
  assert.match(out, /UG-27/)
  assert.match(out, /SE-0\.6P/)
  assert.doesNotMatch(out, /could not verify/i)
})
