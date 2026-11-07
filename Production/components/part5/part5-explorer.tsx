"use client"

import { BookOpen, ChevronLeft, ChevronRight, ExternalLink, FileText, ImageIcon, Loader2, Search, Sparkles, Calculator as CalcIcon } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { ALL_CALCULATORS, getCalculator } from "@/lib/calc-registry"
import { DIV2_DETAIL_SECTIONS } from "@/lib/div2/outline"
import { PdfPageViewer, useLocalPdf } from "./pdf-page-viewer"
import { extractPdfText, PAGE_OFFSET } from "@/lib/local-pdf"
import { DIV2_PARTS, DIV2_TOC, type Div2TocEntry } from "@/lib/div2/toc"
import { GROUP_LABELS, PART5_SECTIONS, type Part5Section } from "@/lib/part5/outline"
import { Math } from "./math"

type Tab = "guide" | "calculators" | "all"
const DETAILED = [...DIV2_DETAIL_SECTIONS, ...PART5_SECTIONS]


export function Part5Explorer({
  open, onClose, initialSectionId, initialTab = "guide", onOpenCalculator, onElaborate,
}: {
  open: boolean
  onClose: () => void
  initialSectionId?: string | null
  initialTab?: Tab
  onOpenCalculator: (id: string) => void
  onElaborate: (text: string) => void
}) {
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<Part5Section | null>(null)
  const [toc, setToc] = useState<Div2TocEntry | null>(null)
  const [pageNo, setPageNo] = useState<number | null>(null)
  const [viewPage, setViewPage] = useState<number | null>(null)
  const [tab, setTab] = useState<Tab>("guide")
  const [text, setText] = useState<{ state: "idle" | "loading" | "ok" | "error"; body?: string; error?: string }>({ state: "idle" })

  useEffect(() => {
    if (open) { setSelected(initialSectionId ? DETAILED.find((s) => s.id === initialSectionId) ?? null : null); setTab(initialTab) }
  }, [open, initialSectionId, initialTab])
  useEffect(() => { setText({ state: "idle" }); setViewPage(null) }, [selected, toc])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return DETAILED
    return DETAILED.filter((s) => `${s.id} ${s.title} ${s.summary} ${s.points.join(" ")} ${s.equations.map((e) => e.no + " " + e.meaning).join(" ")}`.toLowerCase().includes(q))
  }, [query])
  const filteredCalcs = useMemo(() => {
    const q = query.trim().toLowerCase()
    return ALL_CALCULATORS.filter((c) => !q || `${c.title} ${c.section} ${c.equations.join(" ")} ${c.summary}`.toLowerCase().includes(q))
  }, [query])

  const { info: localPdf } = useLocalPdf()
  const loadText = async (id: string) => {
    setText({ state: "loading" })
    // 1) the PDF stored on this device (works offline), 2) the laptop service
    if (localPdf) {
      try {
        const entryIdx = DIV2_TOC.findIndex((e) => e.id === id)
        const entry = entryIdx >= 0 ? DIV2_TOC[entryIdx] : null
        const from = entry ? entry.pdfPage : (selected ? selected.page + PAGE_OFFSET : null)
        if (from) {
          const to = entry ? (DIV2_TOC[entryIdx + 1]?.pdfPage ?? from + 3) : from + 3
          const body = await extractPdfText(from, to)
          setText({ state: "ok", body: `Pages ${from - PAGE_OFFSET}–${globalThis.Math.min(to, from + 13) - PAGE_OFFSET} of your PDF (the section starts on the first page; the last page may begin the next section):\n\n${body}` })
          return
        }
      } catch { /* fall through to the laptop */ }
    }
    try {
      const res = await fetch(id.includes("-") ? `/api/part5/text?id=${encodeURIComponent(id)}` : `/api/div2/text?id=${encodeURIComponent(id)}`, { cache: "no-store" })
      const data = (await res.json()) as { text?: string; error?: string }
      if (!res.ok || !data.text) setText({ state: "error", error: `${data.error ?? "Could not load the text."} You can also choose your PDF under “View PDF pages” to read it on this device.` })
      else setText({ state: "ok", body: data.text })
    } catch {
      setText({ state: "error", error: "Could not reach the server." })
    }
  }

  const groups = useMemo(() => {
    const map = new Map<string, Part5Section[]>()
    for (const s of filtered) map.set(s.group, [...(map.get(s.group) ?? []), s])
    return [...map.entries()]
  }, [filtered])

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex h-[94dvh] w-[calc(100vw-0.75rem)] max-w-3xl flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:h-[88dvh] sm:w-full">
        <DialogHeader className="space-y-2 border-b border-stone-200 bg-stone-50/80 px-4 py-3 text-left">
          <div className="flex items-center gap-2 pr-8">
            {(selected || toc) && (
              <button type="button" onClick={() => (toc ? (setToc(null), setPageNo(null)) : setSelected(null))} aria-label="Back to all sections" className="rounded-full p-1.5 text-stone-500 hover:bg-stone-200"><ChevronLeft className="size-5" aria-hidden="true" /></button>
            )}
            <span className="inline-flex size-7 items-center justify-center rounded-lg bg-emerald-600 text-white"><BookOpen className="size-4" aria-hidden="true" /></span>
            <DialogTitle className="text-base font-semibold text-stone-900">{toc ? `${toc.id} — ${toc.title}` : selected ? `${selected.id} — ${selected.title}` : "Division 2 Library"}</DialogTitle>
          </div>
          <DialogDescription className="text-xs text-stone-500">
            {toc ? `2025 edition · printed page ${toc.page ?? "—"}` : selected ? `2025 edition · printed page ${selected.page}` : "All nine Parts — guide, equations, calculators, exact text and page images from your PDF. Works without AI."}
          </DialogDescription>
          {!selected && !toc && (
            <>
              <div className="flex items-center gap-2 rounded-xl border border-stone-300 bg-white px-3 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-200">
                <Search className="size-4 text-stone-400" aria-hidden="true" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search paragraphs, equations, topics…" aria-label="Search Part 5" className="w-full bg-transparent py-2.5 text-sm outline-none" />
              </div>
              <div className="flex gap-1.5" role="tablist">
                {([["guide", "Detailed guide"], ["all", "All parts 1–9"], ["calculators", `Calculators (${ALL_CALCULATORS.length})`]] as const).map(([k, label]) => (
                  <button key={k} role="tab" aria-selected={tab === k} type="button" onClick={() => setTab(k)}
                    className={cn("rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition", tab === k ? "bg-emerald-600 text-white ring-emerald-600" : "bg-white text-stone-600 ring-stone-200 hover:bg-stone-100")}>{label}</button>
                ))}
              </div>
            </>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {!selected && !toc && tab === "guide" && (
            <div className="space-y-5">
              {groups.length === 0 && <p className="py-10 text-center text-sm text-stone-500">Nothing matches “{query}”.</p>}
              {groups.map(([group, list]) => (
                <section key={group}>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">{GROUP_LABELS[group as Part5Section["group"]]}</h3>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {list.map((s) => (
                      <button key={s.id} type="button" onClick={() => setSelected(s)} className="rounded-xl bg-white p-3 text-left ring-1 ring-stone-200 transition hover:bg-emerald-50/50 hover:ring-emerald-300">
                        <p className="text-sm font-semibold text-stone-900"><span className="mr-1.5 text-emerald-700">{s.id}</span>{s.title}</p>
                        <p className="mt-1 line-clamp-2 text-xs text-stone-500">{s.summary}</p>
                        {s.calculators.length > 0 && <p className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700"><CalcIcon className="size-3" aria-hidden="true" />{s.calculators.length} calculator{s.calculators.length > 1 ? "s" : ""}</p>}
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}

          {!selected && !toc && tab === "calculators" && (
            <div className="grid gap-2 sm:grid-cols-2">
              {filteredCalcs.map((c) => (
                <button key={c.id} type="button" onClick={() => onOpenCalculator(c.id)} className="rounded-xl bg-white p-3 text-left ring-1 ring-stone-200 transition hover:bg-emerald-50/50 hover:ring-emerald-300">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-stone-900"><CalcIcon className="size-4 text-emerald-600" aria-hidden="true" />{c.title}</p>
                  <p className="mt-0.5 text-[11px] text-emerald-700">{c.section}{c.equations.length ? ` · eq. ${c.equations.join(", ")}` : ""}</p>
                  <p className="mt-1 text-xs text-stone-500">{c.summary}</p>
                </button>
              ))}
            </div>
          )}

          {!selected && !toc && tab === "all" && (
            <div className="space-y-5">
              {Object.entries(DIV2_PARTS).map(([n, name]) => {
                const q = query.trim().toLowerCase()
                const list = DIV2_TOC.filter((e) => e.id.startsWith(`${n}.`) && (!q || `${e.id} ${e.title}`.toLowerCase().includes(q)))
                if (list.length === 0) return null
                return (
                  <section key={n}>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Part {n} — {name}</h3>
                    <div className="grid gap-1.5 sm:grid-cols-2">
                      {list.map((e) => {
                        const detailed = DETAILED.find((d) => d.id === e.id || d.id.startsWith(`${e.id}.`))
                        return (
                          <button key={e.id} type="button" onClick={() => (detailed && e.id !== "4.3" ? setSelected(detailed) : (setToc(e), setPageNo(e.page)))} className="flex items-baseline gap-2 rounded-lg bg-white px-3 py-2 text-left text-sm ring-1 ring-stone-200 transition hover:bg-emerald-50/50 hover:ring-emerald-300">
                            <span className="shrink-0 font-semibold text-emerald-700">{e.id}</span>
                            <span className="min-w-0 flex-1 text-stone-800">{e.title}</span>
                            <span className="shrink-0 text-[11px] text-stone-400">p.{e.page ?? "—"}</span>
                          </button>
                        )
                      })}
                    </div>
                  </section>
                )
              })}
            </div>
          )}

          {toc && (
            <article className="space-y-4">
              <p className="text-sm text-stone-600">Part {toc.id.split(".")[0]} — {DIV2_PARTS[Number(toc.id.split(".")[0])]}. Open the exact text or look at the printed pages (figures, tables and graphs) straight from your own PDF.</p>
              {DETAILED.filter((d) => d.id.startsWith(toc.id)).length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {DETAILED.filter((d) => d.id.startsWith(toc.id)).map((d) => (
                    <button key={d.id} type="button" onClick={() => { setToc(null); setSelected(d) }} className="rounded-full bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700">{d.id} — {d.title}</button>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => loadText(toc.id)} disabled={text.state === "loading"} className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-xs font-medium text-stone-700 ring-1 ring-stone-300 hover:bg-stone-100 disabled:opacity-60">{text.state === "loading" ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <FileText className="size-3.5" aria-hidden="true" />}Full text from my PDF</button>
                <button type="button" onClick={() => { onElaborate(`Division 2 ${toc.id} ${toc.title}: explain this section in depth with equations and a worked example.`); onClose() }} className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-xs font-medium text-stone-700 ring-1 ring-stone-300 hover:bg-stone-100"><Sparkles className="size-3.5 text-emerald-600" aria-hidden="true" />Ask AI about this section</button>
              </div>
              {toc.page && <PdfPageViewer start={pageNo ?? toc.page} />}
              {text.state === "error" && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900 ring-1 ring-amber-200">{text.error}</p>}
              {text.state === "ok" && <pre className="max-h-[50dvh] overflow-auto whitespace-pre-wrap rounded-xl bg-stone-50 p-3 font-sans text-[13px] leading-relaxed text-stone-700 ring-1 ring-stone-200">{text.body}</pre>}
            </article>
          )}

          {selected && !toc && (
            <article className="space-y-5">
              <p className="text-sm leading-relaxed text-stone-700">{selected.summary}</p>
              {selected.points.length > 0 && (
                <ul className="space-y-2">
                  {selected.points.map((p, i) => <li key={i} className="flex gap-2 text-sm leading-relaxed text-stone-700"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />{p}</li>)}
                </ul>
              )}
              {selected.equations.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-stone-500">Equations</h4>
                  {selected.equations.map((e) => (
                    <div key={e.no} className="rounded-xl bg-stone-50 p-3 ring-1 ring-stone-200">
                      <p className="text-xs font-semibold text-stone-600">Eq. ({e.no}) <span className="font-normal text-stone-500">— {e.meaning}</span></p>
                      <div className="overflow-x-auto text-[13px] sm:text-base"><Math tex={e.latex} display /></div>
                    </div>
                  ))}
                </div>
              )}
              {selected.calculators.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-stone-500">Calculators</h4>
                  <div className="flex flex-wrap gap-2">
                    {selected.calculators.map((id) => getCalculator(id)).filter(Boolean).map((c) => (
                      <button key={c!.id} type="button" onClick={() => onOpenCalculator(c!.id)} className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700"><CalcIcon className="size-3.5" aria-hidden="true" />{c!.title}</button>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex flex-wrap gap-2 border-t border-stone-200 pt-4">
                <button type="button" onClick={() => loadText(selected.id)} disabled={text.state === "loading"} className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-xs font-medium text-stone-700 ring-1 ring-stone-300 hover:bg-stone-100 disabled:opacity-60">
                  {text.state === "loading" ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <FileText className="size-3.5" aria-hidden="true" />}Full text from my PDF
                </button>
                <button type="button" onClick={() => setViewPage(selected.page)} className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-xs font-medium text-stone-700 ring-1 ring-stone-300 hover:bg-stone-100"><ImageIcon className="size-3.5" aria-hidden="true" />View PDF pages (figures &amp; tables)</button>
                <button type="button" onClick={() => { onElaborate(`Division 2 ${selected.id} ${selected.title}: explain this in depth with a worked example.`); onClose() }} className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-xs font-medium text-stone-700 ring-1 ring-stone-300 hover:bg-stone-100"><Sparkles className="size-3.5 text-emerald-600" aria-hidden="true" />Ask AI to elaborate</button>
              </div>
              {viewPage !== null && <PdfPageViewer start={viewPage} onClose={() => setViewPage(null)} />}
              {text.state === "error" && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900 ring-1 ring-amber-200">{text.error}</p>}
              {text.state === "ok" && (
                <div className="space-y-2">
                  <p className="text-[11px] text-stone-400">Read from your own licensed PDF on the laptop. Equations are images in the PDF and appear above instead.</p>
                  <pre className="max-h-[50dvh] overflow-auto whitespace-pre-wrap rounded-xl bg-stone-50 p-3 font-sans text-[13px] leading-relaxed text-stone-700 ring-1 ring-stone-200">{text.body}</pre>
                </div>
              )}
            </article>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
