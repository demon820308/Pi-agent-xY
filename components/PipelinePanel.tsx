'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import type { PipelineConfig, PipelineState, PipelineStep } from '@/hooks/usePipeline'

interface PipelinePanelProps {
  state: PipelineState
  config: PipelineConfig
  onConfigChange: (config: PipelineConfig) => void
  onStart: (file: File) => void
  onStartWithLink?: (url: string) => void
  onRewrite: (userRequest: string) => void
  onRetry: () => void
  onReset: () => void
  onTriggerTts: (text?: string) => void
  onClose: () => void
  /** Available LLM models for rewrite */
  modelList?: { id: string; name: string; provider: string }[]
  /** Currently selected model key (provider/modelId) */
  currentModelKey?: string
  /** Called when user selects a different model */
  onModelChange?: (provider: string, modelId: string) => void
  onOpenCookieConfig?: () => void
}

export function PipelinePanel({
  state, config, onConfigChange, onStart, onStartWithLink, onRewrite, onRetry, onReset, onTriggerTts, onClose,
  modelList, currentModelKey, onModelChange, onOpenCookieConfig,
}: PipelinePanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const audioInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [rewriteInput, setRewriteInput] = useState('')
  const [showOriginal, setShowOriginal] = useState(false)
  const [inputMode, setInputMode] = useState<'upload' | 'link'>('upload')
  const [linkUrl, setLinkUrl] = useState('')

  const [isPlaying, setIsPlaying] = useState(false)
  const [audioDuration, setAudioDuration] = useState<number | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Load audio duration when voiceCloneAudio is updated
  useEffect(() => {
    if (config.voiceCloneAudio) {
      const tempAudio = new Audio(config.voiceCloneAudio)
      tempAudio.onloadedmetadata = () => {
        setAudioDuration(tempAudio.duration)
      }
    } else {
      setAudioDuration(null)
    }

    // Reset audio player if source changes
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
      setIsPlaying(false)
    }
  }, [config.voiceCloneAudio])

  // Custom audio playback control
  const togglePlayPreview = useCallback(() => {
    if (!config.voiceCloneAudio) return
    if (isPlaying) {
      audioRef.current?.pause()
      setIsPlaying(false)
    } else {
      if (!audioRef.current) {
        audioRef.current = new Audio(config.voiceCloneAudio)
        audioRef.current.onended = () => setIsPlaying(false)
      }
      audioRef.current.play()
      setIsPlaying(true)
    }
  }, [config.voiceCloneAudio, isPlaying])

  // Cleanup audio preview on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [])

  const handleFile = useCallback((file: File) => {
    onStart(file)
    setRewriteInput('')
  }, [onStart])

  const handleVoiceCloneUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      onConfigChange({ ...config, voiceCloneAudio: dataUrl, voiceCloneName: file.name })
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }, [config, onConfigChange])

  const clearVoiceClone = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    setIsPlaying(false)
    onConfigChange({ ...config, voiceCloneAudio: null, voiceCloneName: '' })
  }, [config, onConfigChange])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const handleRewriteSubmit = useCallback(() => {
    const request = rewriteInput.trim() || '改成更口语化、自然的风格'
    onRewrite(request)
  }, [rewriteInput, onRewrite])

  const isRunning = state.step === 'extracting' || state.step === 'rewriting' || state.step === 'synthesizing'

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 12,
      padding: 16, background: 'var(--bg-panel)', borderRadius: 12,
      border: '1px solid var(--border)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>🎬</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Pipeline</span>
        </div>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16, padding: 4,
        }}>×</button>
      </div>

      {/* Config */}
      {state.step === 'idle' && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer' }}>
          <input type="checkbox" checked={config.autoTts} onChange={(e) => onConfigChange({ ...config, autoTts: e.target.checked })} />
          Auto-generate audio after rewrite
        </label>
      )}

      {/* Tab Switcher */}
      {state.step === 'idle' && (
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', paddingBottom: 8, gap: 16 }}>
          <button
            type="button"
            onClick={() => setInputMode('upload')}
            style={{
              background: 'none', border: 'none',
              color: inputMode === 'upload' ? 'var(--accent)' : 'var(--text-muted)',
              borderBottom: inputMode === 'upload' ? '2px solid var(--accent)' : 'none',
              cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: '4px 8px'
            }}
          >
            💻 本地上传视频
          </button>
          <button
            type="button"
            onClick={() => setInputMode('link')}
            style={{
              background: 'none', border: 'none',
              color: inputMode === 'link' ? 'var(--accent)' : 'var(--text-muted)',
              borderBottom: inputMode === 'link' ? '2px solid var(--accent)' : 'none',
              cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: '4px 8px'
            }}
          >
            🔗 视频链接解析
          </button>
        </div>
      )}

      {/* Upload area */}
      {state.step === 'idle' && inputMode === 'upload' && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            padding: 24, borderRadius: 8, textAlign: 'center', cursor: 'pointer',
            border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border)'}`,
            background: dragOver ? 'rgba(59,130,246,0.05)' : 'transparent',
            transition: 'all 0.15s',
          }}
        >
          <div style={{ fontSize: 28, marginBottom: 4 }}>📁</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Drop video or click to upload
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>
            mp4, webm, mkv, mov
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*,.mp4,.webm,.mkv,.mov,.avi,.flv"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleFile(file)
              e.target.value = ''
            }}
          />
        </div>
      )}

      {/* Link Input area */}
      {state.step === 'idle' && inputMode === 'link' && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 10,
          padding: '16px 20px', borderRadius: 8, border: '1px solid var(--border)',
          background: 'rgba(0,0,0,0.02)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 12, color: 'var(--text)', fontWeight: 500 }}>
              支持抖音、B站、小红书（含短链接）:
            </div>
            <button
              type="button"
              onClick={onOpenCookieConfig}
              style={{
                background: 'none', border: 'none', color: 'var(--accent)',
                cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4,
                padding: '2px 6px', borderRadius: 4, transition: 'background 0.15s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
            >
              ⚙️ B站 Cookie 配置
            </button>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="粘贴视频链接，如 抖音、B站、小红书..."
              style={{
                flex: 1, padding: '8px 12px', borderRadius: 6, fontSize: 12,
                border: '1px solid var(--border)', background: 'var(--bg)',
                color: 'var(--text)', outline: 'none',
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && linkUrl.trim()) {
                  onStartWithLink?.(linkUrl.trim());
                }
              }}
            />
            <button
              type="button"
              onClick={() => {
                if (linkUrl.trim()) onStartWithLink?.(linkUrl.trim());
              }}
              disabled={!linkUrl.trim()}
              style={{
                padding: '8px 16px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                border: 'none', background: linkUrl.trim() ? 'var(--accent)' : 'var(--border)',
                color: linkUrl.trim() ? '#fff' : 'var(--text-dim)',
                cursor: linkUrl.trim() ? 'pointer' : 'not-allowed',
                transition: 'all 0.15s',
              }}
            >
              🚀 提取文案
            </button>
          </div>
        </div>
      )}

      {/* Extraction progress */}
      {state.step === 'extracting' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <StepRow label="Extract Audio" progress={state.progress < 0.4 ? state.progress / 0.4 : 1} active={state.progress < 0.4} done={state.progress >= 0.4} />
          <StepRow label="Transcribe" progress={state.progress < 0.4 ? 0 : (state.progress - 0.4) / 0.3} active={state.progress >= 0.4} done={state.progress >= 0.7} />
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{state.statusText}</div>
        </div>
      )}

      {/* Awaiting input: show extracted text + model + voice + rewrite input */}
      {state.step === 'awaitingInput' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 12, color: '#10b981', fontWeight: 500 }}>
            ✅ Script extracted ({state.extractedText.length} characters)
          </div>

          {/* Extracted text */}
          <div style={{
            padding: 10, borderRadius: 8, fontSize: 12, lineHeight: 1.6,
            background: 'var(--bg)', border: '1px solid var(--border)',
            color: 'var(--text)', maxHeight: 200, overflow: 'auto',
            whiteSpace: 'pre-wrap',
          }}>
            {state.extractedText}
          </div>

          {/* Model selector */}
          {modelList && modelList.length > 0 && onModelChange && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>改写模型:</span>
              <select
                value={currentModelKey || ''}
                onChange={(e) => {
                  const [provider, ...idParts] = e.target.value.split('/')
                  onModelChange(provider, idParts.join('/'))
                }}
                style={{
                  flex: 1, padding: '4px 8px', borderRadius: 6, fontSize: 11,
                  border: '1px solid var(--border)', background: 'var(--bg)',
                  color: 'var(--text)', outline: 'none',
                }}
              >
                {modelList.filter(m => !m.id.toLowerCase().includes("tts")).map((m) => (
                  <option key={`${m.provider}/${m.id}`} value={`${m.provider}/${m.id}`}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Voice clone */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>🎙️ 克隆配音 (Voice Cloning Studio)</span>
            
            {/* TTS Model selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>选择 TTS 模型:</span>
              <select
                value={config.ttsModelId}
                onChange={(e) => onConfigChange({ ...config, ttsModelId: e.target.value })}
                style={{
                  flex: 1, padding: '4px 8px', borderRadius: 6, fontSize: 11,
                  border: '1px solid var(--border)', background: 'var(--bg)',
                  color: 'var(--text)', outline: 'none',
                }}
              >
                {(() => {
                  const ttsModels = modelList ? modelList.filter(m => m.id.toLowerCase().includes("tts")) : [];
                  if (ttsModels.length > 0) {
                    // Deduplicate by model ID
                    const seen = new Set();
                    return ttsModels.filter(m => {
                      if (seen.has(m.id)) return false;
                      seen.add(m.id);
                      return true;
                    }).map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ));
                  } else {
                    return [
                      { id: 'mimo-v2.5-tts-voiceclone', name: 'MiMo-V2.5-TTS-VoiceClone' },
                      { id: 'mimo-v2.5-tts-voicedesign', name: 'MiMo-V2.5-TTS-VoiceDesign' },
                      { id: 'mimo-v2.5-tts', name: 'MiMo-V2.5-TTS' },
                      { id: 'mimo-v2-tts', name: 'MiMo-V2-TTS' }
                    ].map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ));
                  }
                })()}
              </select>
            </div>

            {!config.voiceCloneAudio ? (
              <button
                type="button"
                onClick={() => audioInputRef.current?.click()}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  padding: '12px', border: '1px dashed var(--border)', borderRadius: 8,
                  background: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11,
                  transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.borderColor = 'var(--accent)' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border)' }}
              >
                <span>📁</span>
                <span>上传克隆音频 (WAV/MP3/M4A)</span>
              </button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 11, color: '#10b981', fontWeight: 500 }}>
                  🟢 克隆声线已就绪
                </span>
                <div style={{ 
                  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', 
                  borderRadius: 8, background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', 
                  fontSize: 11 
                }}>
                  <span style={{ fontSize: 14 }}>🎵</span>
                  <span style={{ color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={config.voiceCloneName}>
                    {config.voiceCloneName || 'Reference audio'}
                    {audioDuration !== null && ` (${audioDuration.toFixed(1)}s)`}
                  </span>
                  <button 
                    type="button"
                    onClick={togglePlayPreview} 
                    style={{ 
                      padding: '2px 8px', borderRadius: 4, fontSize: 10,
                      border: '1px solid var(--border)', background: 'var(--bg)',
                      color: 'var(--text)', cursor: 'pointer', fontWeight: 500
                    }}
                  >
                    {isPlaying ? '⏸ 暂停' : '▶ 播放试听'}
                  </button>
                  <button 
                    type="button"
                    onClick={clearVoiceClone} 
                    style={{ 
                      padding: '2px 8px', borderRadius: 4, fontSize: 10,
                      border: '1px solid var(--border)', background: 'var(--bg)',
                      color: '#ef4444', cursor: 'pointer', fontWeight: 500
                    }}
                  >
                    🗑️ 清除
                  </button>
                </div>
              </div>
            )}
            
            <input
              ref={audioInputRef}
              type="file"
              accept="audio/*,.wav,.mp3,.m4a,.ogg,.webm"
              style={{ display: 'none' }}
              onChange={handleVoiceCloneUpload}
            />
          </div>

          {/* Rewrite requirements input */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 12, color: 'var(--text)', fontWeight: 500 }}>
              How should I rewrite this?
            </div>
            <input
              type="text"
              value={rewriteInput}
              onChange={(e) => setRewriteInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleRewriteSubmit() }}
              placeholder="e.g. 更口语化、更幽默、加个开头hook..."
              style={{
                padding: '8px 10px', borderRadius: 6, fontSize: 12,
                border: '1px solid var(--border)', background: 'var(--bg)',
                color: 'var(--text)', outline: 'none',
              }}
            />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[
                { key: 'oral', label: '口语化' },
                { key: 'professional', label: '专业' },
                { key: 'humorous', label: '幽默' },
                { key: 'emotional', label: '煽情' },
                { key: 'persuasive', label: '种草' },
                { key: 'concise', label: '精简' },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setRewriteInput(
                    key === 'oral' ? '改成更口语化、自然的风格' :
                    key === 'professional' ? '改成更专业、有深度的风格' :
                    key === 'humorous' ? '改成更幽默、轻松有趣的风格' :
                    key === 'emotional' ? '改成更有感染力、打动人心的风格' :
                    key === 'persuasive' ? '改成有说服力的种草风格' :
                    '精简文案，去掉冗余，保留核心信息'
                  )}
                  style={{
                    padding: '2px 8px', borderRadius: 4, fontSize: 10,
                    border: '1px solid var(--border)', background: 'var(--bg-panel)',
                    color: 'var(--text-muted)', cursor: 'pointer',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              onClick={handleRewriteSubmit}
              style={{
                padding: '8px 16px', borderRadius: 6, fontSize: 13, fontWeight: 600,
                border: 'none', background: 'var(--accent)', color: '#fff',
                cursor: 'pointer', alignSelf: 'flex-start',
              }}
            >
              ✍️ Start Rewrite
            </button>
          </div>
        </div>
      )}

      {/* Progress: rewriting + synthesizing */}
      {(state.step === 'rewriting' || state.step === 'synthesizing') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <StepRow label="Extract" progress={1} active={false} done />
          <StepRow label="Rewrite" progress={state.step === 'rewriting' ? 0.5 : 1} active={state.step === 'rewriting'} done={state.step === 'synthesizing'} />
          <StepRow label="TTS" progress={state.step === 'synthesizing' ? 0.5 : 0} active={state.step === 'synthesizing'} done={false} />
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{state.statusText}</div>
        </div>
      )}

      {/* Error */}
      {state.step === 'error' && (
        <div style={{
          padding: '8px 12px', borderRadius: 6, fontSize: 12,
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444',
        }}>
          {state.error}
          <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
            <button onClick={onRetry} style={btnStyle}>Retry</button>
            <button onClick={onReset} style={btnStyle}>Reset</button>
          </div>
        </div>
      )}

      {/* Done */}
      {state.step === 'done' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 12, color: '#10b981', fontWeight: 500 }}>✅ Complete</div>

          {/* Original (collapsible) */}
          {state.extractedText && (
            <div>
              <button onClick={() => setShowOriginal(!showOriginal)} style={{
                background: 'none', border: 'none', color: 'var(--text-muted)',
                cursor: 'pointer', fontSize: 11, padding: 0,
              }}>
                {showOriginal ? '▼' : '▶'} Original ({state.extractedText.length} chars)
              </button>
              {showOriginal && (
                <div style={{
                  marginTop: 4, padding: 8, borderRadius: 6, fontSize: 11,
                  background: 'var(--bg)', border: '1px solid var(--border)',
                  color: 'var(--text-muted)', maxHeight: 120, overflow: 'auto',
                  whiteSpace: 'pre-wrap', lineHeight: 1.5,
                }}>
                  {state.extractedText}
                </div>
              )}
            </div>
          )}

          {/* Rewritten text */}
          {state.rewrittenText && (
            <div style={{
              padding: 10, borderRadius: 8, fontSize: 12, lineHeight: 1.6,
              background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)',
              color: 'var(--text)', maxHeight: 200, overflow: 'auto',
              whiteSpace: 'pre-wrap',
            }}>
              {state.rewrittenText}
            </div>
          )}

          {/* Audio player */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {state.audioUrl ? (
              <audio controls src={state.audioUrl} style={{ flex: 1, height: 32 }} />
            ) : (
              <button onClick={() => onTriggerTts()} style={{ ...btnStyle, background: 'var(--accent)', color: '#fff', border: 'none' }}>
                🔊 Generate Audio
              </button>
            )}
            <button onClick={onReset} style={btnStyle}>New</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Sub-components
// ============================================================================

function StepRow({ label, progress, active, done }: {
  label: string; progress: number; active: boolean; done: boolean
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
      <span style={{ width: 16, textAlign: 'center' }}>
        {done ? '✅' : active ? '🔄' : '⏳'}
      </span>
      <span style={{ width: 80, color: active ? 'var(--accent)' : 'var(--text-muted)' }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
        <div style={{
          width: `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`,
          height: '100%', borderRadius: 2,
          background: done ? '#10b981' : active ? 'var(--accent)' : 'transparent',
          transition: 'width 0.3s ease',
        }} />
      </div>
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 500,
  border: '1px solid var(--border)', background: 'var(--bg-panel)',
  color: 'var(--text)', cursor: 'pointer',
}
