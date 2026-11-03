import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs"
import "pdfjs-dist/legacy/build/pdf.worker.mjs"

export interface AsmeChunk {
  source: string
  page: number
  text: string
  edition?: string | null
  clause?: string | null
}

const MAX_UPLOAD_PDF_PAGES = 200
const MAX_UPLOAD_TEXT_CHARS = 100_000
const MAX_UPLOAD_OCR_PAGES = 12
const PDF_IMAGE_OPERATORS = new Set([
  OPS.paintImageXObject,
  OPS.paintInlineImageXObject,
  OPS.paintImageMaskXObject,
])
const SEARCH_STOP_WORDS = new Set([
  "about",
  "also",
  "an",
  "and",
  "are",
  "as",
  "can",
  "define",
  "does",
  "explain",
  "for",
  "from",
  "give",
  "how",
  "in",
  "is",
  "it",
  "me",
  "of",
  "on",
  "please",
  "read",
  "search",
  "find",
  "write",
  "sort",
  "summarize",
  "summary",
  "describe",
  "pdf",
  "pdfs",
  "the",
  "this",
  "to",
  "what",
  "when",
  "where",
  "which",
  "with",
  "you",
])
const PART5_SECTION_PATTERNS: Record<string, RegExp> = {
  "5.1": /\bPART\s*5\s+DESIGN[\s-]*BY[\s-]*ANALYSIS\b|\b5\.1\s+GENERAL REQUIREMENTS\b/i,
  "5.2": /\b5\.2\s+PROTECTION AGAINST PLASTIC COLLAPSE\b/i,
  "5.3": /\b5\.3\s+PROTECTION AGAINST LOCAL FAILURE\b/i,
  "5.4": /\b5\.4\s+PROTECTION AGAINST COLLAPSE FROM BUCKLING\b/i,
  "5.5": /\b5\.5\s+PROTECTION AGAINST FAILURE FROM CYCLIC LOADING\b/i,
}

function tokenize(value: string): string[] {
  return value.toLowerCase().match(/\b\d+(?:\.\d+)+(?:\([a-z0-9]+\))*|\b[a-z][a-z0-9-]*\b|\b\d{4}\b/g) ?? []
}

