"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Activity, BookOpen, Calculator, MessageSquareDashed, PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { CalculatorDialog } from "@/components/part5/calculator-dialog"
import { Part5Explorer } from "@/components/part5/part5-explorer"
import { StatusPanel } from "./status-panel"
import { MessageList } from "./message-list"
import { AI_MODELS, Composer, type AIModel } from "./composer"
import { Button } from "@/components/ui/button"
import { ChatHistorySidebar, type ChatConversation } from "./chat-history-sidebar"
import type { PdfPageImage } from "@/lib/pdf-client-render"

// Data model for messages
export interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  createdAt: Date
  imageData?: string
  attachmentData?: string
  attachmentName?: string
  attachmentPageImages?: PdfPageImage[]
  /** Which AI wrote this answer (e.g. "Claude"); "switched" = failover happened mid-answer. */
  model?: string
  switched?: boolean
  /** Set when the Part 5 Brain answered: which paragraphs and calculators to offer. */
  part5?: { sections: string[]; calculators: string[] }
}

const LEGACY_STORAGE_KEY = "chat-messages"
const STORAGE_KEY_PREFIX = "asme-chat-history:"
const MODEL_STORAGE_KEY = "chat-selected-model"

// Generates a unique ID for messages
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

function getSavedModel(value: string | null): AIModel | undefined {
  const exact = AI_MODELS.find(({ id }) => id === value)
  if (exact) return exact.id
  if (value?.startsWith("google/")) return "google"
  if (value?.startsWith("anthropic/")) return "anthropic"
  if (value?.startsWith("openai/")) return "openai"
  if (value?.startsWith("groq/")) return "groq"
  if (value?.startsWith("nvidia/") || value?.startsWith("mistralai/")) return "nvidia"
}

const MAX_AUTO_RECOVERIES = 4

type StreamItem =
  | { type: "status"; status?: string }
  | { type: "text"; text?: string }
  | { type: "meta"; label?: string; switched?: boolean }
  | { type: "done"; complete?: boolean; degraded?: boolean }
  | { type: "part5"; sections?: string[]; calculators?: string[] }
  | { type: "error"; error?: string; retryable?: boolean }

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener("abort", () => { clearTimeout(timer); resolve() }, { once: true })
  })

function friendlyFailure(): string {
  return "I couldn’t reach the AI service after several automatic attempts. Your question is saved — tap Try again."
}

