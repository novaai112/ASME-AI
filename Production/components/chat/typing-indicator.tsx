"use client"

export function TypingIndicator({ status }: { status?: string }) {
  return (
    <div className="mr-auto flex items-center gap-3 px-4 py-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-center gap-1" aria-hidden="true">
        <div className="h-2 w-2 animate-bounce rounded-full bg-stone-300" style={{ animationDelay: "0ms" }} />
        <div className="h-2 w-2 animate-bounce rounded-full bg-stone-300" style={{ animationDelay: "150ms" }} />
        <div className="h-2 w-2 animate-bounce rounded-full bg-stone-300" style={{ animationDelay: "300ms" }} />
      </div>
      {status && <span className="text-xs text-stone-500">{status}</span>}
    </div>
  )
}