export function searchAsmeIndex(index: AsmeChunk[], query: string, limit = 8): AsmeChunk[] {
  const isStandaloneDefinitionQuestion =
    /^\s*(?:please\s+)?(?:define\s+[a-z][a-z0-9-]*|what\s+(?:does|is)\s+[a-z][a-z0-9-]*(?:\s+mean)?)\s*[?.!]*\s*$/i.test(
      query,
    )
  if (isStandaloneDefinitionQuestion) return []

  const terms = [
    ...new Set(
      tokenize(query).filter(
        (term) => (term.length > 1 || /^\d/.test(term)) && !SEARCH_STOP_WORDS.has(term),
      ),
    ),
  ]
  if (terms.length === 0) return []

  const requestedDivisions = [...query.matchAll(/\bdiv(?:ision)?\s*([123])\b/gi)].map((match) => match[1])
  const requestedEditions = [...query.matchAll(/\b(19|20)\d{2}\b/g)].map((match) => match[0])
  const comparesEditions = /\b(compare|comparison|differences?|across editions|all editions|edition history)\b/i.test(query)
  let eligible = index.filter((chunk) => {
    const source = chunk.source.toLowerCase().replace(/div[\s._-]*(\d)/g, "division $1")
    const divisionMatch = /\bdivision\s*([123])\b/.exec(source)
    if (requestedDivisions.length && divisionMatch && !requestedDivisions.includes(divisionMatch[1])) return false
    if (requestedEditions.length && !requestedEditions.some((edition) => source.includes(edition))) return false
    return true
  })
  if (requestedDivisions.length && !requestedEditions.length && !comparesEditions) {
    const editions = eligible
      .map(({ source }) => /\b(19|20)\d{2}\b/.exec(source)?.[0])
      .filter((edition): edition is string => Boolean(edition))
    const latestEdition = editions.sort().at(-1)
    if (latestEdition) eligible = eligible.filter(({ source }) => source.includes(latestEdition))
  }
  if (eligible.length === 0) return []

  const requestedSections = [...new Set(query.match(/\b\d+(?:\.\d+)+(?:\([a-z0-9]+\))?\b/gi) ?? [])]
  const part5Requested =
    /\bpart\s*5\b|\b5\.\d+(?:\.\d+)*\b|design[\s-]+by[\s-]+analysis|\bDBA\b/i.test(query)
  const isDivision2Part5Query =
    part5Requested &&
    (requestedDivisions.length === 0 || (requestedDivisions.length === 1 && requestedDivisions[0] === "2"))
  if (isDivision2Part5Query) {
    const division2Chunks = eligible.filter((chunk) => /division\s*2/i.test(chunk.source.replace(/div[\s._-]*(\d)/gi, "division $1")))
    const part5Ranges = new Map<string, { startPage: number; endPage?: number }>()

    for (const source of new Set(division2Chunks.map((chunk) => chunk.source))) {
      const sourceChunks = division2Chunks.filter((chunk) => chunk.source === source)
      const startPage = sourceChunks
        .filter(
          (chunk) =>
            /\bPART\s*5\s+DESIGN[\s-]*BY[\s-]*ANALYSIS\s+REQUIREMENTS[\s\S]{0,160}\b5\.1\s+GENERAL REQUIREMENTS\b/i.test(
              chunk.text,
            ) &&
            (chunk.text.match(/\.{3,}|(?:\.\s+){2,}\.|…{2,}/g) ?? []).length < 2,
        )
        .map((chunk) => chunk.page)
        .sort((a, b) => a - b)[0]
      if (startPage === undefined) continue

      const endPage = sourceChunks
        .filter(
          (chunk) =>
            chunk.page > startPage &&
            /\bPART\s*6\s+FABRICATION REQUIREMENTS[\s\S]{0,200}\b6\.1\s+GENERAL FABRICATION REQUIREMENTS\b/i.test(chunk.text),
        )
        .map((chunk) => chunk.page)
        .sort((a, b) => a - b)[0]
      part5Ranges.set(source, { startPage, endPage })
    }

    eligible = division2Chunks.filter((chunk) => {
      const range = part5Ranges.get(chunk.source)
      if (!range || chunk.page < range.startPage) return false
      if (range.endPage !== undefined) return chunk.page < range.endPage
      return /^5(?:\.|$)/.test(chunk.clause ?? "") || /\b5\.\d+(?:\.\d+)?\s+[A-Z]/.test(chunk.text)
    })
  }
  const broadPart5 = part5Requested && requestedSections.length === 0
  const topicSections = [
    { section: "5.2", pattern: /\bplastic collapse\b|\blimit[\s-]load\b|\belastic[\s-]plastic\b|\bstress categorization\b|\bprimary membrane\b/i },
    { section: "5.3", pattern: /\blocal failure\b|\blocal strain\b|\bstrain limit\b/i },
    { section: "5.4", pattern: /\bbuckling\b|\bstructural imperfection/i },
    { section: "5.5", pattern: /\bcyclic loading\b|\bfatigue\b|\bratcheting\b/i },
  ]
  const focusedSections = [
    ...requestedSections.map((section) => section.split(".").slice(0, 2).join(".")),
    ...topicSections.filter(({ pattern }) => pattern.test(query)).map(({ section }) => section),
  ]
  const uniqueFocusedSections = [...new Set(focusedSections)]
  const sectionsToCover =
    broadPart5 && requestedSections.length === 0
      ? uniqueFocusedSections.length > 0
        ? [...(uniqueFocusedSections.length > 1 ? ["5.1"] : []), ...uniqueFocusedSections]
        : ["5.1", "5.2", "5.3", "5.4", "5.5"]
      : []

  const documentFrequency = new Map<string, number>()
  for (const chunk of eligible) {
    const uniqueTerms = new Set(tokenize(chunk.text))
    for (const term of terms) {
      if (uniqueTerms.has(term)) documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1)
    }
  }

  const sourceCount = new Set(eligible.map((chunk) => chunk.source)).size
  const ranked = eligible
    .map((chunk) => {
      const text = chunk.text.toLowerCase()
      const words = tokenize(text)
      const counts = new Map<string, number>()
      for (const word of words) counts.set(word, (counts.get(word) ?? 0) + 1)

      const score = terms.reduce((total, term) => {
        const frequency = counts.get(term) ?? 0
        if (frequency === 0) return total
        const inverseFrequency = Math.log(1 + eligible.length / (1 + (documentFrequency.get(term) ?? 0)))
        return total + inverseFrequency * (1 + Math.log(frequency))
      }, 0)

      const sectionHeadings = ["5.1", "5.2", "5.3", "5.4", "5.5"].filter((section) =>
        new RegExp(`\\b${section.replace(".", "\\.")}(?:\\.\\d+)?\\s+[A-Z]`).test(chunk.text),
      )
      const tableOfContentsLines = (chunk.text.match(/\.{3,}|(?:\.\s+){2,}\.|…{2,}/g) ?? []).length
      const hasPart5Heading = /part\s*5\s+design[\s-]+by[\s-]+analysis/i.test(chunk.text)
      const hasPart5SectionHeading = Object.values(PART5_SECTION_PATTERNS).some((pattern) => pattern.test(chunk.text))
      const hasFocusedPart5Heading = uniqueFocusedSections.some((section) =>
        PART5_SECTION_PATTERNS[section]?.test(chunk.text),
      )
      const exactSectionBoost = requestedSections.reduce(
        (total, section) => total + (new RegExp(`\\b${section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\b|\\.)`, "i").test(chunk.text) ? 14 : 0),
        0,
      )
      const focusedSectionBoost = uniqueFocusedSections.reduce(
        (total, section) =>
          total + (sectionHeadings.includes(section) ? 12 : new RegExp(`\\b${section.replace(".", "\\.")}\\.\\d+`, "i").test(chunk.text) ? 5 : 0),
        0,
      )
      const part5Boost =
        part5Requested && (uniqueFocusedSections.length > 0 ? hasFocusedPart5Heading : hasPart5SectionHeading) ? 10 : 0
      const tocPenalty = tableOfContentsLines >= 2 ? 24 : 0
      const offPart5Penalty = part5Requested && !hasPart5SectionHeading && !hasPart5Heading ? 12 : 0

      return {
        chunk,
        score:
          score +
          exactSectionBoost +
          focusedSectionBoost +
          part5Boost +
          (hasPart5Heading ? 12 : 0) -
          tocPenalty -
          offPart5Penalty,
        sectionHeadings,
        tableOfContentsLines,
      }
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)

  const selected: typeof ranked = []
  const addPassage = (item: (typeof ranked)[number]) => {
    if (selected.length >= limit || selected.some(({ chunk }) => chunk.source === item.chunk.source && chunk.page === item.chunk.page)) {
      return
    }
    if (comparesEditions) {
      const maxPerSource = Math.max(1, Math.floor(limit / sourceCount))
      if (selected.filter(({ chunk }) => chunk.source === item.chunk.source).length >= maxPerSource) return
    }
    selected.push(item)
  }

  if (sectionsToCover.length > 0) {
    for (const section of sectionsToCover) {
      const passage = ranked.find(
        (item) => PART5_SECTION_PATTERNS[section]?.test(item.chunk.text) && item.tableOfContentsLines < 2,
      )
      if (passage) addPassage(passage)
    }
  }

  for (const item of ranked) addPassage(item)
  return selected.map(({ chunk }) => chunk)
}