export function ChatShell() {
  const [messages, setMessages] = useState<Message[]>([])
  const [calculatorId, setCalculatorId] = useState<string | null>(null)
  const [explorerOpen, setExplorerOpen] = useState(false)
  const [explorerSection, setExplorerSection] = useState<string | null>(null)
  const [explorerTab, setExplorerTab] = useState<"guide" | "calculators">("guide")
  const [statusOpen, setStatusOpen] = useState(false)
  const nextModeRef = useRef<"ai" | undefined>(undefined)
  const [conversations, setConversations] = useState<ChatConversation[]>([])
  const [activeConversationId, setActiveConversationId] = useState("")
  const [storageKey, setStorageKey] = useState("")
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyNotice, setHistoryNotice] = useState<string | null>(null)
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | undefined>()
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activity, setActivity] = useState<string[]>([])
  const [recovering, setRecovering] = useState(false)
  const [abortController, setAbortController] = useState<AbortController | null>(null)
  const [assistantStatus, setAssistantStatus] = useState("Searching the ASME PDFs…")
  const [selectedModel, setSelectedModel] = useState<AIModel>("auto")
  const [isLoaded, setIsLoaded] = useState(false)
  const historyToggleRef = useRef<HTMLButtonElement>(null)

  const closeHistory = useCallback(() => {
    setHistoryOpen(false)
    window.requestAnimationFrame(() => historyToggleRef.current?.focus())
  }, [])

  // Load private conversation history after resolving the authenticated Nova user.
  useEffect(() => {
    let cancelled = false

    async function loadHistory() {
      try {
        const sessionResponse = await fetch("/api/auth/session", { cache: "no-store" })
        const session = (await sessionResponse.json()) as {
          user?: { id?: string; avatarUrl?: string } | null
        }
        if (!sessionResponse.ok || !session.user?.id) {
          throw new Error("Could not verify your account for private chat history.")
        }
        if (typeof session.user.avatarUrl === "string") setUserAvatarUrl(session.user.avatarUrl)

        const userStorageKey = `${STORAGE_KEY_PREFIX}${session.user.id}`
        const stored = localStorage.getItem(userStorageKey)
        const parsed = stored ? (JSON.parse(stored) as unknown) : null
        let loadedConversations = parseConversations(parsed)

        if (loadedConversations.length === 0) {
          const legacyValue = localStorage.getItem(LEGACY_STORAGE_KEY)
          const legacyMessages = legacyValue ? parseMessages(JSON.parse(legacyValue) as unknown) : []
          if (legacyMessages.length > 0) {
            loadedConversations = [{
              id: generateId(),
              title: getConversationTitle(legacyMessages),
              messages: legacyMessages,
              updatedAt: legacyMessages[legacyMessages.length - 1].createdAt.getTime(),
            }]
          }
        }

        if (cancelled) return
        const activeConversation = loadedConversations[0] ?? createEmptyConversation()
        setStorageKey(userStorageKey)
        setConversations(loadedConversations)
        setActiveConversationId(activeConversation.id)
        setMessages(activeConversation.messages)

        const savedModel = localStorage.getItem(MODEL_STORAGE_KEY)
        const savedModelId = getSavedModel(savedModel)
        if (savedModelId) {
          setSelectedModel(savedModelId)
          localStorage.setItem(MODEL_STORAGE_KEY, savedModelId)
        }
      } catch (e) {
        if (cancelled) return
        console.error("Failed to load private chat history:", e)
        setHistoryNotice(e instanceof Error ? e.message : "Chat history could not be loaded.")
      } finally {
        if (!cancelled) setIsLoaded(true)
      }
    }

    void loadHistory()
    return () => {
      cancelled = true
    }
  }, [])

  // Keep the active conversation synchronized with the rendered transcript.
  useEffect(() => {
    if (!isLoaded || !activeConversationId) return
    setConversations((current) => {
      const active = current.find((conversation) => conversation.id === activeConversationId)
      const savedMessages = messages.map((message) => ({
        ...message,
        attachmentData: undefined,
        imageData: undefined,
        attachmentPageImages: undefined,
      }))
      const updated: ChatConversation = {
        id: activeConversationId,
        title: getConversationTitle(savedMessages),
        messages: savedMessages,
        updatedAt: Date.now(),
      }
      return active
        ? current.map((conversation) => conversation.id === activeConversationId ? updated : conversation)
        : [updated, ...current]
    })
  }, [activeConversationId, isLoaded, messages])

  // Persist all conversations under the verified Nova user ID.
  useEffect(() => {
    // Skip while tokens are streaming in: serialising every conversation 25x/second janks long chats.
    if (!isLoaded || !storageKey || isStreaming) return
    try {
      localStorage.setItem(storageKey, JSON.stringify(conversations))
      setHistoryNotice(null)
    } catch (e) {
      console.error("Failed to save private chat history:", e)
      setHistoryNotice("History could not be saved in this browser.")
    }
  }, [conversations, isLoaded, storageKey, isStreaming])

  const handleModelChange = useCallback((model: AIModel) => {
    setSelectedModel(model)
    localStorage.setItem(MODEL_STORAGE_KEY, model)
  }, [])

  // Send a message to the AI
  const sendMessage = useCallback(
    async (content: string, attachmentData?: string, attachmentName?: string, pageImages?: PdfPageImage[]) => {
      if ((!content.trim() && !attachmentData) || isStreaming) return

      setError(null)

      const userMessage: Message = {
        id: generateId(),
        role: "user",
        content: content.trim() || "Describe this image",
        createdAt: new Date(),
        imageData: attachmentData?.startsWith("data:image/") ? attachmentData : undefined,
        attachmentData,
        attachmentName,
        attachmentPageImages: pageImages?.length ? pageImages : undefined,
      }

      const assistantMessage: Message = {
        id: generateId(),
        role: "assistant",
        content: "",
        createdAt: new Date(),
      }

      const newMessages = [...messages, userMessage, assistantMessage]
      setMessages(newMessages)
      setIsStreaming(true)
      setAssistantStatus("Searching the ASME PDFs…")

      const controller = new AbortController()
      setAbortController(controller)
      setActivity([])
      setRecovering(false)

      const history = [...messages, userMessage].map((m, index, list) => ({
        role: m.role,
        content: m.content,
        attachmentData: index === list.length - 1 ? m.attachmentData ?? m.imageData : undefined,
        attachmentName: index === list.length - 1 ? m.attachmentName : undefined,
        attachmentPageImages: index === list.length - 1 ? m.attachmentPageImages : undefined,
      }))

      let accumulated = ""
      let finished = false
      let degraded = false
      let recoveries = 0
      let modelLabel: string | undefined
      let switched = false
      let part5: { sections: string[]; calculators: string[] } | undefined
      const requestMode = nextModeRef.current
      nextModeRef.current = undefined

      const pushStatus = (status: string) => {
        setAssistantStatus(status)
        setActivity((current) => (current.at(-1) === status ? current : [...current, status].slice(-40)))
      }
      const flush = () =>
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessage.id ? { ...msg, content: accumulated, model: modelLabel, switched, part5 } : msg,
          ),
        )

      // One streaming pass. Returns normally when the server said "done"; throws on a hard failure.
      const runPass = async (resume: string): Promise<{ retryable: boolean; message?: string }> => {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: history, model: selectedModel, ...(resume ? { resume } : {}), ...(requestMode ? { mode: requestMode } : {}) }),
          signal: controller.signal,
        })
        if (!response.ok) {
          const errData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }))
          // 4xx (auth, validation, too large) will not fix itself; 5xx/429 are worth another go.
          return { retryable: response.status >= 500 || response.status === 429, message: errData.error || `HTTP ${response.status}` }
        }
        const reader = response.body?.getReader()
        if (!reader) return { retryable: true, message: "No response body" }

        let sawEvent = false
        let eventBuffer = ""
        let softError: { retryable: boolean; message?: string } | undefined
        const decoder = new TextDecoder()
        const consume = (raw: string) => {
          const data = raw.split(/\r?\n/).find((line) => line.startsWith("data:"))?.slice(5).trim()
          if (!data) return // heartbeat / comment frame
          let item: StreamItem
          try { item = JSON.parse(data) as StreamItem } catch { return }
          sawEvent = true
          if (item.type === "status" && item.status) pushStatus(item.status)
          else if (item.type === "text" && item.text) { accumulated += item.text; setRecovering(false) }
          else if (item.type === "meta") { modelLabel = item.label ?? modelLabel; switched = switched || Boolean(item.switched) }
          else if (item.type === "part5") { part5 = { sections: item.sections ?? [], calculators: item.calculators ?? [] } }
          else if (item.type === "done") { finished = Boolean(item.complete); degraded = Boolean(item.degraded) }
          else if (item.type === "error") softError = { retryable: item.retryable !== false, message: item.error }
        }

        let lastPaint = 0
        try {
          while (true) {
            const { done, value } = await reader.read()
            eventBuffer += decoder.decode(value, { stream: !done })
            const events = eventBuffer.split(/\r?\n\r?\n/)
            eventBuffer = events.pop() ?? ""
            for (const event of events) consume(event)
            if (done && eventBuffer.trim()) consume(eventBuffer)
            const now = performance.now()
            if (accumulated && (now - lastPaint > 40 || done)) { flush(); lastPaint = now }
            if (done) break
          }
        } catch (streamError) {
          if (controller.signal.aborted) throw streamError
          // Network blip / platform cut mid-stream: not an error to the user, just resume.
          flush()
          return { retryable: true, message: sawEvent ? "stream interrupted" : "no response" }
        }
        flush()
        if (softError) return softError
        // Stream closed without a "done" event = connection was cut. Resume.
        if (!finished && !sawEvent) return { retryable: true }
        return { retryable: !finished }
      }

      try {
        let lastFailure: string | undefined
        while (!finished) {
          const result = await runPass(accumulated)
          if (finished) break
          lastFailure = result.message
          if (!result.retryable) throw new Error(result.message || "The request was rejected.")
          if (recoveries >= MAX_AUTO_RECOVERIES) break
          recoveries += 1
          setRecovering(true)
          pushStatus(accumulated ? "Connection hiccup — resuming your answer automatically…" : "Reconnecting to the assistant…")
          await wait(Math.min(900 * 2 ** (recoveries - 1), 6_000), controller.signal)
          if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError")
        }

        if (!finished) {
          // Out of automatic attempts. Keep whatever we have and offer a calm retry (never delete the answer).
          console.warn("Chat did not finish after automatic recovery:", lastFailure)
          if (accumulated) {
            accumulated += "\n\n> *The answer paused before the end. Tap **Continue** to pick up where it stopped.*"
            flush()
            setError("paused")
          } else {
            setMessages((prev) => prev.filter((msg) => msg.id !== assistantMessage.id))
            setError(friendlyFailure())
          }
        } else if (degraded) {
          setRecovering(false)
        }
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessage.id ? { ...msg, content: msg.content || "*Stopped.*" } : msg,
            ),
          )
        } else {
          console.error("Error sending message:", e)
          if (accumulated) {
            flush()
            setError("paused")
          } else {
            setMessages((prev) => prev.filter((msg) => msg.id !== assistantMessage.id))
            setError(e instanceof Error && e.message ? e.message : friendlyFailure())
          }
        }
      } finally {
        setIsStreaming(false)
        setRecovering(false)
        setAbortController(null)
      }
    },
    [messages, isStreaming, selectedModel],
  )

  const retry = useCallback(() => {
    if (messages.length === 0) return
    if (error === "paused") {
      // Ask the assistant to carry on from the partial answer already on screen.
      setError(null)
      void sendMessage("Continue from exactly where you stopped.")
      return
    }
    const lastUserMessage = [...messages].reverse().find((m) => m.role === "user")
    if (lastUserMessage) {
      const index = messages.findIndex((m) => m.id === lastUserMessage.id)
      setMessages(messages.slice(0, index))
      setError(null)
      setTimeout(
        () =>
          sendMessage(
            lastUserMessage.content,
            lastUserMessage.attachmentData ?? lastUserMessage.imageData,
            lastUserMessage.attachmentName,
            lastUserMessage.attachmentPageImages,
          ),
        100,
      )
    }
  }, [messages, sendMessage, error])

  const stopStreaming = useCallback(() => {
    if (abortController) {
      abortController.abort()
    }
  }, [abortController])

  const createNewChat = useCallback(() => {
    const conversation = createEmptyConversation()
    setConversations((current) => [conversation, ...current])
    setActiveConversationId(conversation.id)
    setMessages([])
    setError(null)
    setHistoryOpen(false)
  }, [])

  const selectConversation = useCallback((id: string) => {
    const conversation = conversations.find((item) => item.id === id)
    if (!conversation) return
    setActiveConversationId(id)
    setMessages(conversation.messages)
    setError(null)
    setHistoryOpen(false)
  }, [conversations])

  const deleteConversation = useCallback((id: string) => {
    const remaining = conversations.filter((conversation) => conversation.id !== id)
    if (activeConversationId === id) {
      const next = remaining[0] ?? createEmptyConversation()
      setConversations(remaining.length > 0 ? remaining : [next])
      setActiveConversationId(next.id)
      setMessages(next.messages)
      setError(null)
    } else {
      setConversations(remaining)
    }
  }, [activeConversationId, conversations])

  // "Ask AI to elaborate": same question, but skip the Part 5 Brain and let an AI writer expand on it.
  const elaborateWithAi = useCallback(
    (text: string) => {
      nextModeRef.current = "ai"
      void sendMessage(text)
    },
    [sendMessage],
  )
  const elaborateMessage = useCallback(
    (message: Message) => {
      const index = messages.findIndex((m) => m.id === message.id)
      const question = [...messages.slice(0, index)].reverse().find((m) => m.role === "user")?.content ?? "Division 2 Part 5"
      elaborateWithAi(`${question}\n\nPlease explain this in more depth with a worked example, using the Division 2 Part 5 paragraphs.`)
    },
    [messages, elaborateWithAi],
  )
  const openExplorer = useCallback((sectionId?: string) => { setExplorerTab("guide"); setExplorerSection(sectionId ?? null); setExplorerOpen(true) }, [])

  return (
    <div className="relative min-h-dvh bg-stone-50">
      <ChatHistorySidebar
        conversations={conversations}
        activeConversationId={activeConversationId}
        isStreaming={isStreaming || !isLoaded}
        isOpen={historyOpen}
        onClose={closeHistory}
        onNewChat={() => {
          createNewChat()
          closeHistory()
        }}
        onSelect={(id) => {
          selectConversation(id)
          closeHistory()
        }}
        onDelete={deleteConversation}
        storageNotice={historyNotice}
      />
      <main className={`relative h-dvh min-h-[480px] transition-[margin] duration-300 ${historyOpen ? "md:ml-[288px]" : "md:ml-0"}`}>
        <header className="absolute inset-x-0 top-0 z-20 h-16 bg-gradient-to-b from-stone-50 via-stone-50/85 to-transparent">
          <div className="pointer-events-none absolute inset-x-0 top-0 flex h-16 items-center justify-center">
            <span className="flex items-center gap-2 text-sm font-semibold tracking-tight text-stone-700">
              <span className="size-2 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.18)]" aria-hidden="true" />
              ASME Interpreter
            </span>
          </div>
          <Button
            ref={historyToggleRef}
            onClick={() => historyOpen ? closeHistory() : setHistoryOpen(true)}
            variant="ghost"
            size="icon"
            className="absolute left-3 top-3 h-10 w-10 rounded-full bg-slate-100/65 text-slate-600 shadow-sm ring-1 ring-white/50 backdrop-blur-md hover:bg-slate-200/75"
            aria-label={historyOpen ? "Close chat history" : "Open chat history"}
            aria-expanded={historyOpen}
          >
            {historyOpen
              ? <PanelLeftClose className="size-5" aria-hidden="true" />
              : <PanelLeftOpen className="size-5" aria-hidden="true" />}
          </Button>
          {!historyOpen && (
            <Button
              onClick={createNewChat}
              variant="ghost"
              size="icon"
              className="absolute left-[3.5rem] top-3 h-10 w-10 rounded-full bg-slate-100/65 text-slate-600 shadow-sm ring-1 ring-white/50 backdrop-blur-md hover:bg-slate-200/75"
              aria-label="Start a new chat"
              disabled={!isLoaded || isStreaming}
            >
              <MessageSquareDashed className="size-5" aria-hidden="true" />
            </Button>
          )}
          <div className="absolute right-3 top-3 flex items-center gap-2">
            {([
              { label: "Part 5 Explorer", icon: BookOpen, onClick: () => { setExplorerTab("guide"); openExplorer() } },
              { label: "Calculators", icon: Calculator, onClick: () => { setExplorerTab("calculators"); setExplorerSection(null); setExplorerOpen(true) } },
              { label: "System status", icon: Activity, onClick: () => setStatusOpen(true) },
            ] as const).map(({ label, icon: Icon, onClick }) => (
              <Button key={label} onClick={onClick} variant="ghost" size="icon" aria-label={label} title={label}
                className="h-10 w-10 rounded-full bg-slate-100/65 text-slate-600 shadow-sm ring-1 ring-white/50 backdrop-blur-md hover:bg-slate-200/75">
                <Icon className="size-5" aria-hidden="true" />
              </Button>
            ))}
          </div>
        </header>
        <MessageList
          messages={messages}
          isStreaming={isStreaming}
          status={assistantStatus}
          activity={activity}
          recovering={recovering}
          error={error}
          onSuggest={(text) => void sendMessage(text)}
          onRetry={retry}
          isLoaded={isLoaded}
          userAvatarUrl={userAvatarUrl}
          onOpenCalculator={setCalculatorId}
          onOpenExplorer={openExplorer}
          onElaborate={elaborateMessage}
        />
        <Composer
          onSend={sendMessage}
          onStop={stopStreaming}
          isStreaming={isStreaming}
          selectedModel={selectedModel}
          onModelChange={handleModelChange}
          desktopSidebarOffset={historyOpen}
          disabled={!isLoaded}
          onTyping={() => setHistoryOpen(false)}
        />
      </main>
      <Part5Explorer open={explorerOpen} onClose={() => setExplorerOpen(false)} initialSectionId={explorerSection} initialTab={explorerTab} onOpenCalculator={setCalculatorId} onElaborate={elaborateWithAi} />
      <CalculatorDialog calculatorId={calculatorId} onClose={() => setCalculatorId(null)} />
      <StatusPanel open={statusOpen} onClose={() => setStatusOpen(false)} />
    </div>
  )
}

