"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vs } from "react-syntax-highlighter/dist/cjs/styles/prism";
import { vscDarkPlus } from "react-syntax-highlighter/dist/cjs/styles/prism";
import { useTheme } from "@/hooks/useTheme";
import { useTts } from "@/hooks/useTts";
import { isTtsModel, cleanSpeechText, isVoiceCloneModel, isVoiceDesignModel } from "@/lib/tts-utils";
import type {
  AgentMessage,
  UserMessage,
  AssistantMessage,
  ToolResultMessage,
  AssistantContentBlock,
  TextContent,
  ImageContent,
  ToolCallContent,
  ThinkingContent,
} from "@/lib/types";

interface Props {
  message: AgentMessage;
  isStreaming?: boolean;
  toolResults?: Map<string, ToolResultMessage>;
  modelNames?: Record<string, string>;
  entryId?: string;
  onFork?: (entryId: string) => void;
  forking?: boolean;
  onNavigate?: (entryId: string) => void;
  prevAssistantEntryId?: string;
  onEditContent?: (content: string) => void;
  showTimestamp?: boolean;
  prevTimestamp?: number;
  activeModel?: { provider: string; modelId: string } | null;
  prevUserContent?: string;
  cwd?: string | null;
}

function formatTime(ts?: number): string | null {
  if (!ts) return null;
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (isToday) return time;
  const date = d.toLocaleDateString([], { month: "short", day: "numeric", year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined });
  return `${date} ${time}`;
}

function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    return Promise.resolve();
  } catch {
    return Promise.reject();
  }
}

interface ParsedAttachment {
  name: string;
  path: string;
  size?: string;
}

function parseAttachments(text: string): { cleanText: string; attachments: ParsedAttachment[] } {
  if (!text) return { cleanText: "", attachments: [] };

  const startTag = "<!-- PI_FILE_ATTACHMENTS_START -->";
  const endTag = "<!-- PI_FILE_ATTACHMENTS_END -->";

  const startIndex = text.indexOf(startTag);
  const endIndex = text.indexOf(endTag);

  if (startIndex === -1 || endIndex === -1 || startIndex >= endIndex) {
    return { cleanText: text, attachments: [] };
  }

  const before = text.substring(0, startIndex);
  const after = text.substring(endIndex + endTag.length);
  const inner = text.substring(startIndex + startTag.length, endIndex).trim();

  const cleanText = (before.trim() + "\n" + after.trim()).trim();

  const attachments: ParsedAttachment[] = [];
  const lines = inner.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("📄") || trimmed.includes("已上传文件")) continue;

    const match = trimmed.match(/^[-*]\s+(.+?)(?:\s+\((.+?)\))?$/) || trimmed.match(/^(.+?)(?:\s+\((.+?)\))?$/);
    if (match) {
      const fullPath = match[1].trim();
      const size = match[2]?.trim();
      const parts = fullPath.split(/[/\\]/);
      const name = parts[parts.length - 1] || fullPath;
      attachments.push({
        name,
        path: fullPath,
        size
      });
    }
  }

  return { cleanText, attachments };
}

