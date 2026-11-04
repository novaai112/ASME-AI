/**
 * Models often write LaTeX as \[ ... \], \( ... \) or "[ \sigma = ... ]". Markdown treats "\[" as an escaped
 * bracket, so the formula shows up as raw text (the "[ \sigma_{\theta}= \frac{...} ]" lines users saw).
 * This rewrites those forms into $...$ / $$...$$ before rendering. Fenced and inline code are left alone.
 */
export function normalizeMath(markdown: string): string {
  return markdown
    .split(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/g)
    .map((part, index) => (index % 2 === 1 ? part : normalizeOutsideCode(part)))
    .join("")
}

function normalizeOutsideCode(text: string): string {
  return text
    .split(/(`[^`\n]+`)/g)
    .map((piece, index) => (index % 2 === 1 ? piece : convert(piece)))
    .join("")
}

function convert(text: string): string {
  let out = text
  // \[ ... \]  (possibly multi-line)  ->  $$ ... $$
  out = out.replace(/\\\[([\s\S]+?)\\\]/g, (_m, body: string) => `\n\n$$\n${body.trim()}\n$$\n\n`)
  // \( ... \)  ->  $ ... $
  out = out.replace(/\\\((.+?)\\\)/g, (_m, body: string) => `$${body.trim()}$`)
  // Bare "[ \cmd ... ]" on its own line(s): the backslash before "[" was lost.
  out = out.replace(/^[ \t]*\[[ \t]+((?:[^\]\n]*\\[a-zA-Z]+[^\]\n]*))[ \t]+\][ \t]*$/gm, (_m, body: string) => `\n$$\n${body.trim()}\n$$\n`)
  // Same, but spread over several lines: "[" alone ... "]" alone, containing a LaTeX command.
  out = out.replace(/^[ \t]*\[[ \t]*\n([\s\S]*?\\[a-zA-Z]+[\s\S]*?)\n[ \t]*\][ \t]*$/gm, (_m, body: string) => `\n$$\n${body.trim()}\n$$\n`)
  return out
}
