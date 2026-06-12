// Pipeline orchestration hook: video → script extraction → LLM rewrite → TTS
// Chains existing capabilities (useVideoScript, agent session, MiMo TTS) into
// a single automated flow with a state machine.

'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { extractAudioFromVideo, isVideoFile } from '@/lib/video-audio-extractor'
import { buildRewriteMessage } from '@/lib/pipeline-gem'
import { saveCachedAudio } from './useTts'

// ============================================================================
// Types
// ============================================================================

export type PipelineStep =
  | 'idle'
  | 'extracting'
  | 'awaitingInput'   // extraction done, waiting for user to provide rewrite requirements
  | 'rewriting'
  | 'synthesizing'
  | 'done'
  | 'error'

export interface PipelineConfig {
  autoTts: boolean
  voiceCloneAudio: string | null
  voiceCloneName: string
  /** TTS model to use for voice clone: 'mimo-v2.5-tts-voiceclone' or 'mimo-v2.5-tts' */
  ttsModelId: string
}

export interface PipelineState {
  step: PipelineStep
  progress: number
  statusText: string
  extractedText: string
  rewrittenText: string
  audioUrl: string
  error: string | null
}

interface UsePipelineDeps {
  agentHandleSend: (message: string) => void
  agentRunning: boolean
  getLastAssistantText: () => string
  onAgentEvent?: (event: { type: string; [key: string]: unknown }) => void
  sessionId?: string
  cwd?: string | null
  onTtsComplete?: () => void
}

// ============================================================================
// Default config
// ============================================================================

const DEFAULT_CONFIG: PipelineConfig = {
  autoTts: true,
  voiceCloneAudio: null,
  voiceCloneName: '',
  ttsModelId: 'mimo-v2.5-tts-voiceclone',
}

// ============================================================================
// Hook
// ============================================================================

