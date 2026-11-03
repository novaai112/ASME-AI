"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { MessageSquareDashed, PanelLeftClose, PanelLeftOpen } from "lucide-react"
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

function getChatErrorMessage(error: unknown, responseReceived: boolean): string {
  if (error instanceof TypeError) {
    const detail = error.message ? ` (${error.message})` : ""
    return responseReceived
      ? `The chat response stream was interrupted${detail}. Check the Vercel Function logs and retry.`
      : `The browser did not receive a response from the chat API${detail}. Check the browser Network panel and Vercel Function logs; PDF and web fallbacks only run after Vercel receives the request.`
  }
  return error instanceof Error ? error.message : "An error occurred."
}

export function ChatShell() {
  const [messages, setMessages] = useState<Message[]>([])
  const [conversations, setConversations] = useState<ChatConversation[]>([])
  const [activeConversationId, setActiveConversationId] = useState("")
  const [storageKey, setStorageKey] = useState("")
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyNotice, setHistoryNotice] = useState<string | null>(null)
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | undefined>()
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
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
    if (!isLoaded || !storageKey) return
    try {
      localStorage.setItem(storageKey, JSON.stringify(conversations))
      setHistoryNotice(null)
    } catch (e) {
      console.error("Failed to save private chat history:", e)
      setHistoryNotice("History could not be saved in this browser.")
    }
  }, [conversations, isLoaded, storageKey])

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
      let responseReceived = false

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messages: [...messages, userMessage].map((m, index, history) => ({
              role: m.role,
              content: m.content,
              attachmentData: index === history.length - 1 ? m.attachmentData ?? m.imageData : undefined,
              attachmentName: index === history.length - 1 ? m.attachmentName : undefined,
              attachmentPageImages: index === history.length - 1 ? m.attachmentPageImages : undefined,
            })),
            model: selectedModel,
          }),
          signal: controller.signal,
        })
        responseReceived = true

        if (!response.ok) {
          const errData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }))
          throw new Error(errData.error || `HTTP error! status: ${response.status}`)
        }

        const reader = response.body?.getReader()
        if (!reader) {
          throw new Error("No response body")
        }

        let accumulatedContent = ""
        let eventBuffer = ""
        const decoder = new TextDecoder()
        const consumeEvent = (event: string) => {
          const data = event
            .split(/\r?\n/)
            .find((line) => line.startsWith("data:"))
            ?.slice(5)
            .trim()
          if (!data) return

          const item = JSON.parse(data) as { type: "status" | "text" | "error"; status?: string; text?: string; error?: string }
          if (item.type === "status" && item.status) setAssistantStatus(item.status)
          if (item.type === "text" && item.text) accumulatedContent += item.text
          if (item.type === "error") throw new Error(item.error || "The assistant could not complete this request.")
        }

        while (true) {
          const { done, value } = await reader.read()
          eventBuffer += decoder.decode(value, { stream: !done })
          const events = eventBuffer.split(/\r?\n\r?\n/)
          eventBuffer = events.pop() ?? ""

          for (const event of events) consumeEvent(event)
          if (done && eventBuffer.trim()) consumeEvent(eventBuffer)

          if (accumulatedContent) {
            setMessages((prev) =>
              prev.map((msg) => (msg.id === assistantMessage.id ? { ...msg, content: accumulatedContent } : msg)),
            )
          }

          if (done) break
        }
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessage.id ? { ...msg, content: msg.content || "[Cancelled]" } : msg,
            ),
          )
        } else {
          console.error("Error sending message:", e)
          setError(getChatErrorMessage(e, responseReceived))
          setMessages((prev) => prev.filter((msg) => msg.id !== assistantMessage.id))
        }
      } finally {
        setIsStreaming(false)
        setAbortController(null)
      }
    },
    [messages, isStreaming, selectedModel],
  )

  const retry = useCallback(() => {
    if (messages.length === 0) return
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
  }, [messages, sendMessage])

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
        <header className="absolute inset-x-0 top-0 z-20 h-16">
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
        </header>
        <MessageList
          messages={messages}
          isStreaming={isStreaming}
          status={assistantStatus}
          error={error}
          onRetry={retry}
          isLoaded={isLoaded}
          userAvatarUrl={userAvatarUrl}
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
