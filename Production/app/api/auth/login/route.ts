import { appendNovaSessionCookies, getNovaSupabaseConfig, getNovaUserProfile, isSameOriginRequest, type NovaUser } from "@/lib/nova-auth"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0)
  if (contentLength > 8 * 1024) return Response.json({ error: "Sign-in request is too large." }, { status: 413 })
  if (!isSameOriginRequest(request)) {
    return Response.json({ error: "Sign-in request origin is invalid." }, { status: 403 })
  }
  const config = getNovaSupabaseConfig()
  if (!config) {
    return Response.json(
      { error: "Nova sign-in is not configured. Set NOVA_SUPABASE_URL and NOVA_SUPABASE_ANON_KEY on the server." },
      { status: 503 },
    )
  }

  let credentials: { email?: unknown; password?: unknown }
  try {
    credentials = await request.json()
  } catch {
    return Response.json({ error: "Provide a valid email and password." }, { status: 400 })
  }
  if (
    !credentials ||
    typeof credentials.email !== "string" ||
    credentials.email.length > 320 ||
    typeof credentials.password !== "string" ||
    credentials.password.length < 1 ||
    credentials.password.length > 1024
  ) {
    return Response.json({ error: "Provide a valid email and password." }, { status: 400 })
  }

  const response = await fetch(`${config.url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: config.anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email: credentials.email.trim(), password: credentials.password }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  })

  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as { error_description?: string; msg?: string }
    return Response.json({ error: error.error_description ?? error.msg ?? "Unable to sign in. Check your Nova account credentials." }, { status: 401 })
  }

  const result = (await response.json()) as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
    user?: { id?: string; email?: string }
  }
  if (!result.access_token || !result.refresh_token || !result.user?.id) {
    return Response.json({ error: "Nova authentication returned an incomplete session." }, { status: 502 })
  }

  const session = {
    accessToken: result.access_token,
    refreshToken: result.refresh_token,
    expiresIn: result.expires_in ?? 3600,
  }
  let user: NovaUser = { id: result.user.id, email: result.user.email }
  try {
    user = await getNovaUserProfile(user, session.accessToken)
  } catch (error) {
    console.warn("[nova-auth] Profile lookup failed after sign-in; using verified auth details.", error)
  }
  return appendNovaSessionCookies(
    Response.json({ user }),
    session,
  )
}
