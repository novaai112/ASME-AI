import assert from "node:assert/strict"
import test from "node:test"
import { normalizeMath } from "../lib/markdown-math.ts"

test("bare bracket formula from the screenshot becomes display math", () => {
  const src = "membrane stresses are:\n\n[ \\sigma_{\\theta}= \\frac{P_{int},r_i}{t}, \\qquad \\sigma_{L}= \\frac{P_{int},r_i}{2t} ]\n\nInsert the numbers:"
  const out = normalizeMath(src)
  assert.match(out, /\$\$\n\\sigma_\{\\theta\}= \\frac/)
  assert.doesNotMatch(out, /^\[ /m)
})
test("\\[ \\] and \\( \\) delimiters", () => {
  assert.match(normalizeMath("a \\[ x^2 \\] b"), /\$\$\nx\^2\n\$\$/)
  assert.equal(normalizeMath("where \\(P_m\\) is"), "where $P_m$ is")
})
test("citations and code are untouched", () => {
  const s = "See [ASME Sec VIII Div2 2025, page 654] and `[ \\sigma ]`.\n\n```\n[ \\sigma ]\n```"
  assert.equal(normalizeMath(s), s)
})
test("existing $$ math is untouched", () => {
  const s = "$$\\sigma_e=1$$ and $P_m$"
  assert.equal(normalizeMath(s), s)
})
