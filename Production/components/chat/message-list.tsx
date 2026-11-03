"use client"

import { useEffect, useRef, useState } from "react"
import { MessageBubble } from "./message-bubble"
import type { Message } from "./chat-shell"
import { TypingIndicator } from "./typing-indicator"
import { BookOpen, Calculator, FileSearch, GitCompareArrows, RefreshCw, WifiOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AnimatedOrb } from "./animated-orb"

interface MessageListProps {
  messages: Message[]
  isStreaming: boolean
  status: string
  activity: string[]
  recovering: boolean
  error: string | null
  onSuggest: (text: string) => void
  onRetry: () => void
  isLoaded: boolean // Added isLoaded prop to know when localStorage is loaded
  userAvatarUrl?: string
}

const SUGGESTIONS = [
  { icon: BookOpen, title: "Part 5 overview", text: "Explain ASME Section VIII Division 2 Part 5 design-by-analysis, section by section" },
  { icon: Calculator, title: "Shell thickness", text: "How is minimum required thickness of a cylindrical shell under internal pressure determined in Division 1 (UG-27)?" },
  { icon: GitCompareArrows, title: "Compare editions", text: "Compare Division 2 ratcheting assessment between the 2017 and 2025 editions" },
  { icon: FileSearch, title: "Analyse a file", text: "I’ll attach a drawing or PDF — check it against the applicable Code requirements" },
]

export function MessageList({ messages, isStreaming, status, activity, recovering, error, onRetry, onSuggest, isLoaded, userAvatarUrl }: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const rafRef = useRef<number | null>(null)
  const [hasAnimated, setHasAnimated] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const lastScrollRef = useRef<number>(0)
  const hasPlayedIntroRef = useRef(false) // Track if intro has played

  useEffect(() => {
    if (!isLoaded) return // Wait for localStorage to load

    // Only animate if no messages were loaded (fresh start)
    if (messages.length === 0 && !hasPlayedIntroRef.current) {
      setHasAnimated(true)
      hasPlayedIntroRef.current = true

    } else if (messages.length > 0) {
      // Skip animation if messages exist
      setHasAnimated(false)
      hasPlayedIntroRef.current = true
    }

    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [isLoaded, messages.length])

  useEffect(() => {
    if (!containerRef.current) return
    // Immediate scroll to bottom when messages change
    const container = containerRef.current
    container.scrollTop = container.scrollHeight
    setAutoScroll(true)
  }, [messages.length])

  useEffect(() => {
    if (!isStreaming || !autoScroll || !containerRef.current) {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      return
    }

    const container = containerRef.current
    lastScrollRef.current = container.scrollTop

    const smoothScroll = () => {
      if (!container) return

      const { scrollHeight, clientHeight } = container
      const targetScroll = scrollHeight - clientHeight
      const currentScroll = lastScrollRef.current
      const diff = targetScroll - currentScroll

      if (diff > 0.5) {
        const newScroll = currentScroll + diff * 0.2
        lastScrollRef.current = newScroll
        container.scrollTop = newScroll
      }

      rafRef.current = requestAnimationFrame(smoothScroll)
    }

    // Start immediately
    rafRef.current = requestAnimationFrame(smoothScroll)

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [isStreaming, autoScroll])

  // Detect if user scrolls up to disable auto-scroll
  const handleScroll = () => {
    if (!containerRef.current) return

    const { scrollTop, scrollHeight, clientHeight } = containerRef.current
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 150
    setAutoScroll(isAtBottom)
  }

  const lastMessage = messages[messages.length - 1]
  const showTypingIndicator =
    isStreaming &&
    (messages.length === 0 ||
      lastMessage?.role === "user" ||
      (lastMessage?.role === "assistant" && lastMessage?.content === ""))

  if (!isLoaded) {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <AnimatedOrb size={64} />
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="asme-scroll absolute inset-0 overflow-y-auto px-4 pb-40 pt-20 sm:px-6"
      role="log"
      aria-label="Chat messages"
      aria-live="polite"
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      {/* Empty state */}
      {messages.length === 0 && !error && !isStreaming && (
        <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
          <div className={`mb-5 ${hasAnimated ? "orb-intro" : ""}`}>
            <AnimatedOrb size={104} />
          </div>
          <h1 className={`text-2xl font-semibold tracking-tight text-stone-800 ${hasAnimated ? "text-blur-intro" : ""}`}>
            ASME Interpreter
          </h1>
          <p className={`mt-2 max-w-md text-sm leading-6 text-stone-500 ${hasAnimated ? "text-blur-intro-delay" : ""}`}>
            Section VIII Divisions 1, 2 &amp; 3 answered from your Code PDFs — with edition and page citations.
          </p>
          <div className="mt-8 grid w-full max-w-xl grid-cols-1 gap-2.5 sm:grid-cols-2">
            {SUGGESTIONS.map(({ icon: Icon, title, text }) => (
              <button
                key={title}
                type="button"
                onClick={() => onSuggest(text)}
                className="group flex items-start gap-3 rounded-2xl border border-stone-200 bg-white/80 p-3.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md"
              >
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 transition group-hover:bg-emerald-100">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-stone-800">{title}</span>
                  <span className="mt-0.5 line-clamp-2 block text-xs leading-5 text-stone-500">{text}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      {messages
        .filter((message) => {
          // Hide empty assistant messages during streaming - they'll be shown as the activity panel instead
          if (isStreaming && message.role === "assistant" && message === lastMessage && message.content === "") {
            return false
          }
          return true
        })
        .map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            isStreaming={isStreaming && message.role === "assistant" && message === lastMessage}
            userAvatarUrl={userAvatarUrl}
          />
        ))}

      {/* Live activity: also shown while resuming so the user never sees a dead screen */}
      {(showTypingIndicator || (isStreaming && recovering)) && (
        <TypingIndicator status={status} steps={activity} recovering={recovering} />
      )}

      {/* Soft notice (never a red error wall) */}
      {error && !isStreaming && (
        <div
          className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 p-4 animate-in fade-in duration-300"
          role="status"
        >
          <WifiOff className="size-5 shrink-0 text-amber-600" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-amber-900">
              {error === "paused" ? "The answer paused before the end" : "Couldn’t finish that just now"}
            </p>
            <p className="mt-0.5 text-xs text-amber-800/80">
              {error === "paused"
                ? "Your answer so far is saved above. Continue to pick up exactly where it stopped."
                : error}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            className="shrink-0 border-amber-300 bg-white text-amber-900 hover:bg-amber-100"
            aria-label={error === "paused" ? "Continue the answer" : "Try again"}
          >
            <RefreshCw className="mr-1.5 size-3.5" aria-hidden="true" />
            {error === "paused" ? "Continue" : "Try again"}
          </Button>
        </div>
      )}
      </div>

      {/* Scroll anchor */}
      <div ref={bottomRef} aria-hidden="true" className="h-20" />
    </div>
  )
}
