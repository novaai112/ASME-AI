import type { AsmeChunk } from "@/lib/asme-rag"

const MAX_QUERY_LENGTH = 2_000
const MAX_RESULTS = 16
const MAX_CHUNK_LENGTH = 5_000
const MAX_RESPONSE_BYTES = 256 * 1024
const REQUEST_TIMEOUT_MS = 8_000

export function normalizeAsmeRetrievalQuery(query: string): string {
  let normalized = query
    .replace(/\b(?:please|read|search|find|look\s+up|explain|write|sort|summari[sz]e|summary|describe|pdfs?|and)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
  if (
    /\bpart\s*5\b/i.test(normalized) &&
    /\b(?:div(?:ision)?\s*2|div2)\b/i.test(normalized) &&
    !/\bdesign[\s-]*by[\s-]*analysis\b/i.test(normalized)
  ) {
    normalized += " design-by-analysis requirements"
  }
  return normalized || query.trim()
}

export function isBroadDivision2Part5Query(query: string): boolean {
  return (
    /\bpart\s*5\b/i.test(query) &&
    /\b(?:div(?:ision)?\s*2|div2)\b/i.test(query) &&
    !/\b5\.[2-5]\b|plastic[\s-]*collapse|local failure|buckling|fatigue|ratcheting|cyclic loading/i.test(query)
  )
}

export interface LaptopAsmeChunk extends AsmeChunk {
  edition: string | null
  clause: string | null
}

function getRetrievalUrl(): URL | undefined {
  const configuredUrl = process.env.ASME_LAPTOP_RETRIEVAL_URL?.trim()
  if (!configuredUrl) return undefined

  let url: URL
  try {
    url = new URL(configuredUrl)
  } catch {
    throw new Error("ASME_LAPTOP_RETRIEVAL_URL must be a valid HTTPS URL.")
  }
  const isLocalHttp =
    process.env.NODE_ENV !== "production" &&
    url.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  if (url.protocol !== "https:" && !isLocalHttp) {
    throw new Error("ASME laptop retrieval must use HTTPS outside local development.")
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("ASME_LAPTOP_RETRIEVAL_URL must not contain credentials, query parameters, or a fragment.")
  }

  url.pathname = `${url.pathname.replace(/\/+$/, "")}/search`
  return url
}

function isLaptopAsmeChunk(value: unknown): value is LaptopAsmeChunk {
  return Boolean(
    value &&
      typeof value === "object" &&
      "source" in value &&
      typeof value.source === "string" &&
      value.source.length <= 255 &&
      "page" in value &&
      typeof value.page === "number" &&
      Number.isInteger(value.page) &&
      value.page > 0 &&
      "text" in value &&
      typeof value.text === "string" &&
      value.text.trim().length > 0 &&
      value.text.length <= MAX_CHUNK_LENGTH &&
      "edition" in value &&
      (value.edition === null || (typeof value.edition === "string" && /^\d{4}$/.test(value.edition))) &&
      "clause" in value &&
      (value.clause === null || (typeof value.clause === "string" && value.clause.length <= 40)),
  )
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const declaredLength = Number(response.headers.get("content-length") ?? 0)
  if (declaredLength > MAX_RESPONSE_BYTES) {
    await response.body?.cancel()
    throw new Error("Laptop ASME retrieval response is too large.")
  }
  if (!response.body) throw new Error("Laptop ASME retrieval returned an empty response.")

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      totalBytes += value.byteLength
      if (totalBytes > MAX_RESPONSE_BYTES) {
        await reader.cancel()
        throw new Error("Laptop ASME retrieval response is too large.")
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const bytes = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown
}

export async function searchLaptopAsmeChunks(
  query: string,
  signal?: AbortSignal,
): Promise<LaptopAsmeChunk[]> {
  const url = getRetrievalUrl()
  if (!url) return []

  const token = process.env.ASME_LAPTOP_RETRIEVAL_TOKEN
  if (!token || token.length < 32) {
    throw new Error("ASME_LAPTOP_RETRIEVAL_TOKEN must contain at least 32 characters.")
  }
  const boundedQuery = query.trim().slice(0, MAX_QUERY_LENGTH)
  if (!boundedQuery) throw new Error("ASME laptop retrieval query is empty.")

  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout
  const response = await fetch(url, {
    method: "POST",
    redirect: "error",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ query: boundedQuery, limit: MAX_RESULTS }),
    cache: "no-store",
    signal: requestSignal,
  })
  if (!response.ok) {
    await response.body?.cancel()
    throw new Error(`Laptop ASME retrieval returned HTTP ${response.status}.`)
  }

  const payload = await readBoundedJson(response)
  if (!payload || typeof payload !== "object" || !("chunks" in payload) || !Array.isArray(payload.chunks)) {
    throw new Error("Laptop ASME retrieval returned an invalid response.")
  }
  if (payload.chunks.length > MAX_RESULTS || !payload.chunks.every(isLaptopAsmeChunk)) {
    throw new Error("Laptop ASME retrieval returned invalid or excessive passages.")
  }
  return payload.chunks
}
