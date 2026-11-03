export interface PdfPageImage {
  pageNumber: number
  data: string
}

const MAX_PDF_PAGES = 200
const MAX_SCANNED_PAGES = 12
const MAX_PAGE_IMAGE_DATA_CHARS = 2_400_000
const VISUAL_QUERY = /\b(?:table|chart|graph|figure|diagram|plot|material propert(?:y|ies)|nomograph)\b/i
const STOP_WORDS = new Set(["about", "and", "for", "from", "how", "the", "what", "with"])

export async function renderPdfPagesForParsing(file: File, query: string): Promise<PdfPageImage[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs")
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.mjs", import.meta.url).toString()

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    verbosity: 0,
  })
  const document = await loadingTask.promise
  const scannedPages: number[] = []
  const rankedPages: Array<{ pageNumber: number; score: number }> = []
  const imageOperators = new Set([
    pdfjs.OPS.paintImageXObject,
    pdfjs.OPS.paintInlineImageXObject,
    pdfjs.OPS.paintImageMaskXObject,
  ])
  const terms = [
    ...new Set(
      (query.toLowerCase().match(/[a-z0-9.]+/g) ?? []).filter(
        (term) => term.length > 2 && !STOP_WORDS.has(term),
      ),
    ),
  ]

  try {
    if (document.numPages > MAX_PDF_PAGES) {
      throw new Error(`Uploaded PDFs are limited to ${MAX_PDF_PAGES} pages.`)
    }

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber)
      const content = await page.getTextContent()
      const text = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim()

      if (text.length < 24) {
        const operators = await page.getOperatorList()
        if (!operators.fnArray.some((operator) => imageOperators.has(operator))) continue
        scannedPages.push(pageNumber)
        if (scannedPages.length > MAX_SCANNED_PAGES) {
          throw new Error(`Scanned PDF uploads are limited to ${MAX_SCANNED_PAGES} pages per request.`)
        }
        continue
      }

      if (VISUAL_QUERY.test(query)) {
        const normalizedText = text.toLowerCase()
        const score = terms.reduce((total, term) => total + (normalizedText.includes(term) ? 1 : 0), 0)
        if (score > 0) rankedPages.push({ pageNumber, score })
      }
    }

    const selectedPages = new Set(scannedPages)
    if (VISUAL_QUERY.test(query)) {
      rankedPages
        .sort((left, right) => right.score - left.score)
        .slice(0, 2)
        .forEach(({ pageNumber }) => {
          if (selectedPages.size < MAX_SCANNED_PAGES) selectedPages.add(pageNumber)
        })
    }

    const images: PdfPageImage[] = []
    let totalDataChars = 0
    for (const pageNumber of selectedPages) {
      const page = await document.getPage(pageNumber)
      const initialViewport = page.getViewport({ scale: 1 })
      const scale = Math.min(1.6, 2_000 / Math.max(initialViewport.width, initialViewport.height))
      const viewport = page.getViewport({ scale })
      const canvas = window.document.createElement("canvas")
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      const context = canvas.getContext("2d")
      if (!context) throw new Error("The browser could not prepare a canvas for PDF page parsing.")

      try {
        await page.render({ canvas, canvasContext: context, viewport }).promise
        const data = canvas.toDataURL("image/jpeg", 0.78)
        totalDataChars += data.length
        if (totalDataChars > MAX_PAGE_IMAGE_DATA_CHARS) {
          throw new Error("Rendered PDF pages exceed the parser upload limit; split the PDF and retry.")
        }
        images.push({ pageNumber, data })
      } finally {
        canvas.width = 0
        canvas.height = 0
      }
    }

    return images
  } finally {
    await loadingTask.destroy()
  }
}
