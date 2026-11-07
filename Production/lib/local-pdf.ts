/**
 * The user's own Division 2 PDF, kept in THIS browser (IndexedDB) and rendered with pdf.js — so page images,
 * figures, tables, graphs and exact text work with no laptop, no tunnel and no upload. The file never leaves the
 * device. Client-side only. Erasable TypeScript syntax only (it is unit-tested in a real browser harness).
 */
const DB_NAME = "asme-local-pdf"
const STORE = "files"
const KEY = "division2"
/** Printed page N is PDF page N + 66 in the 935-page 2025 edition (verified: 210→276, 598→664, 856→922). */
export const PAGE_OFFSET = 66
const PDFJS_URL = "/pdfjs/pdf.min.mjs"
const WORKER_URL = "/pdfjs/pdf.worker.min.mjs"

export interface LocalPdfInfo { name: string; size: number; pages: number }

let pdfjsPromise: Promise<any> | null = null
let docPromise: Promise<any> | null = null
let infoCache: LocalPdfInfo | null | undefined
const listeners = new Set<() => void>()
export function onLocalPdfChange(cb: () => void): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}
const notify = () => listeners.forEach((cb) => cb())

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error("Could not open browser storage."))
  })
}
async function idb<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const req = run(tx.objectStore(STORE))
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error ?? new Error("Browser storage failed."))
    })
  } finally {
    db.close()
  }
}

async function loadPdfjs(): Promise<any> {
  pdfjsPromise ??= import(/* webpackIgnore: true */ /* turbopackIgnore: true */ (PDFJS_URL as string)).then((mod: any) => {
    mod.GlobalWorkerOptions.workerSrc = WORKER_URL
    return mod
  })
  return pdfjsPromise
}

/** Stores the chosen PDF in this browser and returns its details. Throws a readable error if it is not a PDF. */
export async function saveLocalPdf(file: File): Promise<LocalPdfInfo> {
  if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") throw new Error("Please choose the Division 2 PDF file.")
  const buffer = await file.arrayBuffer()
  const pdfjs = await loadPdfjs()
  const task = pdfjs.getDocument({ data: new Uint8Array(buffer.slice(0)) })
  const doc = await task.promise
  const info: LocalPdfInfo = { name: file.name, size: file.size, pages: doc.numPages }
  try { await task.destroy() } catch { /* already released */ }
  await idb("readwrite", (s) => s.put({ buffer, ...info }, KEY))
  docPromise = null
  infoCache = info
  notify()
  return info
}

export async function getLocalPdfInfo(): Promise<LocalPdfInfo | null> {
  if (infoCache !== undefined) return infoCache
  try {
    const rec = await idb<any>("readonly", (s) => s.get(KEY))
    infoCache = rec ? { name: rec.name, size: rec.size, pages: rec.pages } : null
  } catch {
    infoCache = null
  }
  return infoCache
}

export async function clearLocalPdf(): Promise<void> {
  await idb("readwrite", (s) => s.delete(KEY))
  docPromise = null
  infoCache = null
  notify()
}

async function getDoc(): Promise<any | null> {
  docPromise ??= (async () => {
    const rec = await idb<any>("readonly", (s) => s.get(KEY))
    if (!rec) return null
    const pdfjs = await loadPdfjs()
    return pdfjs.getDocument({ data: new Uint8Array(rec.buffer.slice(0)) }).promise
  })()
  const doc = await docPromise
  if (!doc) docPromise = null
  return doc
}

export function printedToPdfPage(printed: number, pageCount: number): number | null {
  const n = printed + PAGE_OFFSET
  return n >= 1 && n <= pageCount ? n : null
}

/** Renders a printed page into the canvas, scaled to `cssWidth` CSS pixels (sharp on high-DPI screens). */
export async function renderPrintedPage(printed: number, canvas: HTMLCanvasElement, cssWidth: number): Promise<void> {
  const doc = await getDoc()
  if (!doc) throw new Error("no-local-pdf")
  const n = printedToPdfPage(printed, doc.numPages)
  if (!n) throw new Error("Page not in this PDF.")
  const page = await doc.getPage(n)
  const base = page.getViewport({ scale: 1 })
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5)
  const viewport = page.getViewport({ scale: (cssWidth / base.width) * dpr })
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  canvas.style.width = `${Math.ceil(viewport.width / dpr)}px`
  canvas.style.height = `${Math.ceil(viewport.height / dpr)}px`
  await page.render({ canvasContext: canvas.getContext("2d"), canvas, viewport }).promise
  page.cleanup()
}

/** Exact text of PDF pages [from, to] (inclusive, capped at 14 pages), page-marked. */
export async function extractPdfText(fromPdf: number, toPdf: number): Promise<string> {
  const doc = await getDoc()
  if (!doc) throw new Error("no-local-pdf")
  const start = Math.max(1, fromPdf)
  const end = Math.min(doc.numPages, Math.max(start, toPdf), start + 13)
  const out: string[] = []
  for (let n = start; n <= end; n += 1) {
    const page = await doc.getPage(n)
    const content = await page.getTextContent()
    let text = ""
    for (const item of content.items) if ("str" in item) text += item.str + (item.hasEOL ? "\n" : " ")
    out.push(`— printed page ${n - PAGE_OFFSET} —\n${text.replace(/[ \t]+/g, " ").trim()}`)
    page.cleanup()
  }
  return out.join("\n\n")
}
