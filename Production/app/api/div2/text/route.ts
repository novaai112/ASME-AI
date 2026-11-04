import { NextRequest } from "next/server"
import { appendNovaSessionCookies, getNovaSession } from "@/lib/nova-auth"

export const runtime = "nodejs"

/** Exact Division 2 paragraph text from the owner's PDF via the laptop service: GET /api/div2/text?id=4.3.6 */
export async function GET(request: NextRequest) {
  let session
  try { session = await getNovaSession(request) } catch { return Response.json({ error: "Could not verify your session." }, { status: 503 }) }
  if (!session) return Response.json({ error: "Sign in required." }, { status: 401 })
  const id = request.nextUrl.searchParams.get("id") ?? ""
  if (!/^[1-9]\.\d{1,2}(?:\.\d{1,2}){0,3}$/.test(id)) return Response.json({ error: "Invalid paragraph id." }, { status: 400 })
  const base = process.env.ASME_LAPTOP_RETRIEVAL_URL?.trim()
  const token = process.env.ASME_LAPTOP_RETRIEVAL_TOKEN?.trim()
  if (!base || !token) return Response.json({ error: "The laptop PDF service is not configured, so the exact text is unavailable. The guide, equations and calculators still work." }, { status: 503 })
  try {
    const res = await fetch(`${base.replace(/\/+$/, "")}/div2/section?id=${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000), cache: "no-store" })
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    const response = Response.json(res.ok ? data : { error: data.error ?? "The laptop could not return this paragraph." }, { status: res.ok ? 200 : res.status === 404 ? 404 : 502, headers: { "Cache-Control": "no-store" } })
    return session.refreshed ? appendNovaSessionCookies(response, session) : response
  } catch {
    return Response.json({ error: "The laptop is offline right now. The guide, equations and calculators work without it." }, { status: 503 })
  }
}
