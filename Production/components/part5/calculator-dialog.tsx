"use client"

import { AlertTriangle, CheckCircle2, Info, Plus, RotateCcw, Trash2, XCircle, Calculator as CalcIcon } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { getCalculator, runCalculator } from "@/lib/calc-registry"
import { UNIT_LABELS, type CalcOutput, type Field, type Row, type UnitSystem, type Values } from "@/lib/part5/types"
import { Math } from "./math"

type FormState = Record<string, string | Array<Record<string, string>>>

function initialState(fields: Field[]): FormState {
  const state: FormState = {}
  for (const f of fields) {
    if (f.kind === "number") state[f.key] = f.defaultValue !== undefined ? String(f.defaultValue) : ""
    else if (f.kind === "select") state[f.key] = f.defaultValue
    else if (f.kind === "table") state[f.key] = Array.from({ length: f.minRows }, () => ({}))
  }
  return state
}

function toValues(fields: Field[], state: FormState): Values {
  const v: Values = {}
  for (const f of fields) {
    const raw = state[f.kind === "group" ? "" : f.key]
    if (f.kind === "number") {
      const t = String(raw ?? "").trim().replace(/,/g, "")
      v[f.key] = t === "" || Number.isNaN(Number(t)) ? undefined : Number(t)
    } else if (f.kind === "select") v[f.key] = String(raw)
    else if (f.kind === "table") {
      v[f.key] = (raw as Array<Record<string, string>>).map((r) => {
        const row: Row = {}
        for (const c of f.columns) {
          const t = (r[c.key] ?? "").trim()
          if (t !== "" && !Number.isNaN(Number(t))) row[c.key] = Number(t)
        }
        return row
      })
    }
  }
  return v
}