function AttachmentChip({ file, cwd }: { file: ParsedAttachment; cwd?: string | null }) {
  const isAudio = /\.(wav|mp3|ogg|m4a|webm|aac)$/i.test(file.name);
  const isImage = /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(file.name);
  const isCode = /\.(js|jsx|ts|tsx|json|html|css|py|go|rs|cpp|c|h|sh|bat|md)$/i.test(file.name);

  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const togglePlay = (e: React.MouseEvent) => {
    if (!isAudio) return;
    e.stopPropagation();

    if (isPlaying) {
      audioRef.current?.pause();
      setIsPlaying(false);
    } else {
      if (!audioRef.current) {
        let fullPath = file.path;
        if (cwd && !/^[a-zA-Z]:/i.test(fullPath) && !fullPath.startsWith("/")) {
          const cleanCwd = cwd.replace(/[\\/]+$/, "");
          fullPath = `${cleanCwd}/${file.path}`;
        }
        
        const encoded = fullPath
          .replace(/\\/g, "/")
          .split("/")
          .filter(Boolean)
          .map(encodeURIComponent)
          .join("/");

        const url = `/api/files/${encoded}?type=read`;
        const audio = new Audio(url);
        audio.onended = () => setIsPlaying(false);
        audio.onerror = () => setIsPlaying(false);
        audioRef.current = audio;
      }
      audioRef.current.play().catch(() => setIsPlaying(false));
      setIsPlaying(true);
    }
  };

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  let iconColor = "var(--text-dim)";
  let bgLight = "rgba(255, 255, 255, 0.03)";
  let borderStyle = "1px solid var(--border)";
  let hoverBg = "rgba(255, 255, 255, 0.06)";

  if (isAudio) {
    iconColor = "var(--accent)";
    bgLight = "rgba(59, 130, 246, 0.05)";
    borderStyle = "1px solid rgba(59, 130, 246, 0.15)";
    hoverBg = "rgba(59, 130, 246, 0.09)";
  } else if (isImage) {
    iconColor = "#e11d48";
    bgLight = "rgba(225, 29, 72, 0.05)";
    borderStyle = "1px solid rgba(225, 29, 72, 0.15)";
    hoverBg = "rgba(225, 29, 72, 0.09)";
  } else if (isCode) {
    iconColor = "#10b981";
    bgLight = "rgba(16, 185, 129, 0.05)";
    borderStyle = "1px solid rgba(16, 185, 129, 0.15)";
    hoverBg = "rgba(16, 185, 129, 0.09)";
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 12px",
        background: bgLight,
        border: borderStyle,
        borderRadius: 8,
        fontSize: 12.5,
        color: "var(--text)",
        maxWidth: 320,
        boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
        transition: "transform 0.15s ease, background 0.15s ease, border-color 0.15s ease",
        cursor: isAudio ? "pointer" : "default",
        userSelect: "none",
      }}
      onClick={isAudio ? togglePlay : undefined}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-1px)";
        e.currentTarget.style.background = hoverBg;
        if (isAudio) {
          e.currentTarget.style.borderColor = "var(--accent)";
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.background = bgLight;
        e.currentTarget.style.borderColor = isAudio ? "rgba(59, 130, 246, 0.15)" : isImage ? "rgba(225, 29, 72, 0.15)" : isCode ? "rgba(16, 185, 129, 0.15)" : "var(--border)";
      }}
    >
      <span style={{ display: "flex", alignItems: "center", color: iconColor, flexShrink: 0 }}>
        {isAudio ? (
          isPlaying ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "pulse 1s infinite" }}>
              <rect x="6" y="4" width="4" height="16" />
              <rect x="14" y="4" width="4" height="16" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            </svg>
          )
        ) : isImage ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
        ) : isCode ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="16 18 22 12 16 6" />
            <polyline points="8 6 2 12 8 18" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
        )}
      </span>

      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, overflow: "hidden" }}>
        <span
          style={{
            fontWeight: 500,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            maxWidth: 180,
          }}
          title={file.path}
        >
          {file.name}
        </span>
        {file.size && (
          <span style={{ fontSize: 10, color: "var(--text-dim)", flexShrink: 0 }}>
            ({file.size})
          </span>
        )}
      </div>

      {isAudio && isPlaying && (
        <div style={{ display: "flex", gap: 1.5, alignItems: "flex-end", height: 11, marginLeft: 4, flexShrink: 0 }}>
          <style>{`
            @keyframes chipTtsJump {
              0%, 100% { height: 3px; }
              50% { height: 11px; }
            }
            .chip-tts-wave-bar {
              width: 1.5px;
              background: var(--accent);
              border-radius: 0.8px;
            }
          `}</style>
          <span className="chip-tts-wave-bar" style={{ height: 6, animation: "chipTtsJump 0.8s ease-in-out infinite" }} />
          <span className="chip-tts-wave-bar" style={{ height: 11, animation: "chipTtsJump 0.8s ease-in-out infinite 0.15s" }} />
          <span className="chip-tts-wave-bar" style={{ height: 4, animation: "chipTtsJump 0.8s ease-in-out infinite 0.3s" }} />
        </div>
      )}
    </div>
  );
}

function AttachmentChips({ attachments, cwd }: { attachments: ParsedAttachment[]; cwd?: string | null }) {
  if (!attachments || attachments.length === 0) return null;

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
      {attachments.map((file, idx) => (
        <AttachmentChip key={idx} file={file} cwd={cwd} />
      ))}
    </div>
  );
}

