import assert from "node:assert/strict"
import test from "node:test"
import { retrievePdfFirstResearch, shouldSearchAsmeWebFallback } from "../lib/asme-research-fallback.ts"

test("searches the PDF source before making ASME web research available", async () => {
  const calls = []
  const result = await retrievePdfFirstResearch(
    async () => {
      calls.push("pdf")
      return [{ source: "ASME VIII-2 2025.pdf", page: 42, text: "Evidence" }]
    },
    async () => {
      calls.push("web")
      return [{ title: "ASME research", url: "https://example.com", content: "Research" }]
    },
  )

  assert.deepEqual(calls, ["pdf", "web"])
  assert.equal(result.pdfEvidence.length, 1)
  assert.equal(result.webResearch.length, 1)
  assert.equal(result.pdfUnavailable, false)
})

test("keeps web research available when the laptop PDF service is unavailable", async () => {
  const result = await retrievePdfFirstResearch(
    async () => {
      throw new Error("Laptop service offline.")
    },
    async () => [{ title: "ASME paper", url: "https://example.com", content: "Research" }],
  )

  assert.equal(result.pdfUnavailable, true)
  assert.match(String(result.pdfError), /Laptop service offline/)
  assert.equal(result.pdfEvidence.length, 0)
  assert.equal(result.webResearch.length, 1)
})

test("provides web research when PDF search has no supporting passages", async () => {
  const result = await retrievePdfFirstResearch(
    async () => [],
    async () => [{ title: "ASME research", url: "https://example.com", content: "Research" }],
  )

  assert.equal(result.pdfUnavailable, false)
  assert.equal(result.pdfEvidence.length, 0)
  assert.equal(result.webResearch.length, 1)
})

test("searches the web when PDF passages cover only part of the question", async () => {
  const webCalls = []
  const evidence = [{ source: "ASME VIII-2 2025.pdf", page: 42, text: "Fatigue screening criteria are applied." }]
  const result = await retrievePdfFirstResearch(
    async () => evidence,
    async () => {
      webCalls.push("web")
      return [{ title: "ASME study", url: "https://example.com", content: "Research" }]
    },
    (pdfEvidence, unavailable) =>
      shouldSearchAsmeWebFallback("Compare fatigue and buckling rules in editions 2017 and 2025", pdfEvidence, unavailable),
  )

  assert.deepEqual(webCalls, ["web"])
  assert.equal(result.webResearch.length, 1)
})

test("does not search the web when PDF evidence covers the question", async () => {
  const webCalls = []
  const evidence = [{
    source: "ASME Sec VIII Div2 2025.pdf",
    page: 42,
    text: "Division 2 Part 5 fatigue screening and buckling assessment requirements.",
  }]
  const result = await retrievePdfFirstResearch(
    async () => evidence,
    async () => {
      webCalls.push("web")
      return []
    },
    (pdfEvidence, unavailable) =>
      shouldSearchAsmeWebFallback("Explain Division 2 Part 5 fatigue screening requirements", pdfEvidence, unavailable),
  )

  assert.deepEqual(webCalls, [])
  assert.equal(result.webResearch.length, 0)
  assert.equal(result.webSearched, false)
})

test("preserves PDF evidence if ASME web research is unavailable", async () => {
  const result = await retrievePdfFirstResearch(
    async () => [{ source: "ASME VIII-2 2025.pdf", page: 42, text: "Evidence" }],
    async () => {
      throw new Error("Tavily unavailable.")
    },
  )

  assert.equal(result.pdfEvidence.length, 1)
  assert.match(String(result.webError), /Tavily unavailable/)
})
