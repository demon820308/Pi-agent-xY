"use client";

import React, { useRef, useState, useCallback, useEffect, useImperativeHandle, forwardRef, KeyboardEvent } from "react";
import { isVisionModel } from "@/lib/vision";
import { isTtsModel, isVoiceDesignModel, isVoiceCloneModel, isBaseTtsModel } from "@/lib/tts-utils";
import { encodeFilePathForApi, joinFilePath } from "@/lib/file-paths";
import { TtsPanel } from "./TtsPanel";
import { useVideoScript } from "@/hooks/useVideoScript";
import { isVideoFile } from "@/lib/video-file";
import { PROMPT_PRESETS, type PromptPreset } from "@/lib/prompt-presets";

export interface AttachedImage {
  data: string;   // base64, no prefix
  mimeType: string;
  previewUrl: string; // object URL for display
}

interface ModelOption {
  provider: string;
  modelId: string;
  name: string;
}

interface PromptArg {
  key: string;
  name: string;
  defaultValue: string;
}

function parsePlaceholders(text: string): PromptArg[] {
  const args: PromptArg[] = [];
  const seen = new Set<string>();
  const braceRegex = /\{argument name="([^"]+)"(?: default="([^"]*)")?\}/g;
  let match;
  while ((match = braceRegex.exec(text)) !== null) {
    if (!seen.has(match[0])) {
      seen.add(match[0]);
      args.push({ key: match[0], name: match[1], defaultValue: match[2] ?? "" });
    }
  }
  const bracketRegex = /\[([A-Z\u4e00-\u9fff][A-Z0-9_\u4e00-\u9fff ]{1,30})\]/g;
  while ((match = bracketRegex.exec(text)) !== null) {
    if (!seen.has(match[0])) {
      seen.add(match[0]);
      args.push({ key: match[0], name: match[1], defaultValue: "" });
    }
  }
  return args;
}

function replacePlaceholders(text: string, values: Record<string, string>): string {
  let updated = text;
  for (const [key, val] of Object.entries(values)) {
    updated = updated.replaceAll(key, val);
  }
  return updated;
}

interface Props {
  onSend: (message: string, images?: AttachedImage[]) => void;
  onAbort: () => void;
  onSteer?: (message: string, images?: AttachedImage[]) => void;
  onFollowUp?: (message: string, images?: AttachedImage[]) => void;
  isStreaming: boolean;
  model?: { provider: string; modelId: string } | null;
  modelNames?: Record<string, string>;
  modelList?: { id: string; name: string; provider: string; supportsVision?: boolean }[];
  onModelChange?: (provider: string, modelId: string) => void;
  onCompact?: () => void;
  onAbortCompaction?: () => void;
  isCompacting?: boolean;
  compactError?: string | null;
  toolPreset?: "none" | "default" | "full";
  onToolPresetChange?: (preset: "none" | "default" | "full") => void;
  thinkingLevel?: "auto" | "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
  onThinkingLevelChange?: (level: "auto" | "off" | "minimal" | "low" | "medium" | "high" | "xhigh") => void;
  availableThinkingLevels?: string[] | null;
  thinkingLevelMap?: Record<string, string | null> | null;
  retryInfo?: { attempt: number; maxAttempts: number; errorMessage?: string } | null;
  soundEnabled?: boolean;
  onSoundToggle?: () => void;
  cwd?: string | null;
  onOpenCookieConfig?: () => void;
  designSystem?: string | null;
  onDesignSystemChange?: (id: string | null) => void;
  designSystemList?: { id: string; name: string; category: string }[];

  isNew?: boolean;
  sessionId?: string | null;
  onOpenDeepResearch?: () => void;
}

export interface ChatInputHandle {
  insertText: (text: string) => void;
  insertIfEmpty: (text: string) => void;
  addImages: (files: File[]) => void;
  addFiles: (files: File[]) => void;
}

const TOOL_PRESETS = ["off", "default", "full"] as const;
const TOOL_PRESET_MAP: Record<"off" | "default" | "full", "none" | "default" | "full"> = { off: "none", default: "default", full: "full" };

const THINKING_LEVELS = ["auto", "off", "minimal", "low", "medium", "high", "xhigh"] as const;
const THINKING_LEVEL_DESC: Record<typeof THINKING_LEVELS[number], string> = {
  auto: "沿用 pi 默认设置",
  off: "关闭推理",
  minimal: "最少推理",
  low: "低强度推理",
  medium: "中等推理",
  high: "高强度推理",
  xhigh: "最高强度推理",
};


function parseDescriptionToJSON(text: string): string {
  let coreSubject = "";
  let clothing = "";
  let location = "";
  let background = "";
  let lighting = "";
  let style = "";
  let layout = "";
  let sceneElements = "";
  let textTreatment = "";
  let mood = "";
  let colorPalette = "";
  let aspectRatio = "";
  const lines = text.split(/\r?\n/);
  let inFinalPromptSection = false;
  const finalPromptLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.includes("最终直调用") || trimmed.includes("【最终直调用 Prompt】")) {
      inFinalPromptSection = true;
      continue;
    }

    if (inFinalPromptSection) {
      if (trimmed === "---" || trimmed.startsWith("---") || trimmed.startsWith("***")) continue;
      finalPromptLines.push(trimmed);
      continue;
    }

    const lower = trimmed.toLowerCase();

    if (lower.includes("core_subject") || trimmed.includes("核心主体")) {
      const parts = trimmed.split(/[:：]/);
      if (parts.length > 1) coreSubject = parts.slice(1).join(":").trim();
    } else if ((lower.includes("clothing") || trimmed.includes("服装/材质") || trimmed.includes("服装") || trimmed.includes("材质")) && !lower.includes("lighting") && !trimmed.includes("光照")) {
      const parts = trimmed.split(/[:：]/);
      if (parts.length > 1) clothing = parts.slice(1).join(":").trim();
    } else if (lower.includes("location") || trimmed.includes("具体地点")) {
      const parts = trimmed.split(/[:：]/);
      if (parts.length > 1) location = parts.slice(1).join(":").trim();
    } else if (lower.includes("background") || trimmed.includes("画面背景")) {
      const parts = trimmed.split(/[:::：]/);
      if (parts.length > 1) background = parts.slice(1).join(":").trim();
    } else if (lower.includes("lighting") || trimmed.includes("光照与色彩") || trimmed.includes("光照") || trimmed.includes("色彩")) {
      const parts = trimmed.split(/[:：]/);
      if (parts.length > 1) lighting = parts.slice(1).join(":").trim();
    } else if (lower.includes("style") || trimmed.includes("艺术风格")) {
      const parts = trimmed.split(/[:：]/);
      if (parts.length > 1) style = parts.slice(1).join(":").trim();
    } else if (lower.includes("layout") || trimmed.includes("画面布局")) {
      const parts = trimmed.split(/[:：]/);
      if (parts.length > 1) layout = parts.slice(1).join(":").trim();
    } else if (lower.includes("scene_elements") || trimmed.includes("场景元素")) {
      const parts = trimmed.split(/[:：]/);
      if (parts.length > 1) sceneElements = parts.slice(1).join(":").trim();
    } else if (lower.includes("text_treatment") || trimmed.includes("文字处理")) {
      const parts = trimmed.split(/[:：]/);
      if (parts.length > 1) textTreatment = parts.slice(1).join(":").trim();
    } else if (lower.includes("mood") || trimmed.includes("情绪氛围")) {
      const parts = trimmed.split(/[:：]/);
      if (parts.length > 1) mood = parts.slice(1).join(":").trim();
    } else if (lower.includes("color_palette") || trimmed.includes("色彩调色板") || trimmed.includes("调色板")) {
      const parts = trimmed.split(/[:：]/);
      if (parts.length > 1) colorPalette = parts.slice(1).join(":").trim();
    } else if (lower.includes("aspect_ratio") || trimmed.includes("画面比例")) {
      const parts = trimmed.split(/[:：]/);
      if (parts.length > 1) aspectRatio = parts.slice(1).join(":").trim();
    }
  }

  const cleanMarkdown = (val: string) => val.replace(/[\*\#\>\`]/g, "").trim();

  coreSubject = cleanMarkdown(coreSubject);
  clothing = cleanMarkdown(clothing);
  location = cleanMarkdown(location);
  background = cleanMarkdown(background);
  lighting = cleanMarkdown(lighting);
  style = cleanMarkdown(style);
  layout = cleanMarkdown(layout);
  sceneElements = cleanMarkdown(sceneElements);
  textTreatment = cleanMarkdown(textTreatment);
  mood = cleanMarkdown(mood);
  colorPalette = cleanMarkdown(colorPalette);
  aspectRatio = cleanMarkdown(aspectRatio);

  let finalPromptText = finalPromptLines.join("\n").trim();

  const instructionRegexes = [
    /请根据上述分析.*?Prompt[。：]*/ig,
    /请使用纯英文自然语言或短语.*?复制粘贴[：:]*/ig,
    /要求：[\s\S]*?(?=\n\n|\n[A-Z]|$)/g,
    /请直接给出 Prompt[：:]*/ig,
  ];
  for (const regex of instructionRegexes) {
    finalPromptText = finalPromptText.replace(regex, "");
  }
  finalPromptText = finalPromptText.replace(/^[:：\s]+/, "").trim();
  finalPromptText = cleanMarkdown(finalPromptText);

  if (!coreSubject || !style) {
    const cleanText = text.replace(/[\*\#\>\-\`]/g, " ").replace(/\s+/g, " ").trim();
    if (!coreSubject) {
      const m = cleanText.match(/(?:主角是|主体是|画面中是|一个|一位|一幅|主角为|主体为|核心焦点为|核心为)([^，。；]+)/i);
      coreSubject = m ? m[1].trim() : "";
    }
    if (!clothing) {
      const m = cleanText.match(/(?:身穿|身着|穿着|身披|着装为|服装为|衣服为|衣服是)([^，。；]+)/i);
      clothing = m ? m[1].trim() : "";
    }
    if (!location) {
      const m = cleanText.match(/(?:在|位于|置身于|场景是|地点是|背景是|场景为|位置为|居中放置)([^，。；]{2,20})(?:中|里|上|下|旁|前|后|，|。|；)/i);
      location = m ? m[1].trim() : "";
    }
    if (!background) {
      const m = cleanText.match(/(?:背景是|背景为|背景中包含|背景有|配景为|背景采用)([^。；，]+)/i);
      background = m ? m[1].trim() : "";
    }
    if (!lighting) {
      const m = cleanText.match(/(?:光线|光影|阳光|照射|照明|光效|光环|散发出)([^，。；]+)/i);
      lighting = m ? m[1].trim() : "";
    }
    if (!style) {
      const m = cleanText.match(/(?:风格|画风|设计风格|视觉风格|呈现出|表现为|采用)([^，。；]+)/i);
      style = m ? m[1].trim() : "";
    }
    if (!mood) {
      const m = cleanText.match(/(?:氛围|情绪|感觉|格调|意境)([^，。；]+)/i);
      mood = m ? m[1].trim() : "";
    }
    const sentences = cleanText.split(/[，。；]/).map(s => s.trim()).filter(Boolean);
    if (!coreSubject && sentences.length > 0) coreSubject = sentences[0];
    if (!location && sentences.length > 1) location = sentences[1];
    if (!style) {
      if (cleanText.includes("摄影")) style = "写实摄影肖像";
      else if (cleanText.includes("插画")) style = "动漫手绘插画";
      else if (cleanText.includes("界面") || cleanText.includes("设计")) style = "UI界面设计";
      else style = "现代艺术风格";
    }
  }

  if (!finalPromptText) {
    const promptParts = [style, coreSubject, location, clothing, background, lighting, mood, sceneElements].filter(Boolean);
    finalPromptText = promptParts.join(", ");
    if (!finalPromptText) finalPromptText = text.replace(/[\*\#\>\-\`]/g, " ").replace(/\s+/g, " ").trim();
  }

  const imagePrompt: Record<string, string> = {
    core_subject: coreSubject,
    style: style,
  };
  if (clothing) imagePrompt.clothing = clothing;
  if (location) imagePrompt.location = location;
  if (background) imagePrompt.background = background;
  if (lighting) imagePrompt.lighting = lighting;
  if (layout) imagePrompt.layout = layout;
  if (sceneElements) imagePrompt.scene_elements = sceneElements;
  if (textTreatment) imagePrompt.text_treatment = textTreatment;
  if (mood) imagePrompt.mood = mood;
  if (colorPalette) imagePrompt.color_palette = colorPalette;
  if (aspectRatio) imagePrompt.aspect_ratio = aspectRatio;
  imagePrompt.prompt = finalPromptText;

  return JSON.stringify({ image_prompt: imagePrompt }, null, 2);
}

export const ChatInput = forwardRef<ChatInputHandle, Props>(function ChatInput({
  onSend, onAbort, onSteer, onFollowUp, isStreaming, model, modelNames, modelList, onModelChange,
  onCompact, onAbortCompaction, isCompacting, compactError, toolPreset, onToolPresetChange,
  thinkingLevel, onThinkingLevelChange, availableThinkingLevels, thinkingLevelMap,
  retryInfo,
  soundEnabled, onSoundToggle,
  cwd,
  onOpenCookieConfig,
  designSystem,
  onDesignSystemChange,
  designSystemList,
  onOpenDeepResearch,
  isNew,
  sessionId,
}: Props, ref) {
  const [value, setValue] = useState("");
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [modelDropdownRect, setModelDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const [toolDropdownOpen, setToolDropdownOpen] = useState(false);
  const [thinkingDropdownOpen, setThinkingDropdownOpen] = useState(false);
  const [designDropdownOpen, setDesignDropdownOpen] = useState(false);
  const [designDropdownRect, setDesignDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const [previewDsId, setPreviewDsId] = useState<string | null>(null);
  const [videoUploadDropdownOpen, setVideoUploadDropdownOpen] = useState(false);
  const [videoLinkUrl, setVideoLinkUrl] = useState("");
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([]);
  const [geminiMenuOpen, setGeminiMenuOpen] = useState(false);
  const [geminiSubMenu, setGeminiSubMenu] = useState<'none' | 'upload_options' | 'tools' | 'workspace_files' | 'dev_modes'>('none');
  const [devMode, setDevMode] = useState<"direct" | "guarded" | "rigorous">("guarded");
  const lastIsNewRef = useRef(isNew);
  useEffect(() => {
    if (isNew && !lastIsNewRef.current) {
      localStorage.setItem("mimo_dev_mode_temp", "guarded");
      setDevMode("guarded");
    }
    lastIsNewRef.current = isNew;

    if (isNew || !sessionId) {
      const tempStored = localStorage.getItem("mimo_dev_mode_temp");
      if (tempStored === "direct" || tempStored === "guarded" || tempStored === "rigorous") {
        setDevMode(tempStored);
      } else {
        setDevMode("guarded");
      }
    } else {
      let stored = localStorage.getItem(`mimo_dev_mode_${sessionId}`);
      if (!stored) {
        const tempStored = localStorage.getItem("mimo_dev_mode_temp");
        if (tempStored === "direct" || tempStored === "guarded" || tempStored === "rigorous") {
          stored = tempStored;
          localStorage.setItem(`mimo_dev_mode_${sessionId}`, tempStored);
          localStorage.removeItem("mimo_dev_mode_temp");
        }
      }
      if (stored === "direct" || stored === "guarded" || stored === "rigorous") {
        setDevMode(stored);
      } else {
        setDevMode("guarded");
      }
    }
  }, [sessionId, isNew]);
  const [workspacePath, setWorkspacePath] = useState<string>("");
  const [workspaceFiles, setWorkspaceFiles] = useState<{ name: string; fullPath: string; isDir: boolean; size: number }[]>([]);
  const [workspaceSearchQuery, setWorkspaceSearchQuery] = useState("");
  const [loadingWorkspaceFiles, setLoadingWorkspaceFiles] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<{ file: File; name: string; size: number }[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [describingIndices, setDescribingIndices] = useState<Record<number, boolean>>({});
  const [describeError, setDescribeError] = useState<string | null>(null);
  const [promptModalOpen, setPromptModalOpen] = useState(false);
  const [promptModalText, setPromptModalText] = useState("");
  const [copySuccess, setCopySuccess] = useState(false);
  const [promptTab, setPromptTab] = useState<"text" | "json">("text");
  const [placeholderValues, setPlaceholderValues] = useState<Record<string, string>>({});
  const [presetDropdownOpen, setPresetDropdownOpen] = useState(false);
  const presetDropdownRef = useRef<HTMLDivElement>(null);
  const [activePreset, setActivePreset] = useState<PromptPreset | null>(null);
  const [dynamicPresets, setDynamicPresets] = useState<PromptPreset[] | null>(null);
  const [presetsAvailable, setPresetsAvailable] = useState(false);

  const [downloadModalOpen, setDownloadModalOpen] = useState(false);
  const [downloadStage, setDownloadStage] = useState<"idle" | "downloading" | "extracting" | "done" | "error">("idle");
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadMessage, setDownloadMessage] = useState("");
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const startPresetsDownload = async () => {
    setDownloadStage("downloading");
    setDownloadProgress(0);
    setDownloadMessage("正在初始化连接...");
    setDownloadError(null);

    try {
      const response = await fetch("/api/agent/prompt-presets/download", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error(`连接下载服务失败 (HTTP ${response.status})`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("无法读取服务器响应流");
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("data: ")) {
            try {
              const data = JSON.parse(trimmed.slice(6));
              if (data.stage) {
                setDownloadStage(data.stage);
              }
              if (data.progress !== undefined) {
                setDownloadProgress(data.progress);
              }
              if (data.message) {
                setDownloadMessage(data.message);
              }
              if (data.stage === "done") {
                const res = await fetch("/api/agent/prompt-presets");
                if (res.ok) {
                  const presetData = await res.json();
                  if (presetData.exists && presetData.presets && presetData.presets.length > 0) {
                    setDynamicPresets(presetData.presets);
                    setPresetsAvailable(true);
                  }
                }
                
                setTimeout(() => {
                  setDownloadModalOpen(false);
                  setDownloadStage("idle");
                }, 1500);
              }
              if (data.stage === "error") {
                setDownloadError(data.message || "下载过程中出错");
                setDownloadStage("error");
              }
            } catch (e) {
              console.error("Failed to parse event data:", e);
            }
          }
        }
      }
    } catch (err: any) {
      console.error("Download failed:", err);
      setDownloadError(err.message || "请求失败");
      setDownloadStage("error");
    }
  };

  const allPresets: PromptPreset[] = dynamicPresets && dynamicPresets.length > 0 ? dynamicPresets : PROMPT_PRESETS;

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const url = `/api/agent/prompt-presets`;
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) {
          setPresetsAvailable(false);
          return;
        }
        const data = await res.json() as { exists?: boolean; presets?: PromptPreset[] };
        if (data.exists && data.presets && data.presets.length > 0) {
          setDynamicPresets(data.presets);
          setPresetsAvailable(true);
        } else {
          setPresetsAvailable(false);
        }
      } catch {
        setPresetsAvailable(false);
      }
    })();
    return () => controller.abort();
  }, []);

  const [pptPanelOpen, setPptPanelOpen] = useState(false);
  const [pptTheme, setPptTheme] = useState('tokyo-night');
  const [pptTemplate, setPptTemplate] = useState('tech-sharing');
  const [pptSlides, setPptSlides] = useState(10);
  const [pptAudience, setPptAudience] = useState('');
  const [pptTopic, setPptTopic] = useState('');
  const pptPanelRef = useRef<HTMLDivElement>(null);

  const isTts = model ? isTtsModel(model.provider, model.modelId) : false;

  // Model-Adaptive Voice Workspace States
  const [voiceConsoleOpen, setVoiceConsoleOpen] = useState(false);

  // Track video extraction source (immune to stale closures via ref)
  const extractionSourceRef = useRef<{ type: "link" | "file"; value: string } | null>(null);

  // Video → Script extraction pipeline (auto-detect language)
  const videoScript = useVideoScript({
    language: '',
    onComplete: (text) => {
      const source = extractionSourceRef.current;
      const displayPrefix = source?.type === 'link' 
        ? `提取视频中的文案\n视频链接：${source.value}` 
        : `提取视频中的文案\n本地视频：${source?.value || '未命名视频'}`;

      const fullMessage = `${displayPrefix}\n<!-- PI_HIDDEN_START -->\n以下是从音视频中提取出来的原始文案，目前没有任何标点符号，并且由于语音识别（ASR）技术限制，可能会有部分错别字或同音字。\n请你在不改变原意、不删减关键内容的前提下，进行简单的标点润色：\n1. 合理加上中文标点符号（逗号、句号、问号、感叹号等），并进行简单的自然分段以方便阅读。\n2. 修正明显的同音错别字。\n3. 直接输出加好标点、润色分段后的文案，不要输出任何解释、分析、Markdown 格式标记或代码块包裹，仅返回处理后的纯文本内容。\n\n${text}\n<!-- PI_HIDDEN_END -->`;

      onSend(fullMessage);
      extractionSourceRef.current = null;
    },
    onError: (err) => setDescribeError(err),
  })

  const getPolishModel = () => {
    const isTts = model ? isTtsModel(model.provider, model.modelId) : false;
    if (model && !isTts) {
      return { provider: model.provider, modelId: model.modelId };
    }
    const fallback = modelList?.find(m => !m.id.toLowerCase().includes("tts"));
    if (fallback) {
      return { provider: fallback.provider, modelId: fallback.id };
    }
    return null;
  };



  const insertAudioTag = (tag: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const curVal = value;
    const newVal = curVal.substring(0, start) + ` [${tag}] ` + curVal.substring(end);
    setValue(newVal);
    
    setTimeout(() => {
      ta.focus();
      const newPos = start + tag.length + 4;
      ta.setSelectionRange(newPos, newPos);
    }, 10);
  };

  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    };
  }, []);

  const startRecording = async () => {
    if (typeof window === "undefined" || !navigator.mediaDevices) {
      setDescribeError("您的浏览器不支持麦克风录音设备。");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const options = { mimeType: "audio/webm" };
      
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, options);
      } catch (e) {
        recorder = new MediaRecorder(stream);
      }

      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const ext = recorder.mimeType?.includes("webm") ? "webm" : "wav";
        const audioFile = new File([audioBlob], `voice_record_${Date.now()}.${ext}`, { type: audioBlob.type });
        processFiles([audioFile]);
        
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);
      
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((s) => s + 1);
      }, 1000);

    } catch (err: unknown) {
      console.error("Failed to start recording:", err);
      setDescribeError("麦克风启动失败，请检查浏览器是否已授权麦克风权限！");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  };

  const formatTimeSeconds = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };


  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const modelDropdownPanelRef = useRef<HTMLDivElement>(null);
  const toolDropdownRef = useRef<HTMLDivElement>(null);
  const thinkingDropdownRef = useRef<HTMLDivElement>(null);
  const designDropdownRef = useRef<HTMLDivElement>(null);
  const videoUploadDropdownRef = useRef<HTMLDivElement>(null);
  const geminiMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileUploadInputRef = useRef<HTMLInputElement>(null);
  const videoFileInputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    insertIfEmpty(text: string) {
      const ta = textareaRef.current;
      const current = ta ? ta.value : value;
      if (current.trim()) return;
      setValue(text);
      requestAnimationFrame(() => {
        if (!ta) return;
        ta.focus();
        ta.style.height = "auto";
        ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
      });
    },
    insertText(text: string) {
      const ta = textareaRef.current;
      if (!ta) {
        setValue((v) => v + (v ? " " : "") + text);
        return;
      }
      const start = ta.selectionStart ?? ta.value.length;
      const end = ta.selectionEnd ?? ta.value.length;
      const before = ta.value.slice(0, start);
      const after = ta.value.slice(end);
      const sep = before.length > 0 && !before.endsWith(" ") ? " " : "";
      const newVal = before + sep + text + after;
      setValue(newVal);
      requestAnimationFrame(() => {
        if (!ta) return;
        const pos = start + sep.length + text.length;
        ta.setSelectionRange(pos, pos);
        ta.focus();
        ta.style.height = "auto";
        ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
      });
    },
    addImages(files: File[]) {
      processImageFiles(files);
    },
    addFiles(files: File[]) {
      processFiles(files);
    },
  }));