export function MessageView({ message, isStreaming, toolResults, modelNames, entryId, onFork, forking, onNavigate, prevAssistantEntryId, onEditContent, showTimestamp, prevTimestamp, activeModel, prevUserContent, cwd }: Props) {
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);

  const lightbox = zoomedImage && (
    <div
      onClick={() => setZoomedImage(null)}
      style={{
        position: "fixed",
        top: 0, left: 0, right: 0, bottom: 0,
        background: "rgba(15, 23, 42, 0.85)",
        backdropFilter: "blur(12px) saturate(180%)",
        WebkitBackdropFilter: "blur(12px) saturate(180%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 99999,
        cursor: "zoom-out",
        animation: "fadeIn 0.2s ease-out",
      }}
    >
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes scaleUp { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
      `}</style>
      <div style={{ position: "relative", maxWidth: "90vw", maxHeight: "90vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={zoomedImage}
          alt="Zoomed"
          style={{
            maxWidth: "90vw",
            maxHeight: "90vh",
            objectFit: "contain",
            borderRadius: 8,
            boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
            animation: "scaleUp 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)",
          }}
        />
        <button
          onClick={(e) => { e.stopPropagation(); setZoomedImage(null); }}
          style={{
            position: "fixed",
            top: 20,
            right: 20,
            width: 40,
            height: 40,
            borderRadius: "50%",
            background: "rgba(255, 255, 255, 0.1)",
            border: "none",
            color: "#fff",
            fontSize: 24,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            transition: "background 0.15s, transform 0.15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(255, 255, 255, 0.2)";
            e.currentTarget.style.transform = "scale(1.08)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(255, 255, 255, 0.1)";
            e.currentTarget.style.transform = "scale(1)";
          }}
        >
          ×
        </button>
      </div>
    </div>
  );

  if (message.role === "user") {
    return (
      <>
        <UserMessageView message={message as UserMessage} entryId={entryId} onFork={onFork} forking={forking} onNavigate={onNavigate} prevAssistantEntryId={prevAssistantEntryId} onEditContent={onEditContent} onZoomImage={setZoomedImage} cwd={cwd} />
        {lightbox}
      </>
    );
  }
  if (message.role === "assistant") {
    return (
      <>
        <AssistantMessageView message={message as AssistantMessage} isStreaming={isStreaming} toolResults={toolResults} modelNames={modelNames} showTimestamp={showTimestamp} prevTimestamp={prevTimestamp} onZoomImage={setZoomedImage} activeModel={activeModel} entryId={entryId} prevUserContent={prevUserContent} cwd={cwd} />
        {lightbox}
      </>
    );
  }
  if (message.role === "toolResult") {
    // Rendered inline under its toolCall — skip standalone rendering if paired
    return null;
  }
  return null;
}

function UserMessageView({ message, entryId, onFork, forking, onNavigate, prevAssistantEntryId, onEditContent, onZoomImage, cwd }: {
  message: UserMessage;
  entryId?: string;
  onFork?: (entryId: string) => void;
  forking?: boolean;
  onNavigate?: (entryId: string) => void;
  prevAssistantEntryId?: string;
  onEditContent?: (content: string) => void;
  onZoomImage?: (src: string) => void;
  cwd?: string | null;
}) {
  const [hovered, setHovered] = useState(false);
  const [copied, setCopied] = useState(false);

  const rawContent =
    typeof message.content === "string"
      ? message.content
      : message.content
          .filter((b): b is TextContent => b.type === "text")
          .map((b) => b.text)
          .join("\n");

  const { cleanText, attachments } = useMemo(() => {
    return parseAttachments(rawContent);
  }, [rawContent]);

  const imageBlocks: ImageContent[] =
    typeof message.content === "string"
      ? []
      : message.content.filter((b): b is ImageContent => b.type === "image");

  const time = formatTime(message.timestamp);
  const canFork = !!entryId && !!onFork;
  const canNavigate = !!prevAssistantEntryId && !!onNavigate;

  const copyContent = () => {
    copyText(cleanText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div
      style={{ marginBottom: 16, display: "flex", flexDirection: "column", alignItems: "flex-end" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ display: "flex", alignItems: "flex-end", gap: 6, maxWidth: "85%" }}>
        <div
          style={{
            flex: 1,
            minWidth: 0,
            background: "var(--user-bg)",
            border: "1px solid rgba(59,130,246,0.2)",
            borderRadius: 12,
            padding: "8px 12px",
            fontSize: 14,
            lineHeight: 1.6,
            color: "var(--text)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {imageBlocks.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: cleanText ? 8 : 0 }}>
              {imageBlocks.map((img, i) => {
                // lib/types.ts ImageContent uses {source:{type,data,media_type,url}}
                // pi-ai on-disk format uses flat {data, mimeType} — handle both
                const flat = img as unknown as { data?: string; mimeType?: string };
                const src = img.source
                  ? img.source.type === "base64"
                    ? `data:${img.source.media_type};base64,${img.source.data}`
                    : img.source.url ?? ""
                  : flat.data
                    ? `data:${flat.mimeType};base64,${flat.data}`
                    : "";
                return (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={i}
                    src={src}
                    alt=""
                    onClick={() => onZoomImage?.(src)}
                    style={{ maxWidth: 240, maxHeight: 240, borderRadius: 6, objectFit: "contain", display: "block", border: "1px solid rgba(59,130,246,0.15)", cursor: "zoom-in" }}
                  />
                );
              })}
            </div>
          )}
          {cleanText}
          <AttachmentChips attachments={attachments} cwd={cwd} />
        </div>

      </div>

      {/* Bottom row: action buttons + timestamp */}
      {(time || canFork || canNavigate || true) && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "flex-end",
          gap: 6, marginTop: 3,
        }}>
          <div style={{
            display: "flex", gap: 3,
            opacity: hovered ? 1 : 0,
            pointerEvents: hovered ? "auto" : "none",
            transition: "opacity 0.12s",
          }}>
            <button
              onClick={copyContent}
              title="Copy message"
              style={{
                display: "flex", alignItems: "center", gap: 4,
                padding: "3px 8px", height: 22,
                background: "none", border: "none",
                borderRadius: 5,
                color: copied ? "var(--accent)" : "var(--text-dim)",
                cursor: "pointer",
                fontSize: 11, fontWeight: 400,
                whiteSpace: "nowrap",
                transition: "color 0.12s",
              }}
              onMouseEnter={(e) => { if (!copied) e.currentTarget.style.color = "var(--accent)"; }}
              onMouseLeave={(e) => { if (!copied) e.currentTarget.style.color = "var(--text-dim)"; }}
            >
              {copied ? (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              )}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          {(canFork || canNavigate) && (
            <div style={{
              display: "flex", gap: 3,
              opacity: (hovered || forking) ? 1 : 0,
              pointerEvents: (hovered || forking) ? "auto" : "none",
              transition: "opacity 0.12s",
            }}>
              {canNavigate && (
                <button
                  onClick={() => { onNavigate!(prevAssistantEntryId!); onEditContent?.(cleanText); }}
                  title="Edit from here — branches within this session"
                  style={{
                    display: "flex", alignItems: "center", gap: 4,
                    padding: "3px 8px", height: 22,
                    background: "none", border: "none",
                    borderRadius: 5,
                    color: "var(--text-dim)",
                    cursor: "pointer",
                    fontSize: 11, fontWeight: 400,
                    whiteSpace: "nowrap",
                    transition: "color 0.12s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "var(--accent)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-dim)"; }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 10 20 15 15 20" />
                    <path d="M4 4v7a4 4 0 0 0 4 4h12" />
                  </svg>
                  Edit from here
                </button>
              )}
              {canFork && (
                <button
                  onClick={() => { onFork!(entryId!); }}
                  disabled={forking}
                  title={forking ? "Creating new session…" : "New session — creates an independent copy from here"}
                  style={{
                    display: "flex", alignItems: "center", gap: 4,
                    padding: "3px 8px", height: 22,
                    background: "none", border: "none",
                    borderRadius: 5,
                    color: forking ? "var(--accent)" : "var(--text-dim)",
                    cursor: forking ? "not-allowed" : "pointer",
                    fontSize: 11, fontWeight: 400,
                    whiteSpace: "nowrap",
                    transition: "color 0.12s",
                  }}
                  onMouseEnter={(e) => { if (!forking) e.currentTarget.style.color = "var(--accent)"; }}
                  onMouseLeave={(e) => { if (!forking) e.currentTarget.style.color = "var(--text-dim)"; }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="6" y1="3" x2="6" y2="15" />
                    <circle cx="18" cy="6" r="3" />
                    <circle cx="6" cy="18" r="3" />
                    <path d="M18 9a9 9 0 0 1-9 9" />
                  </svg>
                  {forking ? "Creating…" : "New session"}
                </button>
              )}
            </div>
          )}
          {time && <span style={{ fontSize: 10, color: "var(--text-dim)" }}>{time}</span>}
        </div>
      )}
    </div>
  );
}

function AssistantMessageView({
  message,
  isStreaming,
  toolResults,
  modelNames,
  showTimestamp,
  prevTimestamp,
  onZoomImage,
  activeModel,
  entryId,
  prevUserContent,
  cwd,
}: {
  message: AssistantMessage;
  isStreaming?: boolean;
  toolResults?: Map<string, ToolResultMessage>;
  modelNames?: Record<string, string>;
  showTimestamp?: boolean;
  prevTimestamp?: number;
  onZoomImage?: (src: string) => void;
  activeModel?: { provider: string; modelId: string } | null;
  entryId?: string;
  prevUserContent?: string;
  cwd?: string | null;
}) {
  const time = showTimestamp ? formatTime(message.timestamp) : null;
  const [voiceSettings, setVoiceSettings] = useState<{
    presetVoice?: string;
    voiceDesignPrompt?: string;
    voiceDesignActiveChips?: string[];
    voiceCloneActiveFile?: string;
    modelId?: string;
  } | null>(null);

  const mid = (isTtsModel(message.provider, message.model) ? message.model : (activeModel?.modelId || "")).toLowerCase();
  const resolvedMid = (voiceSettings?.modelId || mid).toLowerCase();

  // 1. Snapshot voice settings during active streaming to lock historical configuration
  useEffect(() => {
    if (isStreaming) {
      try {
        const globalStored = localStorage.getItem("mimo_voice_settings");
        if (globalStored) {
          const histStored = localStorage.getItem("mimo_history_voice_settings");
          const history = histStored ? JSON.parse(histStored) : {};
          
          const settings = JSON.parse(globalStored);
          settings.modelId = mid; // Preserve what model it generated under
          
          let changed = false;
          const timeKey = String(message.timestamp);
          if (JSON.stringify(history[timeKey]) !== JSON.stringify(settings)) {
            history[timeKey] = settings;
            changed = true;
          }
          if (entryId && JSON.stringify(history[entryId]) !== JSON.stringify(settings)) {
            history[entryId] = settings;
            changed = true;
          }
          
          if (changed) {
            localStorage.setItem("mimo_history_voice_settings", JSON.stringify(history));
            window.dispatchEvent(new Event("mimo_history_voice_settings_changed"));
          }
        }
      } catch (e) {
        console.error("Failed to snapshot voice settings:", e);
      }
    }
  }, [isStreaming, entryId, message.timestamp, mid]);

  // 2. Reactively load settings prioritising history snapshots over global state
  useEffect(() => {
    const loadSettings = () => {
      try {
        const histStored = localStorage.getItem("mimo_history_voice_settings");
        if (histStored) {
          const history = JSON.parse(histStored);
          const key = entryId || String(message.timestamp);
          const snapshot = history[key];
          if (snapshot) {
            setVoiceSettings(snapshot);
            return;
          }
        }
        
        const globalStored = localStorage.getItem("mimo_voice_settings");
        if (globalStored) {
          setVoiceSettings(JSON.parse(globalStored));
        }
      } catch (e) {
        console.error("Failed to load settings in MessageView:", e);
      }
    };

    loadSettings();
    window.addEventListener("mimo_voice_settings_changed", loadSettings);
    window.addEventListener("mimo_history_voice_settings_changed", loadSettings);
    return () => {
      window.removeEventListener("mimo_voice_settings_changed", loadSettings);
      window.removeEventListener("mimo_history_voice_settings_changed", loadSettings);
    };
  }, [entryId, message.timestamp]);

  const isDesign = isVoiceDesignModel(undefined, resolvedMid);
  const isClone = isVoiceCloneModel(undefined, resolvedMid);

  const blocks = message.content ?? [];
  const [hovered, setHovered] = useState(false);
  const [copied, setCopied] = useState(false);
  const streamStartRef = useRef<number | null>(null);
  const [tps, setTps] = useState<number | null>(null);
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;

  // Streaming-based timing for thinking blocks
  const blockStartTimesRef = useRef<Map<number, number>>(new Map());
  const [streamingDurations, setStreamingDurations] = useState<Map<number, number>>(new Map());

  // Thinking duration derived from file timestamps: time from prev message end to this message end
  // This is the total generation time (thinking + any text before first tool call)
  const thinkingDurationFromFile = useMemo<number | undefined>(() => {
    if (!message.timestamp || !prevTimestamp) return undefined;
    const secs = Math.round((message.timestamp - prevTimestamp) / 1000);
    return secs > 0 ? secs : undefined;
  }, [message.timestamp, prevTimestamp]);

  // Tool call durations derived from session file timestamps (accurate for completed messages)
  // assistant message timestamp = when generation ended = when tools started running
  // toolResult timestamp = when tool execution finished
  const toolCallDurations = useMemo<Map<string, number>>(() => {
    const map = new Map<string, number>();
    if (!toolResults || !message.timestamp) return map;
    for (const [callId, result] of toolResults) {
      if (result.timestamp && message.timestamp) {
        const secs = Math.round((result.timestamp - message.timestamp) / 1000);
        if (secs > 0) map.set(callId, secs);
      }
    }
    return map;
  }, [toolResults, message.timestamp]);

  const textContent = blocks
    .filter((b): b is TextContent => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  const showTts = isTtsModel(activeModel?.provider, activeModel?.modelId) || isTtsModel(message.provider, message.model);

  const effectiveText = cleanSpeechText(textContent || prevUserContent || "");

  const { isPlaying, isLoading, error: ttsError, play, pause, audioUrl } = useTts(entryId || String(message.timestamp), effectiveText, mid);

  const isFallback = !textContent && showTts && prevUserContent;

  const copyContent = () => {
    copyText(textContent).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  useEffect(() => {
    if (!isStreaming) {
      // Finalise any un-finished thinking block durations on stream end
      const now = Date.now();
      setStreamingDurations((prev: Map<number, number>) => {
        const next = new Map(prev);
        for (const [idx, start] of blockStartTimesRef.current) {
          if (!next.has(idx)) next.set(idx, Math.round((now - start) / 1000));
        }
        return next;
      });
      streamStartRef.current = null;
      setTps(null);
      return;
    }
    const tick = () => {
      const bs = blocksRef.current;
      const now = Date.now();

      // Record start time for each block the first time we see it
      bs.forEach((_, i) => {
        if (!blockStartTimesRef.current.has(i)) blockStartTimesRef.current.set(i, now);
      });

      // When a non-last block has a successor already started, finalise its duration
      setStreamingDurations((prev: Map<number, number>) => {
        let changed = false;
        const next = new Map(prev);
        for (let i = 0; i < bs.length - 1; i++) {
          if (!next.has(i) && blockStartTimesRef.current.has(i)) {
            const start = blockStartTimesRef.current.get(i)!;
            const nextStart = blockStartTimesRef.current.get(i + 1) ?? now;
            next.set(i, Math.round((nextStart - start) / 1000));
            changed = true;
          }
        }
        return changed ? next : prev;
      });

      let chars = 0;
      for (const b of bs) {
        if (b.type === "text") chars += (b as TextContent).text?.length ?? 0;
        else if (b.type === "thinking") chars += (b as ThinkingContent).thinking?.length ?? 0;
        else if (b.type === "toolCall") chars += JSON.stringify((b as ToolCallContent).input ?? {}).length;
      }
      if (chars === 0) return;
      if (streamStartRef.current === null) streamStartRef.current = now;
      const elapsed = (now - streamStartRef.current) / 1000;
      if (elapsed > 0.5) setTps(chars / 4 / elapsed);
    };
    const id = setInterval(tick, 300);
    return () => clearInterval(id);
  }, [isStreaming]);

  return (
    <div
      style={{ marginBottom: 16 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Model label */}
      <div
        style={{
          fontSize: 11,
          color: "var(--text-dim)",
          marginBottom: 4,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        {message.provider && (
          <span>{modelNames?.[`${message.provider}:${message.model}`] ?? modelNames?.[message.model] ?? message.model}</span>
        )}
        {isStreaming && (() => {
          let chars = 0;
          for (const b of blocks) {
            if (b.type === "text") chars += (b as TextContent).text?.length ?? 0;
            else if (b.type === "thinking") chars += (b as ThinkingContent).thinking?.length ?? 0;
            else if (b.type === "toolCall") chars += JSON.stringify((b as ToolCallContent).input ?? {}).length;
          }
          const est = Math.round(chars / 4);
          return (
            <>

              {est > 0 && (
                <span style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--text)" }} title="预估 token 数（流式接收中）">
                  <span style={{ display: "flex", alignItems: "center", gap: 2, fontSize: 11, fontWeight: 400 }}>
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="5" y1="1.5" x2="5" y2="8.5" /><polyline points="2 6 5 8.5 8 6" />
                    </svg>
                    {est}
                  </span>
                  {tps !== null && (() => {
                    const bg = tps >= 50 ? "#53b3cb" : tps >= 30 ? "#9bc53d" : tps >= 15 ? "#f9c22e" : "#e01a4f";
                    return (
                      <span style={{ marginLeft: 6, padding: "1px 6px", borderRadius: 4, background: bg, color: "#fff", fontSize: 11, fontWeight: 400 }}>
                        {tps.toFixed(1)} t/s
                      </span>
                    );
                  })()}
                </span>
              )}
            </>
          );
        })()}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {blocks.map((block, i) => (
          <BlockView key={i} block={block} toolResults={toolResults} isStreaming={isStreaming} streamingDuration={streamingDurations.get(i) ?? (block.type === "thinking" ? thinkingDurationFromFile : undefined)} toolCallDurations={toolCallDurations} onZoomImage={onZoomImage} />
        ))}
        {isFallback && (() => {
          const { cleanText: fallbackCleanText, attachments: fallbackAttachments } = parseAttachments(prevUserContent || "");
          return (
            <div style={{
              border: "1px dashed rgba(59,130,246,0.35)",
              background: "rgba(59,130,246,0.015)",
              borderRadius: 8,
              padding: "10px 14px",
              fontSize: 13,
              color: "var(--text)",
              lineHeight: 1.6,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--accent)", fontWeight: 600, marginBottom: 6 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                </svg>
                待播报文本 (Speech prompt text):
              </div>
              <div style={{ whiteSpace: "pre-wrap", color: "var(--text-muted)", fontSize: 12.5 }}>{fallbackCleanText}</div>
              <AttachmentChips attachments={fallbackAttachments} cwd={cwd} />
            </div>
          );
        })()}
        {isStreaming && blocks.length === 0 && (
          <div style={{ 
            display: "flex", 
            alignItems: "center", 
            gap: 6, 
            color: "var(--text-dim)", 
            fontSize: 13,
            padding: "4px 0"
          }}>
            <svg 
              width="12" 
              height="12" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2.5" 
              strokeLinecap="round" 
              strokeLinejoin="round"
              style={{ animation: "spin 1s linear infinite" }}
            >
              <line x1="12" y1="2" x2="12" y2="6" />
              <line x1="12" y1="18" x2="12" y2="22" />
              <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
              <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
              <line x1="2" y1="12" x2="6" y2="12" />
              <line x1="18" y1="12" x2="22" y2="12" />
              <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
              <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
            </svg>
            <span style={{ animation: "pulse 1.5s infinite" }}>Thinking...</span>
          </div>
        )}
      </div>

      <div style={{
        display: "flex", alignItems: "center", gap: 8, marginTop: 4,
      }}>
        {message.usage && !isStreaming && (
          <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
            {formatUsage(message.usage)}
          </div>
        )}
        {textContent && !isStreaming && (
          <button
            onClick={copyContent}
            title="Copy message"
            style={{
              display: "flex", alignItems: "center", gap: 4,
              padding: "3px 8px", height: 22,
              background: "none", border: "none",
              borderRadius: 5,
              color: copied ? "var(--accent)" : "var(--text-dim)",
              cursor: "pointer",
              fontSize: 11, fontWeight: 400,
              whiteSpace: "nowrap",
              opacity: hovered ? 1 : 0,
              pointerEvents: hovered ? "auto" : "none",
              transition: "opacity 0.12s, color 0.12s",
            }}
            onMouseEnter={(e) => { if (!copied) e.currentTarget.style.color = "var(--accent)"; }}
            onMouseLeave={(e) => { if (!copied) e.currentTarget.style.color = "var(--text-dim)"; }}
          >
            {copied ? (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            )}
            {copied ? "Copied" : "Copy"}
          </button>
        )}
        {showTts && effectiveText && !isStreaming && (
          <div style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 2 }}>
            <button
              onClick={() => isPlaying ? pause() : play(undefined, undefined, isTtsModel(message.provider, message.model) ? message.model : (activeModel?.modelId || message.model))}
              title={isPlaying ? "暂停播放" : audioUrl ? "播放已生成的语音" : "生成并播放语音"}
              style={{
                display: "flex", alignItems: "center", gap: 4,
                padding: "3px 8px", height: 22,
                background: "none", border: "none",
                borderRadius: 5,
                color: isPlaying ? "var(--accent)" : "var(--text-dim)",
                cursor: isLoading ? "not-allowed" : "pointer",
                fontSize: 11, fontWeight: 400,
                whiteSpace: "nowrap",
                opacity: 1,
                pointerEvents: "auto",
                transition: "color 0.12s",
              }}
              disabled={isLoading}
              onMouseEnter={(e) => { if (!isPlaying) e.currentTarget.style.color = "var(--accent)"; }}
              onMouseLeave={(e) => { if (!isPlaying) e.currentTarget.style.color = "var(--text-dim)"; }}
            >
              {isLoading ? (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: "spin 1s linear infinite" }}>
                   <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.2)" />
                   <path d="M12 2a10 10 0 0 1 10 10" />
                </svg>
              ) : isPlaying ? (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" />
                </svg>
              ) : (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                </svg>
              )}
              {isLoading ? "生成中..." : isPlaying ? "播放中" : audioUrl ? "播放" : "生成并播放"}
            </button>

            {audioUrl && (
              <button
                onClick={() => {
                  const a = document.createElement("a");
                  a.href = audioUrl;
                  const randId = Math.floor(100000 + Math.random() * 900000);
                  let modelType = "tts";
                  if (isClone) modelType = "voiceclone";
                  else if (isDesign) modelType = "voicedesign";
                  a.download = `mimo-${modelType}-${randId}.mp3`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                }}
                title="下载语音文件 (Download MP3)"
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  padding: "3px", width: 22, height: 22,
                  background: "none", border: "none",
                  borderRadius: 5,
                  color: "var(--text-dim)",
                  cursor: "pointer",
                  transition: "color 0.12s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "var(--accent)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-dim)"; }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </button>
            )}

            {voiceSettings && (() => {
              let icon = "🎙️";
              let label = "";
              let color = "var(--text-dim)";
              let bg = "var(--bg-panel)";
              let border = "1px solid var(--border)";

              if (isDesign) {
                icon = "🧩";
                const chips = voiceSettings.voiceDesignActiveChips || [];
                label = chips.length > 0 ? chips.join(" / ") : "自定义声线";
                color = "var(--accent)";
                bg = "rgba(59,130,246,0.06)";
                border = "1px solid rgba(59,130,246,0.15)";
              } else if (isClone) {
                icon = "🎙️";
                label = voiceSettings.voiceCloneActiveFile ? `声线克隆: ${voiceSettings.voiceCloneActiveFile}` : "未选择克隆声源";
                color = "#10b981";
                bg = "rgba(16,185,129,0.06)";
                border = "1px solid rgba(16,185,129,0.15)";
              } else {
                icon = "🌸";
                const vMap: Record<string, string> = {
                  "mimo_default": "冰糖 (默认)",
                  "茉莉": "茉莉 (温柔女)",
                  "苏打": "苏打 (活力男)",
                  "白桦": "白桦 (稳重男)",
                  "Chloe": "Chloe (英音女)",
                  "Mia": "Mia (美音女)",
                  "Milo": "Milo (美音男)",
                  "Dean": "Dean (澳音男)"
                };
                const vName = vMap[voiceSettings.presetVoice || "mimo_default"] || voiceSettings.presetVoice || "冰糖 (默认)";
                label = `官方声线: ${vName}`;
                color = "var(--text-muted)";
                bg = "rgba(255,255,255,0.02)";
                border = "1px solid var(--border)";
              }

              return (
                <span 
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "2px 8px",
                    borderRadius: 6,
                    fontSize: 10.5,
                    color,
                    background: bg,
                    border,
                    marginLeft: 6,
                    height: 22,
                    pointerEvents: "none",
                    whiteSpace: "nowrap",
                    opacity: 1,
                  }}
                  title={label}
                >
                  <span>{icon}</span>
                  <span style={{ fontWeight: 500 }}>{label}</span>
                </span>
              );
            })()}

            {isPlaying && (
              <div style={{ display: "flex", gap: 1.5, alignItems: "flex-end", height: 11, marginLeft: 2, marginRight: 2 }}>
                <style>{`
                  @keyframes ttsJump {
                    0%, 100% { height: 3px; }
                    50% { height: 11px; }
                  }
                  .tts-wave-bar {
                    width: 2px;
                    background: var(--accent);
                    border-radius: 1px;
                  }
                `}</style>
                <span className="tts-wave-bar" style={{ height: 6, animation: "ttsJump 0.8s ease-in-out infinite" }} />
                <span className="tts-wave-bar" style={{ height: 11, animation: "ttsJump 0.8s ease-in-out infinite 0.15s" }} />
                <span className="tts-wave-bar" style={{ height: 4, animation: "ttsJump 0.8s ease-in-out infinite 0.3s" }} />
                <span className="tts-wave-bar" style={{ height: 8, animation: "ttsJump 0.8s ease-in-out infinite 0.45s" }} />
              </div>
            )}

            {ttsError && (
              <span style={{ fontSize: 10, color: "#ef4444", marginLeft: 4 }} title={ttsError}>
                ⚠️ Play error
              </span>
            )}
          </div>
        )}
        {time && !isStreaming && (
          <span style={{ fontSize: 10, color: "var(--text-dim)", marginLeft: "auto" }}>{time}</span>
        )}
      </div>
    </div>
  );
}

function BlockView({ block, toolResults, isStreaming, streamingDuration, toolCallDurations, onZoomImage }: { block: AssistantContentBlock; toolResults?: Map<string, ToolResultMessage>; isStreaming?: boolean; streamingDuration?: number; toolCallDurations?: Map<string, number>; onZoomImage?: (src: string) => void }) {
  if (block.type === "text") {
    return <TextBlock block={block as TextContent} onZoomImage={onZoomImage} />;
  }
  if (block.type === "thinking") {
    return <ThinkingBlock block={block as ThinkingContent} duration={streamingDuration} />;
  }
  if (block.type === "toolCall") {
    const tc = block as ToolCallContent;
    const result = toolResults?.get(tc.toolCallId);
    const duration = toolCallDurations?.get(tc.toolCallId);
    return <ToolCallBlock block={tc} result={result} isRunning={isStreaming && !result} duration={duration} />;
  }
  return null;
}

function TextBlock({ block, onZoomImage }: { block: TextContent; onZoomImage?: (src: string) => void }) {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          img({ src, alt }) {
            return (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={src}
                alt={alt}
                style={{ cursor: "zoom-in", maxWidth: "100%", borderRadius: 6, border: "1px solid var(--border)" }}
                onClick={() => {
                  if (typeof src === "string") onZoomImage?.(src);
                }}
              />
            );
          },
          code({ className, children, ...props }) {
            const lang = className?.replace("language-", "") ?? "";
            const raw = String(children);
            const isBlock = className?.includes("language-") || raw.includes("\n");
            if (isBlock) {
              return <CodeBlock code={raw.replace(/\n$/, "")} lang={lang} />;
            }
            return (
              <code
                style={{
                  background: "var(--bg-selected)",
                  padding: "1px 4px",
                  borderRadius: 3,
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.9em",
                }}
                {...props}
              >
                {children}
              </code>
            );
          },
          pre({ children }) {
            // Unwrap <pre> wrapper — CodeBlock handles its own container
            return <>{children}</>;
          },
        }}
      >
        {block.text}
      </ReactMarkdown>
    </div>
  );
}

function ThinkingBlock({ block, duration }: { block: ThinkingContent; duration?: number }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 6,
        overflow: "hidden",
        fontSize: 13,
      }}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          width: "100%",
          padding: "6px 10px",
          background: "var(--bg-panel)",
          border: "none",
          color: "var(--text-muted)",
          cursor: "pointer",
          fontSize: 12,
          textAlign: "left",
        }}
      >
        <span>Thinking</span>
        {duration !== undefined && (
          <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-dim)", fontVariantNumeric: "tabular-nums" }}>{duration}s</span>
        )}
      </button>
      {expanded && (
        <div
          style={{
            padding: "8px 10px",
            color: "var(--text-muted)",
            fontSize: 12,
            lineHeight: 1.6,
            whiteSpace: "pre-wrap",
            background: "var(--bg-panel)",
            borderTop: "1px solid var(--border)",
          }}
        >
          {block.thinking}
        </div>
      )}
    </div>
  );
}


function ToolCallBlock({ block, result, duration }: { block: ToolCallContent; result?: ToolResultMessage; isRunning?: boolean; duration?: number }) {
  const [expanded, setExpanded] = useState(false);
  const inputStr = JSON.stringify(block.input, null, 2);

  // Result display
  const resultText = result
    ? result.content.filter((b): b is { type: "text"; text: string } => b.type === "text").map((b) => b.text).join("\n")
    : null;
  const resultIsEmpty = resultText === null ? false : (resultText.trim() === "(no output)" || resultText.trim() === "");
  const isError = result?.isError ?? false;

  return (
    <div
      style={{
        borderRadius: 7,
        overflow: "hidden",
        fontSize: 12,
        border: isError ? "1px solid rgba(248,113,113,0.45)" : "1px solid rgba(34,197,94,0.25)",
        background: isError ? "rgba(248,113,113,0.05)" : "rgba(34,197,94,0.04)",
      }}
    >
      {/* ── Tool call header ── */}
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          width: "100%",
          padding: "6px 10px",
          background: "none",
          border: "none",
          color: "var(--text-muted)",
          cursor: "pointer",
          fontSize: 12,
          textAlign: "left",
          minWidth: 0,
        }}
      >
        <span style={{ color: isError ? "#f87171" : "#16a34a", fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: 11, flexShrink: 0 }}>
          {block.toolName}
        </span>
        <span style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
          {getToolPreview(block)}
        </span>
        {duration !== undefined && (
          <span style={{ fontSize: 11, color: "var(--text-dim)", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{duration}s</span>
        )}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="var(--text-dim)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
          <polyline points="2 3.5 5 6.5 8 3.5" />
        </svg>
      </button>

      {/* ── Expanded: input args ── */}
      {expanded && (
        <pre
          style={{
            margin: 0,
            padding: "8px 10px",
            color: "var(--text-muted)",
            fontSize: 12,
            lineHeight: 1.5,
            overflow: "auto",
            background: "var(--bg-subtle)",
            borderTop: isError ? "1px solid rgba(248,113,113,0.25)" : "1px solid rgba(34,197,94,0.2)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
          }}
        >
          {inputStr}
        </pre>
      )}

      {/* ── Paired result — only shown when expanded ── */}
      {expanded && result && (
        <PairedResult
          text={resultText ?? ""}
          isEmpty={resultIsEmpty}
          isError={isError}
        />
      )}
    </div>
  );
}

function PairedResult({ text, isEmpty, isError }: {
  text: string;
  isEmpty: boolean;
  isError: boolean;
}) {
  return (
    <div
      style={{
        borderTop: `1px solid ${isError ? "rgba(248,113,113,0.3)" : "rgba(34,197,94,0.15)"}`,
        background: isError ? "rgba(248,113,113,0.04)" : "var(--bg-subtle)",
      }}
    >
      <pre
        style={{
          margin: 0,
          padding: "8px 10px",
          color: isError ? "#f87171" : (isEmpty ? "var(--text-dim)" : "var(--text-muted)"),
          fontSize: 12,
          lineHeight: 1.5,
          overflow: "auto",
          maxHeight: 400,
          background: "var(--bg)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
          fontStyle: isEmpty ? "italic" : "normal",
          opacity: isEmpty ? 0.6 : 1,
        }}
      >
        {isEmpty ? "(no output)" : text}
      </pre>
    </div>
  );
}


function getToolPreview(block: ToolCallContent): string {
  const input = block.input;
  if (!input || typeof input !== "object") return "";
  const keys = Object.keys(input);
  if (keys.length === 0) return "";

  // Common tool input patterns
  if ("command" in input) return String(input.command).slice(0, 120);
  if ("path" in input) return String(input.path).slice(0, 120);
  if ("file_path" in input) return String(input.file_path).slice(0, 120);
  if ("pattern" in input) return String(input.pattern).slice(0, 120);
  if ("query" in input) return String(input.query).slice(0, 120);

  const first = input[keys[0]];
  return String(first).slice(0, 120);
}

function formatUsage(usage: {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: { total: number };
}): string {
  const parts = [];
  if (usage.input) parts.push(`${usage.input.toLocaleString()} in`);
  if (usage.output) parts.push(`${usage.output.toLocaleString()} out`);
  if (usage.cacheRead) parts.push(`${usage.cacheRead.toLocaleString()} cache`);
  if (usage.cost?.total) parts.push(`$${usage.cost.total.toFixed(4)}`);
  return parts.join(" · ");
}



function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const { isDark } = useTheme();
  const [copied, setCopied] = useState(false);

  const copy = () => {
    copyText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div
      style={{
        position: "relative",
        marginTop: 4,
        marginBottom: 4,
        borderRadius: 6,
        overflow: "hidden",
        border: "1px solid var(--border)",
      }}
    >
      <div
        style={{
          padding: "3px 10px",
          background: "var(--bg-panel)",
          borderBottom: "1px solid var(--border)",
          fontSize: 11,
          color: "var(--text-dim)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span>{lang}</span>
        <button
          onClick={copy}
          style={{
            background: "none",
            border: "none",
            color: "var(--text-muted)",
            cursor: "pointer",
            fontSize: 11,
          }}
        >
          {copied ? "copied" : "copy"}
        </button>
      </div>
      <SyntaxHighlighter
        language={lang || "text"}
        style={isDark ? vscDarkPlus : vs}
        showLineNumbers
        lineNumberStyle={{ color: "var(--text-dim)", fontStyle: "normal" }}
        customStyle={{
          margin: 0,
          padding: "10px 12px",
          fontSize: 12.5,
          lineHeight: 1.6,
          borderRadius: 0,
          background: "var(--bg)",
        }}
        codeTagProps={{ style: { fontFamily: "var(--font-mono)" } }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}


