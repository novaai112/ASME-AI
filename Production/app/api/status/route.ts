import { NextRequest } from "next/server"
import { getProviderKeys, type ProviderId } from "@/lib/provider-keys"
import { appendNovaSessionCookies, getNovaSession } from "@/lib/nova-auth"

export const runtime = "nodejs"

const PROVIDERS: ProviderId[] = ["google", "anthropic", "openai", "groq", "nvidia"]

/**
 * Safe health summary for signed-in users: which answer sources are configured (counts only, never keys)
 * and whether the laptop PDF library answers. Lets the UI show "AI online / built-in engine only".
 */
export async function GET(request: NextRequest) {
  let session
  try {
    session = await getNovaSession(request)
  } catch {
    return Response.json({ error: "Could not verify your session." }, { status: 503 })
  }
  if (!session) return Response.json({ error: "Sign in required." }, { status: 401 })

  const providers = Object.fromEntries(PROVIDERS.map((p) => [p, getProviderKeys(p).length])) as Record<ProviderId, number>
  const aiConfigured = Object.values(providers).some((n) => n > 0)

  let laptop: "not-configured" | "online" | "offline" = "not-configured"
  let pdfs: number | undefined
  let laptopDetail: string | undefined
  let laptopHost: string | undefined
  let div2: "ready" | "not-indexed" | "old-server" | undefined
  const url = process.env.ASME_LAPTOP_RETRIEVAL_URL?.trim()
  const token = process.env.ASME_LAPTOP_RETRIEVAL_TOKEN?.trim()
  if (url && !token) laptopDetail = "ASME_LAPTOP_RETRIEVAL_TOKEN is not set on the server."
  if (url && token) {
    const base = url.replace(/\/+$/, "")
    try { laptopHost = new URL(base).host } catch { laptopDetail = "ASME_LAPTOP_RETRIEVAL_URL is not a valid URL (it must start with https://)." }
    if (!laptopDetail) {
      try {
        const res = await fetch(`${base}/health`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5_000), cache: "no-store" })
        if (res.ok) {
          const data = (await res.json()) as { sources?: Record<string, unknown> }
          laptop = "online"
          pdfs = data.sources ? Object.keys(data.sources).length : undefined
          // Is the Division 2 add-on (exact text + page images) installed and indexed on the laptop?
          try {
            const d = await fetch(`${base}/div2/section?id=4.3`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(4_000), cache: "no-store" })
            div2 = d.ok ? "ready" : d.status === 503 ? "not-indexed" : "old-server"
            await d.body?.cancel()
          } catch { /* keep undefined */ }
        } else {
          laptop = "offline"
          await res.body?.cancel()
          laptopDetail = res.status === 401 || res.status === 403
            ? "The laptop answered, but it rejected the access token — ASME_LAPTOP_RETRIEVAL_TOKEN on the website must match the laptop's token."
            : `The address answered with HTTP ${res.status}. It is probably an old or wrong tunnel URL.`
        }
      } catch (error) {
        laptop = "offline"
        const name = error instanceof Error ? error.name : ""
        laptopDetail = name === "TimeoutError" || name === "AbortError"
          ? "No answer within 5 seconds — the laptop service or its tunnel is not running (free Quick Tunnel addresses change every run)."
          : "Could not connect — the laptop service or tunnel is not running, or the URL is outdated."
      }
    }
  }

  const response = Response.json(
    {
      providers,
      aiConfigured,
      laptop,
      laptopDetail,
      laptopHost,
      div2,
      pdfs,
      web: Boolean(process.env.TAVILY_API_KEY),
      engine: true, // the built-in ASME Engine needs nothing and is always available
      mode: aiConfigured ? "ai+engine" : "engine-only",
    },
    { headers: { "Cache-Control": "no-store" } },
  )
  return session.refreshed ? appendNovaSessionCookies(response, session) : response
}
