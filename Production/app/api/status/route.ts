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
  const url = process.env.ASME_LAPTOP_RETRIEVAL_URL?.trim()
  const token = process.env.ASME_LAPTOP_RETRIEVAL_TOKEN?.trim()
  if (url && token) {
    try {
      const res = await fetch(`${url.replace(/\/+$/, "")}/health`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(4_000),
        cache: "no-store",
      })
      if (res.ok) {
        const data = (await res.json()) as { sources?: Record<string, unknown> }
        laptop = "online"
        pdfs = data.sources ? Object.keys(data.sources).length : undefined
      } else {
        laptop = "offline"
      }
    } catch {
      laptop = "offline"
    }
  }

  const response = Response.json(
    {
      providers,
      aiConfigured,
      laptop,
      pdfs,
      web: Boolean(process.env.TAVILY_API_KEY),
      engine: true, // the built-in ASME Engine needs nothing and is always available
      mode: aiConfigured ? "ai+engine" : "engine-only",
    },
    { headers: { "Cache-Control": "no-store" } },
  )
  return session.refreshed ? appendNovaSessionCookies(response, session) : response
}
