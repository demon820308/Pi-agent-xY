// Hook: upload video → extract audio → Whisper transcription → text
// Orchestrates ffmpeg.wasm audio extraction and Whisper WASM transcription.

'use client'

import { useState, useCallback, useRef } from 'react'
import { extractAudioFromVideo, isVideoFile } from '@/lib/video-audio-extractor'

type PipelineState = 'idle' | 'extracting' | 'transcribing' | 'polishing' | 'done' | 'error'

interface UseVideoScriptOptions {
  /** Language code ('zh-CN', 'en-US', etc.) or empty string for auto-detect */
  language?: string
  onComplete?: (text: string) => void
  onError?: (error: string) => void
}

interface UseVideoScriptReturn {
  /** Current pipeline state */
  state: PipelineState
  /** Extraction + transcription progress (0 → 1) */
  progress: number
  /** Status message for UI display */
  statusText: string
  /** Transcribed text (available when state === 'done') */
  result: string
  /** Start the pipeline with a video file */
  process: (file: File, polishModel?: { provider: string; modelId: string } | null) => Promise<string>
  /** Start the pipeline with a link */
  processLink: (url: string, polishModel?: { provider: string; modelId: string } | null) => Promise<string>
  /** Reset state */
  reset: () => void
}

export function useVideoScript(opts: UseVideoScriptOptions = {}): UseVideoScriptReturn {
  const [state, setState] = useState<PipelineState>('idle')
  const [progress, setProgress] = useState(0)
  const [statusText, setStatusText] = useState('')
  const [result, setResult] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  const runPipeline = useCallback(async (
    file: File,
    polishModel: { provider: string; modelId: string } | null | undefined,
    abortCtrl: AbortController
  ): Promise<string> => {
    // ── Step 1: Extract audio ──────────────────────────────────
    setState('extracting')
    setStatusText('Loading audio extractor (first time ~30MB)...')
    setProgress(0.02)

    const { data: audioData } = await extractAudioFromVideo(file, {
      format: 'wav',
      sampleRate: 16000,
      channels: 1,
      onProgress: (p) => setProgress(0.05 + p * 0.45), // 5% → 50%
    })

    if (abortCtrl.signal.aborted) return ''

    // ── Step 2: Transcribe with Whisper ────────────────────────
    setState('transcribing')
    setStatusText('Loading Whisper model...')
    setProgress(0.50)

    let text = await transcribeWithWhisper(audioData, opts.language || 'zh-CN', (p) => {
      setProgress(0.50 + p * 0.40) // 50% → 90%
    })

    if (abortCtrl.signal.aborted) return ''

    if (!text.trim()) {
      throw new Error('No speech detected in the video')
    }

    // ── Step 3: Polish with LLM ───────────────────────────────
    if (polishModel) {
      setState('polishing')
      setStatusText('Adding punctuation and polishing with LLM...')
      setProgress(0.92)

      try {
        const polishRes = await fetch('/api/pipeline/polish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text,
            provider: polishModel.provider,
            modelId: polishModel.modelId,
          }),
          signal: abortCtrl.signal,
        })

        if (!polishRes.ok) {
          const errData = await polishRes.json().catch(() => ({}))
          console.warn('[useVideoScript] Polishing failed:', errData.error || `HTTP ${polishRes.status}`)
        } else {
          const data = await polishRes.json()
          if (data.text) {
            text = data.text
          }
        }
      } catch (e) {
        console.warn('[useVideoScript] Error during polishing:', e)
      }
    }

    // ── Done ───────────────────────────────────────────────────
    setResult(text)
    setState('done')
    setStatusText(`Extracted ${text.length} characters`)
    setProgress(1)
    opts.onComplete?.(text)
    return text
  }, [opts.language, opts.onComplete])

  const process = useCallback(async (file: File, polishModel?: { provider: string; modelId: string } | null): Promise<string> => {
    if (!isVideoFile(file)) {
      const err = `Not a video file: ${file.name}`
      setState('error')
      setStatusText(err)
      opts.onError?.(err)
      return ''
    }

    const abortCtrl = new AbortController()
    abortRef.current = abortCtrl
    setResult('')
    setProgress(0)

    try {
      return await runPipeline(file, polishModel, abortCtrl)
    } catch (e: unknown) {
      if (abortCtrl.signal.aborted) {
        setState('idle')
        return ''
      }
      const msg = e instanceof Error ? e.message : String(e)
      console.error('[useVideoScript]', msg)
      setState('error')
      setStatusText(msg)
      opts.onError?.(msg)
      return ''
    }
  }, [runPipeline, opts.onError])

  const processLink = useCallback(async (url: string, polishModel?: { provider: string; modelId: string } | null): Promise<string> => {
    const abortCtrl = new AbortController()
    abortRef.current = abortCtrl
    setResult('')
    setProgress(0.01)
    setState('extracting')
    setStatusText('Resolving link and downloading audio...')

    try {
      const res = await fetch('/api/pipeline/parse-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
        signal: abortCtrl.signal,
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? `Failed to resolve link: HTTP ${res.status}`)
      }

      if (abortCtrl.signal.aborted) return ''

      const blob = await res.blob()
      const contentType = res.headers.get('content-type') || 'audio/mpeg'
      const ext = contentType.includes('wav') ? 'wav' : contentType.includes('webm') ? 'webm' : contentType.includes('mp4') ? 'mp4' : contentType.includes('m4a') ? 'm4a' : 'mp3'
      const file = new File([blob], `parsed_audio.${ext}`, { type: contentType })

      return await runPipeline(file, polishModel, abortCtrl)
    } catch (e: unknown) {
      if (abortCtrl.signal.aborted) {
        setState('idle')
        return ''
      }
      const msg = e instanceof Error ? e.message : String(e)
      console.error('[useVideoScript]', msg)
      setState('error')
      setStatusText(msg)
      opts.onError?.(msg)
      return ''
    }
  }, [runPipeline, opts.onError])

  const reset = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setState('idle')
    setProgress(0)
    setStatusText('')
    setResult('')
  }, [])

  return { state, progress, statusText, result, process, processLink, reset }
}

