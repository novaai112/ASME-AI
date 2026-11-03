import { getProviderKeys } from "@/lib/provider-keys"
import { appendNovaSessionCookies, getNovaSession } from "@/lib/nova-auth"
import { NextRequest } from "next/server"

export const runtime = "nodejs"
export const maxDuration = 60

const MAX_AUDIO_BYTES = 10 * 1024 * 1024
const SUPPORTED_AUDIO_TYPES = new Set(["audio/wav", "audio/mp3", "audio/mpeg", "audio/aac", "audio/ogg", "audio/flac"])

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get("content-length") ?? 0)
  if (contentLength > MAX_AUDIO_BYTES + 1024 * 1024) {
    return Response.json({ error: "Audio is too large. Keep recordings under 10 MB." }, { status: 413 })
  }

  let audio: FormDataEntryValue | null
  try {
    audio = (await request.formData()).get("audio")
  } catch {
    return Response.json({ error: "Could not read the audio recording." }, { status: 400 })
  }
  if (!(audio instanceof File)) {
    return Response.json({ error: "An audio recording is required." }, { status: 400 })
  }
  if (audio.size === 0 || audio.size > MAX_AUDIO_BYTES) {
    return Response.json({ error: "Audio must be between 1 byte and 10 MB." }, { status: 413 })
  }

  const mimeType = audio.type.split(";")[0].toLowerCase()
  if (!SUPPORTED_AUDIO_TYPES.has(mimeType)) {
    return Response.json({ error: "The browser produced an unsupported audio format. Please try another browser." }, { status: 415 })
  }

  let novaSession
  try {
    novaSession = await getNovaSession(request)
  } catch {
    return Response.json({ error: "Could not verify your Nova AI session. Please try again." }, { status: 503 })
  }
  if (!novaSession) return Response.json({ error: "Sign in with your Nova AI account to use voice transcription." }, { status: 401 })

  const respond = (body: { text?: string; error?: string }, status = 200) => {
    const response = Response.json(body, { status })
    return novaSession.refreshed ? appendNovaSessionCookies(response, novaSession) : response
  }

  const apiKeys = getProviderKeys("google")
  if (apiKeys.length === 0) {
    return respond({ error: "Voice transcription is not configured. Add a Gemini API key on the server." }, 503)
  }

  const audioData = Buffer.from(await audio.arrayBuffer()).toString("base64")
  const model = "gemini-3.6-flash"
  const failures: string[] = []

  for (const [index, apiKey] of apiKeys.entries()) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: "Transcribe the spoken words in this audio accurately. Return only the transcription, with no introduction, explanation, or quotation marks. Preserve the speaker's language." },
                { inlineData: { mimeType, data: audioData } },
              ],
            }],
            generationConfig: { temperature: 0, maxOutputTokens: 4096 },
          }),
          signal: request.signal,
        },
      )

      if (!response.ok) {
        await response.body?.cancel()
        failures.push(`Gemini key ${index + 1} returned HTTP ${response.status}`)
        if (response.status === 401 || response.status === 403 || response.status === 408 || response.status === 429 || response.status >= 500) {
          continue
        }
        return respond({ error: "Gemini could not transcribe this audio. Try a shorter recording or another audio format." }, 502)
      }

      const payload = (await response.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
      }
      const transcript = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim()
      if (!transcript) {
        failures.push(`Gemini key ${index + 1} returned no transcription`)
        continue
      }
      return respond({ text: transcript })
    } catch (error) {
      if (request.signal.aborted) return respond({ error: "Transcription was cancelled." }, 499)
      failures.push(`Gemini key ${index + 1} could not reach the transcription service`)
      console.error("Voice transcription request failed.", error)
    }
  }

  console.error("Voice transcription failed for all configured Gemini keys.", failures)
  return respond({ error: "Voice transcription is temporarily unavailable. Please try again or type your message." }, 502)
}
