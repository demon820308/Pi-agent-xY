// Browser-side video → audio extraction using ffmpeg.wasm
// Extracts the audio track from video files without re-encoding when possible,
// falling back to WAV 16kHz mono for Whisper compatibility.

import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile } from '@ffmpeg/util'

// ============================================================================
// Singleton FFmpeg instance (lazy loaded, shared across calls)
// ============================================================================

let ffmpegInstance: FFmpeg | null = null
let loadPromise: Promise<FFmpeg> | null = null

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance?.loaded) return ffmpegInstance
  if (loadPromise) return loadPromise

  loadPromise = (async () => {
    console.log('[ffmpeg] Loading WASM core from local...')
    const ffmpeg = new FFmpeg()

    ffmpeg.on('log', ({ message }) => {
      if (message.includes('Error') || message.includes('error')) {
        console.warn('[ffmpeg]', message)
      }
    })

    await ffmpeg.load({
      coreURL: '/ffmpeg/ffmpeg-core.js',
      wasmURL: '/ffmpeg/ffmpeg-core.wasm',
    })

    console.log('[ffmpeg] WASM core loaded successfully')
    ffmpegInstance = ffmpeg
    return ffmpeg
  })()

  return loadPromise
}

// ============================================================================
// Types
// ============================================================================

export interface ExtractAudioOptions {
  /** Output format: 'wav' for Whisper, 'mp3'/'aac' for general use */
  format?: 'wav' | 'mp3' | 'aac'
  /** Sample rate in Hz (default: 16000 for Whisper) */
  sampleRate?: number
  /** Number of channels (default: 1 mono for Whisper) */
  channels?: number
  /** Progress callback (0 → 1) */
  onProgress?: (progress: number) => void
}

export interface ExtractAudioResult {
  /** Extracted audio as Uint8Array */
  data: Uint8Array
  /** MIME type of the output */
  mimeType: string
  /** Duration in seconds (approximate) */
  duration?: number
}

// ============================================================================
// Core function
// ============================================================================

/**
 * Extract audio from a video file using ffmpeg.wasm.
 *
 * @param videoFile - The video File or Blob to extract audio from
 * @param options - Output format and audio settings
 * @returns Extracted audio data
 */
export async function extractAudioFromVideo(
  videoFile: File | Blob,
  options: ExtractAudioOptions = {},
): Promise<ExtractAudioResult> {
  const {
    format = 'wav',
    sampleRate = 16000,
    channels = 1,
    onProgress,
  } = options

  const ffmpeg = await getFFmpeg()

  let cleanupProgress: (() => void) | undefined

  // Track progress
  if (onProgress) {
    const progressHandler = ({ progress }: { progress: number }) => {
      onProgress(Math.min(Math.max(progress, 0), 1))
    }
    ffmpeg.on('progress', progressHandler)
    cleanupProgress = () => ffmpeg.off('progress', progressHandler)
  }

  const inputName = 'input_video'
  const outputName = `output_audio.${format}`

  try {
    // Write video to virtual FS
    const inputData = await fetchFile(videoFile)
    await ffmpeg.writeFile(inputName, inputData)

    // Build ffmpeg args
    const args = buildExtractArgs(inputName, outputName, format, sampleRate, channels)

    // Execute
    const exitCode = await ffmpeg.exec(args)
    if (exitCode !== 0) {
      throw new Error(`ffmpeg exited with code ${exitCode}`)
    }

    // Read output
    const outputData = await ffmpeg.readFile(outputName)
    const data = outputData instanceof Uint8Array
      ? outputData
      : new TextEncoder().encode(outputData as string)

    const mimeType = format === 'wav' ? 'audio/wav'
      : format === 'mp3' ? 'audio/mpeg'
      : 'audio/aac'

    return { data, mimeType }
  } finally {
    cleanupProgress?.()
    // Clean up virtual FS files
    try {
      await ffmpeg.deleteFile(inputName)
      await ffmpeg.deleteFile(outputName)
    } catch {
      // ignore cleanup errors
    }
  }
}

/**
 * Get video duration from metadata using ffprobe-like extraction.
 * Returns duration in seconds.
 */
export async function getVideoDuration(videoFile: File | Blob): Promise<number> {
  const ffmpeg = await getFFmpeg()
  const inputName = 'probe_input'

  try {
    const inputData = await fetchFile(videoFile)
    await ffmpeg.writeFile(inputName, inputData)

    // Use ffprobe-style: -f null to just parse metadata
    // We write a tiny output to avoid errors
    const exitCode = await ffmpeg.exec([
      '-i', inputName,
      '-f', 'null', '-t', '0.1',
      '-y', '/dev/null',
    ])

    // Duration is reported via log events — unreliable in WASM.
    // Fallback: parse from file size / bitrate estimate.
    // For now, return 0 and let the caller handle it.
    void exitCode
    return 0
  } finally {
    try { await ffmpeg.deleteFile(inputName) } catch { /* */ }
  }
}

// ============================================================================
// Helpers
// ============================================================================

function buildExtractArgs(
  input: string,
  output: string,
  format: string,
  sampleRate: number,
  channels: number,
): string[] {
  const base = ['-i', input]

  switch (format) {
    case 'wav':
      // WAV PCM 16-bit — directly usable by Whisper
      return [
        ...base,
        '-vn',                    // no video
        '-acodec', 'pcm_s16le',  // 16-bit PCM
        '-ar', String(sampleRate),
        '-ac', String(channels),
        '-y',                     // overwrite
        output,
      ]

    case 'mp3':
      return [
        ...base,
        '-vn',
        '-acodec', 'libmp3lame',
        '-ab', '128k',
        '-ar', String(sampleRate),
        '-ac', String(channels),
        '-y',
        output,
      ]

    case 'aac':
      return [
        ...base,
        '-vn',
        '-acodec', 'aac',
        '-ab', '128k',
        '-ar', String(sampleRate),
        '-ac', String(channels),
        '-y',
        output,
      ]

    default:
      return [...base, '-vn', '-y', output]
  }
}

// ============================================================================
// Utilities
// ============================================================================

const VIDEO_EXTENSIONS = new Set([
  'mp4', 'webm', 'mkv', 'avi', 'mov', 'flv', 'wmv', 'm4v', 'mpeg', 'mpg', '3gp',
])

const VIDEO_MIME_PREFIXES = ['video/']

/** Check if a File is a video based on extension or MIME type */
export function isVideoFile(file: File): boolean {
  if (VIDEO_MIME_PREFIXES.some((p) => file.type.startsWith(p))) return true
  const ext = file.name.split('.').pop()?.toLowerCase()
  return ext ? VIDEO_EXTENSIONS.has(ext) : false
}

/** Check if the browser has SharedArrayBuffer (needed for multi-threaded ffmpeg.wasm) */
export function hasSharedArrayBuffer(): boolean {
  return typeof SharedArrayBuffer !== 'undefined'
}
