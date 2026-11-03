export interface PdfFirstResearchResult<TPdf, TWeb> {
  pdfEvidence: TPdf[]
  webResearch: TWeb[]
  pdfUnavailable: boolean
  webSearched: boolean
  webUnavailable: boolean
  pdfError?: unknown
  webError?: unknown
}

const GENERIC_QUERY_TERMS = new Set([
  "about", "also", "and", "asme", "bpvc", "can", "code", "compare", "comparison",
  "does", "edition", "explain", "for", "from", "how", "is", "of", "on", "part",
  "please", "section", "the", "this", "to", "what", "when", "where", "which",
  "with",
])

export function shouldSearchAsmeWebFallback<TPdf extends { source: string; text: string }>(
  query: string,
  pdfEvidence: TPdf[],
  pdfUnavailable = false,
): boolean {
  if (pdfUnavailable || pdfEvidence.length === 0) return true
  if (/\b(?:web|internet|research papers?|published studies|journal articles?|literature review|external sources?)\b/i.test(query)) {
    return true
  }

  const terms = [...new Set(
    query.toLowerCase().match(/\b\d+(?:\.\d+)+(?:\([a-z0-9]+\))*|\b[a-z][a-z0-9-]*\b|\b\d{4}\b|\b\d+\b/g) ?? [],
  )].filter((term) => !GENERIC_QUERY_TERMS.has(term) && (term.length > 1 || /^\d/.test(term)))
  if (terms.length === 0) return true

  const evidenceText = pdfEvidence.map((chunk) => `${chunk.source} ${chunk.text}`.toLowerCase()).join("\n")
  const coveredTerms = terms.filter((term) => evidenceText.includes(term)).length
  const minimumCoverage = /\b(?:calculate|calculation|numerical|solve|compare|comparison)\b/i.test(query) ? 0.6 : 0.5
  if (coveredTerms / terms.length < minimumCoverage) return true

  const requestedEditions = [...new Set(query.match(/\b(?:19|20)\d{2}\b/g) ?? [])]
  return requestedEditions.length > 1 && requestedEditions.some(
    (edition) => !pdfEvidence.some((chunk) => chunk.source.includes(edition)),
  )
}

export async function retrievePdfFirstResearch<TPdf, TWeb>(
  searchPdf: () => Promise<TPdf[]>,
  searchWeb: () => Promise<TWeb[]>,
  shouldSearchWeb: (pdfEvidence: TPdf[], pdfUnavailable: boolean) => boolean = () => true,
): Promise<PdfFirstResearchResult<TPdf, TWeb>> {
  let pdfEvidence: TPdf[] = []
  let pdfError: unknown
  let pdfUnavailable = false
  try {
    pdfEvidence = await searchPdf()
  } catch (error) {
    pdfError = error
    pdfUnavailable = true
  }

  if (!shouldSearchWeb(pdfEvidence, pdfUnavailable)) {
    return {
      pdfEvidence,
      webResearch: [],
      pdfUnavailable,
      webSearched: false,
      webUnavailable: false,
      ...(pdfError === undefined ? {} : { pdfError }),
    }
  }

  let webResearch: TWeb[] = []
  let webError: unknown
  let webUnavailable = false
  try {
    webResearch = await searchWeb()
  } catch (error) {
    webError = error
    webUnavailable = true
  }

  return {
    pdfEvidence,
    webResearch,
    pdfUnavailable,
    webSearched: true,
    webUnavailable,
    ...(pdfError === undefined ? {} : { pdfError }),
    ...(webError === undefined ? {} : { webError }),
  }
}