export function usePipeline(deps: UsePipelineDeps) {
  const [config, setConfig] = useState<PipelineConfig>(DEFAULT_CONFIG)
  const [state, setState] = useState<PipelineState>({
    step: 'idle',
    progress: 0,
    statusText: '',
    extractedText: '',
    rewrittenText: '',
    audioUrl: '',
    error: null,
  })

  const [isMounted, setIsMounted] = useState(false)

  const pendingRewriteRef = useRef(false)
  const hasAgentStartedRef = useRef(false)
  const videoFileRef = useRef<File | null>(null)
  const stateRef = useRef<PipelineStep>('idle')
  const configRef = useRef<PipelineConfig>(config)
  const tryReadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rewriteResultRef = useRef<string | null>(null)
  const synthesizeTtsRef = useRef<((text: string) => Promise<string>) | null>(null)

  // Keep refs in sync
  stateRef.current = state.step
  configRef.current = config

  // Load voice clone settings from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem("mimo_voice_settings")
      if (stored) {
        const settings = JSON.parse(stored)
        setConfig((prev) => ({
          ...prev,
          voiceCloneAudio: settings.voiceCloneAudioData || null,
          voiceCloneName: settings.voiceCloneActiveFile || '',
          ttsModelId: settings.modelId || 'mimo-v2.5-tts-voiceclone',
        }))
      }
    } catch (e) {
      console.error("Failed to load global voice settings in usePipeline mount:", e)
    }
    setIsMounted(true)
  }, [])

  // Synchronize Pipeline voice clone configuration to global localStorage settings
  useEffect(() => {
    if (!isMounted) return
    try {
      const stored = localStorage.getItem("mimo_voice_settings")
      let currentSettings: Record<string, unknown> = {}
      if (stored) {
        currentSettings = JSON.parse(stored)
      }
      
      currentSettings.modelId = config.ttsModelId
      currentSettings.voiceCloneActiveFile = config.voiceCloneName || null
      currentSettings.voiceCloneAudioData = config.voiceCloneAudio || null
      
      localStorage.setItem("mimo_voice_settings", JSON.stringify(currentSettings))
      window.dispatchEvent(new Event("mimo_voice_settings_changed"))
    } catch (e) {
      console.error("Failed to sync pipeline voice settings to localStorage:", e)
    }
  }, [config.voiceCloneAudio, config.voiceCloneName, config.ttsModelId, isMounted])

  // ── Step 1: Extract script from video ─────────────────────────
  const extractScript = useCallback(async (file: File): Promise<string> => {
    setState((s) => ({
      ...s,
      step: 'extracting',
      progress: 0.05,
      statusText: 'Loading audio extractor...',
      error: null,
      extractedText: '',
      rewrittenText: '',
      audioUrl: '',
    }))

    if (!isVideoFile(file)) {
      throw new Error(`Not a video file: ${file.name}`)
    }

    const { data: audioData } = await extractAudioFromVideo(file, {
      format: 'wav',
      sampleRate: 16000,
      channels: 1,
      onProgress: (p) => {
        setState((s) => ({ ...s, progress: 0.05 + p * 0.35, statusText: 'Extracting audio...' }))
      },
    })

    setState((s) => ({ ...s, progress: 0.40, statusText: 'Transcribing with Whisper...' }))

    const text = await transcribeAudio(audioData, (p) => {
      setState((s) => ({ ...s, progress: 0.40 + p * 0.30 }))
    })

    if (!text.trim()) {
      throw new Error('No speech detected in the video')
    }

    setState((s) => ({
      ...s,
      progress: 0.70,
      statusText: 'Extraction complete — review the script below',
      extractedText: text,
      step: 'awaitingInput',
    }))

    return text
  }, [])

  // ── Step 2: Send to LLM for rewrite (user-triggered) ──────────
  const startRewrite = useCallback((userRequest: string) => {
    const extracted = state.extractedText
    if (!extracted) return

    const message = buildRewriteMessage(extracted, userRequest)

    setState((s) => ({
      ...s,
      step: 'rewriting',
      progress: 0.72,
      statusText: 'Rewriting with LLM...',
    }))

    pendingRewriteRef.current = true
    hasAgentStartedRef.current = false
    rewriteResultRef.current = null
    setTimeout(() => deps.agentHandleSend(message), 0)
  }, [state.extractedText, deps])

  // ── Step 3: TTS synthesis ─────────────────────────────────────
  const synthesizeTts = useCallback(async (text: string): Promise<string> => {
    setState((s) => ({
      ...s,
      step: 'synthesizing',
      progress: 0.92,
      statusText: config.voiceCloneAudio ? 'Generating audio with voice clone...' : 'Generating audio with TTS...',
    }))

    // Clean the text: strip LLM explanations, keep only the script
    const cleaned = cleanScriptForTts(text)

    // Build TTS request body
    const body: Record<string, string> = { text: cleaned }
    if (config.voiceCloneAudio) {
      body.modelId = config.ttsModelId
      body.voice = config.voiceCloneAudio
    }
    if (deps.cwd) {
      body.cwd = deps.cwd
    }
    if (deps.sessionId) {
      body.sessionId = deps.sessionId
    }
    console.log('[Pipeline] TTS request:', { modelId: body.modelId, hasVoice: !!body.voice, textLength: cleaned.length, cwd: body.cwd, sessionId: body.sessionId })

    const res = await fetch('/api/tts/synthesize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error ?? `TTS failed: HTTP ${res.status}`)
    }

    const { audioUrl } = await res.json() as { audioUrl: string }

    // Write to Cache Storage to share with Chat Message Bubbles!
    try {
      const stored = localStorage.getItem("mimo_voice_settings")
      let voice: string | undefined = undefined
      const modelId = config.ttsModelId
      if (stored) {
        const settings = JSON.parse(stored) as Record<string, unknown>
        const mid = (settings.modelId as string || modelId || "").toLowerCase()
        if (mid.includes("voiceclone") || mid.includes("clone")) {
          voice = settings.voiceCloneAudioData as string || undefined
        } else if (mid.includes("tts")) {
          voice = settings.presetVoice as string || "mimo_default"
        }
      }
      const params = {
        text: cleaned,
        voice,
        modelId,
      }
      await saveCachedAudio(params, audioUrl)
      // Dispatch refresh event to update useTts in MessageView
      window.dispatchEvent(new Event("mimo_voice_settings_changed"))
      console.log('[Pipeline] Successfully synced audio URL to Cache Storage for text length:', cleaned.length)
    } catch (e) {
      console.error("[Pipeline] Failed to save generated audio to Cache Storage:", e)
    }

    setState((s) => ({
      ...s,
      progress: 1,
      statusText: 'Done!',
      audioUrl,
      step: 'done',
    }))

    // Invoke completion callback to trigger session reload
    deps.onTtsComplete?.()

    return audioUrl
  }, [config.voiceCloneAudio, config.ttsModelId, deps.cwd, deps.sessionId, deps.onTtsComplete])

  // Keep synthesizeTts ref in sync
  synthesizeTtsRef.current = synthesizeTts

  // Track agent running state for rewrite flow
  useEffect(() => {
    if (state.step !== 'rewriting') return

    if (deps.agentRunning) {
      hasAgentStartedRef.current = true
      pendingRewriteRef.current = true
      return
    }
  }, [state.step, deps.agentRunning])

  // ── Event-driven: handle agent events for rewrite result ──────
  const handleAgentEvent = useCallback((event: { type: string; [key: string]: unknown }) => {
    if (stateRef.current !== 'rewriting' || !pendingRewriteRef.current) return

    // Capture assistant message from message_end event
    if (event.type === 'message_end') {
      const completed = event.message as { role?: string; content?: unknown } | undefined
      if (completed?.role === 'assistant' && completed.content) {
        const content = completed.content
        let text = ''
        if (typeof content === 'string') {
          text = content
        } else if (Array.isArray(content)) {
          text = (content as { type: string; text: string }[])
            .filter((c) => c.type === 'text')
            .map((c) => c.text)
            .join('')
        }
        if (text) {
          rewriteResultRef.current = text
          console.log('[Pipeline] Captured assistant text from message_end:', text.length, 'chars')
        }
      }
    }

    // On agent_end, use the captured result
    if (event.type === 'agent_end') {
      if (!hasAgentStartedRef.current) return

      const assistantText = rewriteResultRef.current
      pendingRewriteRef.current = false
      rewriteResultRef.current = null

      if (assistantText) {
        console.log('[Pipeline] agent_end with captured text, length:', assistantText.length)
        setState((s) => ({
          ...s,
          rewrittenText: assistantText,
          progress: 0.90,
          statusText: 'Rewrite complete',
        }))

        if (configRef.current.autoTts) {
          synthesizeTtsRef.current?.(assistantText).catch((e) => {
            setState((s) => ({ ...s, step: 'error', error: String(e) }))
          })
        } else {
          setState((s) => ({ ...s, step: 'done', progress: 1, statusText: 'Rewrite complete' }))
        }
      } else {
        // Fallback: try getLastAssistantText
        const fallbackText = deps.getLastAssistantText()
        if (fallbackText) {
          console.log('[Pipeline] agent_end fallback to getLastAssistantText:', fallbackText.length)
          setState((s) => ({
            ...s,
            rewrittenText: fallbackText,
            progress: 0.90,
            statusText: 'Rewrite complete',
          }))
          if (configRef.current.autoTts) {
            synthesizeTtsRef.current?.(fallbackText).catch((e) => {
              setState((s) => ({ ...s, step: 'error', error: String(e) }))
            })
          } else {
            setState((s) => ({ ...s, step: 'done', progress: 1, statusText: 'Rewrite complete' }))
          }
        } else {
          console.error('[Pipeline] agent_end with no captured text and no fallback')
          setState((s) => ({ ...s, step: 'error', error: 'No response from LLM' }))
        }
      }
    }
  }, [deps.getLastAssistantText])

  // ── Main entry: start pipeline (extraction only, then pause) ──
  const start = useCallback(async (file: File) => {
    videoFileRef.current = file

    try {
      await extractScript(file)
      // Pipeline pauses at 'awaitingInput' — user provides rewrite requirements
    } catch (e: unknown) {
      const err = e as Error
      const msg = err?.message ?? String(err)
      console.error('[Pipeline]', msg)
      setState((s) => ({ ...s, step: 'error', error: msg }))
    }
  }, [extractScript])

  // ── Start pipeline using a Douyin link ─────────────────────────
  const startWithLink = useCallback(async (url: string) => {
    setState((s) => ({
      ...s,
      step: 'extracting',
      progress: 0.05,
      statusText: 'Resolving link and fetching audio...',
      error: null,
      extractedText: '',
      rewrittenText: '',
      audioUrl: '',
    }))

    try {
      const res = await fetch('/api/pipeline/parse-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? `Failed to resolve link: HTTP ${res.status}`)
      }

      const blob = await res.blob()
      const contentType = res.headers.get('content-type') || 'audio/mpeg'
      const ext = contentType.includes('wav') ? 'wav' : contentType.includes('webm') ? 'webm' : contentType.includes('mp4') ? 'mp4' : contentType.includes('m4a') ? 'm4a' : 'mp3'
      const file = new File([blob], `parsed_audio.${ext}`, { type: contentType })

      await extractScript(file)
    } catch (e: unknown) {
      const err = e as Error
      const msg = err?.message ?? String(err)
      console.error('[Pipeline]', msg)
      setState((s) => ({ ...s, step: 'error', error: msg }))
    }
  }, [extractScript])

  // ── Retry from the last failed step ───────────────────────────
  const retry = useCallback(() => {
    const { step, extractedText } = state
    if (step !== 'error') return

    if (!extractedText && videoFileRef.current) {
      start(videoFileRef.current)
    }
    // If extraction succeeded but rewrite/TTS failed, user can use the UI to retry
  }, [state, start])

  // ── Reset ─────────────────────────────────────────────────────
  const reset = useCallback(() => {
    pendingRewriteRef.current = false
    hasAgentStartedRef.current = false
    videoFileRef.current = null
    setState({
      step: 'idle',
      progress: 0,
      statusText: '',
      extractedText: '',
      rewrittenText: '',
      audioUrl: '',
      error: null,
    })
  }, [])

  // ── Manual TTS trigger ────────────────────────────────────────
  const triggerTts = useCallback(async (text?: string) => {
    const ttsText = text ?? state.rewrittenText
    if (!ttsText) return

    try {
      await synthesizeTts(ttsText)
    } catch (e: unknown) {
      const err = e as Error
      setState((s) => ({ ...s, step: 'error', error: err?.message ?? String(err) }))
    }
  }, [state.rewrittenText, synthesizeTts])

  return {
    state,
    config,
    setConfig,
    start,
    startWithLink,
    startRewrite,
    retry,
    reset,
    triggerTts,
    handleAgentEvent,
  }
}

