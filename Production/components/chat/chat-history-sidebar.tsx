"use client"

import { useMemo, useState } from "react"
import { Clock3, MessageSquarePlus, Search, ShieldCheck, Trash2, X } from "lucide-react"
import Image from "next/image"
import { cn } from "@/lib/utils"
import type { Message } from "./chat-shell"
import { useNovaProfileControl } from "@/components/auth/nova-profile-context"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

export interface ChatConversation {
  id: string
  title: string
  messages: Message[]
  updatedAt: number
}

interface ChatHistorySidebarProps {
  conversations: ChatConversation[]
  activeConversationId: string
  isStreaming: boolean
  isOpen: boolean
  onClose: () => void
  onNewChat: () => void
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  storageNotice: string | null
}

function getGroup(timestamp: number, todayStart: number, weekStart: number) {
  if (timestamp >= todayStart) return "Today"
  if (timestamp >= weekStart) return "Previous 7 days"
  return "Older"
}

export function ChatHistorySidebar({
  conversations,
  activeConversationId,
  isStreaming,
  isOpen,
  onClose,
  onNewChat,
  onSelect,
  onDelete,
  storageNotice,
}: ChatHistorySidebarProps) {
  const [query, setQuery] = useState("")
  const profile = useNovaProfileControl()
  const groups = useMemo(() => {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const weekStart = todayStart - 7 * 24 * 60 * 60 * 1000
    const filtered = conversations
      .filter((conversation) => conversation.messages.length > 0)
      .filter((conversation) => conversation.title.toLowerCase().includes(query.trim().toLowerCase()))
      .sort((a, b) => b.updatedAt - a.updatedAt)
    return ["Today", "Previous 7 days", "Older"].map((label) => ({
      label,
      conversations: filtered.filter(
        (conversation) => getGroup(conversation.updatedAt, todayStart, weekStart) === label,
      ),
    }))
  }, [conversations, query])

  return (
    <>
      {isOpen && (
        <button
          type="button"
          aria-label="Close chat history"
          onClick={onClose}
          className="fixed inset-0 z-30 bg-slate-950/35 backdrop-blur-sm md:hidden"
        />
      )}
      <aside
        aria-label="Chat history"
        className={cn(
          "nova-chat-sidebar fixed inset-y-0 left-0 z-40 flex w-[min(86vw,304px)] flex-col border-r border-white/60 shadow-2xl transition-transform duration-300 md:w-[288px] md:shadow-xl",
          isOpen ? "translate-x-0 md:pointer-events-auto" : "-translate-x-full md:pointer-events-none",
        )}
        aria-hidden={!isOpen}
        inert={!isOpen}
      >
        <div className="absolute inset-0 bg-[url('/bg.jpg')] bg-cover bg-center" aria-hidden="true" />
        <div className="absolute inset-0 bg-white/80 backdrop-blur-2xl" aria-hidden="true" />
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between px-5 pb-4 pt-5">
            <a href="/chat" className="group flex min-w-0 items-center gap-3" aria-label="ASME Interpreter home">
              <Image
                src="/asme-interpreter-orb.png"
                alt=""
                width={40}
                height={40}
                priority
                className="size-10 shrink-0 rounded-full object-cover shadow-lg shadow-fuchsia-900/20"
              />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold tracking-tight text-slate-900">ASME Interpreter</span>
                <span className="mt-0.5 block text-[11px] font-medium text-slate-500">Engineering workspace</span>
              </span>
            </a>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close chat history"
              className="rounded-lg p-2 text-slate-500 transition hover:bg-white/70 hover:text-slate-900 md:hidden"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>

          <div className="px-4">
            <button
              type="button"
              onClick={onNewChat}
              disabled={isStreaming}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <MessageSquarePlus className="size-4" aria-hidden="true" />
              New chat
            </button>
          </div>

          <div className="px-4 pb-4 pt-4">
            <label className="flex h-10 items-center gap-2.5 rounded-xl border border-white/80 bg-white/65 px-3 shadow-sm transition focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-500/15">
              <Search className="size-4 shrink-0 text-slate-400" aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search conversations"
                aria-label="Search conversations"
                className="min-w-0 flex-1 bg-transparent text-xs text-slate-700 outline-none placeholder:text-slate-400"
              />
            </label>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
            <div className="mb-3 flex items-center justify-between px-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Your conversations</p>
              <span className="text-[10px] font-medium text-slate-400">
                {conversations.filter((conversation) => conversation.messages.length > 0).length}
              </span>
            </div>
            {groups.map(({ label, conversations: group }) =>
              group.length > 0 ? (
                <section key={label} className="mb-5">
                  <h2 className="mb-1.5 px-2 text-[11px] font-semibold text-slate-500">{label}</h2>
                  <ul className="space-y-1">
                    {group.map((conversation) => (
                      <li key={conversation.id} className="group relative">
                        <button
                          type="button"
                          onClick={() => onSelect(conversation.id)}
                          disabled={isStreaming}
                          aria-current={conversation.id === activeConversationId ? "page" : undefined}
                          className={cn(
                            "flex min-h-10 w-full items-center gap-2.5 rounded-xl px-3 py-2.5 pr-10 text-left text-xs transition disabled:cursor-not-allowed disabled:opacity-60",
                            conversation.id === activeConversationId
                              ? "bg-white/90 font-semibold text-slate-900 shadow-sm ring-1 ring-blue-100"
                              : "text-slate-600 hover:bg-white/65 hover:text-slate-900",
                          )}
                        >
                          <Clock3 className="size-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                          <span className="min-w-0 flex-1 truncate">{conversation.title}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(conversation.id)}
                          disabled={isStreaming}
                          aria-label={`Delete ${conversation.title}`}
                          title="Delete conversation"
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 opacity-100 transition hover:bg-rose-50 hover:text-rose-600 focus:opacity-100 focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100 disabled:cursor-not-allowed"
                        >
                          <Trash2 className="size-3.5" aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null,
            )}
            {groups.every(({ conversations: group }) => group.length === 0) && (
              <div className="mx-1 rounded-xl border border-dashed border-slate-300/70 bg-white/35 px-3 py-5 text-center">
                <p className="text-xs font-medium text-slate-600">
                  {query.trim() ? "No matching conversations" : "Your conversations will appear here"}
                </p>
                <p className="mt-1 text-[11px] leading-4 text-slate-400">
                  Start a new chat to ask an ASME question.
                </p>
              </div>
            )}
          </div>

          <div className="border-t border-white/70 px-4 py-3">
            <div className="flex items-center gap-2 rounded-xl bg-white/50 px-3 py-2">
              <ShieldCheck className={cn("size-4 shrink-0", storageNotice ? "text-amber-600" : "text-blue-600")} aria-hidden="true" />
              <p className="text-[10px] leading-4 text-slate-500">
                {storageNotice || "Chat history is saved privately in this browser."}
              </p>
            </div>
            {profile && (
              <button
                type="button"
                onClick={profile.openProfile}
                aria-label="Open your NOVA AI profile"
                className="mt-2 flex w-full items-center gap-3 rounded-xl border border-white/70 bg-white/55 px-3 py-2.5 text-left transition hover:bg-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <Avatar className="size-9 shrink-0 border border-white shadow-sm">
                  {profile.avatarUrl && <AvatarImage src={profile.avatarUrl} alt="" referrerPolicy="no-referrer" />}
                  <AvatarFallback className="bg-gradient-to-br from-blue-600 to-indigo-700 text-xs font-semibold text-white">
                    {profile.initials}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-slate-800">{profile.displayName}</span>
                  <span className="mt-0.5 block truncate text-[10px] text-slate-500">{profile.email || "NOVA AI Member"}</span>
                </span>
                <span className="text-[10px] font-medium text-slate-400">Profile</span>
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  )
}
