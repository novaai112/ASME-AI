"use client"

import { Activity, CheckCircle2, Loader2, XCircle, MinusCircle } from "lucide-react"
import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { useLocalPdf } from "@/components/part5/pdf-page-viewer"

interface Status {
  providers: Record<string, number>
  aiConfigured: boolean
  laptop: "not-configured" | "online" | "offline"
  pdfs?: number
  laptopDetail?: string
  laptopHost?: string
  div2?: "ready" | "not-indexed" | "old-server"
  web: boolean
  engine: boolean
  mode: "ai+engine" | "engine-only"
}
const NAMES: Record<string, string> = { google: "Gemini", anthropic: "Claude", openai: "OpenAI", groq: "Groq", nvidia: "NVIDIA" }

export function StatusPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [status, setStatus] = useState<Status | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true); setError(null)
    fetch("/api/status", { cache: "no-store" })
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error ?? "Status unavailable"); if (!cancelled) setStatus(d) })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Status unavailable"))
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [open])

  const { info: localPdf } = useLocalPdf()
  const Row = ({ ok, label, detail, off, children }: { ok: boolean; label: string; detail: string; off?: boolean; children?: React.ReactNode }) => (
    <li className="flex items-center gap-3 rounded-xl bg-white p-3 ring-1 ring-stone-200">
      {off ? <MinusCircle className="size-5 text-stone-300" aria-hidden="true" /> : ok ? <CheckCircle2 className="size-5 text-emerald-600" aria-hidden="true" /> : <XCircle className="size-5 text-red-500" aria-hidden="true" />}
      <div className="min-w-0"><p className="text-sm font-medium text-stone-900">{label}</p><p className="text-xs text-stone-500">{detail}</p>{children}</div>
    </li>
  )

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-md gap-3 rounded-2xl">
        <DialogHeader className="text-left">
          <DialogTitle className="flex items-center gap-2 text-base"><Activity className="size-5 text-emerald-600" aria-hidden="true" />System status</DialogTitle>
          <DialogDescription className="text-xs">What can answer your questions right now.</DialogDescription>
        </DialogHeader>
        {loading && <p className="flex items-center gap-2 text-sm text-stone-500"><Loader2 className="size-4 animate-spin" aria-hidden="true" />Checking…</p>}
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">{error}</p>}
        {status && (
          <>
            <p className={cn("rounded-xl p-3 text-sm font-medium ring-1", status.aiConfigured ? "bg-emerald-50 text-emerald-900 ring-emerald-200" : "bg-amber-50 text-amber-900 ring-amber-200")}>
              {status.aiConfigured ? "AI writers are configured. If they ever fail, the built-in engine answers automatically." : "No AI key is configured — the built-in engine and Part 5 Brain are answering everything."}
            </p>
            <ul className="space-y-2">
              <Row ok off label="Part 5 Brain & calculators" detail="Always on · no AI, no network" />
              <Row ok={status.engine} label="Built-in ASME Engine" detail="Always on · final fallback when every AI fails" />
              {Object.entries(status.providers).map(([k, n]) => <Row key={k} ok={n > 0} off={n === 0} label={NAMES[k] ?? k} detail={n > 0 ? `${n} key${n > 1 ? "s" : ""} configured` : "Not configured"} />)}
              <Row ok={status.laptop === "online"} off={status.laptop === "not-configured"} label="Laptop PDF library" detail={status.laptop === "online" ? `Online${status.pdfs ? ` · ${status.pdfs} PDFs indexed` : ""}` : status.laptop === "offline" ? "Offline" : "Not configured"}>
                {status.laptopHost && <p className="mt-0.5 break-all text-[11px] text-stone-400">{status.laptopHost}</p>}
                {status.laptopDetail && <p className="mt-1 text-xs text-red-700">{status.laptopDetail}</p>}
                {status.laptop === "offline" && (
                  <ol className="mt-1.5 list-decimal space-y-0.5 pl-4 text-[11px] text-stone-600">
                    <li>On the laptop run <code>npm start</code> (or <code>start-laptop.ps1</code>) and keep it open.</li>
                    <li>If you use a free Quick Tunnel, copy its new https address into <code>ASME_LAPTOP_RETRIEVAL_URL</code> on the server and redeploy — or use an ngrok static domain once.</li>
                    <li>Or skip the laptop: open any section → View PDF pages → choose your PDF. It works on this device.</li>
                  </ol>
                )}
              </Row>
              <Row ok={Boolean(localPdf)} off={!localPdf} label="Division 2 PDF on this device" detail={localPdf ? `${localPdf.name} · ${localPdf.pages} pages — figures, tables and exact text open instantly` : "Not loaded — open a section → View PDF pages → choose your PDF (stored only in this browser)"} />
              {status.laptop === "online" && status.div2 && <Row ok={status.div2 === "ready"} label="Laptop Division 2 add-on" detail={status.div2 === "ready" ? "Exact text and page images ready" : status.div2 === "not-indexed" ? "Run  npm run div2  on the laptop once, then restart it" : "Old laptop server — copy the new server.mjs, div2.mjs and build-div2.mjs, then restart"} />}
              <Row ok={status.web} off={!status.web} label="Web research" detail={status.web ? "Tavily configured" : "Not configured"} />
            </ul>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
