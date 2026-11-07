"use client"

import { ChevronLeft, ChevronRight, ExternalLink, FileUp, Loader2, Minus, Plus, Trash2 } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { clearLocalPdf, getLocalPdfInfo, onLocalPdfChange, renderPrintedPage, saveLocalPdf, type LocalPdfInfo } from "@/lib/local-pdf"
import { cn } from "@/lib/utils"

type Mode = "checking" | "local" | "laptop" | "prompt"

/** Hook: the PDF stored in this browser (or null). */
export function useLocalPdf(): { info: LocalPdfInfo | null; ready: boolean } {
  const [info, setInfo] = useState<LocalPdfInfo | null>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let alive = true
    const load = () => getLocalPdfInfo().then((i) => { if (alive) { setInfo(i); setReady(true) } })
    void load()
    const off = onLocalPdfChange(() => void load())
    return () => { alive = false; off() }
  }, [])
  return { info, ready }
}

function PickPdf({ onPicked, compact = false }: { onPicked?: () => void; compact?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pick = async (file: File | undefined) => {
    if (!file) return
    setBusy(true); setError(null)
    try { await saveLocalPdf(file); onPicked?.() } catch (e) { setError(e instanceof Error ? e.message : "Could not read that PDF.") } finally { setBusy(false) }
  }
  return (
    <div className={cn("space-y-2", !compact && "rounded-xl bg-emerald-50/60 p-4 ring-1 ring-emerald-200")}>
      {!compact && (
        <>
          <p className="text-sm font-semibold text-emerald-900">See the figures, tables, graphs and equations</p>
          <p className="text-xs leading-relaxed text-stone-600">Choose your own Division 2 PDF once. It is stored only in this browser (never uploaded), so every page opens instantly — even offline, with no laptop or tunnel.</p>
        </>
      )}
      <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="sr-only" aria-label="Choose the Division 2 PDF" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = "" }} />
      <button type="button" disabled={busy} onClick={() => inputRef.current?.click()} className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60">
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <FileUp className="size-4" aria-hidden="true" />}{busy ? "Reading PDF…" : compact ? "Use my PDF on this device" : "Choose my Division 2 PDF"}
      </button>
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    </div>
  )
}

