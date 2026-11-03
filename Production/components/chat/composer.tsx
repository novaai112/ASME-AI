"use client"

import type React from "react"

import { useState, useRef, useCallback, type KeyboardEvent, useEffect } from "react"
import { Square, Mic, MicOff, Brain, Paperclip, X, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuPortal,
} from "@/components/ui/dropdown-menu"
import Image from "next/image"
import { AnimatedOrb } from "./animated-orb"
import { AudioWaveform } from "./audio-waveform"
import { renderPdfPagesForParsing, type PdfPageImage } from "@/lib/pdf-client-render"

export type AIModel =
  | "auto"
  | "google"
  | "anthropic"
  | "openai"
  | "groq"
  | "nvidia"

export const AI_MODELS: { id: AIModel; name: string; icon?: string }[] = [
  { id: "auto", name: "Auto" },
  { id: "google", name: "Gemini", icon: "/images/google.webp" },
  { id: "anthropic", name: "Claude", icon: "/images/claude.svg" },
  { id: "openai", name: "GPT-4o", icon: "/images/gpt.png" },
  { id: "groq", name: "Groq" },
  { id: "nvidia", name: "NVIDIA" },
]

async function encodeAudioAsWav(recording: Blob): Promise<Blob> {
  const audioContext = new AudioContext()
  try {
    const decoded = await audioContext.decodeAudioData(await recording.arrayBuffer())
    const sampleRate = 16_000
    const sampleCount = Math.ceil((decoded.length * sampleRate) / decoded.sampleRate)
    const wav = new ArrayBuffer(44 + sampleCount * 2)
    const view = new DataView(wav)
    const writeString = (offset: number, value: string) => {
      for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index))
    }

    writeString(0, "RIFF")
    view.setUint32(4, 36 + sampleCount * 2, true)
    writeString(8, "WAVE")
    writeString(12, "fmt ")
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true)
    view.setUint16(22, 1, true)
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, sampleRate * 2, true)
    view.setUint16(32, 2, true)
    view.setUint16(34, 16, true)
    writeString(36, "data")
    view.setUint32(40, sampleCount * 2, true)

    const channels = Array.from({ length: decoded.numberOfChannels }, (_, index) => decoded.getChannelData(index))
    for (let outputIndex = 0; outputIndex < sampleCount; outputIndex += 1) {
      const sourceIndex = (outputIndex * decoded.sampleRate) / sampleRate
      const leftIndex = Math.floor(sourceIndex)
      const fraction = sourceIndex - leftIndex
      let sample = 0
      for (const channel of channels) {
        const left = channel[Math.min(leftIndex, channel.length - 1)] ?? 0
        const right = channel[Math.min(leftIndex + 1, channel.length - 1)] ?? left
        sample += left + (right - left) * fraction
      }
      sample = Math.max(-1, Math.min(1, sample / channels.length))
      view.setInt16(44 + outputIndex * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
    }
    return new Blob([wav], { type: "audio/wav" })
  } finally {
    await audioContext.close()
  }
}

interface ComposerProps {
  onSend: (content: string, attachmentData?: string, attachmentName?: string, pageImages?: PdfPageImage[]) => void
  onStop: () => void
  isStreaming: boolean
  disabled?: boolean
  selectedModel: AIModel
  onModelChange: (model: AIModel) => void
  desktopSidebarOffset?: boolean
  onTyping?: () => void
}

