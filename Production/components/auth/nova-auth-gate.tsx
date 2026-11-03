"use client"

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react"
import { ArrowRight, ExternalLink, KeyRound, LoaderCircle, LockKeyhole, LogOut, Mail, ShieldCheck, UserRound } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { NovaProfileContext, type NovaProfileControl } from "./nova-profile-context"

interface NovaAuthGateProps {
  children: ReactNode
}

interface NovaUser {
  id: string
  email?: string
  fullName?: string
  avatarUrl?: string
}

export function NovaAuthGate({ children }: NovaAuthGateProps) {
  const [user, setUser] = useState<NovaUser | null>(null)
  const [checking, setChecking] = useState(true)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)

  const checkSession = useCallback(async () => {
    setChecking(true)
    setError("")
    try {
      const response = await fetch("/api/auth/session", { cache: "no-store" })
      const result = (await response.json()) as { user?: NovaUser | null; error?: string }
      if (response.ok && result.user) {
        setUser(result.user)
      } else {
        setUser(null)
        if (response.status >= 500) setError(result.error || "Could not verify the Nova sign-in service.")
      }
    } catch {
      setUser(null)
      setError("Could not reach the Nova sign-in service. Check your connection and try again.")
    } finally {
      setChecking(false)
    }
  }, [])

  useEffect(() => {
    void checkSession()
  }, [checkSession])

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError("")
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      })
      const result = (await response.json()) as { user?: NovaUser; error?: string }
      if (!response.ok || !result.user) throw new Error(result.error || "Unable to verify your Nova account.")
      setUser(result.user)
      setPassword("")
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Sign-in failed. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  async function handleSignOut() {
    setBusy(true)
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" })
      if (!response.ok) throw new Error("Sign-out failed. Please try again.")
      setUser(null)
      setProfileOpen(false)
      setError("")
    } catch (logoutError) {
      setError(logoutError instanceof Error ? logoutError.message : "Sign-out failed. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  const displayName = user?.fullName?.trim() || user?.email?.split("@")[0] || "NOVA AI Member"
  const initials = displayName
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "N"
  const profileControl: NovaProfileControl | null = user
    ? {
        displayName,
        email: user.email,
        avatarUrl: user.avatarUrl,
        initials,
        openProfile: () => setProfileOpen(true),
      }
    : null

  if (checking) {
    return (
      <main className="nova-auth-background flex min-h-screen items-center justify-center p-4">
        <section className="flex w-full max-w-[324px] flex-col items-center rounded-[18px] border border-white/80 bg-white/90 px-6 py-8 text-center shadow-2xl backdrop-blur-2xl">
          <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/25">
            <LoaderCircle aria-hidden="true" className="h-5 w-5 animate-spin" />
          </div>
          <p className="nova-auth-title text-base font-semibold text-slate-900">Verifying access…</p>
          <p className="mt-1 text-xs text-slate-500">Checking your NOVA AI session</p>
        </section>
      </main>
    )
  }

  if (!user) {
    return (
      <main className="nova-auth-background flex min-h-screen items-center justify-center overflow-x-hidden p-4 text-slate-800">
        <section className="w-full max-w-[324px] rounded-[18px] border border-white/80 bg-white/90 p-6 shadow-2xl backdrop-blur-2xl sm:max-w-[420px] sm:rounded-[22px] sm:p-9">
          <header className="mb-4 flex flex-col items-center text-center sm:mb-6">
            <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/25 sm:mb-3 sm:h-12 sm:w-12 sm:rounded-2xl">
              <LockKeyhole aria-hidden="true" className="h-[18px] w-[18px] sm:h-6 sm:w-6" />
            </div>
            <span className="mb-1.5 inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-blue-700 sm:mb-2 sm:px-3 sm:py-1 sm:text-[10px]">
              <ShieldCheck aria-hidden="true" className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              NOVA AI Protected
            </span>
            <h1 className="nova-auth-title text-[17px] font-bold leading-6 tracking-tight text-slate-900 sm:text-[22px] sm:leading-7">
              Sign In to ASME Interpreter
            </h1>
            <p className="mt-1 max-w-[240px] text-[10px] leading-[14px] text-slate-600 sm:mt-2 sm:max-w-[310px] sm:text-[13px] sm:leading-5">
              Access to ASME Code assistance is exclusive to verified NOVA AI members.
            </p>
          </header>

          {error && (
            <p role="alert" className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] leading-4 text-rose-800 sm:mb-4 sm:px-3.5 sm:py-2.5 sm:text-xs sm:leading-5">
              {error}
            </p>
          )}

          <form onSubmit={handleSignIn} className="space-y-2.5 sm:space-y-4">
            <label className="block">
              <span className="mb-1 block text-[9px] font-bold uppercase tracking-wide text-slate-600 sm:mb-1.5 sm:text-[11px]">NOVA AI Email</span>
              <span className="flex h-[34px] items-center rounded-[10px] border border-slate-200 bg-white px-2.5 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 sm:h-11 sm:rounded-xl sm:px-3">
                <Mail aria-hidden="true" className="mr-2 h-3.5 w-3.5 shrink-0 text-slate-400 sm:h-4 sm:w-4" />
                <input
                  type="email"
                  autoComplete="username"
                  required
                  maxLength={320}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="your.email@example.com"
                  className="w-full bg-transparent text-[10px] outline-none placeholder:text-slate-400 sm:text-sm"
                />
              </span>
            </label>

            <label className="block">
              <span className="mb-1 block text-[9px] font-bold uppercase tracking-wide text-slate-600 sm:mb-1.5 sm:text-[11px]">Password</span>
              <span className="flex h-[34px] items-center rounded-[10px] border border-slate-200 bg-white px-2.5 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 sm:h-11 sm:rounded-xl sm:px-3">
                <KeyRound aria-hidden="true" className="mr-2 h-3.5 w-3.5 shrink-0 text-slate-400 sm:h-4 sm:w-4" />
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  maxLength={1024}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Your Nova AI password"
                  className="w-full bg-transparent text-[10px] outline-none placeholder:text-slate-400 sm:text-sm"
                />
              </span>
            </label>

            <button
              type="submit"
              disabled={busy}
              className="flex h-[34px] w-full items-center justify-center gap-1.5 rounded-[10px] bg-blue-600 px-3 text-[10px] font-bold text-white shadow-md shadow-blue-500/20 transition-colors hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60 sm:h-11 sm:rounded-xl sm:text-sm"
            >
              {busy ? <LoaderCircle aria-hidden="true" className="h-3.5 w-3.5 animate-spin sm:h-4 sm:w-4" /> : null}
              {busy ? "Verifying credentials…" : "Sign In & Access Database"}
              {!busy && <ArrowRight aria-hidden="true" className="h-3 w-3 sm:h-4 sm:w-4" />}
            </button>
          </form>

          <a
            href="https://nova-analysis.vercel.app/dashboard"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2.5 flex items-center justify-center gap-1 border-t border-slate-200/80 pt-2.5 text-[9px] font-semibold text-blue-700 hover:text-blue-900 sm:mt-4 sm:gap-1.5 sm:pt-4 sm:text-xs"
          >
            Open NOVA AI Dashboard
            <ExternalLink aria-hidden="true" className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
          </a>
          <p className="mt-2 text-center text-[8px] leading-3 text-slate-400 sm:mt-3 sm:text-[10px] sm:leading-4">
            Sign in with the same account you use for NOVA AI.
          </p>
        </section>
      </main>
    )
  }

  return (
    <NovaProfileContext.Provider value={profileControl}>
      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent
          overlayClassName="bg-slate-950/30 backdrop-blur-md"
          className="w-[calc(100%-2rem)] max-w-[390px] gap-0 overflow-hidden rounded-[28px] border border-white/60 bg-white/75 p-0 text-slate-900 shadow-[0_32px_100px_-24px_rgba(15,23,42,0.55)] backdrop-blur-2xl sm:max-w-[390px]"
        >
          <div className="relative flex min-h-[410px] flex-col items-center justify-center px-7 py-10 text-center">
            <div className="absolute inset-x-0 top-0 h-36 bg-gradient-to-br from-blue-100/90 via-indigo-100/60 to-transparent" aria-hidden="true" />
            <Avatar className="relative mb-5 size-28 border-4 border-white shadow-xl shadow-blue-900/10">
              {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={`${displayName}'s profile picture`} referrerPolicy="no-referrer" />}
              <AvatarFallback className="bg-gradient-to-br from-blue-600 to-indigo-700 text-3xl font-semibold text-white">
                {initials}
              </AvatarFallback>
            </Avatar>
            <DialogTitle className="relative max-w-full truncate text-2xl font-semibold tracking-tight text-slate-900">
              {displayName}
            </DialogTitle>
            <DialogDescription className="relative mt-2 max-w-full truncate text-sm text-slate-500">
              {user.email || "Signed in to NOVA AI"}
            </DialogDescription>
            <a
              href="https://nova-analysis.vercel.app/profile/info"
              className="mt-8 flex h-12 w-full max-w-[280px] items-center justify-center gap-2 rounded-xl border border-blue-200/80 bg-white/70 px-4 text-sm font-semibold text-blue-700 shadow-sm transition hover:border-blue-300 hover:bg-white"
            >
              See Full Profile
              <ExternalLink aria-hidden="true" className="h-4 w-4" />
            </a>
            {error && (
              <p role="alert" className="mt-4 max-w-[280px] text-sm text-rose-700">
                {error}
              </p>
            )}
            <button
              type="button"
              onClick={handleSignOut}
              disabled={busy}
              className="mt-3 flex h-12 w-full max-w-[280px] items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60"
            >
              {busy ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : <LogOut aria-hidden="true" className="h-4 w-4" />}
              Sign Out
            </button>
            <div className="mt-6 flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
              <UserRound aria-hidden="true" className="h-3.5 w-3.5" />
              NOVA AI Member
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {children}
    </NovaProfileContext.Provider>
  )
}