export interface UploadedPdfOptions {
  signal?: AbortSignal
  parseScannedPage?: (pageNumber: number) => Promise<string>
  getParsedPageText?: (pageNumber: number) => string | undefined
  onScannedPage?: (pageNumber: number) => void
}

export async function extractUploadedPdf(
  dataUrl: string,
  fileName: string,
  options: UploadedPdfOptions = {},
): Promise<string> {
  const encoded = dataUrl.slice(dataUrl.indexOf(",") + 1)
  const data = new Uint8Array(Buffer.from(encoded, "base64"))
  const loadingTask = getDocument({ data, verbosity: 0 })
  const document = await loadingTask.promise
  const pages: string[] = []

  try {
    if (document.numPages > MAX_UPLOAD_PDF_PAGES) {
      throw new Error(`Uploaded PDFs are limited to ${MAX_UPLOAD_PDF_PAGES} pages.`)
    }

    let totalLength = 0
    let scannedPageCount = 0
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      if (options.signal?.aborted) throw options.signal.reason ?? new Error("PDF processing was cancelled.")
      const page = await document.getPage(pageNumber)
      const content = await page.getTextContent()
      const text = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim()
      let pageText = text
      if (!pageText) {
        const operators = await page.getOperatorList()
        if (!operators.fnArray.some((operator) => PDF_IMAGE_OPERATORS.has(operator))) continue
        if (!options.parseScannedPage) {
          throw new Error(
            `Scanned content was found on page ${pageNumber} of "${fileName}". Configure NVIDIA_API_KEY to parse scanned PDF pages.`,
          )
        }
        scannedPageCount += 1
        if (scannedPageCount > MAX_UPLOAD_OCR_PAGES) {
          throw new Error(
            `Nemotron Parse is limited to ${MAX_UPLOAD_OCR_PAGES} scanned pages per upload. Split "${fileName}" into smaller PDFs.`,
          )
        }
        options.onScannedPage?.(pageNumber)
        pageText = await options.parseScannedPage(pageNumber)
      } else {
        const parsedPageText = options.getParsedPageText?.(pageNumber)
        if (parsedPageText) pageText = `${pageText}\n\nNemotron Parse layout extraction:\n${parsedPageText}`
      }
      if (pageText && totalLength < MAX_UPLOAD_TEXT_CHARS) {
        const pageTextWithSource = `[${fileName}, page ${pageNumber}]\n${pageText}`.slice(
          0,
          MAX_UPLOAD_TEXT_CHARS - totalLength,
        )
        pages.push(pageTextWithSource)
        totalLength += pageTextWithSource.length
      }
    }
  } finally {
    await loadingTask.destroy()
  }

  if (pages.length === 0) {
    throw new Error(`No selectable text was found in "${fileName}". Scanned PDFs require OCR before upload.`)
  }

  return pages.join("\n\n")
}
