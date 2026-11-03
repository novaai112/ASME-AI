import { appendNovaSessionCookies, getNovaSession, getNovaSupabaseConfig, getNovaUserProfile } from "@/lib/nova-auth"
import { NextRequest } from "next/server"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  if (!getNovaSupabaseConfig()) {
    return Response.json(
      { user: null, error: "Nova sign-in is not configured on this server." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    )
  }
  let session
  try {
    session = await getNovaSession(request)
  } catch {
    return Response.json(
      { user: null, error: "Could not verify the Nova AI session. Check the server connection and try again." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    )
  }
  if (!session) return Response.json({ user: null }, { status: 401, headers: { "Cache-Control": "no-store" } })

  let user = session.user
  try {
    user = await getNovaUserProfile(session.user, session.accessToken)
  } catch (error) {
    console.warn("[nova-auth] Profile lookup failed; using verified auth metadata.", error)
  }
  const response = Response.json({ user }, { headers: { "Cache-Control": "no-store" } })
  return session.refreshed ? appendNovaSessionCookies(response, session) : response
}
