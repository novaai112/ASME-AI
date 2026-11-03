"use client"

import { useEffect, useState } from "react"
import { Check, ChevronDown, Loader2, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"

interface ActivityTrailProps {
  status?: string
  steps: string[]
  recovering?: boolean
}

/**
 * Live "what the assistant is doing" panel. Replaces the bouncing dots: shows the current step,
 * and lets the user expand the full trail (PDF search, routing, provider switches).
 */
export function TypingIndicator({ status, steps, recovering }: ActivityTrailProps) {
  const [open, setOpen] = useState(false)
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000)
    return () => clearInterval(timer)
  }, [])

  const previous = steps.slice(0, -1)
  return (
    <div className="mr-auto w-full max-w-[min(100%,46rem)] animate-in fade-in slide-in-from-bottom-2 duration-300">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="group flex w-full items-center gap-3 rounded-2xl border border-stone-200/80 bg-white/80 px-4 py-3 text-left shadow-sm backdrop-blur transition hover:border-stone-300"
      >
        <span className="relative flex size-5 shrink-0 items-center justify-center text-emerald-700" aria-hidden="true">
          {recovering ? <RefreshCw className="size-4 animate-spin" /> : <Loader2 className="size-4 animate-spin" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="asme-shimmer block truncate text-sm font-medium text-stone-700">
            {status || "Working on it…"}
          </span>
          <span className="block text-xs text-stone-400">
            {recovering ? "Reconnecting automatically" : `${seconds}s · ${steps.length} step${steps.length === 1 ? "" : "s"}`}
          </span>
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-stone-400 transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>
      {open && previous.length > 0 && (
        <ol className="mt-2 space-y-1.5 rounded-2xl border border-stone-200/70 bg-white/60 px-4 py-3 text-xs text-stone-500">
          {previous.map((step, index) => (
            <li key={`${index}-${step}`} className="flex gap-2">
              <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
              <span className="min-w-0 break-words">{step}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