// ============================================================================
// Whisper transcription (reuses @huggingface/transformers pipeline)
// ============================================================================

let whisperPipeline: any = null
let whisperLoadPromise: Promise<any> | null = null

async function getWhisperPipeline() {
  if (whisperPipeline) return whisperPipeline
  if (whisperLoadPromise) return whisperLoadPromise

  whisperLoadPromise = (async () => {
    try {
      const { pipeline } = await import('@huggingface/transformers')

      try {
        whisperPipeline = await pipeline(
          'automatic-speech-recognition',
          'Xenova/whisper-small',
          { device: 'webgpu' },
        )
      } catch {
        whisperPipeline = await pipeline(
          'automatic-speech-recognition',
          'Xenova/whisper-small',
        )
      }
      return whisperPipeline
    } catch (e) {
      console.error('[VideoScript] Failed to load Whisper:', e)
      throw new Error('Whisper model could not be loaded. Try restarting the dev server after installing @huggingface/transformers.')
    }
  })()

  return whisperLoadPromise
}

/**
 * Transcribe raw WAV audio data (Uint8Array) with Whisper.
 * Expects 16kHz mono PCM — the format produced by extractAudioFromVideo.
 */
async function transcribeWithWhisper(
  audioData: Uint8Array,
  language: string,
  onProgress?: (p: number) => void,
): Promise<string> {
  onProgress?.(0.1)

  const transcriber = await getWhisperPipeline()
  onProgress?.(0.5)

  // Decode the WAV to Float32Array samples
  // WAV header is 44 bytes for standard PCM
  const samples = decodeWavToFloat32(audioData)

  onProgress?.(0.6)

  const lang = language ? (
    language === 'zh-CN' ? 'chinese' :
    language === 'en-US' ? 'english' :
    language === 'ja' ? 'japanese' :
    language === 'ko' ? 'korean' :
    language
  ) : undefined

  // Whisper can handle long audio, but process in chunks to avoid memory issues
  // whisper-base processes ~30s of audio per call
  const chunkDuration = 30 * 16000 // 30s at 16kHz
  const totalChunks = Math.ceil(samples.length / chunkDuration)
  const texts: string[] = []

  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkDuration
    const end = Math.min(start + chunkDuration, samples.length)
    const chunk = samples.slice(start, end)

    const result = await transcriber(chunk, {
      ...(lang ? { language: lang } : {}),
      task: 'transcribe',
      initial_prompt: '以下是普通话的句子。',
    })

    texts.push((result?.text ?? '').trim())
    onProgress?.(0.6 + 0.4 * ((i + 1) / totalChunks))
  }

  return texts.filter(Boolean).join('\n')
}

/**
 * Decode WAV file (Uint8Array) to Float32Array of audio samples.
 * Handles standard 16-bit PCM WAV format.
 */
function decodeWavToFloat32(wavData: Uint8Array): Float32Array {
  // Skip WAV header (44 bytes for standard PCM header)
  // Find the 'data' chunk more robustly
  let dataOffset = 44
  for (let i = 0; i < wavData.length - 4; i++) {
    if (wavData[i] === 0x64 && wavData[i + 1] === 0x61 &&
        wavData[i + 2] === 0x74 && wavData[i + 3] === 0x61) {
      // 'data' found — skip 4 bytes tag + 4 bytes size
      dataOffset = i + 8
      break
    }
  }

  const dataView = new DataView(wavData.buffer, wavData.byteOffset + dataOffset)
  const numSamples = Math.floor((wavData.length - dataOffset) / 2) // 16-bit = 2 bytes per sample
  const samples = new Float32Array(numSamples)

  for (let i = 0; i < numSamples; i++) {
    // 16-bit signed PCM → float [-1, 1]
    samples[i] = dataView.getInt16(i * 2, true) / 32768.0
  }

  return samples
}
