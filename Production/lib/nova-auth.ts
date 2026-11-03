import type { NextRequest } from "next/server"

export const NOVA_ACCESS_COOKIE = "nova_access_token"
export const NOVA_REFRESH_COOKIE = "nova_refresh_token"
const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 30

export interface NovaUser {
  id: string
  email?: string
  fullName?: string
  avatarUrl?: string
}

export interface NovaSession {
  user: NovaUser
  accessToken: string
  refreshToken: string
  expiresIn: number
  refreshed: boolean
}

export function getNovaSupabaseConfig(): { url: string; anonKey: string } | null {
  const url = process.env.NOVA_SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const anonKey = process.env.NOVA_SUPABASE_ANON_KEY?.trim() || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
  if (!url || !anonKey) return null

  try {
    const parsedUrl = new URL(url)
    if (parsedUrl.protocol !== "https:" && parsedUrl.hostname !== "localhost") return null
    return { url: parsedUrl.origin, anonKey }
  } catch {
    return null
  }
}

function getCookieOptions(maxAge: number): string {
  return [
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.max(0, Math.floor(maxAge))}`,
    ...(process.env.NODE_ENV === "production" ? ["Secure"] : []),
  ].join("; ")
}

export function appendNovaSessionCookies(response: Response, session: Pick<NovaSession, "accessToken" | "refreshToken" | "expiresIn">): Response {
  response.headers.append(
    "Set-Cookie",
    `${NOVA_ACCESS_COOKIE}=${encodeURIComponent(session.accessToken)}; ${getCookieOptions(session.expiresIn)}`,
  )
  response.headers.append(
    "Set-Cookie",
    `${NOVA_REFRESH_COOKIE}=${encodeURIComponent(session.refreshToken)}; ${getCookieOptions(SESSION_COOKIE_MAX_AGE)}`,
  )
  return response
}

export function clearNovaSessionCookies(response: Response): Response {
  response.headers.append("Set-Cookie", `${NOVA_ACCESS_COOKIE}=; ${getCookieOptions(0)}`)
  response.headers.append("Set-Cookie", `${NOVA_REFRESH_COOKIE}=; ${getCookieOptions(0)}`)
  return response
}

async function fetchNovaUser(url: string, anonKey: string, accessToken: string): Promise<NovaUser | null> {
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  })
  if (!response.ok) {
    await response.body?.cancel()
    return null
  }
  const user = (await response.json()) as {
    id?: string
    email?: string
    user_metadata?: { full_name?: string; name?: string; avatar_url?: string; picture?: string }
  }
  if (typeof user.id !== "string") return null
  const avatarUrl = user.user_metadata?.avatar_url ?? user.user_metadata?.picture
  return {
    id: user.id,
    email: user.email,
    fullName: user.user_metadata?.full_name ?? user.user_metadata?.name,
    avatarUrl: isHttpsUrl(avatarUrl) ? avatarUrl : undefined,
  }
}

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string") return false
  try {
    return new URL(value).protocol === "https:"
  } catch {
    return false
  }
}

export async function getNovaUserProfile(
  user: NovaUser,
  accessToken: string,
): Promise<NovaUser> {
  const config = getNovaSupabaseConfig()
  if (!config) return user

  const query = new URLSearchParams({
    select: "full_name,avatar_url",
    id: `eq.${user.id}`,
    limit: "1",
  })
  const response = await fetch(`${config.url}/rest/v1/user_profiles?${query}`, {
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  })
  if (!response.ok) {
    await response.body?.cancel()
    throw new Error(`Nova profile lookup returned HTTP ${response.status}.`)
  }
  const rows = (await response.json()) as Array<{ full_name?: unknown; avatar_url?: unknown }>
  const profile = rows[0]
  if (!profile) return user

  return {
    ...user,
    fullName: typeof profile.full_name === "string" && profile.full_name.trim()
      ? profile.full_name.trim()
      : user.fullName,
    avatarUrl: isHttpsUrl(profile.avatar_url) ? profile.avatar_url : user.avatarUrl,
  }
}

async function refreshNovaSession(url: string, anonKey: string, refreshToken: string): Promise<NovaSession | null> {
  const response = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  })
  if (!response.ok) {
    await response.body?.cancel()
    return null
  }
  const result = (await response.json()) as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
    user?: {
      id?: string
      email?: string
      user_metadata?: { full_name?: string; name?: string; avatar_url?: string; picture?: string }
    }
  }
  if (!result.access_token || !result.refresh_token || typeof result.user?.id !== "string") return null
  return {
    user: {
      id: result.user.id,
      email: result.user.email,
      fullName: result.user.user_metadata?.full_name ?? result.user.user_metadata?.name,
      avatarUrl: isHttpsUrl(result.user.user_metadata?.avatar_url ?? result.user.user_metadata?.picture)
        ? result.user.user_metadata?.avatar_url ?? result.user.user_metadata?.picture
        : undefined,
    },
    accessToken: result.access_token,
    refreshToken: result.refresh_token,
    expiresIn: result.expires_in ?? 3600,
    refreshed: true,
  }
}

export async function getNovaSession(request: NextRequest): Promise<NovaSession | null> {
  const config = getNovaSupabaseConfig()
  if (!config) return null

  const accessToken = request.cookies.get(NOVA_ACCESS_COOKIE)?.value
  const refreshToken = request.cookies.get(NOVA_REFRESH_COOKIE)?.value
  if (accessToken) {
    const user = await fetchNovaUser(config.url, config.anonKey, accessToken)
    if (user) {
      return {
        user,
        accessToken,
        refreshToken: refreshToken ?? "",
        expiresIn: 3600,
        refreshed: false,
      }
    }
  }

  if (!refreshToken) return null
  return refreshNovaSession(config.url, config.anonKey, refreshToken)
}

export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin")
  if (!origin) return true
  try {
    return new URL(origin).origin === new URL(request.url).origin
  } catch {
    return false
  }
}
