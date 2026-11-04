"use client"

import katex from "katex"
import { useMemo } from "react"

/** Renders LaTeX with KaTeX (never throws — falls back to the raw text). */
export function Math({ tex, display = false, className }: { tex: string; display?: boolean; className?: string }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(tex, { displayMode: display, throwOnError: false, strict: "ignore", output: "html" })
    } catch {
      return null
    }
  }, [tex, display])
  if (html === null) return <code className={className}>{tex}</code>
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />
}
