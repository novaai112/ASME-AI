import { PART5_CALCULATORS, runCalculator as runPart5 } from "./part5/calculators.ts"
import { DIV2_CALCULATORS } from "./div2/calculators.ts"
import type { CalcDef, CalcOutput, UnitSystem, Values } from "./part5/types.ts"

/** Every calculator in the app (Part 5 design-by-analysis + Part 4/8 design-by-rule). */
export const ALL_CALCULATORS: CalcDef[] = [...DIV2_CALCULATORS, ...PART5_CALCULATORS]
export const getCalculator = (id: string) => ALL_CALCULATORS.find((c) => c.id === id)

export function runCalculator(id: string, values: Values, system: UnitSystem): { ok: true; output: CalcOutput } | { ok: false; error: string } {
  const def = DIV2_CALCULATORS.find((c) => c.id === id)
  if (!def) return runPart5(id, values, system)
  try {
    return { ok: true, output: def.compute(values, system) }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Calculation failed." }
  }
}
