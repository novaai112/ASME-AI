import { NextRequest } from "next/server"
import { appendNovaSessionCookies, getNovaSession } from "@/lib/nova-auth"

export const runtime = "nodejs"

/** A page image (figures, tables, graphs, equations) rendered from the owner's own PDF: GET /api/div2/page?printed=211 */
export async function GET(request: NextRequest) {
  let session
  try { session = await getNovaSession(request) } catch { return Response.json({ error: "Could not verify your session." }, { status: 503 }) }
  if (!session) return Response.json({ error: "Sign in required." }, { status: 401 })
  const printed = Number(request.nextUrl.searchParams.get("printed"))
  if (!Number.isInteger(printed) || printed < 1 || printed > 950) return Response.json({ error: "Invalid page." }, { status: 400 })
  const base = process.env.ASME_LAPTOP_RETRIEVAL_URL?.trim()
  const token = process.env.ASME_LAPTOP_RETRIEVAL_TOKEN?.trim()
  if (!base || !token) return Response.json({ error: "The laptop PDF service is not configured." }, { status: 503 })
  try {
    const res = await fetch(`${base.replace(/\/+$/, "")}/div2/page?printed=${printed}&scale=1.8`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000), cache: "no-store" })
    if (!res.ok || !res.headers.get("content-type")?.includes("image/png")) {
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      return Response.json({ error: data.error ?? "The laptop could not render this page." }, { status: 502 })
    }
    const response = new Response(res.body, { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=600" } })
    return session.refreshed ? appendNovaSessionCookies(response, session) : response
  } catch {
    return Response.json({ error: "The laptop is offline right now." }, { status: 503 })
  }
}