// ============================================================================
// Clean LLM response — extract only the script content for TTS
// ============================================================================

/**
 * Strip LLM explanations and keep only the pure script text.
 * Handles common patterns like:
 * - "好的，以下是改写后的文案：\n\n[actual script]\n\n希望对你有帮助！"
 * - Markdown formatting, quotes, headers
 */
function cleanScriptForTts(text: string): string {
  let cleaned = text.trim()

  // Remove markdown headers (### Title)
  cleaned = cleaned.replace(/^#{1,6}\s+.*$/gm, '')

  // Remove markdown bold/italic wrappers
  cleaned = cleaned.replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1')

  // Remove blockquote markers
  cleaned = cleaned.replace(/^>\s?/gm, '')

  // Remove common LLM preamble patterns (Chinese + English)
  const preamblePatterns = [
    /^.{0,30}(以下是|下面是|这是|给你|改写后|改写如下|重写后|rewrite|here.{0,20}is)[：:]\s*\n*/i,
    /^.{0,20}(好的|没问题|当然|可以|当然可以)[，,。.]\s*\n*/i,
  ]
  for (const pattern of preamblePatterns) {
    cleaned = cleaned.replace(pattern, '')
  }

  // Remove common LLM closing patterns
  const closingPatterns = [
    /\n*.{0,40}(希望|如果|需要|有任何|以上是|以上就|觉得|觉得如何|怎么样|你看|你觉得).{0,30}[。！!？?]*\s*$/,
    /\n*.{0,30}(please let me know|hope this helps|feel free|let me know|does this work).{0,30}\s*$/i,
    /\n*---+\s*$/,
  ]
  for (const pattern of closingPatterns) {
    cleaned = cleaned.replace(pattern, '')
  }

  // Remove leading/trailing quotes if wrapping the entire text
  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) ||
      (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
      (cleaned.startsWith('「') && cleaned.endsWith('」'))) {
    cleaned = cleaned.slice(1, -1).trim()
  }

  // Collapse multiple blank lines
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n')

  return cleaned.trim()
}