/** Page image from the user's own PDF: this device first, then the laptop service, otherwise a clear prompt. */
export function PdfPageViewer({ start, onClose }: { start: number; onClose?: () => void }) {
  const { info, ready } = useLocalPdf()
  const [page, setPage] = useState(start)
  const [zoom, setZoom] = useState(1)
  const [laptop, setLaptop] = useState<"trying" | "ok" | "failed">("trying")
  const [renderState, setRenderState] = useState<"idle" | "loading" | "ok" | "error">("idle")
  const [renderError, setRenderError] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(640)

  useEffect(() => setPage(start), [start])
  // Bring the viewer into view when it opens (it sits below the section text).
  useEffect(() => { const t = setTimeout(() => rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60); return () => clearTimeout(t) }, [])
  useEffect(() => setLaptop("trying"), [page])

  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    let first = true
    const measure = () => {
      const w = Math.max(280, Math.floor(el.clientWidth))
      setWidth(w)
      if (first) { first = false; if (w < 520) setZoom(2) } // phones: start zoomed so the text is readable
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const mode: Mode = !ready ? "checking" : info ? "local" : laptop === "failed" ? "prompt" : "laptop"

  const draw = useCallback(async () => {
    const canvas = canvasRef.current
    if (!canvas || !info) return
    setRenderState("loading"); setRenderError(null)
    try {
      await renderPrintedPage(page, canvas, width * zoom)
      setRenderState("ok")
    } catch (e) {
      setRenderState("error"); setRenderError(e instanceof Error && e.message !== "no-local-pdf" ? e.message : "Could not render this page.")
    }
  }, [info, page, width, zoom])
  useEffect(() => { if (mode === "local") void draw() }, [mode, draw])

  const src = `/api/div2/page?printed=${page}`
  const go = (n: number) => setPage(Math.min(950, Math.max(1, n)))

  return (
    <div ref={rootRef} className="scroll-mt-2 space-y-2 rounded-xl bg-stone-100 p-2 ring-1 ring-stone-200">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <button type="button" aria-label="Previous page" onClick={() => go(page - 1)} className="rounded-lg bg-white p-1.5 ring-1 ring-stone-300 hover:bg-stone-50"><ChevronLeft className="size-4" aria-hidden="true" /></button>
          <label className="flex items-center gap-1 text-xs text-stone-600">Page
            <input inputMode="numeric" value={page} onChange={(e) => { const n = Number(e.target.value.replace(/\D/g, "")); if (n >= 1 && n <= 950) setPage(n) }} aria-label="Printed page number" className="w-14 rounded-lg border border-stone-300 bg-white px-2 py-1 text-center text-sm" />
          </label>
          <button type="button" aria-label="Next page" onClick={() => go(page + 1)} className="rounded-lg bg-white p-1.5 ring-1 ring-stone-300 hover:bg-stone-50"><ChevronRight className="size-4" aria-hidden="true" /></button>
        </div>
        <div className="flex items-center gap-1.5">
          {mode === "local" && (
            <>
              <button type="button" aria-label="Zoom out" disabled={zoom <= 1} onClick={() => setZoom((z) => Math.max(1, +(z - 0.5).toFixed(1)))} className="rounded-lg bg-white p-1.5 ring-1 ring-stone-300 hover:bg-stone-50 disabled:opacity-40"><Minus className="size-4" aria-hidden="true" /></button>
              <span className="w-10 text-center text-xs text-stone-500">{Math.round(zoom * 100)}%</span>
              <button type="button" aria-label="Zoom in" disabled={zoom >= 3} onClick={() => setZoom((z) => Math.min(3, +(z + 0.5).toFixed(1)))} className="rounded-lg bg-white p-1.5 ring-1 ring-stone-300 hover:bg-stone-50 disabled:opacity-40"><Plus className="size-4" aria-hidden="true" /></button>
            </>
          )}
          {mode === "laptop" && <a href={src} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline"><ExternalLink className="size-3.5" aria-hidden="true" />Open full size</a>}
          {onClose && <button type="button" onClick={onClose} className="px-1 text-xs text-stone-500 hover:text-stone-800">Close</button>}
        </div>
      </div>

      <div ref={boxRef} className="relative min-h-40 overflow-auto rounded-lg bg-white">
        {mode === "checking" && <p className="p-4 text-sm text-stone-400">Checking for your PDF…</p>}
        {mode === "local" && (
          <>
            {renderState === "loading" && <div className="absolute left-2 top-2 z-10 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-xs text-stone-500 shadow"><Loader2 className="size-3.5 animate-spin" aria-hidden="true" />Rendering…</div>}
            {renderState === "error" && <p role="alert" className="p-4 text-sm text-amber-800">{renderError}</p>}
            <canvas ref={canvasRef} role="img" aria-label={`Division 2 printed page ${page}`} className={cn("block", renderState === "error" && "hidden")} />
          </>
        )}
        {mode === "laptop" && (
          <>
            {laptop === "trying" && <div className="absolute inset-0 flex items-center justify-center text-sm text-stone-400"><Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />Asking the laptop service…</div>}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img key={`${page}`} src={src} alt={`Division 2 printed page ${page}`} onLoad={() => setLaptop("ok")} onError={() => setLaptop("failed")} className={cn("h-auto w-full", laptop !== "ok" && "opacity-0")} />
          </>
        )}
        {mode === "prompt" && <div className="p-3"><PickPdf /><p className="mt-2 text-[11px] text-stone-400">The laptop service did not answer, so your PDF can also be used directly on this device. (Status → System status shows why the laptop is offline.)</p></div>}
      </div>

      {mode === "local" && info && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-stone-500">
          <span className="truncate">From your PDF on this device: {info.name} · {info.pages} pages{info.pages !== 935 ? " — page numbers may differ from the 2025 edition" : ""}</span>
          <button type="button" onClick={() => void clearLocalPdf()} className="inline-flex items-center gap-1 text-stone-500 hover:text-red-700"><Trash2 className="size-3" aria-hidden="true" />Remove from this device</button>
        </div>
      )}
      {mode === "laptop" && laptop === "ok" && <div className="text-[11px] text-stone-400"><PickPdf compact /></div>}
    </div>
  )
}
