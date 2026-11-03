export type ProviderId = "google" | "anthropic" | "openai" | "groq" | "nvidia"

export function getProviderKeys(provider: ProviderId): string[] {
  const config: Record<ProviderId, { list: string; prefix: string; single: string[] }> = {
    google: {
      list: "GOOGLE_API_KEYS",
      prefix: "GOOGLE_API_KEY",
      single: ["GOOGLE_API_KEY", "GEMINI_API_KEY", "Gemini_API_KEY"],
    },
    anthropic: { list: "ANTHROPIC_API_KEYS", prefix: "ANTHROPIC_API_KEY", single: ["ANTHROPIC_API_KEY"] },
    openai: { list: "OPENAI_API_KEYS", prefix: "OPENAI_API_KEY", single: ["OPENAI_API_KEY"] },
    groq: { list: "GROQ_API_KEYS", prefix: "GROQ_API_KEY", single: ["GROQ_API_KEY"] },
    nvidia: { list: "NVIDIA_API_KEYS", prefix: "NVIDIA_API_KEY", single: ["NVIDIA_API_KEY"] },
  }
  const { list, prefix, single } = config[provider]
  const numberedKeys = Object.entries(process.env)
    .filter(([name, value]) => name.startsWith(`${prefix}_`) && /^\d+$/.test(name.slice(prefix.length + 1)) && Boolean(value?.trim()))
    .sort(([left], [right]) => Number(left.slice(prefix.length + 1)) - Number(right.slice(prefix.length + 1)))
    .map(([, value]) => value ?? "")
  const keys = [
    ...(process.env[list]?.split(/[,\r\n]/) ?? []),
    ...numberedKeys,
    ...single.map((name) => process.env[name] ?? ""),
  ]
  return [...new Set(keys.flatMap((key) => key.split(/[,\r\n]/)).map((key) => key.trim()).filter(Boolean))]
}