// ============================================================================
// Whisper transcription
// ============================================================================

let whisperPipeline: unknown = null
let whisperLoadPromise: Promise<unknown> | null = null

async function getWhisperPipeline() {
  if (whisperPipeline) return whisperPipeline
  if (whisperLoadPromise) return whisperLoadPromise

  whisperLoadPromise = (async () => {
    try {
      const { pipeline } = await import('@huggingface/transformers')
      let pipe
      try {
        pipe = await pipeline('automatic-speech-recognition', 'Xenova/whisper-small', { device: 'webgpu' })
      } catch {
        pipe = await pipeline('automatic-speech-recognition', 'Xenova/whisper-small')
      }
      whisperPipeline = pipe
      return pipe
    } catch (e) {
      console.error('[Pipeline] Failed to load Whisper:', e)
      throw new Error('Whisper model could not be loaded.')
    }
  })()

  return whisperLoadPromise
}

async function transcribeAudio(
  audioData: Uint8Array,
  onProgress?: (p: number) => void,
): Promise<string> {
  onProgress?.(0.1)
  const pipe = await getWhisperPipeline()
  const transcriber = pipe as (
    audio: Float32Array,
    options: Record<string, unknown>
  ) => Promise<{ text: string }>
  onProgress?.(0.5)

  const samples = decodeWavToFloat32(audioData)
  onProgress?.(0.6)

  const chunkDuration = 30 * 16000
  const totalChunks = Math.ceil(samples.length / chunkDuration)
  const texts: string[] = []

  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkDuration
    const end = Math.min(start + chunkDuration, samples.length)
    const chunk = samples.slice(start, end)

    const result = await transcriber(chunk, {
      task: 'transcribe',
      language: 'chinese',
      initial_prompt: '以下是普通话的句子。',
    })
    texts.push((result?.text ?? '').trim())
    onProgress?.(0.6 + 0.4 * ((i + 1) / totalChunks))
  }

  return texts.filter(Boolean).join('\n')
}

function decodeWavToFloat32(wavData: Uint8Array): Float32Array {
  let dataOffset = 44
  for (let i = 0; i < wavData.length - 4; i++) {
    if (wavData[i] === 0x64 && wavData[i + 1] === 0x61 &&
        wavData[i + 2] === 0x74 && wavData[i + 3] === 0x61) {
      dataOffset = i + 8
      break
    }
  }

  const dataView = new DataView(wavData.buffer, wavData.byteOffset + dataOffset)
  const numSamples = Math.floor((wavData.length - dataOffset) / 2)
  const samples = new Float32Array(numSamples)

  for (let i = 0; i < numSamples; i++) {
    samples[i] = dataView.getInt16(i * 2, true) / 32768.0
  }

  return samples
}
