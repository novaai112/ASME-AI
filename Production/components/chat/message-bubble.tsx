"use client"

import { useState } from "react"
import { BookMarked, Brain, Calculator, Check, Copy, Cpu, FileText, Sparkles, User } from "lucide-react"
import { getCalculator } from "@/lib/calc-registry"
import Image from "next/image"
import { cn } from "@/lib/utils"
import type { Message } from "./chat-shell"
import { MarkdownRenderer } from "./markdown-renderer"

interface MessageBubbleProps {
  message: Message
  isStreaming?: boolean
  userAvatarUrl?: string
  onOpenCalculator?: (id: string) => void
  onOpenExplorer?: (sectionId?: string) => void
  onElaborate?: (message: Message) => void
}

/** Pulls "[Document, clause, page N]" citations out of an answer so they can be shown as source chips. */
function extractSources(content: string): string[] {
  const found = new Set<string>()
  for (const match of content.matchAll(/\[([^\[\]\n]{4,160}?,\s*(?:[^\[\]\n]*?,\s*)?pages?\s+\d+[^\[\]\n]*)\]/gi)) {
    found.add(match[1].trim())
    if (found.size >= 12) break
  }
  return [...found]
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

export function MessageBubble({ message, isStreaming = false, userAvatarUrl, onOpenCalculator, onOpenExplorer, onElaborate }: MessageBubbleProps) {
  const isUser = message.role === "user"
  const [copied, setCopied] = useState(false)
  const isEngine = message.model === "ASME Engine"
  const isBrain = message.model === "Division 2 Brain" || message.model === "Part 5 Brain"
  const part5Calcs = (message.part5?.calculators ?? []).map((id) => getCalculator(id)).filter((c): c is NonNullable<ReturnType<typeof getCalculator>> => Boolean(c))
  const sources = !isUser && !isStreaming ? extractSources(message.content) : []

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard blocked: ignore */
    }
  }

  if (isUser) {
    return (
      <div className="user-message-enter ml-auto flex max-w-[88%] flex-row-reverse items-end gap-2.5 md:max-w-[75%]">
        <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-stone-200 text-stone-600" aria-hidden="true">
          {userAvatarUrl
            ? <img src={userAvatarUrl} alt="" className="size-8 rounded-full object-cover" referrerPolicy="no-referrer" />
            : <User className="size-4" />}
        </div>
        <div className="flex flex-col items-end">
          <div className="rounded-2xl rounded-br-md bg-stone-900 px-4 py-3 text-stone-50 shadow-sm">
            <div className="flex flex-col gap-2">
              {message.imageData?.startsWith("data:image/") && (
                <div className="size-20 overflow-hidden rounded-lg border border-white/20">
                  <Image src={message.imageData} alt="Uploaded image" width={80} height={80} className="size-full object-cover" />
                </div>
              )}
              {message.attachmentName && (
                <div className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-xs text-stone-100">
                  <FileText className="size-4 shrink-0 text-emerald-300" aria-hidden="true" />
                  <span className="max-w-52 truncate">{message.attachmentName}</span>
                </div>
              )}
              <p className="whitespace-pre-wrap break-words text-sm leading-6">{message.content}</p>
            </div>
          </div>
          <span className="mt-1 text-[11px] text-stone-400">{formatTime(message.createdAt)}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="mr-auto flex w-full gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="mt-1 size-8 shrink-0 overflow-hidden rounded-full bg-white shadow-sm ring-1 ring-stone-200" aria-hidden="true">
        <Image src="/asme-interpreter-orb.png" alt="" width={32} height={32} className="size-8 rounded-full object-cover" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2 text-xs">
          <span className="font-semibold text-stone-800">ASME Interpreter</span>
          {message.model && (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                isEngine ? "bg-amber-50 text-amber-800 ring-1 ring-amber-200" : isBrain ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200" : "bg-stone-100 text-stone-500",
              )}
              title={isEngine ? "Written by the built-in engine directly from your ASME PDFs — no external AI was needed." : undefined}
            >
              {isEngine ? <Cpu className="size-3" aria-hidden="true" /> : isBrain ? <Brain className="size-3" aria-hidden="true" /> : <Sparkles className="size-3 text-emerald-600" aria-hidden="true" />}
              {isEngine ? "Built-in ASME Engine" : isBrain ? "Division 2 Brain · no AI" : message.model}
              {message.switched ? " · auto-switched" : ""}
            </span>
          )}
        </div>
        <div className="rounded-2xl rounded-tl-md border border-stone-200/80 bg-white px-5 py-4 shadow-[0_1px_2px_rgba(28,25,23,0.04),0_8px_24px_-12px_rgba(28,25,23,0.10)]">
          <MarkdownRenderer content={message.content || " "} isStreaming={isStreaming} />
          {isStreaming && <span className="asme-caret ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 bg-emerald-600" aria-hidden="true" />}
        </div>
        {isBrain && !isStreaming && (
          <div className="mt-3 space-y-2 rounded-2xl bg-emerald-50/60 p-3 ring-1 ring-emerald-200/70">
            {part5Calcs.length > 0 && (
              <>
                <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-900"><Calculator className="size-3.5" aria-hidden="true" />Calculate it — enter the variables, get the worked steps</p>
                <div className="flex flex-wrap gap-2">
                  {part5Calcs.map((c) => (
                    <button key={c.id} type="button" onClick={() => onOpenCalculator?.(c.id)} className="rounded-full bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 active:scale-95">{c.title}</button>
                  ))}
                </div>
              </>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              <button type="button" onClick={() => onOpenExplorer?.(message.part5?.sections?.[0])} className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-stone-700 ring-1 ring-stone-300 hover:bg-stone-100"><BookMarked className="size-3.5" aria-hidden="true" />Division 2 Library &amp; full text</button>
              <button type="button" onClick={() => onElaborate?.(message)} className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-stone-700 ring-1 ring-stone-300 hover:bg-stone-100"><Sparkles className="size-3.5 text-emerald-600" aria-hidden="true" />Ask AI to elaborate</button>
            </div>
          </div>
        )}
        {sources.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5" aria-label="Sources cited in this answer">
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-stone-500">
              <BookMarked className="size-3" aria-hidden="true" />
              Sources
            </span>
            {sources.map((source) => (
              <span
                key={source}
                className="max-w-full truncate rounded-md border border-emerald-200/70 bg-emerald-50/60 px-2 py-0.5 text-[11px] text-emerald-900"
                title={source}
              >
                {source}
              </span>
            ))}
          </div>
        )}
        <div className="mt-1.5 flex items-center gap-3 text-[11px] text-stone-400">
          <span>{formatTime(message.createdAt)}</span>
          {!isStreaming && message.content.trim() && (
            <button
              type="button"
              onClick={copy}
              className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 transition hover:bg-stone-100 hover:text-stone-600", copied && "text-emerald-700")}
              aria-label="Copy answer"
            >
              {copied ? <Check className="size-3" aria-hidden="true" /> : <Copy className="size-3" aria-hidden="true" />}
              {copied ? "Copied" : "Copy"}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