export function CalculatorDialog({ calculatorId, onClose }: { calculatorId: string | null; onClose: () => void }) {
  const def = calculatorId ? getCalculator(calculatorId) : undefined
  const [system, setSystem] = useState<UnitSystem>("SI")
  const [state, setState] = useState<FormState>({})
  const [output, setOutput] = useState<CalcOutput | null>(null)
  const [error, setError] = useState<string | null>(null)
  const resultRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (def) { setState(initialState(def.fields)); setOutput(null); setError(null) }
  }, [def])

  const calculate = () => {
    if (!def) return
    const res = runCalculator(def.id, toValues(def.fields, state), system)
    if (res.ok) { setOutput(res.output); setError(null) } else { setOutput(null); setError(res.error) }
    setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50)
  }
  const reset = () => { if (def) { setState(initialState(def.fields)); setOutput(null); setError(null) } }

  const unitLabel = (kind: keyof typeof UNIT_LABELS) => UNIT_LABELS[kind][system]

  return (
    <Dialog open={Boolean(def)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[92dvh] w-[calc(100vw-1rem)] max-w-2xl flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:w-full">
        {def && (
          <>
            <DialogHeader className="space-y-1 border-b border-stone-200 bg-stone-50/80 px-4 py-3 text-left sm:px-5 sm:py-4">
              <div className="flex flex-wrap items-center gap-2 pr-8">
                <span className="inline-flex size-7 items-center justify-center rounded-lg bg-emerald-600 text-white"><CalcIcon className="size-4" aria-hidden="true" /></span>
                <DialogTitle className="text-[15px] font-semibold leading-snug text-stone-900 sm:text-base">{def.title}</DialogTitle>
              </div>
              <DialogDescription className="line-clamp-2 text-xs text-stone-500">
                Part {def.section.split(".")[0]} · {def.section}{def.equations.length ? ` · eq. ${def.equations.length > 4 ? `${def.equations[0]} – ${def.equations[def.equations.length - 1]}` : def.equations.join(", ")}` : ""} — {def.summary}
              </DialogDescription>
              <div className="flex items-center gap-2 pt-1" role="group" aria-label="Unit system">
                <span className="text-[11px] font-medium text-stone-500">Units</span>
                {(["SI", "US"] as const).map((s) => (
                  <button key={s} type="button" onClick={() => setSystem(s)} aria-pressed={system === s}
                    className={cn("rounded-full px-3 py-1 text-xs font-medium ring-1 transition", system === s ? "bg-emerald-600 text-white ring-emerald-600" : "bg-white text-stone-600 ring-stone-200 hover:bg-stone-100")}>
                    {s === "SI" ? "SI (MPa, mm, °C)" : "US (ksi, in, °F)"}
                  </button>
                ))}
              </div>
            </DialogHeader>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {def.fields.map((f, i) => {
                if (f.kind === "group") return (
                  <div key={`g${i}`} className="border-b border-stone-200 pb-1 pt-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{f.label}</p>
                    {f.help && <p className="text-[11px] text-stone-400">{f.help}</p>}
                  </div>
                )
                if (f.kind === "select") return (
                  <label key={f.key} className="block space-y-1">
                    <span className="text-sm font-medium text-stone-800">{f.label}</span>
                    <select value={String(state[f.key] ?? f.defaultValue)} onChange={(e) => setState((s) => ({ ...s, [f.key]: e.target.value }))}
                      className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200">
                      {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </label>
                )
                if (f.kind === "table") {
                  const rows = (state[f.key] as Array<Record<string, string>>) ?? []
                  return (
                    <div key={f.key} className="space-y-2">
                      <div>
                        <p className="text-sm font-medium text-stone-800">{f.label}</p>
                        {f.help && <p className="text-[11px] text-stone-500">{f.help}</p>}
                      </div>
                      <div className="space-y-2">
                        {rows.map((row, ri) => (
                          <div key={ri} className="flex items-end gap-2 rounded-xl bg-stone-50 p-2 ring-1 ring-stone-200">
                            <span className="pb-2.5 text-xs font-semibold text-stone-400">{ri + 1}</span>
                            <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-4">
                              {f.columns.map((c) => (
                                <label key={c.key} className="block min-w-0">
                                  <span className="flex items-center gap-1 text-[11px] text-stone-600"><Math tex={c.latex} /><span className="truncate text-stone-400">({unitLabel(c.unit)})</span></span>
                                  <input inputMode="decimal" value={row[c.key] ?? ""} title={c.label} aria-label={`${c.label} row ${ri + 1}`}
                                    onChange={(e) => setState((s) => { const next = [...(s[f.key] as Array<Record<string, string>>)]; next[ri] = { ...next[ri], [c.key]: e.target.value }; return { ...s, [f.key]: next } })}
                                    className="w-full rounded-lg border border-stone-300 bg-white px-2 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200" />
                                </label>
                              ))}
                            </div>
                            <button type="button" aria-label={`Remove row ${ri + 1}`} disabled={rows.length <= 1}
                              onClick={() => setState((s) => ({ ...s, [f.key]: (s[f.key] as Array<Record<string, string>>).filter((_, x) => x !== ri) }))}
                              className="mb-0.5 rounded-lg p-2 text-stone-400 hover:bg-stone-200 hover:text-stone-700 disabled:opacity-30"><Trash2 className="size-4" aria-hidden="true" /></button>
                          </div>
                        ))}
                      </div>
                      <button type="button" onClick={() => setState((s) => ({ ...s, [f.key]: [...(s[f.key] as Array<Record<string, string>>), {}] }))}
                        className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 ring-1 ring-emerald-200 hover:bg-emerald-100">
                        <Plus className="size-3.5" aria-hidden="true" /> Add row
                      </button>
                    </div>
                  )
                }
                return (
                  <label key={f.key} className="block space-y-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-sm text-emerald-900 ring-1 ring-emerald-200"><Math tex={f.latex} /></span>
                      <span className="text-sm font-medium text-stone-800">{f.label}</span>
                      {f.optional && <span className="text-[11px] text-stone-400">optional</span>}
                    </span>
                    <span className="flex overflow-hidden rounded-xl border border-stone-300 bg-white focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-200">
                      <input inputMode="decimal" value={String(state[f.key] ?? "")} placeholder={f.placeholder ?? "enter value"}
                        onChange={(e) => setState((s) => ({ ...s, [f.key]: e.target.value }))}
                        onKeyDown={(e) => e.key === "Enter" && calculate()}
                        className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm text-stone-900 outline-none" />
                      <span className="flex items-center border-l border-stone-200 bg-stone-50 px-3 text-xs font-medium text-stone-500">{unitLabel(f.unit)}</span>
                    </span>
                    {f.help && <span className="block text-[11px] text-stone-400">{f.help}</span>}
                  </label>
                )
              })}

              <div className="flex gap-2 pt-1">
                <button type="button" onClick={calculate} className="flex-1 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 active:scale-[0.99]">Calculate</button>
                <button type="button" onClick={reset} className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-3 text-sm font-medium text-stone-600 ring-1 ring-stone-300 hover:bg-stone-100"><RotateCcw className="size-4" aria-hidden="true" />Reset</button>
              </div>

              <div ref={resultRef} aria-live="polite">
                {error && (
                  <div role="alert" className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200"><XCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{error}</div>
                )}
                {output && <Results output={output} />}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Results({ output }: { output: CalcOutput }) {
  const v = output.verdict
  return (
    <div className="space-y-4">
      {v && (
        <div className={cn("flex items-start gap-2 rounded-xl p-3 text-sm font-medium ring-1", v.ok ? "bg-emerald-50 text-emerald-900 ring-emerald-200" : "bg-red-50 text-red-900 ring-red-200")}>
          {v.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}{v.text}
        </div>
      )}
      <div className="overflow-hidden rounded-xl ring-1 ring-stone-200">
        <p className="bg-stone-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Results</p>
        <dl className="divide-y divide-stone-100 bg-white">
          {output.results.map((r, i) => (
            <div key={i} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
              <dt className="flex min-w-0 items-center gap-2 text-stone-700">
                {r.status === "pass" ? <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden="true" /> : r.status === "fail" ? <XCircle className="size-4 shrink-0 text-red-600" aria-hidden="true" /> : <Info className="size-4 shrink-0 text-stone-300" aria-hidden="true" />}
                <span className="truncate">{r.label}</span>
              </dt>
              <dd className={cn("shrink-0 text-right font-semibold tabular-nums", r.status === "fail" ? "text-red-700" : r.status === "pass" ? "text-emerald-700" : "text-stone-900")}>{r.value}{r.unit ? <span className="ml-1 text-xs font-normal text-stone-500">{r.unit}</span> : null}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Calculation steps</p>
        {output.steps.map((s, i) => (
          <div key={i} className="rounded-xl bg-stone-50 p-3 ring-1 ring-stone-200">
            <p className="mb-1 text-sm font-semibold text-stone-800"><span className="mr-2 text-emerald-600">{i + 1}.</span>{s.title}</p>
            {s.text && <p className="text-sm text-stone-600">{s.text}</p>}
            <div className="space-y-1 overflow-x-auto">{s.latex?.map((l, j) => <div key={j} className="overflow-x-auto py-0.5"><Math tex={l} display /></div>)}</div>
          </div>
        ))}
      </div>
      {output.warnings.length > 0 && (
        <ul className="space-y-1.5">
          {output.warnings.map((w, i) => (
            <li key={i} className="flex items-start gap-2 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900 ring-1 ring-amber-200"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />{w}</li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-stone-400">Computed by software from the 2025 Part 5 equations — no AI. Verify against the licensed Code and have the result reviewed by the engineer of record.</p>
    </div>
  )
}
