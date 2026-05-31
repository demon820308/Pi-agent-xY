"use client";

import React, { useRef, useState, useCallback, useEffect, useImperativeHandle, forwardRef, KeyboardEvent } from "react";
import { isVisionModel } from "@/lib/vision";
import { isTtsModel, isVoiceDesignModel, isVoiceCloneModel, isBaseTtsModel } from "@/lib/tts-utils";
import { encodeFilePathForApi, joinFilePath } from "@/lib/file-paths";
import { TtsPanel } from "./TtsPanel";

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
  // Split by line to perform structured extraction
  const lines = text.split(/\r?\n/);
  let inFinalPromptSection = false;
  const finalPromptLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Check if we hit the final prompt section header
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
    
    // Core Subject
    if (lower.includes("core_subject") || trimmed.includes("核心主体")) {
      const parts = trimmed.split(/[:：]/);
      if (parts.length > 1) {
        coreSubject = parts.slice(1).join(":").trim();
      }
    }
    // Clothing
    else if (lower.includes("clothing") || trimmed.includes("服装/材质") || trimmed.includes("服装") || trimmed.includes("材质")) {
      if (!lower.includes("lighting") && !trimmed.includes("光照")) {
        const parts = trimmed.split(/[:：]/);
        if (parts.length > 1) {
          clothing = parts.slice(1).join(":").trim();
        }
      }
    }
    // Location
    else if (lower.includes("location") || trimmed.includes("具体地点")) {
      const parts = trimmed.split(/[:：]/);
      if (parts.length > 1) {
        location = parts.slice(1).join(":").trim();
      }
    }
    // Background
    else if (lower.includes("background") || trimmed.includes("画面背景")) {
      const parts = trimmed.split(/[:::：]/);
      if (parts.length > 1) {
        background = parts.slice(1).join(":").trim();
      }
    }
    // Lighting
    else if (lower.includes("lighting") || trimmed.includes("光照与色彩") || trimmed.includes("光照") || trimmed.includes("色彩")) {
      const parts = trimmed.split(/[:：]/);
      if (parts.length > 1) {
        lighting = parts.slice(1).join(":").trim();
      }
    }
    // Style
    else if (lower.includes("style") || trimmed.includes("艺术风格")) {
      const parts = trimmed.split(/[:：]/);
      if (parts.length > 1) {
        style = parts.slice(1).join(":").trim();
      }
    }
  }

  // Clean values from markdown formatting
  const cleanMarkdown = (val: string) => {
    return val.replace(/[\*\#\>\`]/g, "").trim();
  };

  coreSubject = cleanMarkdown(coreSubject);
  clothing = cleanMarkdown(clothing);
  location = cleanMarkdown(location);
  background = cleanMarkdown(background);
  lighting = cleanMarkdown(lighting);
  style = cleanMarkdown(style);

  // Parse prompt text from final prompt section
  let finalPromptText = finalPromptLines.join("\n").trim();
  
  // Clean instructions if the model repeated them
  const instructionRegexes = [
    /请根据上述分析，直接组合出可直接复制的流利中文\s*Prompt。/ig,
    /请使用纯英文自然语言或短语（用逗号隔开），以便我直接复制粘贴：/ig,
    /请使用纯英文自然语言或短语\s*\(用逗号隔开\)\s*，以便我直接复制粘贴：/ig,
    /请使用纯英文自然语言或短语\s*（用逗号隔开）\s*，以便我直接复制粘贴：/ig,
    /请根据上述分析，直接组合出可直接复制的流利中文\s*Prompt/ig,
    /请使用纯英文自然语言或短语/ig,
    /以便我直接复制粘贴/ig,
  ];

  for (const regex of instructionRegexes) {
    finalPromptText = finalPromptText.replace(regex, "");
  }
  // Trim any leading/trailing colons or extra characters left over
  finalPromptText = finalPromptText.replace(/^[:：\s]+/, "").trim();
  finalPromptText = cleanMarkdown(finalPromptText);

  // Fallback to heuristic regexes if some fields are missing
  if (!coreSubject || !style) {
    const cleanText = text.replace(/[\*\#\>\-\`]/g, " ").replace(/\s+/g, " ").trim();

    if (!coreSubject) {
      const subjectMatch = cleanText.match(/(?:主角是|主体是|画面中是|一个|一位|一幅|主角为|主体为|核心焦点为|核心为)([^，。；]+)/i);
      coreSubject = subjectMatch ? subjectMatch[1].trim() : "";
    }

    if (!clothing) {
      const clothingMatch = cleanText.match(/(?:身穿|身着|穿着|身披|着装为|服装为|衣服为|衣服是|身穿一袭)([^，。；]+)/i);
      clothing = clothingMatch ? clothingMatch[1].trim() : "";
    }

    if (!location) {
      const locationMatch = cleanText.match(/(?:在|位于|置身于|场景是|地点是|背景是|场景为|位置为|居中放置)([^，。；]{2,20})(?:中|里|上|下|旁|前|后|，|。|；)/i);
      location = locationMatch ? locationMatch[1].trim() : "";
    }

    if (!background) {
      const backgroundMatch = cleanText.match(/(?:背景是|背景为|背景中包含|背景有|配景为|背景采用)([^。；，]+)/i);
      background = backgroundMatch ? backgroundMatch[1].trim() : "";
    }

    if (!lighting) {
      const lightingMatch = cleanText.match(/(?:光线|光影|阳光|照射|照明|光效|光环|散发出)([^，。；]+)/i);
      lighting = lightingMatch ? lightingMatch[1].trim() : "";
    }

    if (!style) {
      const styleMatch = cleanText.match(/(?:风格|画风|设计风格|视觉风格|呈现出|表现为|采用)([^，。；]+)/i);
      style = styleMatch ? styleMatch[1].trim() : "";
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

  // Synthesize a structured prompt if no explicit prompt section was captured
  if (!finalPromptText) {
    const promptParts = [
      style ? style : "",
      coreSubject ? coreSubject : "",
      location ? location : "",
      clothing ? clothing : "",
      background ? background : "",
      lighting ? lighting : ""
    ].filter(Boolean);

    finalPromptText = promptParts.join("，");
    if (!finalPromptText) {
      finalPromptText = text.replace(/[\*\#\>\-\`]/g, " ").replace(/\s+/g, " ").trim();
    }
  }

  const jsonObj = {
    image_prompt: {
      core_subject: coreSubject,
      clothing: clothing,
      location: location,
      background: background,
      lighting: lighting,
      style: style,
      prompt: finalPromptText
    }
  };

  return JSON.stringify(jsonObj, null, 2);
}

export const ChatInput = forwardRef<ChatInputHandle, Props>(function ChatInput({
  onSend, onAbort, onSteer, onFollowUp, isStreaming, model, modelNames, modelList, onModelChange,
  onCompact, onAbortCompaction, isCompacting, compactError, toolPreset, onToolPresetChange,
  thinkingLevel, onThinkingLevelChange, availableThinkingLevels, thinkingLevelMap,
  retryInfo,
  soundEnabled, onSoundToggle,
  cwd,
}: Props, ref) {
  const [value, setValue] = useState("");
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [modelDropdownRect, setModelDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const [toolDropdownOpen, setToolDropdownOpen] = useState(false);
  const [thinkingDropdownOpen, setThinkingDropdownOpen] = useState(false);
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([]);
  const [attachedFiles, setAttachedFiles] = useState<{ file: File; name: string; size: number }[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [describingIndices, setDescribingIndices] = useState<Record<number, boolean>>({});
  const [describeError, setDescribeError] = useState<string | null>(null);
  const [promptModalOpen, setPromptModalOpen] = useState(false);
  const [promptModalText, setPromptModalText] = useState("");
  const [copySuccess, setCopySuccess] = useState(false);
  const [promptTab, setPromptTab] = useState<"text" | "json">("text");

  const isTts = model ? isTtsModel(model.provider, model.modelId) : false;

  // Model-Adaptive Voice Workspace States
  const [voiceConsoleOpen, setVoiceConsoleOpen] = useState(false);

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

    } catch (err: any) {
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileUploadInputRef = useRef<HTMLInputElement>(null);

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
      } catch (err: any) {
        console.error("Upload error:", err);
        setDescribeError(err.message || "上传文件过程中出现未知错误");
        setIsUploading(false);
        return;
      }
      setIsUploading(false);
    }

    onSend(finalMsg, attachedImages.length ? attachedImages : undefined);
    setValue("");
    clearImages();
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [value, attachedImages, attachedFiles, isStreaming, isUploading, onSend, clearImages, model, modelList, cwd, formatBytes]);

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
      } catch (err: any) {
        console.error("Upload error:", err);
        setDescribeError(err.message || "上传文件过程中出现未知错误");
        setIsUploading(false);
        return;
      }
      setIsUploading(false);
    }

    if (mode === "steer" && onSteer) {
      onSteer(finalMsg, attachedImages.length ? attachedImages : undefined);
    } else if (mode === "followup" && onFollowUp) {
      onFollowUp(finalMsg, attachedImages.length ? attachedImages : undefined);
    }
    setValue("");
    clearImages();
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }, [value, attachedImages, attachedFiles, onSteer, onFollowUp, clearImages, model, modelList, cwd, isUploading, formatBytes]);

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
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);



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
          processFiles(files);
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
          )}
        </div>

        {/* Bottom bar: left | center (context) | right */}
        <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>

          {/* LEFT: attach + model selector (idle) or steer/followup toggle (streaming) */}
          <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: 2 }}>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isStreaming}
              title="Attach image"
              style={{
                flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                width: 32, height: 32, padding: 0,
                background: "none", border: "none",
                borderRadius: 9,
                color: attachedImages.length ? "var(--accent)" : "var(--text-muted)",
                cursor: isStreaming ? "not-allowed" : "pointer",
                opacity: isStreaming ? 0.5 : 1,
                transition: "background 0.12s, color 0.12s",
              }}
              onMouseEnter={(e) => {
                if (isStreaming) return;
                e.currentTarget.style.background = "var(--bg-hover)";
                e.currentTarget.style.color = attachedImages.length ? "var(--accent)" : "var(--text)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "none";
                e.currentTarget.style.color = attachedImages.length ? "var(--accent)" : "var(--text-muted)";
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
            </button>
            <button
              onClick={() => fileUploadInputRef.current?.click()}
              disabled={isStreaming || isUploading}
              title="Upload files to workspace"
              style={{
                flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                width: 32, height: 32, padding: 0,
                background: "none", border: "none",
                borderRadius: 9,
                color: attachedFiles.length ? "var(--accent)" : "var(--text-muted)",
                cursor: (isStreaming || isUploading) ? "not-allowed" : "pointer",
                opacity: (isStreaming || isUploading) ? 0.5 : 1,
                transition: "background 0.12s, color 0.12s",
              }}
              onMouseEnter={(e) => {
                if (isStreaming || isUploading) return;
                e.currentTarget.style.background = "var(--bg-hover)";
                e.currentTarget.style.color = attachedFiles.length ? "var(--accent)" : "var(--text)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "none";
                e.currentTarget.style.color = attachedFiles.length ? "var(--accent)" : "var(--text-muted)";
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
            </button>
            {isTts && (() => {
              const modelIdStr = model?.modelId || "";
              const isVoiceClone = isVoiceCloneModel(model?.provider, modelIdStr);
              return (
                <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  {isVoiceClone && (
                    <button
                      onClick={isRecording ? stopRecording : startRecording}
                      disabled={isStreaming}
                      title={isRecording ? "停止录音" : "麦克风录音 (可作为声音克隆音源)"}
                      style={{
                        flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                        width: 32, height: 32, padding: 0,
                        background: isRecording ? "rgba(239,68,68,0.15)" : "none", border: "none",
                        borderRadius: 9,
                        color: isRecording ? "#ef4444" : "var(--text-muted)",
                        cursor: isStreaming ? "not-allowed" : "pointer",
                        opacity: isStreaming ? 0.5 : 1,
                        transition: "background 0.12s, color 0.12s",
                      }}
                      onMouseEnter={(e) => {
                        if (isStreaming) return;
                        e.currentTarget.style.background = isRecording ? "rgba(239,68,68,0.2)" : "var(--bg-hover)";
                        e.currentTarget.style.color = isRecording ? "#ef4444" : "var(--text)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = isRecording ? "rgba(239,68,68,0.15)" : "none";
                        e.currentTarget.style.color = isRecording ? "#ef4444" : "var(--text-muted)";
                      }}
                    >
                      {isRecording ? (
                        <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: 14, height: 14 }}>
                          <style>{`
                            @keyframes micPulse {
                              0% { transform: scale(0.9); opacity: 0.5; }
                              50% { transform: scale(1.3); opacity: 1; }
                              100% { transform: scale(0.9); opacity: 0.5; }
                            }
                          `}</style>
                          <span style={{ position: "absolute", width: 14, height: 14, borderRadius: "50%", background: "#ef4444", animation: "micPulse 1.2s infinite" }} />
                          <span style={{ position: "absolute", width: 6, height: 6, borderRadius: "50%", background: "#fff" }} />
                        </div>
                      ) : (
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                          <line x1="12" y1="19" x2="12" y2="22" />
                        </svg>
                      )}
                    </button>
                  )}
                  <button
                    onClick={() => setVoiceConsoleOpen(v => !v)}
                    title="语音工坊设定"
                    style={{
                      flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                      width: 32, height: 32, padding: 0,
                      background: voiceConsoleOpen ? "rgba(var(--accent-rgb), 0.12)" : "none", border: "none",
                      borderRadius: 9,
                      color: voiceConsoleOpen ? "var(--accent)" : "var(--text-muted)",
                      cursor: "pointer",
                      transition: "background 0.12s, color 0.12s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "var(--bg-hover)";
                      e.currentTarget.style.color = "var(--text)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = voiceConsoleOpen ? "rgba(var(--accent-rgb), 0.12)" : "none";
                      e.currentTarget.style.color = voiceConsoleOpen ? "var(--accent)" : "var(--text-muted)";
                    }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="3" />
                      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                    </svg>
                  </button>
                </div>
              );
            })()}
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
          </div>

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
                    const lvl = thinkingLevel ?? "auto";
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

      {/* 🪄 Premium Image Reverse-Prompt Modal */}
      {promptModalOpen && (() => {
        const jsonText = parseDescriptionToJSON(promptModalText);
        const activeText = promptTab === "text" ? promptModalText : jsonText;

        return (
          <div style={{
            position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(0, 0, 0, 0.45)", backdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 9999, padding: 16,
            animation: "fadeIn 0.2s ease-out",
          }}>
            <style>{`
              @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
              }
              @keyframes scaleIn {
                from { transform: scale(0.96); opacity: 0; }
                to { transform: scale(1); opacity: 1; }
              }
            `}</style>
            <div style={{
              background: "var(--bg-panel)",
              border: "1px solid var(--border)",
              borderRadius: 16,
              width: "100%",
              maxWidth: 560,
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
              display: "flex",
              flexDirection: "column",
              animation: "scaleIn 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)",
              overflow: "hidden",
            }}>
              {/* Header with Tabs */}
              <div style={{
                display: "flex",
                borderBottom: "1px solid var(--border)",
                background: "rgba(255,255,255,0.02)",
                padding: "0 20px",
                alignItems: "center",
                justifyContent: "space-between",
              }}>
                <div style={{ display: "flex", gap: 16 }}>
                  <button
                    onClick={() => setPromptTab("text")}
                    style={{
                      padding: "16px 4px",
                      border: "none",
                      borderBottom: `2px solid ${promptTab === "text" ? "var(--accent)" : "transparent"}`,
                      background: "none",
                      color: promptTab === "text" ? "var(--text)" : "var(--text-muted)",
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: "pointer",
                      transition: "color 0.15s, border-color 0.15s",
                    }}
                  >
                    文本格式
                  </button>
                  <button
                    onClick={() => setPromptTab("json")}
                    style={{
                      padding: "16px 4px",
                      border: "none",
                      borderBottom: `2px solid ${promptTab === "json" ? "var(--accent)" : "transparent"}`,
                      background: "none",
                      color: promptTab === "json" ? "var(--text)" : "var(--text-muted)",
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: "pointer",
                      transition: "color 0.15s, border-color 0.15s",
                    }}
                  >
                    JSON 格式
                  </button>
                </div>
                
                <button
                  onClick={() => setPromptModalOpen(false)}
                  style={{
                    background: "none", border: "none", color: "var(--text-muted)",
                    cursor: "pointer", display: "flex", alignItems: "center", padding: 4,
                    borderRadius: "50%", transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg-hover)"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "none"}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              {/* Content Body */}
              <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                  {promptTab === "text" 
                    ? "视觉大模型已为您反推解析出以下结构化文本提示词：" 
                    : "已将提示词自动分词并重构为以下 image_prompt JSON 结构："}
                </div>
                <textarea
                  readOnly
                  value={activeText}
                  style={{
                    width: "100%",
                    height: 220,
                    padding: 12,
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    fontSize: 13,
                    lineHeight: "1.6",
                    color: "var(--text)",
                    resize: "none",
                    outline: "none",
                    fontFamily: promptTab === "json" ? "var(--font-mono), monospace" : "inherit",
                  }}
                />
              </div>

              {/* Footer Actions */}
              <div style={{
                padding: "16px 20px",
                borderTop: "1px solid var(--border)",
                background: "rgba(255,255,255,0.01)",
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
              }}>
                <button
                  onClick={() => {
                    setValue((v) => v + (v ? "\n\n" : "") + activeText);
                    setPromptModalOpen(false);
                    requestAnimationFrame(() => {
                      if (textareaRef.current) {
                        textareaRef.current.focus();
                        textareaRef.current.style.height = "auto";
                        textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
                      }
                    });
                  }}
                  style={{
                    padding: "8px 16px",
                    background: "rgba(129,140,248,0.1)",
                    border: "1px solid rgba(129,140,248,0.25)",
                    borderRadius: 8,
                    color: "rgb(99,102,241)",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 600,
                    transition: "background 0.12s",
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "rgba(129,140,248,0.18)"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "rgba(129,140,248,0.1)"}
                >
                  插入到输入框
                </button>
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(activeText);
                      setCopySuccess(true);
                      setTimeout(() => setCopySuccess(false), 2000);
                    } catch (err) {
                      console.error("Failed to copy text:", err);
                    }
                  }}
                  style={{
                    padding: "8px 18px",
                    background: copySuccess ? "#10B981" : "var(--accent)",
                    border: "none",
                    borderRadius: 8,
                    color: "#fff",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) => { if (!copySuccess) e.currentTarget.style.filter = "brightness(1.15)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.filter = "none"; }}
                >
                  {copySuccess ? (
                    <>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      已复制！
                    </>
                  ) : (
                    <>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                      复制提示词
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
});