function compressAndResizeImage(file: File, maxWidth = 1024, maxHeight = 1024, quality = 0.8): Promise<{ data: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Failed to get canvas 2D context"));
          return;
        }

        // Draw a solid white background (crucial for preserving transparent PNGs correctly)
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);

        // Draw the downscaled image
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to space-efficient lossy JPEG base64
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        const commaIndex = dataUrl.indexOf(",");
        const base64 = commaIndex !== -1 ? dataUrl.substring(commaIndex + 1) : dataUrl;

        resolve({
          data: base64,
          mimeType: "image/jpeg",
        });
      };
      img.onerror = (err) => reject(err);
      img.src = e.target?.result as string;
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

  const processImageFiles = useCallback(async (files: File[]) => {
    const imageFiles = files.filter((f) => f.type.startsWith("image/"));
    if (!imageFiles.length) return;
    try {
      const newImages = await Promise.all(
        imageFiles.map(async (file) => {
          const compressed = await compressAndResizeImage(file);
          return {
            data: compressed.data,
            mimeType: compressed.mimeType,
            previewUrl: URL.createObjectURL(file),
          };
        })
      );
      setAttachedImages((prev) => [...prev, ...newImages]);
    } catch (e) {
      console.error("Failed to process and compress image files:", e);
    }
  }, []);

  const removeImage = useCallback((index: number) => {
    setAttachedImages((prev) => {
      const next = [...prev];
      URL.revokeObjectURL(next[index].previewUrl);
      next.splice(index, 1);
      return next;
    });
  }, []);

  const clearImages = useCallback(() => {
    setAttachedImages((prev) => {
      prev.forEach((img) => URL.revokeObjectURL(img.previewUrl));
      return [];
    });
  }, []);

  const processFiles = useCallback((files: File[]) => {
    const newFiles = files.map((file) => ({
      file,
      name: file.name,
      size: file.size,
    }));
    setAttachedFiles((prev) => [...prev, ...newFiles]);
  }, []);

  const removeFile = useCallback((index: number) => {
    setAttachedFiles((prev) => {
      const next = [...prev];
      next.splice(index, 1);
      return next;
    });
  }, []);

  const formatBytes = useCallback((bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }, []);


  const handleDescribe = useCallback(async (index: number) => {
    const img = attachedImages[index];
    if (!img) return;

    const dynamicModel = modelList?.find(m => m.id === model?.modelId && m.provider === model?.provider);
    const supportsVision = (dynamicModel && dynamicModel.supportsVision) || (model ? isVisionModel(model.provider, model.modelId) : false);

    if (!supportsVision) {
      setDescribeError("该模型不是视觉模型，不支持识图功能。");
      return;
    }

    setDescribingIndices((prev) => ({ ...prev, [index]: true }));
    setDescribeError(null);
    try {
      const res = await fetch("/api/agent/describe-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: img.data,
          mimeType: img.mimeType,
          provider: model!.provider,
          modelId: model!.modelId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to describe image");
      }
      
      // Open the visual modal with the reverse-prompt instead of auto-injecting it silently
      setPromptModalText(data.description);
      setPromptModalOpen(true);
      setCopySuccess(false);
      setPromptTab("text");
      setPlaceholderValues({});
      setActivePreset(null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      console.error(err);
      let errMsg = err.message || String(err);
      if (
        errMsg.includes("No endpoints found that support image input") ||
        errMsg.includes("support image input") ||
        errMsg.includes("not support image") ||
        (errMsg.includes("404") && (errMsg.toLowerCase().includes("image") || errMsg.toLowerCase().includes("endpoint")))
      ) {
        errMsg = "该模型不是视觉模型，不支持识图功能。";
      }
      setDescribeError(errMsg);
    } finally {
      setDescribingIndices((prev) => ({ ...prev, [index]: false }));
    }
  }, [attachedImages, model, modelList]);

  const handleSend = useCallback(async () => {
    const msg = value.trim();
    if (!msg && !attachedImages.length && !attachedFiles.length) return;
    if (isStreaming || isUploading) return;

    if (attachedImages.length > 0) {
      const dynamicModel = modelList?.find(m => m.id === model?.modelId && m.provider === model?.provider);
      const supportsVision = (dynamicModel && dynamicModel.supportsVision) || (model ? isVisionModel(model.provider, model.modelId) : false);
      if (!supportsVision) {
        setDescribeError("该模型不是视觉模型，不支持识图功能。");
        return;
      }
    }

    let finalMsg = msg;
    if (attachedFiles.length > 0) {
      if (!cwd) {
        setDescribeError("无法获取当前工作区路径，文件上传失败。");
        return;
      }
      setIsUploading(true);
      setDescribeError(null);
      try {
        const uploaded = await Promise.all(
          attachedFiles.map(async (f) => {
            const destPath = joinFilePath(joinFilePath(cwd, "Temp"), f.name);
            const encoded = encodeFilePathForApi(destPath);
            const res = await fetch(`/api/files/${encoded}`, {
              method: "POST",
              body: f.file,
            });
            if (!res.ok) {
              const data = await res.json().catch(() => ({}));
              throw new Error(data.error || `上传文件 ${f.name} 失败`);
            }
            return f;
          })
        );
        const uploadedNotes = "\n\n<!-- PI_FILE_ATTACHMENTS_START -->\n📄 [已上传文件到工作区]\n" + uploaded.map(f => `- Temp/${f.name} (${formatBytes(f.size)})`).join("\n") + "\n<!-- PI_FILE_ATTACHMENTS_END -->";
        finalMsg = finalMsg ? `${finalMsg}${uploadedNotes}` : uploadedNotes.trim();
        setAttachedFiles([]);
      } catch (err: unknown) {
        console.error("Upload error:", err);
        const errMsg = err instanceof Error ? err.message : String(err);
        setDescribeError(errMsg || "上传文件过程中出现未知错误");
        setIsUploading(false);
        return;
      }
      setIsUploading(false);
    }

    const devModeDirectives: Record<string, string> = {
      direct: "[Directive] You are currently in DIRECT mode. Please answer queries and modify code directly. Avoid generating specs, creating task checklists (task.md), or enforcing strict workflow gates unless explicitly asked. Respond as quickly and concisely as possible. Do NOT output XML tags like '<tool_call>' or '<function>' to call tools; use your native function calling API.",
      guarded: "[Directive] You are currently in GUARDED mode. You should only use/invoke engineering skills (such as frontend-ui-engineering, doubt-driven-development, or planning) if the task is complex, non-trivial, or touches multiple core files. For simple edits or explanations, respond directly and briefly without planning overhead. Do NOT output XML tags like '<tool_call>' or '<function>' to call tools; use your native function calling API.",
      rigorous: "[Directive] You are currently in RIGOROUS mode. You MUST strictly follow the SWE workflow: write specification first (spec-driven-development), break down tasks into task.md (planning-and-task-breakdown), implement incrementally, and write automated tests (test-driven-development). Do not skip these quality gates. IMPORTANT: Do NOT output XML tags like '<tool_call>' or '<function>' to call tools; use your native function calling API.",
    };
    const directive = devModeDirectives[devMode];
    if (directive) {
      finalMsg = `${finalMsg}\n<!-- PI_HIDDEN_START -->\n${directive}\n<!-- PI_HIDDEN_END -->`;
    }

    onSend(finalMsg, attachedImages.length ? attachedImages : undefined);
    setValue("");
    clearImages();
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [value, attachedImages, attachedFiles, isStreaming, isUploading, onSend, clearImages, model, modelList, cwd, formatBytes, devMode]);

  const sendQueued = useCallback(async (mode: "steer" | "followup") => {
    const msg = value.trim();
    if (!msg && !attachedImages.length && !attachedFiles.length) return;
    if (isUploading) return;

    if (attachedImages.length > 0) {
      const dynamicModel = modelList?.find(m => m.id === model?.modelId && m.provider === model?.provider);
      const supportsVision = (dynamicModel && dynamicModel.supportsVision) || (model ? isVisionModel(model.provider, model.modelId) : false);
      if (!supportsVision) {
        setDescribeError("该模型不是视觉模型，不支持识图功能。");
        return;
      }
    }

    let finalMsg = msg;
    if (attachedFiles.length > 0) {
      if (!cwd) {
        setDescribeError("无法获取当前工作区路径，文件上传失败。");
        return;
      }
      setIsUploading(true);
      setDescribeError(null);
      try {
        const uploaded = await Promise.all(
          attachedFiles.map(async (f) => {
            const destPath = joinFilePath(joinFilePath(cwd, "Temp"), f.name);
            const encoded = encodeFilePathForApi(destPath);
            const res = await fetch(`/api/files/${encoded}`, {
              method: "POST",
              body: f.file,
            });
            if (!res.ok) {
              const data = await res.json().catch(() => ({}));
              throw new Error(data.error || `上传文件 ${f.name} 失败`);
            }
            return f;
          })
        );
        const uploadedNotes = "\n\n<!-- PI_FILE_ATTACHMENTS_START -->\n📄 [已上传文件到工作区]\n" + uploaded.map(f => `- Temp/${f.name} (${formatBytes(f.size)})`).join("\n") + "\n<!-- PI_FILE_ATTACHMENTS_END -->";
        finalMsg = finalMsg ? `${finalMsg}${uploadedNotes}` : uploadedNotes.trim();
        setAttachedFiles([]);
      } catch (err: unknown) {
        console.error("Upload error:", err);
        const errMsg = err instanceof Error ? err.message : String(err);
        setDescribeError(errMsg || "上传文件过程中出现未知错误");
        setIsUploading(false);
        return;
      }
      setIsUploading(false);
    }

    const devModeDirectives: Record<string, string> = {
      direct: "[Directive] You are currently in DIRECT mode. Please answer queries and modify code directly. Avoid generating specs, creating task checklists (task.md), or enforcing strict workflow gates unless explicitly asked. Respond as quickly and concisely as possible. Do NOT output XML tags like '<tool_call>' or '<function>' to call tools; use your native function calling API.",
      guarded: "[Directive] You are currently in GUARDED mode. You should only use/invoke engineering skills (such as frontend-ui-engineering, doubt-driven-development, or planning) if the task is complex, non-trivial, or touches multiple core files. For simple edits or explanations, respond directly and briefly without planning overhead. Do NOT output XML tags like '<tool_call>' or '<function>' to call tools; use your native function calling API.",
      rigorous: "[Directive] You are currently in RIGOROUS mode. You MUST strictly follow the SWE workflow: write specification first (spec-driven-development), break down tasks into task.md (planning-and-task-breakdown), implement incrementally, and write automated tests (test-driven-development). Do not skip these quality gates. IMPORTANT: Do NOT output XML tags like '<tool_call>' or '<function>' to call tools; use your native function calling API.",
    };
    const directive = devModeDirectives[devMode];
    if (directive) {
      finalMsg = `${finalMsg}\n<!-- PI_HIDDEN_START -->\n${directive}\n<!-- PI_HIDDEN_END -->`;
    }

    if (mode === "steer" && onSteer) {
      onSteer(finalMsg, attachedImages.length ? attachedImages : undefined);
    } else if (mode === "followup" && onFollowUp) {
      onFollowUp(finalMsg, attachedImages.length ? attachedImages : undefined);
    }
    setValue("");
    clearImages();
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }, [value, attachedImages, attachedFiles, onSteer, onFollowUp, clearImages, model, modelList, cwd, isUploading, formatBytes, devMode]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault();
        if (isStreaming && (onSteer || onFollowUp)) {
          // Default Enter sends as steer if available, else followup
          sendQueued(onSteer ? "steer" : "followup");
        } else {
          handleSend();
        }
      }
    },
    [isStreaming, onSteer, onFollowUp, sendQueued, handleSend]
  );

  const handleInput = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }, []);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData?.items ?? []);
    const imageItems = items.filter((item) => item.type.startsWith("image/"));
    if (!imageItems.length) return;
    e.preventDefault();
    const files = imageItems.map((item) => item.getAsFile()).filter((f): f is File => f !== null);
    processImageFiles(files);
  }, [processImageFiles]);



  // Build model options: prefer modelList (has provider info), fallback to modelNames
  const modelOptions: ModelOption[] = (() => {
    if (modelList && modelList.length > 0) {
      return modelList.map((m) => ({ provider: m.provider, modelId: m.id, name: m.name }));
    }
    return Object.entries(modelNames ?? {}).map(([modelId, name]) => ({
      provider: model?.provider ?? "unknown",
      modelId,
      name,
    }));
  })();

  // Group options by provider, preserving insertion order
  const modelsByProvider: { provider: string; options: ModelOption[] }[] = [];
  for (const opt of modelOptions) {
    const group = modelsByProvider.find((g) => g.provider === opt.provider);
    if (group) group.options.push(opt);
    else modelsByProvider.push({ provider: opt.provider, options: [opt] });
  }

  const currentName = model
    ? (modelOptions.find((o) => o.modelId === model.modelId && o.provider === model.provider)?.name ?? model.modelId)
    : modelOptions.length > 0 ? modelOptions[0].name : null;

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        modelDropdownPanelRef.current && !modelDropdownPanelRef.current.contains(e.target as Node)
      ) {
        setModelDropdownOpen(false);
      }
      if (toolDropdownRef.current && !toolDropdownRef.current.contains(e.target as Node)) {
        setToolDropdownOpen(false);
      }
      if (thinkingDropdownRef.current && !thinkingDropdownRef.current.contains(e.target as Node)) {
        setThinkingDropdownOpen(false);
      }
      if (designDropdownRef.current && !designDropdownRef.current.contains(e.target as Node)) {
        setDesignDropdownOpen(false);
      }
      if (videoUploadDropdownRef.current && !videoUploadDropdownRef.current.contains(e.target as Node)) {
        setVideoUploadDropdownOpen(false);
      }
      if (geminiMenuRef.current && !geminiMenuRef.current.contains(e.target as Node)) {
        setGeminiMenuOpen(false);
        setGeminiSubMenu('none');
      }
      if (pptPanelRef.current && !pptPanelRef.current.contains(e.target as Node)) {
        setPptPanelOpen(false);
      }
      if (presetDropdownRef.current && !presetDropdownRef.current.contains(e.target as Node)) {
        setPresetDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const loadWorkspaceFiles = useCallback(async (dirPath: string) => {
    if (!dirPath) return;
    setLoadingWorkspaceFiles(true);
    try {
      const encoded = encodeFilePathForApi(dirPath);
      const res = await fetch(`/api/files/${encoded}?type=list`);
      if (res.ok) {
        const data = await res.json() as { entries?: { name: string; isDir: boolean; size: number }[] };
        const list = (data.entries ?? []).map(e => ({
          name: e.name,
          fullPath: joinFilePath(dirPath, e.name),
          isDir: e.isDir,
          size: e.size
        }));
        list.sort((a, b) => {
          if (a.isDir && !b.isDir) return -1;
          if (!a.isDir && b.isDir) return 1;
          return a.name.localeCompare(b.name);
        });
        setWorkspaceFiles(list);
      }
    } catch (err) {
      console.error("Error loading workspace files:", err);
    } finally {
      setLoadingWorkspaceFiles(false);
    }
  }, []);

  useEffect(() => {
    if (geminiSubMenu === 'workspace_files' && workspacePath) {
      loadWorkspaceFiles(workspacePath);
    }
  }, [geminiSubMenu, workspacePath, loadWorkspaceFiles]);

  const handleAttachWorkspaceFile = async (name: string, fullPath: string, size: number) => {
    try {
      const encoded = encodeFilePathForApi(fullPath);
      const res = await fetch(`/api/files/${encoded}?type=read`);
      if (!res.ok) throw new Error("Failed to read file from workspace");
      const blob = await res.blob();
      const file = new File([blob], name);
      setAttachedFiles(prev => [...prev, { file, name, size }]);
      setGeminiMenuOpen(false);
      setGeminiSubMenu('none');
    } catch (err) {
      console.error("Error attaching workspace file:", err);
      setDescribeError("附加工作区文件失败");
    }
  };



  return (
    <div
      style={{
        flexShrink: 0,
        background: "transparent",
        padding: "0 16px 8px",
        paddingRight: 34, // 16px base + 18px for ChatMinimap alignment
      }}
    >
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: "none" }}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          processImageFiles(files);
          e.target.value = "";
        }}
      />
      <input
        ref={fileUploadInputRef}
        type="file"
        multiple
        style={{ display: "none" }}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          const videoFiles = files.filter(isVideoFile)
          const otherFiles = files.filter((f) => !isVideoFile(f))
          if (videoFiles.length > 0) {
            // Process first video through the script extraction pipeline
            const filePath = (videoFiles[0] as any).path || videoFiles[0].name;
            extractionSourceRef.current = { type: 'file', value: filePath };
            videoScript.process(videoFiles[0], getPolishModel());
          }
          if (otherFiles.length > 0) {
            processFiles(otherFiles);
          }
          e.target.value = "";
        }}
      />
      <div style={{ maxWidth: 820, margin: "0 auto" }}>
        {/* Retry banner */}
        {retryInfo && (
          <div style={{
            marginBottom: 8, padding: "5px 10px",
            background: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.25)",
            borderRadius: 6, fontSize: 12, color: "rgba(180,130,0,0.9)",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
            Retrying ({retryInfo.attempt}/{retryInfo.maxAttempts})…{retryInfo.errorMessage && <span style={{ opacity: 0.7, marginLeft: 4 }}>— {retryInfo.errorMessage}</span>}
          </div>
        )}
        {/* Image description error banner */}
        {describeError && (
          <div style={{
            marginBottom: 8, padding: "8px 12px",
            background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)",
            borderRadius: 8, fontSize: 12, color: "rgba(220,38,38,0.9)",
            display: "flex", alignItems: "center", gap: 6,
            position: "relative",
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span style={{ flex: 1 }}>{describeError}</span>
            <button
              onClick={() => setDescribeError(null)}
              style={{
                background: "none", border: "none", color: "rgba(220,38,38,0.6)",
                cursor: "pointer", display: "flex", alignItems: "center", padding: 2,
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        )}

        {/* Image previews */}
        {attachedImages.length > 0 && (
          <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
            <style>{`
              @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
            `}</style>
            {attachedImages.map((img, i) => {
              const isDescribing = !!describingIndices[i];
              return (
                <div key={i} style={{ position: "relative", flexShrink: 0 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.previewUrl}
                    alt=""
                    style={{
                      width: 56,
                      height: 56,
                      objectFit: "cover",
                      borderRadius: 6,
                      border: "1px solid var(--border)",
                      display: "block",
                      filter: isDescribing ? "brightness(0.4)" : "none",
                      transition: "filter 0.2s",
                    }}
                  />
                  {isDescribing ? (
                    <div style={{
                      position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: "rgba(0, 0, 0, 0.4)", borderRadius: 6,
                    }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" style={{ animation: "spin 1s linear infinite" }}>
                        <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.2)" />
                        <path d="M12 2a10 10 0 0 1 10 10" />
                      </svg>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => handleDescribe(i)}
                        title="🪄 反推提示词"
                        style={{
                          position: "absolute", bottom: -4, left: -4,
                          width: 20, height: 20, borderRadius: "50%",
                          background: "var(--bg-panel)", border: "1px solid var(--border)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          cursor: "pointer", padding: 0, color: "var(--accent)",
                          boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                          fontSize: 11,
                          transition: "transform 0.15s, background-color 0.15s",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = "scale(1.15)";
                          e.currentTarget.style.background = "var(--bg-hover)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = "scale(1)";
                          e.currentTarget.style.background = "var(--bg-panel)";
                        }}
                      >
                        🪄
                      </button>
                      <button
                        onClick={() => removeImage(i)}
                        style={{
                          position: "absolute", top: -4, right: -4,
                          width: 16, height: 16, borderRadius: "50%",
                          background: "var(--bg-panel)", border: "1px solid var(--border)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          cursor: "pointer", padding: 0, color: "var(--text-muted)",
                        }}
                      >
                        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                          <line x1="1" y1="1" x2="7" y2="7" /><line x1="7" y1="1" x2="1" y2="7" />
                        </svg>
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Recording status banner */}
        {isRecording && (
          <div style={{
            marginBottom: 8, padding: "8px 12px",
            background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)",
            borderRadius: 8, fontSize: 12, color: "#ef4444",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <style>{`
              @keyframes recordPulse {
                0% { opacity: 0.4; }
                50% { opacity: 1; }
                100% { opacity: 0.4; }
              }
            `}</style>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444", display: "inline-block", animation: "recordPulse 1s infinite" }} />
            <span style={{ fontWeight: 600 }}>麦克风录制中:</span>
            <span style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>{formatTimeSeconds(recordingSeconds)}</span>
            <button
              onClick={stopRecording}
              style={{
                marginLeft: "auto", padding: "2px 8px", background: "#ef4444", border: "none",
                borderRadius: 4, color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer",
                boxShadow: "0 1px 3px rgba(239,68,68,0.3)",
              }}
            >
              停止录音并添加至附件
            </button>
          </div>
        )}

        {/* Upload status banner */}
        {isUploading && (
          <div style={{
            marginBottom: 8, padding: "5px 10px",
            background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.25)",
            borderRadius: 6, fontSize: 12, color: "var(--accent)",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" style={{ animation: "spin 1s linear infinite" }}>
              <circle cx="12" cy="12" r="10" stroke="rgba(59,130,246,0.2)" />
              <path d="M12 2a10 10 0 0 1 10 10" />
            </svg>
            Uploading {attachedFiles.length} file(s) to workspace…
          </div>
        )}

        {/* Video script extraction progress */}
        {(videoScript.state === 'extracting' || videoScript.state === 'transcribing' || videoScript.state === 'polishing') && (
          <div style={{
            marginBottom: 8, padding: '6px 10px',
            background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)',
            borderRadius: 6, fontSize: 12, color: '#10b981',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" style={{ animation: 'spin 1s linear infinite' }}>
                <circle cx="12" cy="12" r="10" stroke="rgba(16,185,129,0.2)" />
                <path d="M12 2a10 10 0 0 1 10 10" />
              </svg>
              <span>{videoScript.statusText}</span>
            </div>
            <div style={{
              height: 3, borderRadius: 2, background: 'rgba(16,185,129,0.15)', overflow: 'hidden',
            }}>
              <div style={{
                width: `${Math.round(videoScript.progress * 100)}%`,
                height: '100%', borderRadius: 2, background: '#10b981',
                transition: 'width 0.3s ease',
              }} />
            </div>
          </div>
        )}
        {videoScript.state === 'error' && (
          <div style={{
            marginBottom: 8, padding: '5px 10px',
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
            borderRadius: 6, fontSize: 12, color: '#ef4444',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {videoScript.statusText}
            <button onClick={videoScript.reset} style={{
              marginLeft: 'auto', padding: '1px 6px', background: 'none', border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 4, color: '#ef4444', fontSize: 10, cursor: 'pointer',
            }}>
              Dismiss
            </button>
          </div>
        )}

        {/* File previews */}
        {attachedFiles.length > 0 && (
          <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
            {attachedFiles.map((fileObj, i) => (
              <div
                key={i}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "5px 10px",
                  background: "var(--bg-panel)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                  color: "var(--text)",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                  position: "relative",
                  transition: "background 0.15s",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                <span style={{ maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={fileObj.name}>
                  {fileObj.name}
                </span>
                <span style={{ fontSize: 10, color: "var(--text-dim)", flexShrink: 0 }}>
                  {formatBytes(fileObj.size)}
                </span>
                <button
                  onClick={() => removeFile(i)}
                  disabled={isUploading}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    background: "rgba(255,255,255,0.05)",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: isUploading ? "not-allowed" : "pointer",
                    padding: 0,
                    marginLeft: 2,
                    fontSize: 10,
                  }}
                  onMouseEnter={(e) => {
                    if (isUploading) return;
                    e.currentTarget.style.background = "var(--bg-hover)";
                    e.currentTarget.style.color = "#ef4444";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                    e.currentTarget.style.color = "var(--text-muted)";
                  }}
                >
                  <svg width="6" height="6" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <line x1="1" y1="1" x2="7" y2="7" /><line x1="7" y1="1" x2="1" y2="7" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}


        {/* Adaptive Voice Workspace & Audio Tag Assistant */}
        <TtsPanel
          model={model}
          attachedFiles={attachedFiles}
          voiceConsoleOpen={voiceConsoleOpen}
          setVoiceConsoleOpen={setVoiceConsoleOpen}
          insertAudioTag={insertAudioTag}
          cwd={cwd}
        />

        {/* Main input */}
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            background: "var(--bg)",
            border: `1px solid ${isStreaming && (onSteer || onFollowUp)
              ? "rgba(234,179,8,0.4)"
              : "color-mix(in srgb, var(--border) 70%, transparent)"}`,
            borderRadius: 14,
            padding: "10px 10px 10px 14px",
            boxShadow: "0 1px 2px rgba(15,23,42,0.04), 0 8px 24px -12px rgba(15,23,42,0.10)",
            transition: "border-color 0.15s, background 0.15s, box-shadow 0.15s",
          } as React.CSSProperties}
        >
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            onPaste={handlePaste}
            placeholder={
              isStreaming && (onSteer || onFollowUp)
                ? "Steer 立即注入 / Follow-up 排队…"
                : isStreaming ? "Agent is running…"
                : "Message…"
            }
            rows={1}
            style={{
              flex: 1,
              background: "none",
              border: "none",
              outline: "none",
              resize: "none",
              color: "var(--text)",
              fontSize: 14,
              lineHeight: 1.6,
              fontFamily: "inherit",
              minHeight: 24,
              maxHeight: 200,
              overflow: "auto",
            }}
          />

          {isStreaming ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, alignSelf: "flex-end" }}>
              {onSteer && (
                <button
                  onClick={() => sendQueued("steer")}
                  disabled={!value.trim() && !attachedImages.length && !attachedFiles.length}
                  title="打断 Agent 当前运行，立即注入消息"
                  style={{
                    display: "flex", alignItems: "center", gap: 5,
                    padding: "7px 12px",
                    background: (value.trim() || attachedImages.length || attachedFiles.length) ? "rgba(234,179,8,0.12)" : "none",
                    border: "1px solid rgba(234,179,8,0.35)",
                    borderRadius: 8,
                    color: (value.trim() || attachedImages.length || attachedFiles.length) ? "rgba(180,130,0,1)" : "var(--text-dim)",
                    cursor: (value.trim() || attachedImages.length || attachedFiles.length) ? "pointer" : "not-allowed",
                    fontSize: 13, fontWeight: 600, letterSpacing: "-0.01em",
                    transition: "background 0.12s",
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 1 L9 5 L5 9" /><line x1="1" y1="5" x2="9" y2="5" />
                  </svg>
                  Steer
                </button>
              )}
              {onFollowUp && (
                <button
                  onClick={() => sendQueued("followup")}
                  disabled={!value.trim() && !attachedImages.length && !attachedFiles.length}
                  title="在 Agent 完成后排队发送"
                  style={{
                    display: "flex", alignItems: "center", gap: 5,
                    padding: "7px 12px",
                    background: (value.trim() || attachedImages.length || attachedFiles.length) ? "rgba(129,140,248,0.12)" : "none",
                    border: "1px solid rgba(129,140,248,0.35)",
                    borderRadius: 8,
                    color: (value.trim() || attachedImages.length || attachedFiles.length) ? "rgba(99,102,241,1)" : "var(--text-dim)",
                    cursor: (value.trim() || attachedImages.length || attachedFiles.length) ? "pointer" : "not-allowed",
                    fontSize: 13, fontWeight: 600, letterSpacing: "-0.01em",
                    transition: "background 0.12s",
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="1" x2="5" y2="6" /><polyline points="2.5 3.5 5 1 7.5 3.5" />
                    <line x1="2" y1="9" x2="8" y2="9" />
                  </svg>
                  Follow-up
                </button>
              )}
            </div>
          ) : (
            <>
            <button
              onClick={handleSend}
              disabled={!value.trim() && !attachedImages.length && !attachedFiles.length}
              style={{
                flexShrink: 0,
                alignSelf: "flex-end",
                display: "flex", alignItems: "center", gap: 6,
                padding: "7px 14px",
                background: (value.trim() || attachedImages.length || attachedFiles.length) ? "var(--accent)" : "var(--bg-panel)",
                border: "none",
                borderRadius: 8,
                color: (value.trim() || attachedImages.length || attachedFiles.length) ? "#fff" : "var(--text-dim)",
                cursor: (value.trim() || attachedImages.length || attachedFiles.length) ? "pointer" : "not-allowed",
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: "-0.01em",
                boxShadow: (value.trim() || attachedImages.length || attachedFiles.length) ? "0 1px 3px rgba(37,99,235,0.25)" : "none",
                transition: "background 0.15s, box-shadow 0.15s",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="2" y1="7" x2="11" y2="7" />
                <polyline points="7.5 3 12 7 7.5 11" />
              </svg>
              Send
            </button>
            </>
          )}
        </div>

        {/* Bottom bar: left | center (context) | right */}
        <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>

          {/* LEFT: attach + model selector (idle) or steer/followup toggle (streaming) */}
          <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: 2 }}>
            {/* Gemini-Style Unified menu trigger button */}
            <div ref={geminiMenuRef} style={{ position: "relative" }}>
              <button
                onClick={() => {
                  if (isStreaming) return;
                  setGeminiMenuOpen(open => !open);
                  setGeminiSubMenu('none');
                }}
                disabled={isStreaming}
                title="添加附件或使用工具"
                style={{
                  flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                  width: 32, height: 32, padding: 0,
                  background: geminiMenuOpen ? "var(--bg-hover)" : "none", border: "none",
                  borderRadius: "50%",
                  color: (attachedImages.length || attachedFiles.length) ? "var(--accent)" : "var(--text-muted)",
                  cursor: isStreaming ? "not-allowed" : "pointer",
                  opacity: isStreaming ? 0.5 : 1,
                  transition: "background 0.2s, transform 0.2s, color 0.2s",
                  transform: geminiMenuOpen ? "rotate(45deg)" : "none",
                }}
                onMouseEnter={(e) => {
                  if (isStreaming) return;
                  e.currentTarget.style.background = "var(--bg-hover)";
                  e.currentTarget.style.color = "var(--text)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = geminiMenuOpen ? "var(--bg-hover)" : "none";
                  e.currentTarget.style.color = (attachedImages.length || attachedFiles.length) ? "var(--accent)" : "var(--text-muted)";
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>

              {geminiMenuOpen && (() => {
                const menuItemStyle: React.CSSProperties = {
                  display: "flex",
                  alignItems: "center",
                  width: "100%",
                  padding: "8px 10px",
                  background: "none",
                  border: "none",
                  borderRadius: 12,
                  color: "var(--text)",
                  cursor: "pointer",
                  fontSize: 12.5,
                  textAlign: "left",
                  transition: "background 0.12s, transform 0.08s",
                  gap: 10
                };

                const menuItemIconStyle: React.CSSProperties = {
                  display: "flex",
                  alignItems: "center",
                  color: "var(--text-muted)",
                  fontSize: 14,
                  width: 16,
                  justifyContent: "center"
                };

                const menuItemArrowStyle: React.CSSProperties = {
                  fontSize: 14,
                  color: "var(--text-dim)",
                  fontWeight: 600
                };

                const workspaceItemStyle: React.CSSProperties = {
                  display: "flex",
                  alignItems: "center",
                  width: "100%",
                  padding: "6px 8px",
                  background: "none",
                  border: "none",
                  borderRadius: 8,
                  color: "var(--text)",
                  cursor: "pointer",
                  fontSize: 12,
                  gap: 8,
                  transition: "background 0.12s"
                };

                const menuItemHover = (e: React.MouseEvent<HTMLButtonElement>) => {
                  e.currentTarget.style.background = "var(--bg-hover)";
                };

                const menuItemLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
                  e.currentTarget.style.background = "none";
                };

                return (
                  <div style={{
                    position: "absolute", bottom: "calc(100% + 8px)", left: 0,
                    zIndex: 400,
                    background: "color-mix(in srgb, var(--bg-panel) 92%, transparent)",
                    backdropFilter: "blur(16px)",
                    WebkitBackdropFilter: "blur(16px)",
                    border: "1px solid var(--border)",
                    borderRadius: 20,
                    boxShadow: "0 12px 32px rgba(0, 0, 0, 0.25)",
                    padding: 8,
                    width: 260,
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                    animation: "drop-zone-in 0.18s cubic-bezier(0.16, 1, 0.3, 1) forwards",
                  }}>
                    {geminiSubMenu === 'none' && (
                      <>

                        {/* Items */}
                        <button
                          onClick={() => { setGeminiMenuOpen(false); fileUploadInputRef.current?.click(); }}
                          style={menuItemStyle}
                          onMouseEnter={menuItemHover}
                          onMouseLeave={menuItemLeave}
                        >
                          <span style={menuItemIconStyle}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                            </svg>
                          </span>
                          <span style={{ flex: 1 }}>上传文件</span>
                        </button>

                        <button
                          onClick={() => { setGeminiMenuOpen(false); fileInputRef.current?.click(); }}
                          style={menuItemStyle}
                          onMouseEnter={menuItemHover}
                          onMouseLeave={menuItemLeave}
                        >
                          <span style={menuItemIconStyle}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                              <circle cx="8.5" cy="8.5" r="1.5" />
                              <polyline points="21 15 16 10 5 21" />
                            </svg>
                          </span>
                          <span style={{ flex: 1 }}>上传图片</span>
                        </button>

                        <button
                          onClick={() => { setGeminiSubMenu('workspace_files'); setWorkspacePath(cwd || ''); }}
                          style={menuItemStyle}
                          onMouseEnter={menuItemHover}
                          onMouseLeave={menuItemLeave}
                        >
                          <span style={menuItemIconStyle}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                            </svg>
                          </span>
                          <span style={{ flex: 1 }}>从当前工作区添加</span>
                        </button>

                        <button
                          onClick={() => setGeminiSubMenu('upload_options')}
                          style={menuItemStyle}
                          onMouseEnter={menuItemHover}
                          onMouseLeave={menuItemLeave}
                        >
                          <span style={menuItemIconStyle}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" />
                            </svg>
                          </span>
                          <span style={{ flex: 1 }}>更多上传选项</span>
                          <span style={menuItemArrowStyle}>›</span>
                        </button>

                        <div style={{ height: 1, background: "var(--border)", margin: "4px 8px" }} />

                        <button
                          onClick={() => {
                            setGeminiMenuOpen(false);
                            const prefix = "帮我生成一张图片：";
                            setValue(prev => prev.startsWith(prefix) ? prev : `${prefix}${prev}`);
                            setTimeout(() => textareaRef.current?.focus(), 50);
                          }}
                          style={menuItemStyle}
                          onMouseEnter={menuItemHover}
                          onMouseLeave={menuItemLeave}
                        >
                          <span style={menuItemIconStyle}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 14.7255 3.09032 17.1962 4.85857 19" />
                              <circle cx="7.5" cy="10.5" r="1" fill="currentColor" />
                              <circle cx="11.5" cy="7.5" r="1" fill="currentColor" />
                              <circle cx="16.5" cy="9.5" r="1" fill="currentColor" />
                            </svg>
                          </span>
                          <span style={{ flex: 1 }}>制作图片</span>
                        </button>

                        <button
                          onClick={() => {
                            setGeminiMenuOpen(false);
                            onOpenDeepResearch?.();
                          }}
                          style={menuItemStyle}
                          onMouseEnter={menuItemHover}
                          onMouseLeave={menuItemLeave}
                        >
                          <span style={menuItemIconStyle}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="10" />
                              <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
                            </svg>
                          </span>
                          <span style={{ flex: 1 }}>Deep Research</span>
                        </button>

                        <button
                          onClick={() => setGeminiSubMenu('dev_modes')}
                          style={menuItemStyle}
                          onMouseEnter={menuItemHover}
                          onMouseLeave={menuItemLeave}
                        >
                          <span style={menuItemIconStyle}>🛠️</span>
                          <span style={{ flex: 1 }}>开发模式规范: {{
                            direct: "⚡ 极速",
                            guarded: "🛡️ 守护",
                            rigorous: "🎯 严谨",
                          }[devMode]}</span>
                          <span style={menuItemArrowStyle}>›</span>
                        </button>

                        <button
                          onClick={() => setGeminiSubMenu('tools')}
                          style={menuItemStyle}
                          onMouseEnter={menuItemHover}
                          onMouseLeave={menuItemLeave}
                        >
                          <span style={menuItemIconStyle}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="3" />
                              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                            </svg>
                          </span>
                          <span style={{ flex: 1 }}>更多工具</span>
                          <span style={menuItemArrowStyle}>›</span>
                        </button>
                      </>
                    )}

                    {geminiSubMenu === 'upload_options' && (
                      <>
                        {/* Header */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px 8px 8px', borderBottom: '1px solid var(--border)', marginBottom: 4 }}>
                          <button onClick={() => setGeminiSubMenu('none')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', padding: 0 }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
                            </svg>
                          </button>
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>更多上传选项</span>
                        </div>

                        <button
                          onClick={() => { setGeminiMenuOpen(false); setGeminiSubMenu('none'); videoFileInputRef.current?.click(); }}
                          style={menuItemStyle}
                          onMouseEnter={menuItemHover}
                          onMouseLeave={menuItemLeave}
                        >
                          <span style={menuItemIconStyle}>🎥</span>
                          <span style={{ flex: 1 }}>上传本地视频文件-提取方案</span>
                        </button>

                        <div style={{ height: 1, background: "var(--border)", margin: "4px 8px" }} />

                        {/* Video Link Input Option */}
                        <div style={{ padding: "6px 8px", display: "flex", flexDirection: "column", gap: 6 }}>
                          <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>
                            粘贴视频链接 (B站/抖音/小红书/YouTube):
                          </div>
                          <div style={{ display: "flex", gap: 6 }}>
                            <input
                              type="text"
                              value={videoLinkUrl}
                              onChange={(e) => setVideoLinkUrl(e.target.value)}
                              placeholder="粘贴链接并回车..."
                              style={{
                                flex: 1, padding: "5px 8px", borderRadius: 8, fontSize: 12,
                                border: "1px solid var(--border)", background: "var(--bg)",
                                color: "var(--text)", outline: "none",
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && videoLinkUrl.trim()) {
                                  extractionSourceRef.current = { type: 'link', value: videoLinkUrl.trim() };
                                  videoScript.processLink(videoLinkUrl.trim(), getPolishModel());
                                  setVideoLinkUrl("");
                                  setGeminiMenuOpen(false);
                                  setGeminiSubMenu('none');
                                }
                              }}
                            />
                            <button
                              onClick={() => {
                                if (videoLinkUrl.trim()) {
                                  extractionSourceRef.current = { type: 'link', value: videoLinkUrl.trim() };
                                  videoScript.processLink(videoLinkUrl.trim(), getPolishModel());
                                  setVideoLinkUrl("");
                                  setGeminiMenuOpen(false);
                                  setGeminiSubMenu('none');
                                }
                              }}
                              disabled={!videoLinkUrl.trim() || videoScript.state === 'extracting' || videoScript.state === 'transcribing' || videoScript.state === 'polishing'}
                              style={{
                                padding: "5px 10px", borderRadius: 8, fontSize: 11, fontWeight: 600,
                                border: "none", background: videoLinkUrl.trim() ? "var(--accent)" : "var(--border)",
                                color: videoLinkUrl.trim() ? "#fff" : "var(--text-dim)",
                                cursor: videoLinkUrl.trim() ? "pointer" : "not-allowed",
                              }}
                            >
                              提取
                            </button>
                          </div>
                        </div>
                      </>
                    )}

                    {geminiSubMenu === 'tools' && (
                      <>
                        {/* Header */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px 8px 8px', borderBottom: '1px solid var(--border)', marginBottom: 4 }}>
                          <button onClick={() => setGeminiSubMenu('none')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', padding: 0 }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
                            </svg>
                          </button>
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>更多工具</span>
                        </div>

                        {isTts && (
                          <>
                            <button
                              onClick={() => { setGeminiMenuOpen(false); setGeminiSubMenu('none'); setVoiceConsoleOpen(v => !v); }}
                              style={menuItemStyle}
                              onMouseEnter={menuItemHover}
                              onMouseLeave={menuItemLeave}
                            >
                              <span style={menuItemIconStyle}>🎙️</span>
                              <span style={{ flex: 1 }}>语音工坊设定</span>
                            </button>

                            {(() => {
                              const modelIdStr = model?.modelId || "";
                              const isVoiceClone = isVoiceCloneModel(model?.provider, modelIdStr);
                              if (!isVoiceClone) return null;
                              return (
                                <button
                                  onClick={() => { setGeminiMenuOpen(false); setGeminiSubMenu('none'); if (isRecording) stopRecording(); else startRecording(); }}
                                  style={menuItemStyle}
                                  onMouseEnter={menuItemHover}
                                  onMouseLeave={menuItemLeave}
                                >
                                  <span style={menuItemIconStyle}>🎤</span>
                                  <span style={{ flex: 1 }}>{isRecording ? "停止录音" : "麦克风录音 (声音克隆)"}</span>
                                </button>
                              );
                            })()}
                          </>
                        )}

                        <button
                          onClick={() => { setGeminiMenuOpen(false); setGeminiSubMenu('none'); onOpenCookieConfig?.(); }}
                          style={menuItemStyle}
                          onMouseEnter={menuItemHover}
                          onMouseLeave={menuItemLeave}
                        >
                          <span style={menuItemIconStyle}>⚙️</span>
                          <span style={{ flex: 1 }}>B站 Cookie 配置</span>
                        </button>
                      </>
                    )}

                    {geminiSubMenu === 'dev_modes' && (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px 8px 8px', borderBottom: '1px solid var(--border)', marginBottom: 4 }}>
                          <button
                            onClick={() => setGeminiSubMenu('none')}
                            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', padding: 0 }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
                            </svg>
                          </button>
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>切换开发规范模式</span>
                        </div>
                        {([
                          { id: 'direct', label: '⚡ 极速模式 (Direct)', desc: '不启用工程规范，快速问答和单点修改。' },
                          { id: 'guarded', label: '🛡️ 守护模式 (Guarded)', desc: '日常推荐。仅在复杂/多文件修改时激活规范。' },
                          { id: 'rigorous', label: '🎯 严谨模式 (Rigorous)', desc: '强制执行 TDD 流程与任务分解，严防疏漏。' },
                        ] as const).map((m) => (
                          <button
                            key={m.id}
                            onClick={() => {
                              setDevMode(m.id);
                              if (sessionId) {
                                localStorage.setItem(`mimo_dev_mode_${sessionId}`, m.id);
                              } else {
                                localStorage.setItem("mimo_dev_mode_temp", m.id);
                              }
                              setGeminiMenuOpen(false);
                              setGeminiSubMenu('none');
                            }}
                            style={{
                              ...menuItemStyle,
                              background: devMode === m.id ? "var(--bg-selected)" : "none",
                              flexDirection: "column",
                              alignItems: "flex-start",
                              gap: 2,
                              padding: "8px 12px",
                            }}
                            onMouseEnter={menuItemHover}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = devMode === m.id ? "var(--bg-selected)" : "none";
                            }}
                          >
                            <span style={{ fontSize: 12.5, fontWeight: devMode === m.id ? 600 : 500, color: devMode === m.id ? "var(--accent)" : "var(--text)" }}>
                              {m.label}
                            </span>
                            <span style={{ fontSize: 10.5, color: "var(--text-muted)", lineHeight: 1.3 }}>
                              {m.desc}
                            </span>
                          </button>
                        ))}
                      </>
                    )}

                    {geminiSubMenu === 'workspace_files' && (
                      <>
                        {/* Header */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px 8px 8px', borderBottom: '1px solid var(--border)', marginBottom: 4 }}>
                          <button onClick={() => { setGeminiSubMenu('none'); setWorkspaceSearchQuery(''); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', padding: 0 }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
                            </svg>
                          </button>
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                            工作区: {workspacePath.replace(cwd || '', '') || '/'}
                          </span>
                        </div>

                        {/* Search box */}
                        <div style={{ padding: "0 4px 6px 4px" }}>
                          <input
                            type="text"
                            value={workspaceSearchQuery}
                            onChange={(e) => setWorkspaceSearchQuery(e.target.value)}
                            placeholder="搜索项目文件..."
                            style={{
                              width: "100%", padding: "5px 8px", borderRadius: 8, fontSize: 12,
                              border: "1px solid var(--border)", background: "var(--bg)",
                              color: "var(--text)", outline: "none"
                            }}
                          />
                        </div>

                        {/* Files list */}
                        <div style={{ maxHeight: 180, overflowY: "auto", display: "flex", flexDirection: "column", gap: 1, padding: "0 2px" }}>
                          {loadingWorkspaceFiles ? (
                            <div style={{ fontSize: 11, color: "var(--text-dim)", padding: "12px", textAlign: "center" }}>
                              加载中...
                            </div>
                          ) : (
                            <>
                              {workspacePath !== cwd && (
                                <button
                                  onClick={() => {
                                    const parts = workspacePath.split(/[/\\]/);
                                    parts.pop();
                                    const parent = parts.join('/');
                                    if (parent.startsWith(cwd || '')) {
                                      setWorkspacePath(parent);
                                    }
                                  }}
                                  style={workspaceItemStyle}
                                  onMouseEnter={menuItemHover}
                                  onMouseLeave={menuItemLeave}
                                >
                                  <span>📁</span>
                                  <span style={{ fontWeight: 600 }}>.. (上一级)</span>
                                </button>
                              )}

                              {workspaceFiles.filter(f => f.name.toLowerCase().includes(workspaceSearchQuery.toLowerCase())).map((f) => (
                                <button
                                  key={f.fullPath}
                                  onClick={() => {
                                    if (f.isDir) {
                                      setWorkspacePath(f.fullPath);
                                      setWorkspaceSearchQuery('');
                                    } else {
                                      handleAttachWorkspaceFile(f.name, f.fullPath, f.size);
                                    }
                                  }}
                                  style={workspaceItemStyle}
                                  onMouseEnter={menuItemHover}
                                  onMouseLeave={menuItemLeave}
                                >
                                  <span>{f.isDir ? '📁' : '📄'}</span>
                                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>
                                    {f.name}
                                  </span>
                                  {!f.isDir && (
                                    <span style={{ fontSize: 9, color: "var(--text-dim)", flexShrink: 0 }}>
                                      {formatBytes(f.size)}
                                    </span>
                                  )}
                                </button>
                              ))}
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Hidden Video Input */}
            <input
              ref={videoFileInputRef}
              type="file"
              accept="video/*"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const filePath = (file as any).path || file.name;
                  extractionSourceRef.current = { type: 'file', value: filePath };
                  videoScript.process(file, getPolishModel());
                }
                e.target.value = "";
              }}
            />
            {/* Model selector — visible always, disabled during streaming */}
            {modelOptions.length > 0 && currentName && onModelChange && (
                <div ref={dropdownRef} style={{ position: "relative" }}>
                  <button
                    onClick={(e) => {
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      setModelDropdownRect({ top: rect.top, left: rect.left, width: rect.width });
                      setModelDropdownOpen((v) => !v);
                    }}
                    disabled={isStreaming}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      padding: "8px 12px",
                      height: 32,
                      maxWidth: 220, overflow: "hidden",
                      background: modelDropdownOpen ? "var(--bg-hover)" : "none",
                      border: "none",
                      borderRadius: 9,
                      color: "var(--text-muted)",
                      cursor: isStreaming ? "not-allowed" : "pointer",
                      fontSize: 12,
                      opacity: isStreaming ? 0.5 : 1,
                      transition: "background 0.12s, color 0.12s",
                    }}
                    onMouseEnter={(e) => {
                      if (isStreaming) return;
                      e.currentTarget.style.background = "var(--bg-hover)";
                      e.currentTarget.style.color = "var(--text)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = modelDropdownOpen ? "var(--bg-hover)" : "none";
                      e.currentTarget.style.color = "var(--text-muted)";
                    }}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="4" y="4" width="16" height="16" rx="2" />
                      <rect x="9" y="9" width="6" height="6" />
                      <line x1="9" y1="1" x2="9" y2="4" /><line x1="15" y1="1" x2="15" y2="4" />
                      <line x1="9" y1="20" x2="9" y2="23" /><line x1="15" y1="20" x2="15" y2="23" />
                      <line x1="20" y1="9" x2="23" y2="9" /><line x1="20" y1="14" x2="23" y2="14" />
                      <line x1="1" y1="9" x2="4" y2="9" /><line x1="1" y1="14" x2="4" y2="14" />
                    </svg>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{currentName}</span>
                  </button>
                  {modelDropdownOpen && modelDropdownRect && (() => {
                    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
                    const bottom = viewportHeight - modelDropdownRect.top + 6;
                    const maxH = Math.max(120, Math.min(modelDropdownRect.top - 8, viewportHeight * 0.6));
                    return (
                    <div ref={modelDropdownPanelRef} style={{
                      position: "fixed",
                      bottom, left: modelDropdownRect.left,
                      zIndex: 500, background: "var(--bg)", border: "1px solid var(--border)",
                      borderRadius: 8, boxShadow: "0 -4px 16px rgba(0,0,0,0.10)",
                      overflow: "hidden", width: "max-content", minWidth: modelDropdownRect.width, maxHeight: maxH, overflowY: "auto",
                    }}>
                      {modelsByProvider.map((group, gi) => (
                        <div key={group.provider}>
                          {(modelsByProvider.length > 1) && (
                            <div style={{
                              padding: "6px 12px 4px",
                              fontSize: 10, fontWeight: 600, color: "var(--text-dim)",
                              textTransform: "uppercase", letterSpacing: "0.07em",
                              borderTop: gi > 0 ? "1px solid var(--border)" : "none",
                            }}>
                              {group.provider}
                            </div>
                          )}
                          {group.options.map((opt) => {
                            const isActive = opt.modelId === model?.modelId && opt.provider === model?.provider;
                            return (
                              <button
                                key={`${opt.provider}:${opt.modelId}`}
                                onClick={() => { setModelDropdownOpen(false); if (!isActive) onModelChange(opt.provider, opt.modelId); }}
                                style={{
                                  display: "flex", alignItems: "center", gap: 8,
                                  width: "100%", padding: "7px 12px",
                                  background: isActive ? "var(--bg-selected)" : "none",
                                  border: "none",
                                  color: isActive ? "var(--text)" : "var(--text-muted)",
                                  cursor: "pointer", fontSize: 12, textAlign: "left",
                                  fontWeight: isActive ? 600 : 400,
                                  whiteSpace: "nowrap",
                                }}
                                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "var(--bg-hover)"; }}
                                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "none"; }}
                              >
                                {isActive
                                  ? <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="1.5 5 4 7.5 8.5 2.5" /></svg>
                                  : <span style={{ width: 10, flexShrink: 0 }} />}
                                {opt.name}
                              </button>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                    );
                  })()}
                </div>
            )}
            {/* Design system selector */}
            {designSystemList && designSystemList.length > 0 && onDesignSystemChange && (
                <div ref={designDropdownRef} style={{ position: "relative" }}>
                  <button
                    onClick={(e) => {
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      setDesignDropdownRect({ top: rect.top, left: rect.left, width: rect.width });
                      setDesignDropdownOpen((v) => !v);
                    }}
                    disabled={isStreaming}
                    title="选择设计系统"
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      padding: "8px 12px",
                      height: 32,
                      maxWidth: 200, overflow: "hidden",
                      background: designDropdownOpen ? "var(--bg-hover)" : "none",
                      border: "none",
                      borderRadius: 9,
                      color: "var(--text-muted)",
                      cursor: isStreaming ? "not-allowed" : "pointer",
                      fontSize: 12,
                      opacity: isStreaming ? 0.5 : 1,
                      transition: "background 0.12s, color 0.12s",
                    }}
                    onMouseEnter={(e) => {
                      if (isStreaming) return;
                      e.currentTarget.style.background = "var(--bg-hover)";
                      e.currentTarget.style.color = "var(--text)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = designDropdownOpen ? "var(--bg-hover)" : "none";
                      e.currentTarget.style.color = "var(--text-muted)";
                    }}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="13.5" cy="6.5" r="2.5" />
                      <circle cx="17.5" cy="15.5" r="2.5" />
                      <circle cx="8.5" cy="15.5" r="2.5" />
                      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
                    </svg>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                      {designSystem ? designSystemList.find(d => d.id === designSystem)?.name ?? designSystem : "Design"}
                    </span>
                  </button>
                  {designDropdownOpen && designDropdownRect && (() => {
                    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
                    const bottom = viewportHeight - designDropdownRect.top + 6;
                    const maxH = Math.max(120, Math.min(designDropdownRect.top - 8, viewportHeight * 0.6));
                    const grouped = designSystemList.reduce<Record<string, typeof designSystemList>>((acc, d) => {
                      (acc[d.category] ||= []).push(d);
                      return acc;
                    }, {});
                    return (
                    <>
                    <div style={{
                      position: "fixed",
                      bottom, left: designDropdownRect.left,
                      zIndex: 500, background: "var(--bg)", border: "1px solid var(--border)",
                      borderRadius: 8, boxShadow: "0 -4px 16px rgba(0,0,0,0.10)",
                      overflow: "hidden", width: "max-content", minWidth: designDropdownRect.width, maxHeight: maxH, overflowY: "auto",
                    }}>
                      <button
                        onClick={() => { setDesignDropdownOpen(false); onDesignSystemChange(null); }}
                        style={{
                          display: "flex", alignItems: "center", gap: 8,
                          width: "100%", padding: "7px 12px",
                          background: !designSystem ? "var(--bg-selected)" : "none",
                          border: "none",
                          color: !designSystem ? "var(--text)" : "var(--text-muted)",
                          cursor: "pointer", fontSize: 12, textAlign: "left",
                          fontWeight: !designSystem ? 600 : 400,
                          borderBottom: "1px solid var(--border)",
                        }}
                      >
                        {!designSystem
                          ? <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="1.5 5 4 7.5 8.5 2.5" /></svg>
                          : <span style={{ width: 10, flexShrink: 0 }} />}
                        <span style={{ flex: 1 }}>None</span>
                      </button>
                      {Object.entries(grouped).map(([category, items]) => (
                        <div key={category}>
                          <div style={{
                            padding: "6px 12px 4px",
                            fontSize: 10, fontWeight: 600, color: "var(--text-dim)",
                            textTransform: "uppercase", letterSpacing: "0.07em",
                            borderTop: "1px solid var(--border)",
                          }}>
                            {category}
                          </div>
                          {items.map((d) => {
                            const isActive = d.id === designSystem;
                            return (
                              <button
                                key={d.id}
                                onClick={() => { setDesignDropdownOpen(false); if (!isActive) onDesignSystemChange(d.id); }}
                                style={{
                                  display: "flex", alignItems: "center", gap: 8,
                                  width: "100%", padding: "7px 12px",
                                  background: isActive ? "var(--bg-selected)" : "none",
                                  border: "none",
                                  color: isActive ? "var(--text)" : "var(--text-muted)",
                                  cursor: "pointer", fontSize: 12, textAlign: "left",
                                  fontWeight: isActive ? 600 : 400,
                                  whiteSpace: "nowrap",
                                }}
                                onMouseEnter={(e) => { setPreviewDsId(d.id); if (!isActive) e.currentTarget.style.background = "var(--bg-hover)"; }}
                                onMouseLeave={(e) => { setPreviewDsId(null); if (!isActive) e.currentTarget.style.background = "none"; }}
                              >
                                {isActive
                                  ? <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="1.5 5 4 7.5 8.5 2.5" /></svg>
                                  : <span style={{ width: 10, flexShrink: 0 }} />}
                                {d.name}
                              </button>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                    {previewDsId && designDropdownRect && (
                      <div style={{
                        position: "fixed",
                        left: designDropdownRect.left + 340,
                        bottom: (window.visualViewport?.height ?? window.innerHeight) - designDropdownRect.top + 6,
                        width: 320, height: 200,
                        zIndex: 600, borderRadius: 10, overflow: "hidden",
                        border: "1px solid var(--border)",
                        boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
                        pointerEvents: "none",
                      }}>
                        <iframe
                          src={`/api/design-systems/${encodeURIComponent(previewDsId)}/preview`}
                          style={{
                            border: "none",
                            width: "200%", height: "200%",
                            transform: "scale(0.5)", transformOrigin: "top left",
                          }}
                          title={`Preview ${previewDsId}`}
                          sandbox="allow-same-origin"
                        />
                      </div>
                    )}
                    </>
                    );
                })()}
                </div>
            )}

          </div>

          {/* PPT Studio Button */}
          {!isStreaming && onSend && (
            <div ref={pptPanelRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setPptPanelOpen(v => !v)}
                title="HTML PPT Studio"
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '8px 12px', height: 32,
                  background: pptPanelOpen ? 'var(--bg-hover)' : 'none',
                  border: 'none', borderRadius: 9,
                  color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12,
                  transition: 'background 0.12s, color 0.12s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = pptPanelOpen ? 'var(--bg-hover)' : 'none'; e.currentTarget.style.color = 'var(--text-muted)'; }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
                </svg>
                PPT
              </button>

              {pptPanelOpen && (
                <div style={{
                  position: 'absolute', bottom: '100%', left: 0, marginBottom: 8,
                  width: 340, background: 'var(--bg-panel)', border: '1px solid var(--border)',
                  borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', zIndex: 500,
                  padding: '16px', display: 'flex', flexDirection: 'column', gap: 12,
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>HTML PPT Studio</div>

                  {/* Topic */}
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>主题 / 内容简述</label>
                    <input
                      type="text"
                      placeholder="例：AI Agent 技术分享、2026 Q2 业绩复盘…"
                      value={pptTopic}
                      onChange={e => setPptTopic(e.target.value)}
                      style={{
                        width: '100%', padding: '8px 10px', fontSize: 12, boxSizing: 'border-box',
                        border: '1px solid var(--border)', borderRadius: 7,
                        background: 'var(--bg)', color: 'var(--text)', outline: 'none',
                      }}
                    />
                  </div>

                  {/* Audience */}
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>受众（可选）</label>
                    <input
                      type="text"
                      placeholder="例：工程师团队、VC 投资人、小红书用户…"
                      value={pptAudience}
                      onChange={e => setPptAudience(e.target.value)}
                      style={{
                        width: '100%', padding: '8px 10px', fontSize: 12, boxSizing: 'border-box',
                        border: '1px solid var(--border)', borderRadius: 7,
                        background: 'var(--bg)', color: 'var(--text)', outline: 'none',
                      }}
                    />
                  </div>

                  {/* Theme */}
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>视觉主题</label>
                    <select
                      value={pptTheme}
                      onChange={e => setPptTheme(e.target.value)}
                      style={{
                        width: '100%', padding: '8px 10px', fontSize: 12, boxSizing: 'border-box',
                        border: '1px solid var(--border)', borderRadius: 7,
                        background: 'var(--bg)', color: 'var(--text)', cursor: 'pointer',
                      }}
                    >
                      <optgroup label="深色 · 技术">
                        <option value="tokyo-night">Tokyo Night — 蓝夜科技感</option>
                        <option value="dracula">Dracula — 经典紫红深色</option>
                        <option value="catppuccin-mocha">Catppuccin Mocha — 开发者友好深色</option>
                        <option value="terminal-green">Terminal Green — 绿屏终端复古</option>
                        <option value="nord">Nord — 北欧清冷蓝</option>
                        <option value="gruvbox-dark">Gruvbox Dark — 暖棕复古深色</option>
                        <option value="rose-pine">Rosé Pine — 柔和紫粉深色</option>
                        <option value="vaporwave">Vaporwave — 蒸汽波霓虹紫</option>
                        <option value="cyberpunk-neon">Cyberpunk Neon — 赛博霓虹</option>
                      </optgroup>
                      <optgroup label="浅色 · 专业">
                        <option value="minimal-white">Minimal White — 极简白（内部汇报）</option>
                        <option value="corporate-clean">Corporate Clean — 企业蓝正式汇报</option>
                        <option value="pitch-deck-vc">Pitch Deck VC — YC 风融资路演</option>
                        <option value="editorial-serif">Editorial Serif — 杂志风衬线高级感</option>
                        <option value="academic-paper">Academic Paper — 学术论文风</option>
                        <option value="swiss-grid">Swiss Grid — 瑞士网格 Helvetica</option>
                        <option value="solarized-light">Solarized Light — 暖调浅色护眼</option>
                        <option value="catppuccin-latte">Catppuccin Latte — 柔和奶咖浅色</option>
                      </optgroup>
                      <optgroup label="小红书 · 生活">
                        <option value="xiaohongshu-white">小红书白 — 暖红衬线图文</option>
                        <option value="soft-pastel">Soft Pastel — 马卡龙柔和</option>
                        <option value="rainbow-gradient">Rainbow Gradient — 彩虹渐变欢乐</option>
                        <option value="sunset-warm">Sunset Warm — 橘珊瑚渐变</option>
                      </optgroup>
                      <optgroup label="高冲击力 · 创意">
                        <option value="neo-brutalism">Neo Brutalism — 厚描边硬阴影</option>
                        <option value="glassmorphism">Glassmorphism — 毛玻璃苹果风</option>
                        <option value="aurora">Aurora — 极光渐变</option>
                        <option value="blueprint">Blueprint — 工程蓝图网格</option>
                        <option value="y2k-chrome">Y2K Chrome — 千禧铬金属银</option>
                        <option value="retro-tv">Retro TV — 复古显像管扫描线</option>
                        <option value="news-broadcast">News Broadcast — 新闻播报风格</option>
                        <option value="memphis-pop">Memphis Pop — 孟菲斯波普几何</option>
                        <option value="magazine-bold">Magazine Bold — 杂志大标题冲击</option>
                        <option value="japanese-minimal">Japanese Minimal — 和风极简侘寂</option>
                        <option value="midcentury">Midcentury — 世纪中期现代复古</option>
                        <option value="engineering-whiteprint">Engineering Whiteprint — 工程白图蓝线</option>
                        <option value="arctic-cool">Arctic Cool — 冰川冷色石板蓝</option>
                        <option value="bauhaus">Bauhaus — 包豪斯几何原色</option>
                        <option value="sharp-mono">Sharp Mono — 锐利黑白高对比</option>
                      </optgroup>
                    </select>
                  </div>

                  {/* Template */}
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Deck 模板（结构）</label>
                    <select
                      value={pptTemplate}
                      onChange={e => setPptTemplate(e.target.value)}
                      style={{
                        width: '100%', padding: '8px 10px', fontSize: 12, boxSizing: 'border-box',
                        border: '1px solid var(--border)', borderRadius: 7,
                        background: 'var(--bg)', color: 'var(--text)', cursor: 'pointer',
                      }}
                    >
                      <option value="tech-sharing">Tech Sharing — 技术分享（封面/背景/方案/Demo/总结）</option>
                      <option value="pitch-deck">Pitch Deck — 融资路演（问题/方案/市场/团队/融资）</option>
                      <option value="product-launch">Product Launch — 产品发布（亮点/功能/对比/CTA）</option>
                      <option value="weekly-report">Weekly Report — 周报复盘（目标/进展/风险/下周计划）</option>
                      <option value="xhs-post">小红书图文 — 3:4 竖版图文（封面/内容/种草/结尾）</option>
                      <option value="course-module">Course Module — 课程模块（学习目标/讲解/练习/小结）</option>
                      <option value="presenter-mode-reveal">演讲者模式 — 含逐字稿（S键弹出提词器）</option>
                    </select>
                  </div>

                  {/* Slides count */}
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>页数：{pptSlides} 页</label>
                    <input
                      type="range" min={4} max={20} value={pptSlides}
                      onChange={e => setPptSlides(Number(e.target.value))}
                      style={{ width: '100%', accentColor: 'var(--accent)' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>
                      <span>4</span><span>20</span>
                    </div>
                  </div>

                  {/* Generate button */}
                  <button
                    disabled={!pptTopic.trim()}
                    onClick={() => {
                      if (!pptTopic.trim()) return;

                      const templateDescMap: Record<string, string> = {
                        'tech-sharing': 'tech-sharing（技术分享：封面 → 背景/问题 → 解决方案 → 核心模块讲解 × 3 → Demo/效果 → 总结/Q&A）',
                        'pitch-deck': 'pitch-deck（融资路演：封面 → 问题 → 解决方案 → 市场规模 → 产品/Demo → 商业模式 → 竞争壁垒 → 团队 → 融资计划）',
                        'product-launch': 'product-launch（产品发布：封面 → 痛点 → 产品亮点 → 核心功能 × 3 → 对比竞品 → 价格/CTA）',
                        'weekly-report': 'weekly-report（周报复盘：封面 → 本周目标 → 完成进展 → 数据指标 → 风险/阻塞 → 下周计划）',
                        'xhs-post': 'xhs-post（小红书图文 3:4 竖版：封面卡片 → 内容卡片 × 3-4 → 种草/结尾卡片）',
                        'course-module': 'course-module（课程模块：封面 → 学习目标 → 知识讲解 × 3 → 案例/练习 → 小结/作业）',
                        'presenter-mode-reveal': 'presenter-mode-reveal（演讲者模式：每页含 <div class="notes"> 逐字稿 150-300 字，S 键弹出提词器窗口）',
                      };

                      const prompt = `请用 html-ppt skill 生成一份完整的单文件 HTML 演示文稿。

## 内容要求
- 主题：${pptTopic}
${pptAudience ? `- 目标受众：${pptAudience}` : ''}
- 页数：${pptSlides} 页

## 技术规格
- 视觉主题：${pptTheme}（对应 assets/themes/${pptTheme}.css）
- Deck 模板结构：${templateDescMap[pptTemplate] || pptTemplate}
- 必须是**单文件 HTML**，所有 CSS/JS **inline 内嵌**，不引用外部文件
- 完整实现键盘导航（← →）、幻灯片切换动画
- 每张 slide 为 \`<section class="slide">\` 元素，默认隐藏只显示 .is-active

## 输出规范
- 输出一段话说明 deck 结构，然后直接给出完整 HTML
- HTML 以 \`<!doctype html>\` 开头，\`</html>\` 结尾
- 不要截断，必须完整输出所有 ${pptSlides} 页内容
${pptTemplate === 'presenter-mode-reveal' ? '- 每页必须有 <div class="notes"> 逐字稿，150-300 字，口语风格' : ''}
${pptTemplate === 'xhs-post' ? '- 使用 3:4 竖版尺寸（width:1080px, height:1440px），小红书图文卡片风格' : ''}`;

                      onSend(prompt);
                      setPptPanelOpen(false);
                      setPptTopic('');
                      setPptAudience('');
                    }}
                    style={{
                      width: '100%', padding: '9px', fontSize: 13, fontWeight: 600,
                      background: pptTopic.trim() ? 'var(--accent)' : 'var(--bg-hover)',
                      color: pptTopic.trim() ? '#fff' : 'var(--text-muted)',
                      border: 'none', borderRadius: 8, cursor: pptTopic.trim() ? 'pointer' : 'not-allowed',
                      transition: 'all 0.15s',
                    }}
                  >
                    🎞 生成 PPT
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Prompt Presets Button */}
          {!isStreaming && (
            <div ref={presetDropdownRef} style={{ position: 'relative' }}>
              <button
                onClick={() => {
                  if (!presetsAvailable) {
                    setDownloadModalOpen(true);
                    setDownloadStage("idle");
                    setDownloadProgress(0);
                    setDownloadMessage("");
                    setDownloadError(null);
                    return;
                  }
                  setPresetDropdownOpen(v => !v);
                }}
                title={presetsAvailable ? "提示词灵感预设" : "提示词灵感预设 (未检测到资源目录)"}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '8px 12px', height: 32,
                  background: presetsAvailable && presetDropdownOpen ? 'var(--bg-hover)' : 'none',
                  border: 'none', borderRadius: 9,
                  color: presetsAvailable ? 'var(--text-muted)' : 'var(--text-dim)',
                  opacity: presetsAvailable ? 1 : 0.4,
                  cursor: 'pointer', fontSize: 12,
                  transition: 'background 0.12s, color 0.12s, opacity 0.12s',
                }}
                onMouseEnter={e => {
                  if (presetsAvailable) {
                    e.currentTarget.style.background = 'var(--bg-hover)';
                    e.currentTarget.style.color = 'var(--text)';
                  }
                }}
                onMouseLeave={e => {
                  if (presetsAvailable) {
                    e.currentTarget.style.background = presetDropdownOpen ? 'var(--bg-hover)' : 'none';
                    e.currentTarget.style.color = 'var(--text-muted)';
                  }
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2z" />
                </svg>
                灵感
              </button>

              {presetsAvailable && presetDropdownOpen && (() => {
                const categories = [...new Set(allPresets.map(p => p.category))];
                return (
                  <div style={{
                    position: 'absolute', bottom: 'calc(100% + 8px)', left: 0,
                    zIndex: 400,
                    background: 'color-mix(in srgb, var(--bg-panel) 92%, transparent)',
                    backdropFilter: 'blur(16px)',
                    WebkitBackdropFilter: 'blur(16px)',
                    border: '1px solid var(--border)',
                    borderRadius: 16,
                    boxShadow: '0 12px 32px rgba(0, 0, 0, 0.25)',
                    padding: 8,
                    width: 280,
                    maxHeight: 340,
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                    animation: 'drop-zone-in 0.18s cubic-bezier(0.16, 1, 0.3, 1) forwards',
                  }}>
                    {categories.map(cat => (
                      <div key={cat}>
                        <div style={{
                          padding: '6px 10px 4px',
                          fontSize: 10, fontWeight: 600, color: 'var(--text-dim)',
                          textTransform: 'uppercase', letterSpacing: '0.07em',
                        }}>
                          {cat} ({allPresets.filter(p => p.category === cat).length})
                        </div>
                        {allPresets.filter(p => p.category === cat).slice(0, 20).map(preset => (
                          <button
                            key={preset.id}
                            onClick={() => {
                              setPresetDropdownOpen(false);
                              setActivePreset(preset);
                              const args = parsePlaceholders(preset.template);
                              const initVals: Record<string, string> = {};
                              for (const a of args) initVals[a.key] = a.defaultValue;
                              setPlaceholderValues(initVals);
                              setPromptModalText(preset.template);
                              setPromptModalOpen(true);
                              setCopySuccess(false);
                              setPromptTab('text');
                            }}
                            style={{
                              display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                              width: '100%', padding: '7px 10px',
                              background: 'none', border: 'none', borderRadius: 10,
                              color: 'var(--text)', cursor: 'pointer', textAlign: 'left',
                              gap: 2, transition: 'background 0.12s',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
                          >
                            <span style={{ fontSize: 12.5, fontWeight: 600 }}>{preset.name}</span>
                            <span style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.4 }}>{preset.description}</span>
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}

          {/* spacer */}
          <div style={{ flex: 1 }} />

          {/* RIGHT: thinking + tools preset + compact + sound (idle) | Stop + sound (streaming) */}
          <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: 2, marginLeft: "auto" }}>
            {!isStreaming && onThinkingLevelChange && (
              <div ref={thinkingDropdownRef} style={{ position: "relative" }}>
                <button
                  onClick={() => !isStreaming && setThinkingDropdownOpen((v) => !v)}
                  disabled={isStreaming}
                  title="切换推理强度"
                  style={{
                    display: "flex", alignItems: "center", gap: 5,
                    padding: "8px 12px",
                    height: 32,
                    background: thinkingDropdownOpen ? "var(--bg-hover)" : "none",
                    border: "none",
                    borderRadius: 9,
                    color: "var(--text-muted)",
                    cursor: isStreaming ? "not-allowed" : "pointer",
                    fontSize: 12,
                    opacity: isStreaming ? 0.5 : 1,
                    transition: "background 0.12s, color 0.12s",
                  }}
                  onMouseEnter={(e) => {
                    if (isStreaming) return;
                    e.currentTarget.style.background = "var(--bg-hover)";
                    e.currentTarget.style.color = "var(--text)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = thinkingDropdownOpen ? "var(--bg-hover)" : "none";
                    e.currentTarget.style.color = "var(--text-muted)";
                  }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9.5 2A5.5 5.5 0 0 0 4 7.5c0 1.7.78 3.21 2 4.21V14a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1v-2.29c1.22-1 2-2.51 2-4.21A5.5 5.5 0 0 0 9.5 2z" />
                    <line x1="7" y1="18" x2="12" y2="18" />
                    <line x1="8" y1="21" x2="11" y2="21" />
                  </svg>
                  <span>{(() => {
                    const rawLvl = thinkingLevel ?? "auto";
                    const lvl = (
                      rawLvl === "auto" ||
                      !availableThinkingLevels ||
                      availableThinkingLevels.includes(rawLvl)
                    ) ? rawLvl : "auto";
                    if (lvl === "auto" || !thinkingLevelMap) return lvl;
                    const mapped = thinkingLevelMap[lvl];
                    return mapped != null ? mapped : lvl;
                  })()}</span>
                </button>
                {thinkingDropdownOpen && (
                  <div style={{
                    position: "absolute", bottom: "calc(100% + 6px)", right: 0,
                    zIndex: 100, background: "var(--bg)", border: "1px solid var(--border)",
                    borderRadius: 8, boxShadow: "0 -4px 16px rgba(0,0,0,0.10)",
                    overflow: "hidden", minWidth: 180,
                  }}>
                    {THINKING_LEVELS.filter((lvl) => {
                      if (!availableThinkingLevels) return true;
                      if (lvl === "auto") return true;
                      return availableThinkingLevels.includes(lvl);
                    }).map((lvl) => {
                      const isActive = (thinkingLevel ?? "auto") === lvl;
                      const desc = THINKING_LEVEL_DESC[lvl];
                      const mappedVal = (lvl !== "auto" && thinkingLevelMap) ? thinkingLevelMap[lvl] : undefined;
                      const displayLabel = (mappedVal != null && mappedVal !== lvl) ? mappedVal : lvl;
                      const showOriginal = mappedVal != null && mappedVal !== lvl;
                      return (
                        <button
                          key={lvl}
                          onClick={() => { setThinkingDropdownOpen(false); if (!isActive) onThinkingLevelChange(lvl); }}
                          style={{
                            display: "flex", alignItems: "center", gap: 8,
                            width: "100%", padding: "7px 12px",
                            background: isActive ? "var(--bg-selected)" : "none",
                            border: "none",
                            color: isActive ? "var(--text)" : "var(--text-muted)",
                            cursor: "pointer", fontSize: 12, textAlign: "left",
                            fontWeight: isActive ? 600 : 400,
                            whiteSpace: "nowrap",
                          }}
                          onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "var(--bg-hover)"; }}
                          onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "none"; }}
                        >
                          {isActive
                            ? <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="1.5 5 4 7.5 8.5 2.5" /></svg>
                            : <span style={{ width: 10, flexShrink: 0 }} />}
                          <span style={{ flex: 1 }}>
                            {displayLabel}
                            {showOriginal && <span style={{ fontSize: 10, color: "var(--text-dim)", fontFamily: "var(--font-mono)", marginLeft: 5 }}>({lvl})</span>}
                          </span>
                          <span style={{ fontSize: 11, color: "var(--text-dim)", marginLeft: 8 }}>{desc}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            {!isStreaming && onToolPresetChange && (
              <div ref={toolDropdownRef} style={{ position: "relative" }}>
                <button
                  onClick={() => !isStreaming && setToolDropdownOpen((v) => !v)}
                  disabled={isStreaming}
                  title="切换工具预设"
                  style={{
                    display: "flex", alignItems: "center", gap: 5,
                    padding: "8px 12px",
                    height: 32,
                    background: toolDropdownOpen ? "var(--bg-hover)" : "none",
                    border: "none",
                    borderRadius: 9,
                    color: "var(--text-muted)",
                    cursor: isStreaming ? "not-allowed" : "pointer",
                    fontSize: 12,
                    opacity: isStreaming ? 0.5 : 1,
                    transition: "background 0.12s, color 0.12s",
                  }}
                  onMouseEnter={(e) => {
                    if (isStreaming) return;
                    e.currentTarget.style.background = "var(--bg-hover)";
                    e.currentTarget.style.color = "var(--text)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = toolDropdownOpen ? "var(--bg-hover)" : "none";
                    e.currentTarget.style.color = "var(--text-muted)";
                  }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                  </svg>
                  <span>{Object.entries(TOOL_PRESET_MAP).find(([, v]) => v === (toolPreset ?? "default"))?.[0] ?? "default"}</span>
                </button>
                {toolDropdownOpen && (
                  <div style={{
                    position: "absolute", bottom: "calc(100% + 6px)", right: 0,
                    zIndex: 100, background: "var(--bg)", border: "1px solid var(--border)",
                    borderRadius: 8, boxShadow: "0 -4px 16px rgba(0,0,0,0.10)",
                    overflow: "hidden", minWidth: 120,
                  }}>
                    {TOOL_PRESETS.map((lvl) => {
                      const preset = TOOL_PRESET_MAP[lvl];
                      const isActive = (toolPreset ?? "default") === preset;
                      const desc = lvl === "off" ? "无工具，纯聊天" : lvl === "default" ? "4 项内置工具" : "全部内置工具";
                      return (
                        <button
                          key={lvl}
                          onClick={() => { setToolDropdownOpen(false); if (!isActive) onToolPresetChange(preset); }}
                          style={{
                            display: "flex", alignItems: "center", gap: 8,
                            width: "100%", padding: "7px 12px",
                            background: isActive ? "var(--bg-selected)" : "none",
                            border: "none",
                            color: isActive ? "var(--text)" : "var(--text-muted)",
                            cursor: "pointer", fontSize: 12, textAlign: "left",
                            fontWeight: isActive ? 600 : 400,
                            whiteSpace: "nowrap",
                          }}
                          onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "var(--bg-hover)"; }}
                          onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "none"; }}
                        >
                          {isActive
                            ? <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="1.5 5 4 7.5 8.5 2.5" /></svg>
                            : <span style={{ width: 10, flexShrink: 0 }} />}
                          <span style={{ flex: 1 }}>{lvl}</span>
                          <span style={{ fontSize: 11, color: "var(--text-dim)", marginLeft: 8 }}>{desc}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {!isStreaming && onCompact && (
              <div style={{ position: "relative" }}>
                {compactError && (
                  <div style={{
                    position: "absolute", bottom: "calc(100% + 6px)", right: 0,
                    background: "#1f2937", color: "#f87171",
                    fontSize: 11, padding: "4px 8px", borderRadius: 5,
                    whiteSpace: "nowrap", pointerEvents: "none",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.2)", zIndex: 50,
                  }}>
                    {compactError}
                  </div>
                )}
                <button
                  onClick={isCompacting ? onAbortCompaction : onCompact}
                  disabled={isStreaming && !isCompacting}
                  style={{
                    display: "flex", alignItems: "center", gap: 5,
                    padding: "8px 12px",
                    height: 32,
                    background: isCompacting ? "rgba(239,68,68,0.08)" : "none",
                    border: "none",
                    borderRadius: 9,
                    color: isCompacting ? "#ef4444" : "var(--text-muted)",
                    cursor: (isStreaming && !isCompacting) ? "not-allowed" : "pointer",
                    fontSize: 12, opacity: (isStreaming && !isCompacting) ? 0.5 : 1,
                    transition: "background 0.12s, color 0.12s",
                  }}
                  onMouseEnter={(e) => {
                    if (isStreaming && !isCompacting) return;
                    e.currentTarget.style.background = isCompacting ? "rgba(239,68,68,0.16)" : "var(--bg-hover)";
                    e.currentTarget.style.color = isCompacting ? "#ef4444" : "var(--text)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = isCompacting ? "rgba(239,68,68,0.08)" : "none";
                    e.currentTarget.style.color = isCompacting ? "#ef4444" : "var(--text-muted)";
                  }}
                  title={isCompacting ? "停止压缩" : "压缩上下文"}
                >
                  {isCompacting ? (
                    <><svg width="10" height="10" viewBox="0 0 10 10" fill="none"><rect x="2" y="2" width="6" height="6" rx="1" fill="currentColor" /></svg>Compacting…</>
                  ) : (
                    <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" />
                      <line x1="10" y1="14" x2="3" y2="21" /><line x1="21" y1="3" x2="14" y2="10" />
                    </svg>Compact</>
                  )}
                </button>
              </div>
            )}

            {isStreaming && (
              <button
                onClick={onAbort}
                title="停止 Agent"
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "8px 14px",
                  height: 32,
                  background: "rgba(239,68,68,0.08)",
                  border: "1px solid rgba(239,68,68,0.3)",
                  borderRadius: 9,
                  color: "#ef4444",
                  cursor: "pointer",
                  fontSize: 12, fontWeight: 600,
                  whiteSpace: "nowrap", letterSpacing: "-0.01em",
                  transition: "background 0.12s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.16)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.08)"; }}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <rect x="1.5" y="1.5" width="7" height="7" rx="1.5" fill="currentColor" />
                </svg>
                Stop
              </button>
            )}

            {onSoundToggle !== undefined && (
              <button
                onClick={onSoundToggle}
                title={soundEnabled ? "关闭完成提示音" : "开启完成提示音"}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: 32, height: 32, padding: 0,
                  background: "none",
                  border: "none",
                  borderRadius: 9,
                  color: soundEnabled ? "var(--text-muted)" : "var(--text-dim)",
                  cursor: "pointer",
                  opacity: soundEnabled ? 1 : 0.55,
                  transition: "background 0.12s, color 0.12s, opacity 0.12s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--bg-hover)";
                  e.currentTarget.style.color = "var(--text)";
                  e.currentTarget.style.opacity = "1";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "none";
                  e.currentTarget.style.color = soundEnabled ? "var(--text-muted)" : "var(--text-dim)";
                  e.currentTarget.style.opacity = soundEnabled ? "1" : "0.55";
                }}
              >
                {soundEnabled ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                  </svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <line x1="23" y1="9" x2="17" y2="15" />
                    <line x1="17" y1="9" x2="23" y2="15" />
                  </svg>
                )}
              </button>
            )}
          </div>

        </div>
      </div>

      {/* 🪄 Premium Image Reverse-Prompt / Preset Modal */}
      {promptModalOpen && (() => {
        const jsonText = parseDescriptionToJSON(promptModalText);
        const rawText = promptTab === "text" ? promptModalText : jsonText;
        const parsedArgs = parsePlaceholders(rawText);
        const activeText = parsedArgs.length > 0 ? replacePlaceholders(rawText, placeholderValues) : rawText;
        const hasImage = !!activePreset?.imagePath;
        let imageUrl = null;
        if (hasImage && activePreset?.imagePath) {
          const isAbsolute = activePreset.imagePath.startsWith("/") || 
                            activePreset.imagePath.startsWith("\\") || 
                            /^[a-zA-Z]:/.test(activePreset.imagePath);
          const finalPath = isAbsolute ? activePreset.imagePath : (cwd ? joinFilePath(cwd, activePreset.imagePath) : null);
          if (finalPath) {
            imageUrl = `/api/files/${encodeFilePathForApi(finalPath)}?type=read`;
          }
        }

        const closeModal = () => {
          setPromptModalOpen(false);
          setActivePreset(null);
          setPlaceholderValues({});
        };

        const insertAndClose = () => {
          setValue((v) => v + (v ? "\n\n" : "") + activeText);
          closeModal();
          requestAnimationFrame(() => {
            if (textareaRef.current) {
              textareaRef.current.focus();
              textareaRef.current.style.height = "auto";
              textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
            }
          });
        };

        const rightPanel = (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 0, flex: 1 }}>
            {/* Tabs */}
            <div style={{ display: "flex", gap: 16, flexShrink: 0 }}>
              <button
                onClick={() => setPromptTab("text")}
                style={{
                  padding: "8px 4px",
                  border: "none",
                  borderBottom: `2px solid ${promptTab === "text" ? "var(--accent)" : "transparent"}`,
                  background: "none",
                  color: promptTab === "text" ? "var(--text)" : "var(--text-muted)",
                  fontSize: 13, fontWeight: 600, cursor: "pointer",
                  transition: "color 0.15s, border-color 0.15s",
                }}
              >文本格式</button>
              <button
                onClick={() => setPromptTab("json")}
                style={{
                  padding: "8px 4px",
                  border: "none",
                  borderBottom: `2px solid ${promptTab === "json" ? "var(--accent)" : "transparent"}`,
                  background: "none",
                  color: promptTab === "json" ? "var(--text)" : "var(--text-muted)",
                  fontSize: 13, fontWeight: 600, cursor: "pointer",
                  transition: "color 0.15s, border-color 0.15s",
                }}
              >JSON 格式</button>
            </div>

            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {hasImage
                ? `预设：${activePreset?.name ?? ""}`
                : promptTab === "text"
                  ? "视觉大模型已为您反推解析出以下结构化文本提示词："
                  : "已将提示词自动分词并重构为以下 image_prompt JSON 结构："}
            </div>

            {/* Variable Editor */}
            {parsedArgs.length > 0 && (
              <div style={{
                display: "flex", flexDirection: "column", gap: 6,
                padding: 10,
                background: "rgba(99,102,241,0.04)",
                border: "1px solid rgba(99,102,241,0.15)",
                borderRadius: 10,
                maxHeight: hasImage ? 160 : undefined,
                overflowY: "auto",
              }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "rgb(99,102,241)", display: "flex", alignItems: "center", gap: 5 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
                  </svg>
                  可编辑变量 ({parsedArgs.length})
                </div>
                {parsedArgs.map((arg) => (
                  <div key={arg.key} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <label style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 500 }}>{arg.name}</label>
                    <input
                      type="text"
                      value={placeholderValues[arg.key] ?? arg.defaultValue}
                      onChange={(e) => setPlaceholderValues(prev => ({ ...prev, [arg.key]: e.target.value }))}
                      placeholder={arg.defaultValue || arg.name}
                      style={{
                        padding: "5px 7px", fontSize: 11.5, borderRadius: 6,
                        border: "1px solid var(--border)", background: "var(--bg)",
                        color: "var(--text)", outline: "none", transition: "border-color 0.15s",
                      }}
                      onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
                    />
                  </div>
                ))}
              </div>
            )}

            <textarea
              readOnly
              value={activeText}
              style={{
                width: "100%", flex: 1, minHeight: hasImage ? 100 : 140,
                padding: 10, background: "var(--bg)", border: "1px solid var(--border)",
                borderRadius: 10, fontSize: 12, lineHeight: "1.6", color: "var(--text)",
                resize: "none", outline: "none",
                fontFamily: promptTab === "json" ? "var(--font-mono), monospace" : "inherit",
              }}
            />
          </div>
        );

        return (
          <div style={{
            position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(0, 0, 0, 0.45)", backdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 9999, padding: 16,
            animation: "fadeIn 0.2s ease-out",
          }}>
            <style>{`
              @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
              @keyframes scaleIn { from { transform: scale(0.96); opacity: 0; } to { transform: scale(1); opacity: 1; } }
              @media (max-width: 640px) {
                .pi-preset-grid { grid-template-columns: 1fr !important; }
                .pi-preset-grid > div:first-child { border-right: none !important; border-bottom: 1px solid var(--border); max-height: 200px; }
              }
            `}</style>
            <div style={{
              background: "var(--bg-panel)",
              border: "1px solid var(--border)",
              borderRadius: 16,
              width: "100%",
              maxWidth: hasImage ? 900 : 560,
              maxHeight: "90vh",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
              display: "flex",
              flexDirection: "column",
              animation: "scaleIn 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)",
              overflow: "hidden",
            }}>
              {/* Header */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "14px 20px", borderBottom: "1px solid var(--border)",
                background: "rgba(255,255,255,0.02)", flexShrink: 0,
              }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {hasImage ? (activePreset?.name ?? "提示词预设") : "🪄 图像反推提示词"}
                </span>
                <button
                  onClick={closeModal}
                  style={{
                    background: "none", border: "none", color: "var(--text-muted)",
                    cursor: "pointer", display: "flex", alignItems: "center", padding: 4,
                    borderRadius: "50%", transition: "background 0.15s", flexShrink: 0, marginLeft: 12,
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg-hover)"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "none"}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              {/* Body: dual-column or single-column */}
              {hasImage ? (
                <div className="pi-preset-grid" style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 45%) minmax(0, 55%)",
                  flex: 1, minHeight: 0, overflow: "hidden",
                }}>
                  {/* Left: Image Preview */}
                  <div style={{
                    position: "relative", overflow: "hidden",
                    borderRight: "1px solid var(--border)",
                    background: "rgba(0,0,0,0.03)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    padding: 16,
                  }}>
                    {imageUrl ? (
                      <div style={{
                        width: "100%", borderRadius: 12, overflow: "hidden",
                        boxShadow: "0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08)",
                      }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={imageUrl}
                          alt={activePreset?.name ?? "预设效果图"}
                          style={{
                            width: "100%", display: "block", objectFit: "cover",
                            maxHeight: "calc(90vh - 160px)",
                          }}
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                        />
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, color: "var(--text-dim)", textAlign: "center" }}>
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3, marginBottom: 8 }}>
                          <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
                        </svg>
                        <div>无效果图</div>
                      </div>
                    )}
                    {/* Category badge */}
                    {activePreset?.category && (
                      <div style={{
                        position: "absolute", top: 12, left: 12,
                        padding: "3px 8px", borderRadius: 6,
                        background: "rgba(0,0,0,0.55)", backdropFilter: "blur(8px)",
                        color: "#fff", fontSize: 10, fontWeight: 600,
                        letterSpacing: "0.03em",
                      }}>
                        {activePreset.category}
                      </div>
                    )}
                  </div>

                  {/* Right: Editor */}
                  <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10, overflowY: "auto", minHeight: 0 }}>
                    {rightPanel}
                  </div>
                </div>
              ) : (
                <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12, overflowY: "auto", flex: 1, minHeight: 0 }}>
                  {rightPanel}
                </div>
              )}

              {/* Footer */}
              <div style={{
                padding: "14px 20px", borderTop: "1px solid var(--border)",
                background: "rgba(255,255,255,0.01)", display: "flex",
                justifyContent: "flex-end", gap: 10, flexShrink: 0,
              }}>
                <button
                  onClick={insertAndClose}
                  style={{
                    padding: "8px 16px",
                    background: "rgba(129,140,248,0.1)", border: "1px solid rgba(129,140,248,0.25)",
                    borderRadius: 8, color: "rgb(99,102,241)", cursor: "pointer",
                    fontSize: 13, fontWeight: 600, transition: "background 0.12s",
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "rgba(129,140,248,0.18)"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "rgba(129,140,248,0.1)"}
                >插入到输入框</button>
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(activeText);
                      setCopySuccess(true);
                      setTimeout(() => setCopySuccess(false), 2000);
                    } catch (err) { console.error("Failed to copy text:", err); }
                  }}
                  style={{
                    padding: "8px 18px", background: copySuccess ? "#10B981" : "var(--accent)",
                    border: "none", borderRadius: 8, color: "#fff", cursor: "pointer",
                    fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6,
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) => { if (!copySuccess) e.currentTarget.style.filter = "brightness(1.15)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.filter = "none"; }}
                >
                  {copySuccess ? (
                    <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>已复制！</>
                  ) : (
                    <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>复制提示词</>
                  )}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 📥 Presets Automatic Download Progress Modal */}
      {downloadModalOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0, 0, 0, 0.65)', backdropFilter: 'blur(8px)',
          zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: 'var(--bg-panel)', border: '1px solid var(--border)',
            borderRadius: 16, width: '450px', maxWidth: '90%', padding: '24px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2)',
            display: 'flex', flexDirection: 'column', gap: 20,
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>
                  下载提示词灵感预设资源
                </h3>
              </div>
              {downloadStage !== 'downloading' && downloadStage !== 'extracting' && (
                <button
                  onClick={() => setDownloadModalOpen(false)}
                  style={{
                    background: 'none', border: 'none', color: 'var(--text-muted)',
                    cursor: 'pointer', padding: 4, display: 'flex', borderRadius: 4,
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>

            {/* Content */}
            <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: '1.5' }}>
              {downloadStage === 'idle' && (
                <div>
                  <p style={{ margin: '0 0 12px 0' }}>
                    未检测到灵感预设目录 <code>awesome-gpt-image-2-API-and-Prompts-main</code>。
                  </p>
                  <p style={{ margin: '0 0 12px 0' }}>
                    是否立即开始自动下载资源包？为了节省您的磁盘空间，系统在解压时将<strong>仅提取 cases 和 images 目录</strong>，过滤掉其它无关内容。
                  </p>
                  <p style={{ margin: 0, fontSize: 11, color: 'var(--text-dim)' }}>
                    项目源地址: <a href="https://github.com/demon820308/awesome-gpt-image-2-API-and-Prompts" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>GitHub Repo</a>
                  </p>
                </div>
              )}

              {(downloadStage === 'downloading' || downloadStage === 'extracting') && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 500, color: 'var(--text)' }}>
                    <span>
                      {downloadStage === 'downloading' ? '正在下载资源包...' : '正在解压并精简文件...'}
                    </span>
                    <span>{downloadProgress}%</span>
                  </div>
                  
                  {/* Progress Bar Container */}
                  <div style={{
                    width: '100%', height: 8, background: 'var(--bg-hover)',
                    borderRadius: 4, overflow: 'hidden', position: 'relative'
                  }}>
                    <div style={{
                      width: `${downloadProgress}%`, height: '100%',
                      background: 'var(--accent)', borderRadius: 4,
                      transition: 'width 0.2s ease-out'
                    }} />
                  </div>

                  <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4, wordBreak: 'break-all' }}>
                    {downloadMessage}
                  </div>
                </div>
              )}

              {downloadStage === 'done' && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '10px 0', color: '#10B981' }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span style={{ fontWeight: 600 }}>资源已成功安装并启用！</span>
                </div>
              )}

              {downloadStage === 'error' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, color: '#EF4444' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <span>下载或安装失败</span>
                  </div>
                  <div style={{ fontSize: 12, background: 'rgba(239, 68, 68, 0.08)', padding: 10, borderRadius: 8, border: '1px solid rgba(239, 68, 68, 0.2)', wordBreak: 'break-all' }}>
                    {downloadError}
                  </div>
                </div>
              )}
            </div>

            {/* Footer / Buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              {downloadStage === 'idle' && (
                <>
                  <button
                    onClick={() => setDownloadModalOpen(false)}
                    style={{
                      padding: '8px 16px', background: 'none', border: '1px solid var(--border)',
                      borderRadius: 8, color: 'var(--text)', cursor: 'pointer', fontSize: 12, fontWeight: 600
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                  >
                    取消
                  </button>
                  <button
                    onClick={startPresetsDownload}
                    style={{
                      padding: '8px 16px', background: 'var(--accent)', border: 'none',
                      borderRadius: 8, color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600
                    }}
                    onMouseEnter={e => e.currentTarget.style.filter = 'brightness(1.15)'}
                    onMouseLeave={e => e.currentTarget.style.filter = 'none'}
                  >
                    开始自动下载
                  </button>
                </>
              )}
              {downloadStage === 'error' && (
                <>
                  <button
                    onClick={() => setDownloadModalOpen(false)}
                    style={{
                      padding: '8px 16px', background: 'none', border: '1px solid var(--border)',
                      borderRadius: 8, color: 'var(--text)', cursor: 'pointer', fontSize: 12, fontWeight: 600
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                  >
                    关闭
                  </button>
                  <button
                    onClick={startPresetsDownload}
                    style={{
                      padding: '8px 16px', background: 'var(--accent)', border: 'none',
                      borderRadius: 8, color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600
                    }}
                    onMouseEnter={e => e.currentTarget.style.filter = 'brightness(1.15)'}
                    onMouseLeave={e => e.currentTarget.style.filter = 'none'}
                  >
                    重试
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