export function Composer({ onSend, onStop, isStreaming, disabled, selectedModel, onModelChange, desktopSidebarOffset = false, onTyping }: ComposerProps) {
  const [value, setValue] = useState("")
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [isPreparingPdf, setIsPreparingPdf] = useState(false)
  const [voiceError, setVoiceError] = useState("")
  const [uploadError, setUploadError] = useState("")
  const [uploadedFile, setUploadedFile] = useState<{ data: string; name: string; type: string; file: File } | null>(null)
  const [showImageBounce, setShowImageBounce] = useState(false)
  const [hasAnimated, setHasAnimated] = useState(false)
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const recordingChunksRef = useRef<Blob[]>([])
  const recordingFailedRef = useRef(false)

  useEffect(() => {
    return () => {
      recordingFailedRef.current = true
      if (recorderRef.current?.state === "recording") recorderRef.current.stop()
      recorderRef.current?.stream.getTracks().forEach((track) => track.stop())
    }
  }, [])

  useEffect(() => {
    // Trigger intro animation after mount
    setHasAnimated(true)
  }, [])

  const playClickSound = useCallback(() => {
    const audio = new Audio("https://hebbkx1anhila5yf.public.blob.vercel-storage.com/click-FM4Xaa1FJj237591TiZw4yL1fIxdOw.mp3")
    audio.volume = 0.5
    audio.play().catch(() => {})
  }, [])

  const playRecordSound = useCallback(() => {
    const audio = new Audio("https://hebbkx1anhila5yf.public.blob.vercel-storage.com/record-CNHOyjcpri6lx5C2sGXncDtFVDwspO.mp3")
    audio.volume = 0.5
    audio.play().catch(() => {})
  }, [])

  const transcribeRecording = useCallback(async (recording: Blob) => {
    if (recording.size === 0) {
      setVoiceError("No audio was recorded. Try again.")
      return
    }

    setIsTranscribing(true)
    setVoiceError("")
    try {
      const wav = await encodeAudioAsWav(recording)
      const formData = new FormData()
      formData.append("audio", wav, "voice-input.wav")
      const response = await fetch("/api/transcribe", { method: "POST", body: formData })
      const result = (await response.json()) as { text?: string; error?: string }
      if (!response.ok) throw new Error(result.error || "Voice transcription failed.")
      const transcript = result.text?.trim()
      if (!transcript) throw new Error("No speech was detected. Try again or type your message.")

      setValue((previous) => `${previous}${previous && !previous.endsWith(" ") ? " " : ""}${transcript}`)
      requestAnimationFrame(() => {
        const textarea = textareaRef.current
        if (textarea) textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
      })
    } catch (error) {
      setVoiceError(error instanceof Error ? error.message : "Voice transcription failed. Please try again.")
    } finally {
      setIsTranscribing(false)
    }
  }, [])

  const toggleRecording = useCallback(async () => {
    playClickSound()

    if (isTranscribing) return

    if (isRecording) {
      recorderRef.current?.stop()
      setIsRecording(false)
      return
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setVoiceError("Audio recording is not supported in this browser. Type your message instead.")
      return
    }

    playRecordSound()
    setVoiceError("")
    let stream: MediaStream | null = null
    try {
      const activeStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream = activeStream
      const recorder = new MediaRecorder(activeStream)
      recorderRef.current = recorder
      recordingChunksRef.current = []
      recordingFailedRef.current = false
      setMediaStream(activeStream)
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordingChunksRef.current.push(event.data)
      }
      recorder.onerror = () => {
        recordingFailedRef.current = true
        setVoiceError("Audio recording failed. Check your microphone and try again.")
        setIsRecording(false)
        activeStream.getTracks().forEach((track) => track.stop())
        setMediaStream(null)
      }
      recorder.onstop = () => {
        const recording = new Blob(recordingChunksRef.current, { type: recorder.mimeType })
        recordingChunksRef.current = []
        activeStream.getTracks().forEach((track) => track.stop())
        setMediaStream(null)
        if (recordingFailedRef.current) return
        void transcribeRecording(recording)
      }
      recorder.start()
      setIsRecording(true)
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop())
      const name = error instanceof Error ? error.name : ""
      setVoiceError(
        name === "NotAllowedError" || name === "SecurityError"
          ? "Microphone access was denied. Allow microphone access or type your message."
          : name === "NotFoundError"
            ? "No microphone is available. Connect a microphone or type your message."
            : "Could not start recording. Check microphone permissions and try again.",
      )
      setIsRecording(false)
    }
  }, [isRecording, isTranscribing, playClickSound, playRecordSound, transcribeRecording])

  const handleInput = useCallback(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = "auto"
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
    }
  }, [])

  const handleSend = useCallback(async () => {
    if ((!value.trim() && !uploadedFile) || isStreaming || isRecording || isTranscribing || isPreparingPdf || disabled) return
    playClickSound()

    let pageImages: PdfPageImage[] = []
    if (uploadedFile?.type === "application/pdf") {
      setIsPreparingPdf(true)
      setUploadError("")
      try {
        pageImages = await renderPdfPagesForParsing(uploadedFile.file, value)
      } catch (error) {
        setUploadError(error instanceof Error ? error.message : "The PDF pages could not be prepared for parsing.")
        return
      } finally {
        setIsPreparingPdf(false)
      }
    }

    onSend(
      value || (uploadedFile?.type === "application/pdf" ? "Analyze this ASME document" : "Describe this image"),
      uploadedFile?.data,
      uploadedFile?.name,
      pageImages,
    )
    setValue("")
    setUploadedFile(null)
    setUploadError("")
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
    }
  }, [value, uploadedFile, isStreaming, disabled, onSend, isRecording, isTranscribing, isPreparingPdf, playClickSound])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend],
  )

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      playClickSound()

      const file = e.target.files?.[0]
      if (file) {
        if (!(file.type.startsWith("image/") || file.type === "application/pdf")) {
          window.alert("Please upload an image or PDF file.")
          e.target.value = ""
          return
        }
        if (file.size > 5 * 1024 * 1024) {
          window.alert("Please choose a file smaller than 5 MB.")
          e.target.value = ""
          return
        }
        const reader = new FileReader()
        reader.onload = (event) => {
          const data = event.target?.result
          if (typeof data === "string") {
            setUploadedFile({ data, name: file.name, type: file.type, file })
            setUploadError("")
          }
          setShowImageBounce(true)
          setTimeout(() => setShowImageBounce(false), 400)
        }
        reader.onerror = () => window.alert(`Could not read "${file.name}". Please try another file.`)
        reader.readAsDataURL(file)
      }
      e.target.value = ""
    },
    [playClickSound],
  )

  const removeImage = useCallback(() => {
    setUploadedFile(null)
    setUploadError("")
  }, [])

  const currentModel = AI_MODELS.find((m) => m.id === selectedModel) || AI_MODELS[0]

  return (
    <div className={cn("fixed bottom-4 left-0 right-0 px-4 pointer-events-none z-10", desktopSidebarOffset && "md:left-[288px]", hasAnimated && "composer-intro")}>
      <div className="relative max-w-2xl mx-auto pointer-events-auto">
        <div
          className={cn(
            "flex flex-col gap-3 p-4 bg-white border-stone-200 transition-all duration-200 border-none border-0 overflow-hidden relative rounded-3xl",
            "focus-within:border-stone-300 focus-within:ring-2 focus-within:ring-stone-200",
          )}
          style={{
            boxShadow:
              "rgba(14, 63, 126, 0.06) 0px 0px 0px 1px, rgba(42, 51, 69, 0.06) 0px 1px 1px -0.5px, rgba(42, 51, 70, 0.06) 0px 3px 3px -1.5px, rgba(42, 51, 70, 0.06) 0px 6px 6px -3px, rgba(14, 63, 126, 0.06) 0px 12px 12px -6px, rgba(14, 63, 126, 0.06) 0px 24px 24px -12px",
          }}
        >
          <div className="flex gap-2 items-center">
            {uploadedFile && (
              <div className={cn("relative shrink-0", showImageBounce && "image-bounce")}>
                <div className="flex h-12 max-w-48 items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 px-2">
                  {uploadedFile.type.startsWith("image/") ? (
                    <Image
                      src={uploadedFile.data}
                      alt="Uploaded image"
                      width={36}
                      height={36}
                      className="h-9 w-9 rounded object-cover"
                    />
                  ) : (
                    <FileText className="h-5 w-5 shrink-0 text-emerald-700" aria-hidden="true" />
                  )}
                  <span className="max-w-28 truncate text-xs text-stone-600">{uploadedFile.name}</span>
                </div>
                <button
                  onClick={removeImage}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-stone-800 hover:bg-stone-900 text-white rounded-full flex items-center justify-center transition-colors"
                  aria-label="Remove image"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => {
                setValue(e.target.value)
                handleInput()
                if (e.target.value) onTyping?.()
              }}
              onKeyDown={handleKeyDown}
              placeholder={
                isRecording
                  ? "Listening…"
                  : isPreparingPdf
                    ? "Preparing PDF pages for analysis…"
                  : isTranscribing
                    ? "Transcribing audio…"
                    : "Ask about ASME Section VIII or upload a PDF/image…"
              }
              disabled={isStreaming || disabled || isPreparingPdf}
              rows={1}
              className={cn(
                "flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-stone-800 placeholder:text-stone-400",
                "focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed",
                "max-h-[56px] overflow-y-auto",
              )}
              aria-label="Message input"
              id="message-input"
            />

            {(voiceError || uploadError) && (
              <p className="basis-full px-2 text-xs leading-5 text-amber-800" role="status" aria-live="polite">
                {voiceError || uploadError}
              </p>
            )}

            {isRecording && (
              <div className="shrink-0 w-24">
                <AudioWaveform isRecording={isRecording} stream={mediaStream} />
              </div>
            )}

            {isStreaming ? (
              <button
                onClick={() => {
                  playClickSound()
                  onStop()
                }}
                className="relative h-9 w-9 shrink-0 transition-all rounded-full flex items-center justify-center cursor-pointer hover:scale-105"
                aria-label="Stop generating"
                id="stop-btn"
              >
                <AnimatedOrb size={36} variant="red" />
                <Square
                  className="w-4 h-4 absolute drop-shadow-md text-red-700"
                  fill="currentColor"
                  aria-hidden="true"
                />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={(!value.trim() && !uploadedFile) || isRecording || isTranscribing || disabled}
                className={cn(
                  "relative h-9 w-9 shrink-0 transition-all rounded-full flex items-center justify-center",
                  (!value.trim() && !uploadedFile) || isRecording || isTranscribing || disabled
                    ? "opacity-50 cursor-not-allowed"
                    : "cursor-pointer hover:scale-105",
                )}
                aria-label="Send message"
                id="send-btn"
              >
                <AnimatedOrb size={36} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf,.pdf"
              onChange={handleFileSelect}
              className="hidden"
              aria-label="Upload an image or PDF"
            />

            <div className="relative">
              <Button
                onClick={toggleRecording}
                disabled={isStreaming || disabled || isTranscribing || isPreparingPdf}
                size="icon"
                className={cn(
                  "h-9 w-9 shrink-0 transition-all rounded-full relative z-10",
                  isRecording
                    ? "bg-red-500 hover:bg-red-600 text-white animate-bounce-subtle"
                    : "bg-zinc-100 hover:bg-zinc-200 text-stone-700",
                )}
                aria-label={isRecording ? "Stop recording" : isTranscribing ? "Transcribing audio" : "Start voice input"}
              >
                {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </Button>
            </div>

            <Button
              onClick={() => {
                playClickSound()
                fileInputRef.current?.click()
              }}
              disabled={isStreaming || disabled || isPreparingPdf}
              size="icon"
              className="h-9 w-9 shrink-0 bg-zinc-100 hover:bg-zinc-200 text-stone-700 rounded-full"
              aria-label="Attach an image or PDF"
              id="attach-image-btn"
            >
              <Paperclip className="w-4 h-4" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger className="bg-zinc-100" asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={isStreaming || disabled || isPreparingPdf}
                  className="h-9 w-9 shrink-0 bg-zinc-100 hover:bg-zinc-200 text-stone-700 rounded-full"
                  aria-label="Select AI model"
                  onClick={playClickSound}
                  id="model-selector"
                >
                  <Brain className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuPortal>
                <DropdownMenuContent
                  align="start"
                  side="top"
                  sideOffset={8}
                  className="w-40 px-2 py-2 rounded-2xl z-[9999]"
                >
                  {AI_MODELS.map((model) => (
                    <DropdownMenuItem
                      key={model.id}
                      onClick={() => {
                        playClickSound()
                        onModelChange(model.id)
                      }}
                      className={cn(
                        "flex items-center cursor-pointer gap-3 rounded-lg",
                        selectedModel === model.id && "bg-stone-100",
                      )}
                      id={`model-${model.id.replace(/\//g, "-")}`}
                    >
                      {model.icon ? (
                        <Image
                          src={model.icon}
                          alt=""
                          width={20}
                          height={20}
                          className="rounded-sm object-contain w-4 h-4"
                        />
                      ) : (
                        <Brain aria-hidden="true" className="h-4 w-4" />
                      )}
                      <span className="text-sm">{model.name}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenuPortal>
            </DropdownMenu>

            <span className="text-xs text-stone-400">{currentModel.name}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
