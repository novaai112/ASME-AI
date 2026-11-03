import { clearNovaSessionCookies, isSameOriginRequest } from "@/lib/nova-auth"

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return Response.json({ error: "Sign-out request origin is invalid." }, { status: 403 })
  }
  return clearNovaSessionCookies(Response.json({ ok: true }))
}