function createEmptyConversation(): ChatConversation {
  return { id: generateId(), title: "New chat", messages: [], updatedAt: Date.now() }
}

function getConversationTitle(messages: Message[]): string {
  const firstUserMessage = messages.find((message) => message.role === "user")
  if (!firstUserMessage) return "New chat"
  const title = firstUserMessage.content.replace(/\s+/g, " ").trim()
  return title.length > 52 ? `${title.slice(0, 52).trimEnd()}…` : title || "New chat"
}

function parseMessages(value: unknown): Message[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry): Message[] => {
    if (!entry || typeof entry !== "object") return []
    const message = entry as Partial<Message>
    if (
      typeof message.id !== "string" ||
      (message.role !== "user" && message.role !== "assistant") ||
      typeof message.content !== "string"
    ) return []
    const createdAt = new Date(message.createdAt ?? Date.now())
    return [{
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: Number.isNaN(createdAt.getTime()) ? new Date() : createdAt,
      attachmentName: typeof message.attachmentName === "string" ? message.attachmentName : undefined,
      model: typeof message.model === "string" ? message.model : undefined,
      switched: message.switched === true,
      part5: message.part5 && Array.isArray(message.part5.calculators) ? { sections: Array.isArray(message.part5.sections) ? message.part5.sections.filter((x): x is string => typeof x === "string") : [], calculators: message.part5.calculators.filter((x): x is string => typeof x === "string") } : undefined,
    }]
  })
}

function parseConversations(value: unknown): ChatConversation[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry): ChatConversation[] => {
    if (!entry || typeof entry !== "object") return []
    const conversation = entry as Partial<ChatConversation>
    if (typeof conversation.id !== "string") return []
    const messages = parseMessages(conversation.messages)
    return [{
      id: conversation.id,
      title: typeof conversation.title === "string" ? conversation.title : getConversationTitle(messages),
      messages,
      updatedAt: typeof conversation.updatedAt === "number" ? conversation.updatedAt : Date.now(),
    }]
  }).sort((a, b) => b.updatedAt - a.updatedAt)
}
