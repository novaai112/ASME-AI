export type UnitSystem = "SI" | "US"
export type UnitKind = "stress" | "length" | "temperature" | "pressure" | "none" | "cycles" | "strain" | "modulus" | "expansion" | "percent"

export interface NumberField {
  kind: "number"
  key: string
  symbol: string // plain text symbol shown to the user, e.g. "P_m" or "σ1"
  latex: string // KaTeX for the symbol
  label: string
  unit: UnitKind
  help?: string
  placeholder?: string
  optional?: boolean
  min?: number
  max?: number
  defaultValue?: number
}
export interface SelectField {
  kind: "select"
  key: string
  label: string
  help?: string
  options: Array<{ value: string; label: string }>
  defaultValue: string
}
export interface TableField {
  kind: "table"
  key: string
  label: string
  help?: string
  columns: Array<{ key: string; symbol: string; latex: string; label: string; unit: UnitKind }>
  minRows: number
}
export interface GroupField {
  kind: "group"
  label: string
  help?: string
}
export type Field = NumberField | SelectField | TableField | GroupField

export type Row = Record<string, number>
export type Values = Record<string, number | string | Row[] | undefined>

export interface ResultLine {
  label: string
  latex?: string
  value: string
  unit?: string
  status?: "pass" | "fail" | "info"
}
export interface Step {
  title: string
  latex?: string[] // each entry is a display-math line
  text?: string
}
export interface CalcOutput {
  results: ResultLine[]
  steps: Step[]
  verdict?: { ok: boolean; text: string }
  warnings: string[]
}
export interface CalcDef {
  id: string
  title: string
  section: string // e.g. "5.2.2.4"
  equations: string[] // e.g. ["5.1"]
  summary: string
  fields: Field[]
  compute: (values: Values, system: UnitSystem) => CalcOutput
}

export const UNIT_LABELS: Record<UnitKind, Record<UnitSystem, string>> = {
  stress: { SI: "MPa", US: "ksi" },
  modulus: { SI: "MPa", US: "ksi" },
  pressure: { SI: "MPa", US: "ksi" },
  length: { SI: "mm", US: "in" },
  temperature: { SI: "°C", US: "°F" },
  expansion: { SI: "1/°C", US: "1/°F" },
  none: { SI: "–", US: "–" },
  cycles: { SI: "cycles", US: "cycles" },
  strain: { SI: "mm/mm", US: "in/in" },
  percent: { SI: "%", US: "%" },
}
