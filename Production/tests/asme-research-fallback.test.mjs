import assert from "node:assert/strict"
import test from "node:test"
import { retrievePdfFirstResearch, shouldSearchAsmeWebFallback } from "../lib/asme-research-fallback.ts"
import { isBroadDivision2Part5Query, normalizeAsmeRetrievalQuery } from "../lib/asme-laptop-retrieval.ts"
import { searchAsmeIndex } from "../lib/asme-rag.ts"

test("removes prompt instructions from the retrieval query but preserves ASME terms", () => {
  assert.equal(
    normalizeAsmeRetrievalQuery("read ASME Sec VIII div 2 part 5 pdf and Write Sort Explain"),
    "ASME Sec VIII div 2 part 5 design-by-analysis requirements",
  )
})

test("requests section-specific retrieval for broad Division 2 Part 5 questions", () => {
  assert.equal(isBroadDivision2Part5Query("ASME Section VIII Division 2 Part 5"), true)
  assert.equal(isBroadDivision2Part5Query("ASME Section VIII Division 2 Part 5 plastic collapse"), false)
  assert.equal(isBroadDivision2Part5Query("ASME Section VIII Division 1 Part 5"), false)
})

test("retains retrieved Part 5 passages when the limited search result omits the Part 6 boundary", () => {
  const passages = [
    {
      source: "ASME Sec VIII Div2 2025.pdf",
      page: 654,
      clause: "5.1",
      text: "PART 5 DESIGN-BY-ANALYSIS REQUIREMENTS 5.1 GENERAL REQUIREMENTS",
    },
    {
      source: "ASME Sec VIII Div2 2025.pdf",
      page: 656,
      clause: "5.2.1",
      text: "5.2 PROTECTION AGAINST PLASTIC COLLAPSE 5.2.1 GENERAL",
    },
    {
      source: "ASME Sec VIII Div2 2025.pdf",
      page: 917,
      clause: "2.3.5",
      text: "7-A.4 TABLES inspection activities",
    },
  ]

  const result = searchAsmeIndex(passages, "ASME Section VIII Division 2 Part 5 design-by-analysis requirements")

  assert.ok(result.some(({ page }) => page === 654))
  assert.ok(result.some(({ page }) => page === 656))
  assert.ok(result.every(({ page }) => page !== 917))
})

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
  const webCalls = []
  const result = await retrievePdfFirstResearch(
    async () => {
      throw new Error("Laptop service offline.")
    },
    async () => {
      webCalls.push("web")
      return [{ title: "ASME paper", url: "https://example.com", content: "Research" }]
    },
    (pdfEvidence, unavailable) =>
      shouldSearchAsmeWebFallback("Explain ASME Section VIII Division 2 plastic collapse", pdfEvidence, unavailable),
  )

  assert.equal(result.pdfUnavailable, true)
  assert.match(String(result.pdfError), /Laptop service offline/)
  assert.equal(result.pdfEvidence.length, 0)
  assert.deepEqual(webCalls, ["web"])
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
