import { ChatShell } from "@/components/chat/chat-shell"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "ASME Interpreter",
  description: "Ask ASME BPVC Section VIII questions with source citations and document analysis.",
}

export default function ChatPage() {
  return <ChatShell />
}
