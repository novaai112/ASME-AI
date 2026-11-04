"use client"

import { isValidElement, type ReactNode } from "react"
import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeKatex from "rehype-katex"
import remarkMath from "remark-math"
import { normalizeMath } from "@/lib/markdown-math"
import { cn } from "@/lib/utils"

interface MarkdownRendererProps {
  content: string
  className?: string
  isStreaming?: boolean
}

const part5AssessmentAreas = [
  { title: "Plastic collapse", reference: "5.2" },
  { title: "Local failure", reference: "5.3" },
  { title: "Buckling collapse", reference: "5.4" },
  { title: "Cyclic loading", reference: "5.5" },
  { title: "Creep damage", reference: "5.6 (scope: 5.1.1.1(e))" },
]

function getTextContent(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(getTextContent).join("")
  if (isValidElement<{ children?: ReactNode }>(node)) return getTextContent(node.props.children)
  return ""
}

function isPart5AssessmentDiagram(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").toLowerCase()
  return (
    /plastic\s+collapse/.test(normalized) &&
    /local\s+failure/.test(normalized) &&
    /buckling/.test(normalized) &&
    /cyclic\s+loading/.test(normalized) &&
    /creep\s+damage/.test(normalized)
  )
}

const markdownComponents: Components = {
  h1: ({ children }) => (
    <h1 className="mb-4 mt-7 text-xl font-semibold tracking-tight text-stone-900 first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-3 mt-6 text-lg font-semibold tracking-tight text-stone-900 first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => <h3 className="mb-2 mt-5 text-base font-semibold text-stone-900">{children}</h3>,
  p: ({ children }) => <p className="my-3 leading-7 text-stone-700">{children}</p>,
  ul: ({ children }) => <ul className="my-3 list-disc space-y-1.5 pl-6 marker:text-emerald-700">{children}</ul>,
  ol: ({ children }) => <ol className="my-3 list-decimal space-y-1.5 pl-6 marker:font-medium marker:text-emerald-800">{children}</ol>,
  li: ({ children }) => <li className="ps-1 leading-7 text-stone-700">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="my-4 border-l-4 border-emerald-600 bg-emerald-50/70 py-1 pl-4 pr-3 text-stone-700 [&>p]:my-2">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="my-4 w-full overflow-x-auto rounded-lg border border-stone-200">
      <table className="w-full min-w-max border-collapse text-left text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-stone-100 text-stone-800">{children}</thead>,
  th: ({ children }) => <th className="border-b border-stone-200 px-3 py-2.5 font-semibold">{children}</th>,
  td: ({ children }) => <td className="border-t border-stone-100 px-3 py-2.5 align-top text-stone-700">{children}</td>,
  hr: () => <hr className="my-5 border-stone-200" />,
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="break-words text-emerald-700 underline decoration-emerald-300 underline-offset-2 transition-colors hover:text-emerald-900"
    >
      {children}
    </a>
  ),
  pre: ({ children }) => {
    if (isPart5AssessmentDiagram(getTextContent(children))) {
      return (
        <section
          aria-label="ASME Section VIII Division 2 Part 5 assessment areas"
          className="my-5 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 sm:p-5"
        >
          <h3 className="mb-4 text-sm font-semibold text-stone-900 sm:text-base">
            ASME Section VIII, Division 2 — Part 5 Assessment Areas
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {part5AssessmentAreas.map(({ title, reference }) => (
              <div key={reference} className="rounded-lg border border-stone-200 bg-white p-3 shadow-sm">
                <p className="font-semibold leading-5 text-stone-800">{title}</p>
                <p className="mt-1 text-xs font-medium text-emerald-800">Code reference: {reference}</p>
              </div>
            ))}
          </div>
        </section>
      )
    }

    return (
      <pre className="my-4 overflow-x-auto rounded-xl bg-stone-900 p-4 text-sm leading-6 text-stone-100 shadow-sm">
        {children}
      </pre>
    )
  },
  code: ({ children, className }) =>
    className?.startsWith("language-") ? (
      <code className="font-mono">{children}</code>
    ) : (
      <code className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[0.9em] text-stone-800">{children}</code>
    ),
  strong: ({ children }) => <strong className="font-semibold text-stone-900">{children}</strong>,
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    <div
      className={cn(
        "markdown-content min-w-0 max-w-none break-words text-sm leading-7 text-stone-700 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false }]]}
        components={markdownComponents}
      >
        {normalizeMath(content)}
      </ReactMarkdown>
    </div>
  )
}
