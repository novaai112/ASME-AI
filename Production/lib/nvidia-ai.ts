import { createHash } from "node:crypto"

const EMBEDDING_MODEL = "nvidia/nemotron-3.5-embed-8b"
const RERANKING_MODEL = "nvidia/nemotron-3.5-rerank-8b"
const EMBEDDING_ENDPOINT = "https://integrate.api.nvidia.com/v1/embeddings"
const RERANKING_ENDPOINT = "https://ai.api.nvidia.com/v1/retrieval/nvidia/nemotron-3.5-rerank-8b/reranking"
const PARSE_ENDPOINT = "https://ai.api.nvidia.com/v1/retrieval/nvidia/nemotron-3.5-parse/parse"
const MAX_CACHED_EMBEDDINGS = 512
const embeddingCache = new Map<string, number[]>()

export interface RankedPassage<T> {
  passage: T
  score: number
}

function cacheKey(inputType: "query" | "passage", text: string): string {
  return `${inputType}:${createHash("sha256").update(text).digest("hex")}`
}

async function embedTexts(
  texts: string[],
  inputType: "query" | "passage",
  apiKey: string,
  signal: AbortSignal,
): Promise<number[][]> {
  const keys = texts.map((text) => cacheKey(inputType, text))
  const missingIndexes = keys.flatMap((key, index) => (embeddingCache.has(key) ? [] : [index]))

  if (missingIndexes.length > 0) {
    const response = await fetch(EMBEDDING_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: missingIndexes.map((index) => texts[index]),
        input_type: inputType,
        encoding_format: "float",
      }),
      signal,
    })
    if (!response.ok) throw new Error(`NVIDIA embeddings returned HTTP ${response.status}.`)

    const result = (await response.json()) as {
      data?: Array<{ index?: number; embedding?: number[] }>
    }
    if (!Array.isArray(result.data)) throw new Error("NVIDIA embeddings returned an invalid response.")

    const vectors = new Array<number[] | undefined>(missingIndexes.length)
    for (const item of result.data) {
      if (
        typeof item.index !== "number" ||
        !Array.isArray(item.embedding) ||
        item.embedding.some((value) => typeof value !== "number" || !Number.isFinite(value))
      ) {
        throw new Error("NVIDIA embeddings returned an invalid vector.")
      }
      vectors[item.index] = item.embedding
    }
    if (vectors.some((vector) => !vector)) throw new Error("NVIDIA embeddings returned incomplete results.")

    for (const [index, vector] of vectors.entries()) {
      if (!vector) continue
      const key = keys[missingIndexes[index]]
      if (embeddingCache.size >= MAX_CACHED_EMBEDDINGS) {
        const oldestKey = embeddingCache.keys().next().value
        if (oldestKey) embeddingCache.delete(oldestKey)
      }
      embeddingCache.set(key, vector)
    }
  }

  return keys.map((key) => {
    const vector = embeddingCache.get(key)
    if (!vector) throw new Error("NVIDIA embeddings cache is incomplete.")
    return vector
  })
}

function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length !== right.length || left.length === 0) return 0
  let dotProduct = 0
  let leftMagnitude = 0
  let rightMagnitude = 0
  for (let index = 0; index < left.length; index += 1) {
    dotProduct += left[index] * right[index]
    leftMagnitude += left[index] ** 2
    rightMagnitude += right[index] ** 2
  }
  if (leftMagnitude === 0 || rightMagnitude === 0) return 0
  return dotProduct / Math.sqrt(leftMagnitude * rightMagnitude)
}

export async function rankPassagesByEmbedding<T extends { text: string }>(
  query: string,
  passages: T[],
  apiKey: string,
  signal: AbortSignal,
): Promise<RankedPassage<T>[]> {
  if (passages.length === 0) return []
  const [queryVector, passageVectors] = await Promise.all([
    embedTexts([query], "query", apiKey, signal),
    embedTexts(passages.map((passage) => passage.text.slice(0, 1_800)), "passage", apiKey, signal),
  ])
  return passages
    .map((passage, index) => ({
      passage,
      score: cosineSimilarity(queryVector[0], passageVectors[index]),
    }))
    .sort((left, right) => right.score - left.score)
}

export async function rerankPassages<T extends { text: string }>(
  query: string,
  passages: T[],
  apiKey: string,
  signal: AbortSignal,
): Promise<RankedPassage<T>[]> {
  if (passages.length === 0) return []
  const response = await fetch(RERANKING_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: RERANKING_MODEL,
      query: { text: query },
      passages: passages.map((passage) => ({ text: passage.text.slice(0, 1_800) })),
    }),
    signal,
  })
  if (!response.ok) throw new Error(`NVIDIA reranking returned HTTP ${response.status}.`)

  const result = (await response.json()) as {
    rankings?: Array<{ index?: number; logit?: number }>
  }
  if (!Array.isArray(result.rankings)) throw new Error("NVIDIA reranking returned an invalid response.")

  return result.rankings
    .filter(
      (ranking): ranking is { index: number; logit: number } =>
        typeof ranking.index === "number" &&
        Number.isInteger(ranking.index) &&
        ranking.index >= 0 &&
        ranking.index < passages.length &&
        typeof ranking.logit === "number" &&
        Number.isFinite(ranking.logit),
    )
    .sort((left, right) => right.logit - left.logit)
    .map(({ index, logit }) => ({ passage: passages[index], score: logit }))
}

export async function parseNvidiaDocumentImage(
  image: Uint8Array,
  fileName: string,
  contentType: "image/png" | "image/jpeg",
  apiKey: string,
  signal: AbortSignal,
): Promise<string> {
  const form = new FormData()
  form.append("document", new Blob([Uint8Array.from(image)], { type: contentType }), fileName)
  form.append(
    "options",
    new Blob([JSON.stringify({ decoding: { max_output_tokens: 2_048 } })], { type: "application/json" }),
  )

  const response = await fetch(PARSE_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    body: form,
    signal,
  })
  if (!response.ok) throw new Error(`Nemotron Parse returned HTTP ${response.status}.`)

  const result = (await response.json()) as { content?: unknown }
  if (typeof result.content !== "string" || !result.content.trim()) {
    throw new Error("Nemotron Parse returned no extracted document content.")
  }
  return result.content.trim()
}
