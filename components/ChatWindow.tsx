"use client";

import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import type { AgentMessage, SessionInfo, SessionTreeNode } from "@/lib/types";
import { MessageView } from "./MessageView";
import { ChatInput, type ChatInputHandle } from "./ChatInput";
import { ChatMinimap, useMessageRefs } from "./ChatMinimap";
import { useAgentSession, type AgentPhase } from "@/hooks/useAgentSession";
import { useAudio } from "@/hooks/useAudio";
import { useDragDrop } from "@/hooks/useDragDrop";

// Pipeline & Design Tools Integrations
import { usePipeline } from "@/hooks/usePipeline";
import { PipelinePanel } from "./PipelinePanel";
import { useDesignCritic } from "@/hooks/useDesignCritic";
import { DesignCriticPanel } from "./design-critic/DesignCriticPanel";
import { PptProgressPanel } from "./PptProgressPanel";
import type { UserSelection } from "./design-critic/AnnotatedImage";
import { BilibiliCookieModal } from "./BilibiliCookieModal";
import { generateCodeForIssue } from "@/lib/design-critic/code-generator";
import { encodeFilePathForApi, joinFilePath } from "@/lib/file-paths";

interface Props {
  session: SessionInfo | null;
  newSessionCwd: string | null;
  onAgentEnd?: () => void;
  onSessionCreated?: (session: SessionInfo) => void;
  onSessionForked?: (newSessionId: string) => void;
  modelsRefreshKey?: number;
  chatInputRef?: React.RefObject<ChatInputHandle | null>;
  onBranchDataChange?: (tree: SessionTreeNode[], activeLeafId: string | null, onLeafChange: (leafId: string | null) => void) => void;
  onSystemPromptChange?: (prompt: string | null) => void;
  onSessionStatsChange?: (stats: { tokens: { input: number; output: number; cacheRead: number; cacheWrite: number }; cost?: number } | null) => void;
  onContextUsageChange?: (usage: { percent: number | null; contextWindow: number; tokens: number | null } | null) => void;
  activeGemId?: string | null;
  pipelineActive?: boolean;
  onPipelineDeactivate?: () => void;
  designToolsActive?: boolean;
  onDesignToolsDeactivate?: () => void;
  designSystem?: string | null;
  onDesignSystemChange?: (ds: string | null) => void;
  designSystemList?: any[];
  onOpenDeepResearch?: () => void;
  onOpenFile?: (filePath: string, fileName: string) => void;
}

function phaseLabel(phase: AgentPhase): string {
  if (phase?.kind === "running_tools") {
    const names = phase.tools.map((t) => t.name);
    if (names.length === 0) return "Running tool...";
    if (names.length === 1) return `Running ${names[0]}...`;
    if (names.length <= 3) return `Running ${names.join(", ")}...`;
    return `Running ${names.slice(0, 2).join(", ")} (+${names.length - 2})...`;
  }
  if (phase?.kind === "waiting_model") return "Waiting for model...";
  return "Thinking...";
}



function getMessageTextContent(content: any): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((block: any) => {
        if (typeof block === "string") return block;
        if (block && typeof block === "object") {
          if (block.type === "text") return block.text;
        }
        return "";
      })
      .join("\n");
  }
  return "";
}

function getWorkspaceCwd(cwd: string): string {
  return cwd;
}

export function ChatWindow({
  session, newSessionCwd, onAgentEnd, onSessionCreated, onSessionForked,
  modelsRefreshKey, chatInputRef, onBranchDataChange, onSystemPromptChange,
  onSessionStatsChange, onContextUsageChange, activeGemId,
  pipelineActive, onPipelineDeactivate, designToolsActive, onDesignToolsDeactivate,
  designSystem, onDesignSystemChange, designSystemList, onOpenDeepResearch, onOpenFile
}: Props) {
  const [gemName, setGemName] = useState<string | null>(null);
  const [cookieModalOpen, setCookieModalOpen] = useState(false);
  const [pptSessionId, setPptSessionId] = useState<string | null>(null);
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [pptSessionState, setPptSessionState] = useState<any>(null);

  const pipelineAgentEventRef = useRef<((event: any) => void) | null>(null);

  const handleAgentEventFromOptions = useCallback((event: any) => {
    if (pipelineAgentEventRef.current) {
      pipelineAgentEventRef.current(event);
    }
  }, []);

  const wrappedOnAgentEndRef = useRef(onAgentEnd);
  const wrappedOnAgentEnd = useCallback(() => {
    onAgentEnd?.();
  }, [onAgentEnd]);
  wrappedOnAgentEndRef.current = wrappedOnAgentEnd;

  useEffect(() => {
    if (activeGemId) {
      fetch("/api/gem-xy")
        .then((res) => res.json())
        .then((gems: import("@/lib/types").GemProfile[]) => {
          const gem = gems.find((g) => g.id === activeGemId);
          if (gem) {
            setGemName(`${gem.avatar || "🤖"} ${gem.name}`);
          }
        })
        .catch(() => {});
    } else {
      setGemName(null);
    }
  }, [activeGemId]);

  const {
    loading, error, messages, entryIds, streamState,
    agentRunning, modelNames, modelList, modelThinkingLevels, modelThinkingLevelMaps, toolPreset, thinkingLevel,
    retryInfo, contextUsage, forkingEntryId,
    isCompacting, compactError, displayModel: displayModelValue, sessionStats,
    agentPhase,
    isNew,
    messagesEndRef, scrollContainerRef,
    lastUserMsgRef,
    handleSend, handleAbort, handleFork, handleNavigate, handleModelChange,
    handleCompact, handleSteer, handleFollowUp, handleAbortCompaction,
    handleToolPresetChange, handleThinkingLevelChange, handleAgentEventRef,
    loadSession,
  } = useAgentSession({
    session, newSessionCwd, onAgentEnd: wrappedOnAgentEndRef.current, onSessionCreated, onSessionForked,
    modelsRefreshKey, onBranchDataChange, onSystemPromptChange, activeGemId,
    onAgentEvent: handleAgentEventFromOptions,
    designSystem,
  });

  const { soundEnabled, onSoundToggle, playDoneSound } = useAudio();
  const playDoneSoundRef = useRef(playDoneSound);
  playDoneSoundRef.current = playDoneSound;
  const soundEnabledRef = useRef(soundEnabled);
  soundEnabledRef.current = soundEnabled;

  // Wrap agent event handler to play sound on agent_end
  const origHandler = handleAgentEventRef.current;
  useEffect(() => {
    handleAgentEventRef.current = (event) => {
      if (event.type === "agent_end" && soundEnabledRef.current) {
        playDoneSoundRef.current();
      }
      origHandler?.(event);
    };
  }, [origHandler, handleAgentEventRef]);

  // Automatically submit "done" when PPT Confirm UI is completed
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === "PPT_CONFIRM_DONE") {
        console.log("[ChatWindow] Received PPT_CONFIRM_DONE, automatically sending 'done'");
        handleSend("done");
      }
    };
    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [handleSend]);

  // Intercept document clicks on file:/// and open-folder:/// links
  useEffect(() => {
    const handleGlobalClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const anchor = target.closest("a");
      if (anchor) {
        const href = anchor.getAttribute("href");
        if (href) {
          // Match file:/// links (with or without unsafe: prefix from older react-markdown)
          const fileMatch = href.match(/^(?:unsafe:)?file:\/{2,3}(.+)$/i);
          if (fileMatch) {
            event.preventDefault();
            event.stopPropagation();
            const filePath = decodeURIComponent(fileMatch[1]);
            const fileName = filePath.split(/[/\\]/).pop() || "file";
            onOpenFile?.(filePath, fileName);
            return;
          }

          // Match open-folder:/// links
          const openFolderMatch = href.match(/^(?:unsafe:)?open-folder:\/{2,3}(.+)$/i);
          if (openFolderMatch) {
            event.preventDefault();
            event.stopPropagation();
            const filePath = decodeURIComponent(openFolderMatch[1]);
            fetch("/api/ppt/open-folder", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ filePath }),
            }).catch((err) => console.error("Failed to open containing folder:", err));
          }
        }
      }
    };
    document.addEventListener("click", handleGlobalClick, true);
    return () => {
      document.removeEventListener("click", handleGlobalClick, true);
    };
  }, [onOpenFile]);

  // Keep messages ref in sync so getLastAssistantText always reads latest
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // Proactively cache latest assistant text to window on every messages update
  useEffect(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role === 'assistant') {
        const text = getMessageTextContent(m.content);
        if (text) {
          const win = window as unknown as Record<string, string | undefined>;
          win.__pipelineAssistantCache = text;
          break;
        }
      }
    }
  }, [messages]);

  // Trigger PPT generation if user uploads a document in a PPT session
  const isPptActive = activeGemId === "ppt-master-preset" || session?.gemId === "ppt-master-preset";
  const lastProcessedMsgIdRef = useRef<string | number | null>(null);
  const initializedPptSessionKeyRef = useRef<string | null>(null);
  const initialCompileMsgIdRef = useRef<string | number | null>(null);
  const processedPptTriggerKeysRef = useRef<Set<string>>(new Set());
  const processedPptCompileKeysRef = useRef<Set<string>>(new Set());
  const pptConfirmNotifiedRef = useRef(false);
  const pptSessionKey = session?.id ?? (newSessionCwd ? `new:${newSessionCwd}:${activeGemId ?? ""}` : "none");

  // Initialize the ref to the latest assistant message ID on session load
  useEffect(() => {
    const previousPptSessionKey = initializedPptSessionKeyRef.current;
    if (initializedPptSessionKeyRef.current === pptSessionKey) return;
    if (session && loading) return;

    const isRealSessionFromNewPpt =
      !!session &&
      session.gemId === "ppt-master-preset" &&
      !!previousPptSessionKey?.startsWith("new:") &&
      previousPptSessionKey.endsWith(":ppt-master-preset");

    // Determine if we are transitioning from a new session state to a saved real session of the same PPT preset.
    // In this case, we should preserve the active PPT generation state to prevent duplicate triggering.
    const isTransitionFromNewToReal = isRealSessionFromNewPpt;

    if (isTransitionFromNewToReal) {
      // Update msg ID references instead of nullifying them, to prevent double processing of the trigger message
      let latestAssistantMsgIdx = -1;
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === "assistant") {
          latestAssistantMsgIdx = i;
          break;
        }
      }
      if (latestAssistantMsgIdx !== -1) {
        lastProcessedMsgIdRef.current = entryIds[latestAssistantMsgIdx] || latestAssistantMsgIdx;
      }
      initialCompileMsgIdRef.current = null;
    } else {
      let latestAssistantMsgIdx = -1;
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === "assistant") {
          latestAssistantMsgIdx = i;
          break;
        }
      }
      if (latestAssistantMsgIdx !== -1) {
        lastProcessedMsgIdRef.current = entryIds[latestAssistantMsgIdx] || latestAssistantMsgIdx;
      } else {
        lastProcessedMsgIdRef.current = null;
      }

      // Scan for the latest [COMPILE_PPT] message in history on load
      let latestCompileMsgId: string | number | null = null;
      for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (msg.role === "assistant") {
          const text = typeof msg.content === "string"
            ? msg.content
            : Array.isArray(msg.content)
              ? (msg.content as any[])
                  .filter((b: any) => b && typeof b === "object" && b.type === "text")
                  .map((b: any) => b.text)
                  .join("\n")
              : "";
          if (/\[COMPILE_PPT\]?/.test(text)) {
            latestCompileMsgId = entryIds[i] || i;
            break;
          }
        }
      }
      initialCompileMsgIdRef.current = latestCompileMsgId;
    }
    initializedPptSessionKeyRef.current = pptSessionKey;

    // Only clear states if we are NOT transitioning from a new PPT session to a saved real one.
    if (!isTransitionFromNewToReal) {
      processedPptTriggerKeysRef.current.clear();
      processedPptCompileKeysRef.current.clear();
      pptConfirmNotifiedRef.current = false;
      setPptSessionId(null);
      setProjectPath(null);
      setPptSessionState(null);
    }
  }, [pptSessionKey, session, loading, messages, entryIds]);

  useEffect(() => {
    if (!isPptActive || pptSessionId) return;

    // Find the latest assistant message in the messages list
    let latestAssistantMsgIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") {
        latestAssistantMsgIdx = i;
        break;
      }
    }

    if (latestAssistantMsgIdx !== -1) {
      const latestAssistantMsg = messages[latestAssistantMsgIdx];
      const msgId = entryIds[latestAssistantMsgIdx] || latestAssistantMsgIdx;

      if (msgId && lastProcessedMsgIdRef.current === msgId) {
        return;
      }

      const text = typeof latestAssistantMsg.content === "string"
        ? latestAssistantMsg.content
        : Array.isArray(latestAssistantMsg.content)
          ? latestAssistantMsg.content
              .filter((b: any) => b && typeof b === "object" && b.type === "text")
              .map((b: any) => b.text)
              .join("\n")
          : "";

      // Regular expression matching: [START_PPT: Temp/filename.ext] (optional closing bracket to handle LLM truncation)
      const match = text.match(/\[START_PPT:\s*([^\]\s]+)\]?/);
      if (match) {
        const sourceFile = match[1].trim();
        const triggerKey = `${latestAssistantMsgIdx}:${sourceFile}`;
        if (processedPptTriggerKeysRef.current.has(triggerKey)) return;

        processedPptTriggerKeysRef.current.add(triggerKey);
        lastProcessedMsgIdRef.current = msgId;
        const startGen = async () => {
          try {
            const res = await fetch("/api/ppt/generate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                cwd: session?.cwd || newSessionCwd || "",
                sourceFile,
              }),
            });
            const data = await res.json();
            if (data.success && data.sessionId) {
              setPptSessionId(data.sessionId);
              if (data.projectPath) {
                setProjectPath(data.projectPath);
              }
            }
          } catch (e) {
            console.error("Failed to start PPT generation:", e);
          }
        };
        startGen();
      }
    }
  }, [messages, entryIds, isPptActive, pptSessionId, session, newSessionCwd]);

  // Trigger PPT compilation when [COMPILE_PPT] is detected in assistant messages
  useEffect(() => {
    if (!isPptActive || !pptSessionId || !projectPath || agentRunning) return;

    // Find the latest assistant message in the messages list
    let latestAssistantMsgIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") {
        latestAssistantMsgIdx = i;
        break;
      }
    }

    if (latestAssistantMsgIdx !== -1) {
      const latestAssistantMsg = messages[latestAssistantMsgIdx];
      const msgId = entryIds[latestAssistantMsgIdx];
      if (typeof msgId !== "string") return; // Wait until entryIds has been loaded and the message has a stable ID

      const text = typeof latestAssistantMsg.content === "string"
        ? latestAssistantMsg.content
        : Array.isArray(latestAssistantMsg.content)
          ? latestAssistantMsg.content
              .filter((b: any) => b && typeof b === "object" && b.type === "text")
              .map((b: any) => b.text)
              .join("\n")
          : "";

      // Regex matching: [COMPILE_PPT] (optional closing bracket to handle LLM truncation at the end of the text)
      if (/\[COMPILE_PPT\]?\s*$/.test(text)) {
        if (initialCompileMsgIdRef.current === msgId) return; // Prevent double compilation from history on load

        const triggerKey = `${msgId}:${pptSessionId}`;
        if (processedPptCompileKeysRef.current.has(triggerKey)) return;

        processedPptCompileKeysRef.current.add(triggerKey);
        const triggerCompile = async () => {
          try {
            await fetch("/api/ppt/compile", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                sessionId: pptSessionId,
                cwd: session?.cwd || newSessionCwd || "",
                projectPath,
                agentSessionId: session?.id || null,
              }),
            });
          } catch (e) {
            console.error("Failed to start PPT compilation:", e);
          }
        };
        triggerCompile();
      }
    }
  }, [messages, entryIds, isPptActive, pptSessionId, projectPath, session, newSessionCwd, agentRunning]);

  // Memoize PPT callbacks to prevent SSE reconnection on every render
  const pptOnComplete = useCallback((pptxPath: string) => {
    // Reload session so that the newly injected completion message is loaded immediately
    if (session?.id) {
      loadSession(session.id);
    }

    if (onOpenFile) {
      const fileName = pptxPath.split(/[/\\]/).pop() || "generated.pptx";
      onOpenFile(pptxPath, fileName);
    }
  }, [onOpenFile, loadSession, session]);

  const pptOnClose = useCallback(() => {
    fetch("/api/ppt/close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: pptSessionId }),
    }).catch(() => {});
    setPptSessionId(null);
    setPptSessionState(null);
  }, [pptSessionId]);

  const pptOnProjectPathResolved = useCallback((path: string) => {
    if (path && path !== projectPath) {
      setProjectPath(path);
    }
  }, [projectPath]);

  // Auto-notify AI agent when PPT confirm UI transitions to waiting_design
  useEffect(() => {
    if (!pptSessionState || !pptSessionId) return;
    if (pptConfirmNotifiedRef.current) return;

    if (pptSessionState.step === "waiting_design") {
      pptConfirmNotifiedRef.current = true;
      handleFollowUp("[System] 用户已确认设计规范。请立即读取项目中的 spec_lock.md，然后按照规范逐页编写 SVG 到 svg_output/ 目录，并更新 notes/total.md 演讲备注。完成后输出 [COMPILE_PPT]。");
    }
  }, [pptSessionState, pptSessionId, handleFollowUp]);

  // Module-level cache for assistant text — survives HMR
  const getLastAssistantText = useCallback(() => {
    let lastUserIdx = -1;
    const msgs = messagesRef.current;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'user') {
        lastUserIdx = i;
        break;
      }
    }

    if (lastUserIdx !== -1) {
      for (let i = msgs.length - 1; i > lastUserIdx; i--) {
        const m = msgs[i];
        if (m.role === 'assistant') {
          const text = getMessageTextContent(m.content);
          if (text) {
            const win = window as unknown as Record<string, string | undefined>;
            win.__pipelineAssistantCache = text;
          }
          return text;
        }
      }
    }
    const win = window as unknown as Record<string, string | undefined>;
    return win.__pipelineAssistantCache || '';
  }, []);

  const pipeline = usePipeline({
    agentHandleSend: handleSend,
    agentRunning,
    getLastAssistantText,
    sessionId: session?.id,
    cwd: session?.cwd || newSessionCwd,
    onTtsComplete: () => {
      if (session?.id) {
        loadSession(session.id);
      }
    },
  });

  // Keep pipeline agent event ref in sync
  pipelineAgentEventRef.current = pipeline.handleAgentEvent;

  const designCritic = useDesignCritic();

  const handleGenerateManualFix = useCallback(async (params: {
    screenshot: string;
    selections: UserSelection[];
    prompts: Map<number, string>;
    codes: Map<number, string>;
    htmlSource?: string;
    filePath?: string;
  }) => {
    onDesignToolsDeactivate?.();

    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const tmp = `Temp/New_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];

    const regionDescriptions = params.selections.map((sel, idx) => {
      const prompt = params.prompts.get(sel.id) || '';
      const code = params.codes.get(sel.id) || '';
      const label = CIRCLED[idx] || `${idx + 1}`;
      const coords = `x=${(sel.x * 100).toFixed(1)}%, y=${(sel.y * 100).toFixed(1)}%, w=${(sel.w * 100).toFixed(1)}%, h=${(sel.h * 100).toFixed(1)}%`;
      let block = `### 区域 ${label} [${coords}]\n- 修改需求: ${prompt}`;
      if (sel.elementHtml) {
        block += `\n- 对应网页元素代码片段:\n\`\`\`html\n${sel.elementHtml}\n\`\`\``;
      }
      if (code) block += `\n- 参考代码片段:\n\`\`\`\n${code}\n\`\`\``;
      return block;
    }).join('\n\n');

    const premiumDesignGuide = `\n\n## 界面美化设计规范（必须严格遵守）\n1. **高端视觉设计**：严禁使用未经设计的原生或刺眼的纯红、纯绿、纯蓝。优先选用深浅渐变、微渐变、和谐平衡的 HSL 柔和调色盘。\n2. **现代排版与字体**：通过 CDN 引入并应用现代字体（如 \`Inter\`、\`Outfit\` 或 \`Cabinet Grotesk\` 等 Google Fonts），建立字号和字重的合理视觉梯度。\n3. **细节与动态美感**：为卡片、按钮和链接添加精美的 hover 悬停效果与平滑的过渡动画。使用精致的圆角（卡片 12px~16px，按钮 6px~8px）与细腻的阴影（如 \`shadow-sm\` 到 \`shadow-lg\`）来增加视觉层级。`;

    let prompt: string;
    if (params.htmlSource) {
      const fileName = params.filePath || 'design-finetune.html';
      const fileInstruction = `目标文件路径: \`${tmp}/${fileName}\`（已保存到工作区，请直接读取并修改此文件）`;
      prompt = `我需要你基于一个已有的 HTML 文件进行定向修改。\n\n## ${fileInstruction}\n\n## 原始 HTML 源码（必须基于此修改，保留结构和逻辑）\n\`\`\`html\n${params.htmlSource.slice(0, 15000)}\n\`\`\`\n\n## 截图预览 + 修改标注\n请查看附带的截图，我在上面标记了 ${params.selections.length} 个需要修改的区域。\n\n## 修改需求\n${regionDescriptions}${premiumDesignGuide}\n\n## 执行要求\n1. **基于源码修改**：以上述 HTML 源码为基础，只针对标注区域做定向修改，不要从零重写\n2. **保留原有结构**：保留原有的 HTML 结构、class 命名、ID、JS 逻辑，只修改样式和内容\n3. **逐区域修改**：针对每个标记区域的需求，找到对应的 DOM 节点进行修改\n4. **禁止读取其他文件**：不要使用 read 工具读取项目中的任何其他文件，所有需要的信息都已在上方提供\n5. **保存修改后的文件**：将修改后的完整 HTML 写回目标文件（\`${tmp}/${fileName}\`）\n6. **生成设计思路文档**：创建一个 Markdown 文件（\`${tmp}/design-finetune-report.md\`），内容包括：每个区域的修改思路和设计决策、修改前后的代码对比、关键 CSS 样式说明\n7. **确保可运行**：修改后的 HTML 必须能直接在浏览器中打开，无错误\n\n请逐步思考并执行。`;
    } else {
      prompt = `我需要你帮我对一个网页的特定区域进行设计微调。\n\n## 整体截图\n请查看附带的网页截图，了解整体页面结构和设计风格。\n\n## 需要修改的区域\n我在截图中标记了 ${params.selections.length} 个区域，每个区域都有具体的修改需求：\n\n${regionDescriptions}${premiumDesignGuide}\n\n## 执行要求\n1. **理解原图**：仔细分析截图中的整体布局、配色、字体、间距等设计要素\n2. **逐区域修改**：针对每个标记区域的需求，进行相应的设计调整\n3. **保持一致性**：修改后的区域需要与页面整体风格保持和谐统一\n4. **生成 HTML 页面**：创建一个单文件 HTML 页面（例如 \`${tmp}/design-finetune.html\`），完整还原原图结构，但融入上述修改\n5. **生成设计思路文档**：创建一个 Markdown 文件（例如 \`${tmp}/design-finetune-report.md\`），内容包括：原始设计分析、每个区域的修改思路和设计决策、修改前后对比说明、关键 CSS/Tailwind 样式说明\n6. **确保可运行**：生成的 HTML 必须能直接在浏览器中打开，无错误\n\n请逐步思考并执行。`;
    }

    const imagesPayload: { type: "image"; data: string; mimeType: string }[] = [];
    if (!params.htmlSource && params.screenshot) {
      const rawBase64 = params.screenshot.replace(/^data:image\/\w+;base64,/, '');
      imagesPayload.push({ type: "image", data: rawBase64, mimeType: "image/png" });
    }

    try {
      const activeCwd = session?.cwd || newSessionCwd || process.cwd();
      const { PRESET_DEFAULT } = await import("@/components/ToolPanel");

      if (params.htmlSource) {
        const fileName = params.filePath || 'design-finetune.html';
        const destPath = joinFilePath(joinFilePath(activeCwd, tmp), fileName);
        const encoded = encodeFilePathForApi(destPath);
        const saveRes = await fetch(`/api/files/${encoded}`, {
          method: "POST",
          body: params.htmlSource,
        });
        if (!saveRes.ok) {
          const errData = await saveRes.json().catch(() => ({}));
          throw new Error(errData.error || "保存 HTML 文件失败");
        }
      }

      const res = await fetch("/api/agent/new", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cwd: activeCwd,
          type: "prompt",
          message: prompt,
          toolNames: PRESET_DEFAULT,
          images: imagesPayload,
          ...(displayModelValue ? { provider: displayModelValue.provider, modelId: displayModelValue.modelId } : {}),
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      onSessionCreated?.({
        id: data.sessionId,
        path: "",
        cwd: activeCwd,
        name: undefined,
        created: new Date().toISOString(),
        modified: new Date().toISOString(),
        messageCount: 1,
        firstMessage: `手动微调设计 (${params.selections.length}个区域)`,
      });
    } catch (err) {
      console.error("Failed to generate manual fix:", err);
      alert("创建新会话失败，请重试：" + String(err));
    }
  }, [session, newSessionCwd, displayModelValue, onSessionCreated, onDesignToolsDeactivate]);

  const handleGenerateReplica = useCallback(async (params: {
    screenshot?: string;
    url?: string;
    designSystemId?: string;
    prompt: string;
    code?: string;
    replicaMode?: 'hifi' | 'wireframe' | 'nextjs';
    targetPath?: string;
    cloneLanguage?: 'zh' | 'en';
  }) => {
    onDesignToolsDeactivate?.();

    // Next.js full project clone mode
    if (params.replicaMode === 'nextjs' && params.url) {
      try {
        const cloneRes = await fetch('/api/design-critic/clone-init', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: params.url, targetPath: params.targetPath, language: params.cloneLanguage }),
        });
        if (!cloneRes.ok) {
          const errData = await cloneRes.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP ${cloneRes.status}`);
        }
        const cloneData = await cloneRes.json();

        const { PRESET_DEFAULT } = await import("@/components/ToolPanel");
        const initialMsg = params.cloneLanguage === 'zh'
          ? `/clone-website ${params.url}\n\n重要提示：请务必全程使用中文（简体）与我交流，所有的思考思考过程、工作日志、组件说明规格书（.spec.md）以及设计思路报告也必须全部用中文撰写。`
          : `/clone-website ${params.url}`;

        const agentRes = await fetch("/api/agent/new", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cwd: cloneData.projectPath,
            type: "prompt",
            message: initialMsg,
            toolNames: PRESET_DEFAULT,
            ...(displayModelValue ? { provider: displayModelValue.provider, modelId: displayModelValue.modelId } : {}),
          }),
        });
        if (!agentRes.ok) throw new Error(`Agent creation failed: HTTP ${agentRes.status}`);
        const agentData = await agentRes.json();
        onSessionCreated?.({
          id: agentData.sessionId,
          path: "",
          cwd: cloneData.projectPath,
          name: undefined,
          created: new Date().toISOString(),
          modified: new Date().toISOString(),
          messageCount: 1,
          firstMessage: `Next.js 项目克隆: ${params.url}`,
        });
      } catch (err) {
        console.error("Failed to clone Next.js project:", err);
        alert("Next.js 项目克隆失败，请重试：" + String(err));
      }
      return;
    }

    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const tmp = `Temp/New_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    const matchedBrandId = params.designSystemId || null;
    let matchedBrandName = '经典';

    if (matchedBrandId) {
      try {
        const dsRes = await fetch('/api/design-systems');
        const dsList = await dsRes.json();
        const found = Array.isArray(dsList) ? dsList.find((d: any) => d.id === matchedBrandId) : null;
        if (found) matchedBrandName = found.name;
      } catch {}
    }

    let designTokenSection = '';
    if (matchedBrandId) {
      try {
        const dsContentRes = await fetch(`/api/design-systems?id=${encodeURIComponent(matchedBrandId)}`);
        if (dsContentRes.ok) {
          const dsData = await dsContentRes.json();
          if (dsData.content) {
            const truncated = dsData.content.length > 12000 ? dsData.content.slice(0, 12000) + '\n...(已截断)' : dsData.content;
            designTokenSection = `\n## 参考设计系统「${matchedBrandName}」\n以下是完整的设计规范，你必须严格遵循其中的配色 Hex 值、字体族、圆角大小等设计 Token：\n\n\`\`\`markdown\n${truncated}\n\`\`\``;
          }
        }
      } catch {}
      if (!designTokenSection) {
        designTokenSection = `\n## 参考设计系统\n本项目已锁定「${matchedBrandName}」设计系统。请使用该品牌的设计风格。`;
      }
    }

    let codeSection = '';
    if (params.code) {
      codeSection = `\n## 参考代码\n用户提供了以下参考代码，请在复刻时参考其结构和实现方式：\n\`\`\`\n${params.code.slice(0, 3000)}\n\`\`\``;
    }

    const premiumDesignGuide = `\n\n## 界面美化设计规范（必须严格遵守）\n1. **高端视觉设计**：严禁使用原生或刺眼的纯红、纯绿、纯蓝。优先选用深浅渐变、微渐变、和品牌调性相符的 HSL 柔和配色。\n2. **现代排版与字体**：引入并应用现代字体（如 \`Inter\`、\`Outfit\` 等 Google Fonts），建立合理视觉层次。\n3. **细节与动态美感**：按钮、卡片和导航链接添加精美的 hover 悬停效果与平滑的过渡动画。使用圆角和细腻的阴影来丰富层级。`;

    const prompt = `我需要你根据参考信息，完整复刻一个网页。\n\n## 用户需求\n${params.prompt}\n${designTokenSection}\n${codeSection}${premiumDesignGuide}\n\n## 执行要求\n1. **分析参考截图**：仔细查看附带的截图，理解页面的整体布局结构、视觉层级、配色方案、字体排版、间距关系、交互元素\n2. **像素级还原**：尽可能精确地复刻截图中的布局和视觉效果\n3. **生成 HTML 页面**：创建一个单文件 HTML 页面（例如 \`${tmp}/replica.html\`），使用 Tailwind CSS（通过 CDN 引入），使用现代 CSS 特性，确保响应式设计\n4. **生成设计思路文档**：创建一个 Markdown 文件（例如 \`${tmp}/replica-design.md\`），内容包括：原始设计分析、布局结构决策、设计 Token 应用说明、组件拆分建议、响应式适配策略、后续可优化方向\n5. **确保可运行**：生成的 HTML 必须能直接在浏览器中打开，无错误\n\n请逐步思考并执行。`;

    const imagesPayload: { type: "image"; data: string; mimeType: string }[] = [];
    if (params.screenshot) {
      const rawBase64 = params.screenshot.replace(/^data:image\/\w+;base64,/, '');
      imagesPayload.push({ type: "image", data: rawBase64, mimeType: "image/png" });
    }

    try {
      const activeCwd = session?.cwd || newSessionCwd || process.cwd();
      const { PRESET_DEFAULT } = await import("@/components/ToolPanel");

      const res = await fetch("/api/agent/new", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cwd: activeCwd,
          type: "prompt",
          message: prompt,
          toolNames: PRESET_DEFAULT,
          images: imagesPayload.length > 0 ? imagesPayload : undefined,
          url: params.url && !params.screenshot ? params.url : undefined,
          designSystem: matchedBrandId,
          ...(displayModelValue ? { provider: displayModelValue.provider, modelId: displayModelValue.modelId } : {}),
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      onSessionCreated?.({
        id: data.sessionId,
        path: "",
        cwd: activeCwd,
        name: undefined,
        created: new Date().toISOString(),
        modified: new Date().toISOString(),
        messageCount: 1,
        firstMessage: `整体复刻网页`,
      });
    } catch (err) {
      console.error("Failed to generate replica:", err);
      alert("创建新会话失败，请重试：" + String(err));
    }
  }, [session, newSessionCwd, displayModelValue, onSessionCreated, onDesignToolsDeactivate]);

  const handleGenerateCritique = useCallback(async (params: {
    screenshot?: string;
    url?: string;
  }) => {
    onDesignToolsDeactivate?.();

    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const tmp = `Temp/New_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

    const prompt = `我需要你对一个网页/截图进行 5 维度设计评审。

## 评审维度
请从以下 5 个维度进行专业评审，每个维度给出 0-10 分的评分：

1. **哲学一致性** (Philosophy Consistency) — 设计是否传达了清晰的品牌理念和设计哲学？各元素之间是否有统一的设计语言？
2. **视觉层级** (Visual Hierarchy) — 信息的重要程度是否通过大小、颜色、间距等视觉手段清晰表达？用户能否快速找到核心内容？
3. **细节执行** (Detail Execution) — 像素级对齐、间距一致性、字体渲染、颜色搭配、圆角使用等细节是否精致？
4. **功能性** (Functionality) — 布局是否合理？交互元素是否易于识别和操作？是否符合用户直觉？
5. **创新性** (Innovation) — 是否有独特的设计亮点？是否在常见模式上有所突破或改进？

## 输出要求
1. **生成 HTML 评审报告**（例如 \`${tmp}/critique-report.html\`），包含：
   - 雷达图（使用 Chart.js 或纯 CSS/SVG）展示 5 个维度的得分
   - 每个维度的详细分析和改进建议
   - 总体评分和总结
   - 使用现代化、美观的排版设计
2. **确保可运行**：HTML 必须能直接在浏览器中打开

请逐步思考并执行。`;

    const imagesPayload: { type: "image"; data: string; mimeType: string }[] = [];
    if (params.screenshot) {
      const rawBase64 = params.screenshot.replace(/^data:image\/\w+;base64,/, '');
      imagesPayload.push({ type: "image", data: rawBase64, mimeType: "image/png" });
    }

    try {
      const activeCwd = session?.cwd || newSessionCwd || process.cwd();
      const { PRESET_DEFAULT } = await import("@/components/ToolPanel");

      const res = await fetch("/api/agent/new", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cwd: activeCwd,
          type: "prompt",
          message: prompt,
          toolNames: PRESET_DEFAULT,
          images: imagesPayload.length > 0 ? imagesPayload : undefined,
          url: params.url && !params.screenshot ? params.url : undefined,
          ...(displayModelValue ? { provider: displayModelValue.provider, modelId: displayModelValue.modelId } : {}),
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      onSessionCreated?.({
        id: data.sessionId,
        path: "",
        cwd: activeCwd,
        name: undefined,
        created: new Date().toISOString(),
        modified: new Date().toISOString(),
        messageCount: 1,
        firstMessage: `5维度设计评审`,
      });
    } catch (err) {
      console.error("Failed to generate critique:", err);
      alert("创建新会话失败，请重试：" + String(err));
    }
  }, [session, newSessionCwd, displayModelValue, onSessionCreated, onDesignToolsDeactivate]);

  // Push session stats up to AppShell for the top bar.
  // Compare scalar fields to avoid loops from new object identity each render.
  const statsKey = sessionStats
    ? `${sessionStats.tokens.input}|${sessionStats.tokens.output}|${sessionStats.tokens.cacheRead}|${sessionStats.tokens.cacheWrite}|${sessionStats.cost ?? 0}`
    : null;
  const sessionStatsRef = useRef(sessionStats);
  sessionStatsRef.current = sessionStats;
  useEffect(() => {
    onSessionStatsChange?.(sessionStatsRef.current);
  }, [statsKey, onSessionStatsChange]);
  useEffect(() => () => { onSessionStatsChange?.(null); }, [onSessionStatsChange]);

  // Push context usage up to AppShell as well.
  const ctxKey = contextUsage
    ? `${contextUsage.percent ?? "null"}|${contextUsage.contextWindow}|${contextUsage.tokens ?? "null"}`
    : null;
  const contextUsageRef = useRef(contextUsage);
  contextUsageRef.current = contextUsage;
  useEffect(() => {
    onContextUsageChange?.(contextUsageRef.current);
  }, [ctxKey, onContextUsageChange]);
  useEffect(() => () => { onContextUsageChange?.(null); }, [onContextUsageChange]);

  const onDrop = useCallback((files: File[]) => {
    const images = files.filter((f) => f.type.startsWith("image/"));
    const nonImages = files.filter((f) => !f.type.startsWith("image/"));
    if (images.length > 0) {
      chatInputRef?.current?.addImages(images);
    }
    if (nonImages.length > 0) {
      chatInputRef?.current?.addFiles?.(nonImages);
    }
  }, [chatInputRef]);

  const { isDragOver, handleDragEnter, handleDragOver, handleDragLeave, handleDrop } = useDragDrop(onDrop);

  const visibleMessages = messages.filter((m) => m.role === "user" || m.role === "assistant");
  const messageRefs = useMessageRefs(visibleMessages.length);

  const toolResultsMap = useMemo(() => {
    const map = new Map<string, import("@/lib/types").ToolResultMessage>();
    for (const msg of messages) {
      if (msg.role === "toolResult") {
        map.set((msg as import("@/lib/types").ToolResultMessage).toolCallId, msg as import("@/lib/types").ToolResultMessage);
      }
    }
    return map;
  }, [messages]);

  const isEmptyNew = isNew && messages.length === 0 && !streamState.isStreaming && !agentRunning;

  const availableThinkingLevels = displayModelValue
    ? (modelThinkingLevels[`${displayModelValue.provider}:${displayModelValue.modelId}`] ?? null)
    : null;

  const currentThinkingLevelMap = displayModelValue
    ? (modelThinkingLevelMaps[`${displayModelValue.provider}:${displayModelValue.modelId}`] ?? null)
    : null;

  const chatInputElement = (
    <ChatInput
      ref={chatInputRef}
      sessionId={session?.id ?? null}
      onSend={handleSend}
      onAbort={handleAbort}
      onSteer={agentRunning ? handleSteer : undefined}
      onFollowUp={agentRunning ? handleFollowUp : undefined}
      isStreaming={agentRunning}
      model={displayModelValue}
      modelNames={modelNames}
      modelList={modelList}
      onModelChange={handleModelChange}
      onCompact={session || isNew ? handleCompact : undefined}
      onAbortCompaction={handleAbortCompaction}
      isCompacting={isCompacting}
      compactError={compactError}
      toolPreset={toolPreset}
      onToolPresetChange={session || isNew ? handleToolPresetChange : undefined}
      thinkingLevel={thinkingLevel}
      onThinkingLevelChange={session || isNew ? handleThinkingLevelChange : undefined}
      availableThinkingLevels={availableThinkingLevels}
      thinkingLevelMap={currentThinkingLevelMap}
      retryInfo={retryInfo}
      soundEnabled={soundEnabled}
      onSoundToggle={onSoundToggle}
      cwd={session?.cwd ?? newSessionCwd ?? null}
      onOpenCookieConfig={() => setCookieModalOpen(true)}
      designSystem={designSystem}
      onDesignSystemChange={onDesignSystemChange}
      designSystemList={designSystemList}
      onOpenDeepResearch={onOpenDeepResearch}
      isNew={isNew}
    />
  );

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        {pipelineActive && (
          <div style={{
            position: "fixed",
            top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(15, 23, 42, 0.55)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 9999, padding: 16,
          }}>
            <div style={{ width: "100%", maxWidth: 640 }}>
              <PipelinePanel
                state={pipeline.state}
                config={pipeline.config}
                onConfigChange={pipeline.setConfig}
                onStart={pipeline.start}
                onStartWithLink={pipeline.startWithLink}
                onRewrite={pipeline.startRewrite}
                onRetry={pipeline.retry}
                onReset={pipeline.reset}
                onTriggerTts={pipeline.triggerTts}
                onClose={() => onPipelineDeactivate?.()}
                modelList={modelList}
                currentModelKey={displayModelValue ? `${displayModelValue.provider}/${displayModelValue.modelId}` : undefined}
                onModelChange={handleModelChange}
                onOpenCookieConfig={() => setCookieModalOpen(true)}
              />
            </div>
          </div>
        )}
        {designToolsActive && (
          <div style={{
            position: "fixed",
            top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(15, 23, 42, 0.55)",
            backdropFilter: "blur(16px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 9999, padding: 16,
          }}>
            <DesignCriticPanel
              state={designCritic.state}
              config={designCritic.config}
              onConfigChange={designCritic.setConfig}
              onAnalyze={designCritic.analyze}
              onReset={designCritic.reset}
              onClose={() => onDesignToolsDeactivate?.()}
              onGenerateManualFix={handleGenerateManualFix}
              onGenerateReplica={handleGenerateReplica}
              onGenerateCritique={handleGenerateCritique}
              modelList={modelList}
              currentModelKey={displayModelValue ? `${displayModelValue.provider}/${displayModelValue.modelId}` : undefined}
              onModelChange={handleModelChange}
              workspaceCwd={session?.cwd || newSessionCwd}
            />
          </div>
        )}
        <div className="flex flex-1 items-center justify-center text-text-muted">
          Loading session...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-red-400">
        {error}
      </div>
    );
  }

  return (
    <div
      className="relative flex h-full flex-col overflow-hidden"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragOver && (
        <div className="pointer-events-none absolute inset-0 z-50 flex animate-[drop-zone-in_0.15s_ease_both] items-center justify-center bg-[rgba(37,99,235,0.06)] backdrop-blur-[1px]">
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            {[0, 0.8, 1.6].map((delay) => (
              <div
                key={delay}
                className="absolute h-[720px] w-[720px] rounded-full border-[1.5px] border-solid border-[rgba(37,99,235,0.5)] animate-[drop-ripple_2.4s_ease-out_infinite_backwards]"
                style={{ transformOrigin: "center", animationDelay: `${delay}s` }}
              />
            ))}
          </div>
          <svg
            width="280" height="280" viewBox="0 0 140 140" fill="none" xmlns="http://www.w3.org/2000/svg"
            className="drop-shadow-[0_6px_18px_rgba(37,99,235,0.18)]"
          >
            <rect x="28" y="44" width="84" height="60" rx="8" fill="rgba(37,99,235,0.08)" stroke="rgba(37,99,235,0.50)" strokeWidth="1.8"/>
            <path d="M36 100 L54 72 L68 88 L80 74 L104 100Z" fill="rgba(37,99,235,0.16)" stroke="rgba(37,99,235,0.40)" strokeWidth="1.4" strokeLinejoin="round"/>
            <circle cx="96" cy="58" r="8" fill="rgba(37,99,235,0.22)" stroke="rgba(37,99,235,0.55)" strokeWidth="1.6"/>
            <g stroke="rgba(37,99,235,0.45)" strokeWidth="1.4" strokeLinecap="round">
              <line x1="96" y1="46" x2="96" y2="43"/>
              <line x1="96" y1="70" x2="96" y2="73"/>
              <line x1="84" y1="58" x2="81" y2="58"/>
              <line x1="108" y1="58" x2="111" y2="58"/>
              <line x1="87.5" y1="49.5" x2="85.4" y2="47.4"/>
              <line x1="104.5" y1="66.5" x2="106.6" y2="68.6"/>
              <line x1="104.5" y1="49.5" x2="106.6" y2="47.4"/>
              <line x1="87.5" y1="66.5" x2="85.4" y2="68.6"/>
            </g>
          </svg>
        </div>
      )}

      {isEmptyNew ? (
        <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-4 py-8">
          <div className="w-full max-w-[820px]">
            <div
              className="mb-3"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                marginLeft: 16,
                marginRight: 52,
                fontFamily: "var(--font-mono)",
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, minWidth: 0, flex: 1, lineHeight: 1.4 }}>
                <span style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--text)" }}>π</span>
                <span style={{ fontSize: 22, color: "var(--text)", fontWeight: 700, letterSpacing: "-0.01em" }}>
                  Pi Agent xY{gemName ? ` [${gemName}]` : ""}
                </span>
              </div>
            </div>
            {chatInputElement}
          </div>
        </div>
      ) : (
      <>
      <div className="relative flex flex-1 overflow-hidden">
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto pt-4 [scrollbar-width:none]" style={{ overflowAnchor: "auto" }}>
          <div className="mx-auto max-w-[820px] px-4">

            {(() => {
              let lastUserIdx = -1;
              for (let i = messages.length - 1; i >= 0; i--) {
                if (messages[i].role === "user") { lastUserIdx = i; break; }
              }
              let refIdx = 0;
              return messages.map((msg, idx) => {
                const prevAssistantEntryId =
                  msg.role === "user" && idx > 0 && messages[idx - 1].role === "assistant"
                    ? entryIds[idx - 1]
                    : undefined;
                
                const prevUserContent = msg.role === "assistant" && idx > 0 && messages[idx - 1].role === "user"
                  ? (typeof messages[idx - 1].content === "string"
                      ? (messages[idx - 1].content as string)
                      : Array.isArray(messages[idx - 1].content)
                          ? (messages[idx - 1].content as unknown[])
                              .filter((b): b is { type: "text"; text: string } => !!b && typeof b === "object" && "type" in b && b.type === "text")
                              .map((b) => b.text)
                              .join("\n")
                          : "")
                  : undefined;

                const isVisible = msg.role === "user" || msg.role === "assistant";
                const currentRefIdx = isVisible ? refIdx++ : -1;
                let showTimestamp = false;
                if (msg.role === "assistant") {
                  showTimestamp = true;
                  for (let j = idx + 1; j < messages.length; j++) {
                    const r = messages[j].role;
                    if (r === "user") break;
                    if (r === "assistant") { showTimestamp = false; break; }
                  }
                  if (showTimestamp && streamState.isStreaming && idx === messages.length - 1) {
                    showTimestamp = false;
                  }
                }
                const isLastMessage = idx === messages.length - 1;
                const isPipelineSynthesizing = isLastMessage && pipeline.state.step === "synthesizing";

                const view = (
                  <MessageView
                    key={idx}
                    message={msg}
                    toolResults={toolResultsMap}
                    modelNames={modelNames}
                    entryId={entryIds[idx]}
                    onFork={agentRunning || isNew || (idx === 0 && msg.role === "user") ? undefined : handleFork}
                    forking={forkingEntryId === entryIds[idx]}
                    onNavigate={agentRunning ? undefined : handleNavigate}
                    prevAssistantEntryId={agentRunning ? undefined : prevAssistantEntryId}
                    onEditContent={(content) => chatInputRef?.current?.insertIfEmpty(content)}
                    showTimestamp={showTimestamp}
                    prevTimestamp={idx > 0 ? (messages[idx - 1] as import("@/lib/types").AgentMessage & { timestamp?: number }).timestamp : undefined}
                    activeModel={displayModelValue}
                    prevUserContent={prevUserContent}
                    cwd={session?.cwd || newSessionCwd}
                    isPipelineSynthesizing={isPipelineSynthesizing}
                  />
                );
                if (!isVisible) return view;
                return (
                  <div key={idx} ref={(el) => {
                    messageRefs.current[currentRefIdx] = el;
                    if (idx === lastUserIdx) { (lastUserMsgRef as { current: HTMLDivElement | null }).current = el; }
                  }}>
                    {view}
                  </div>
                );
              });
            })()}

            {pptSessionId && (
              <PptProgressPanel
                sessionId={pptSessionId}
                onComplete={pptOnComplete}
                onClose={pptOnClose}
                onProjectPathResolved={pptOnProjectPathResolved}
                onStateChange={setPptSessionState}
              />
            )}

            {pptSessionId && pptSessionState?.step === "confirming" && pptSessionState?.confirmUrl && (
              <div style={{
                position: "fixed",
                top: 0,
                left: 0,
                width: "100vw",
                height: "100vh",
                background: "rgba(15, 23, 42, 0.65)",
                backdropFilter: "blur(8px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 9999,
                padding: 24,
              }}>
                <div style={{
                  background: "var(--bg-panel)",
                  border: "1px solid var(--border)",
                  borderRadius: 16,
                  width: "100%",
                  maxWidth: 1100,
                  height: "85vh",
                  display: "flex",
                  flexDirection: "column",
                  boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.4)",
                  overflow: "hidden",
                }}>
                  <div style={{
                    padding: "16px 24px",
                    borderBottom: "1px solid var(--border)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "var(--text)" }}>
                      🎨 配置 PPT 设计规范
                    </h3>
                    <button
                      onClick={() => {
                        fetch("/api/ppt/close", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ sessionId: pptSessionId }),
                        }).catch(() => {});
                        setPptSessionId(null);
                        setPptSessionState(null);
                      }}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "var(--text-muted)",
                        fontSize: 18,
                        padding: 4,
                      }}
                    >
                      ✕
                    </button>
                  </div>
                  <div style={{ flex: 1, position: "relative" }}>
                    <iframe
                      src={pptSessionState.confirmUrl}
                      style={{
                        border: "none",
                        width: "100%",
                        height: "100%",
                        background: "transparent",
                      }}
                    />
                  </div>
                </div>
              </div>
            )}
            {streamState.isStreaming && streamState.streamingMessage && (() => {
              const lastUserMessage = messages.length > 0 && messages[messages.length - 1].role === "user" ? messages[messages.length - 1] : null;
              const streamingPrevUserContent = lastUserMessage
                ? (typeof lastUserMessage.content === "string"
                    ? (lastUserMessage.content as string)
                    : Array.isArray(lastUserMessage.content)
                        ? (lastUserMessage.content as unknown[])
                            .filter((b): b is { type: "text"; text: string } => !!b && typeof b === "object" && "type" in b && b.type === "text")
                            .map((b) => b.text)
                            .join("\n")
                        : "")
                : undefined;
              return (
                <MessageView
                  message={streamState.streamingMessage as AgentMessage}
                  isStreaming
                  modelNames={modelNames}
                  activeModel={displayModelValue}
                  prevUserContent={streamingPrevUserContent}
                  cwd={session?.cwd || newSessionCwd}
                />
              );
            })()}

            {agentRunning && !streamState.streamingMessage && (
              <div className="py-2 text-[13px] text-text-muted">
                <span className="animate-[pulse_1.5s_infinite]">{phaseLabel(agentPhase)}</span>
              </div>
            )}

            {agentRunning && (
              <div style={{ height: scrollContainerRef.current ? scrollContainerRef.current.clientHeight : "80vh" }} />
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>
        <ChatMinimap
          messages={messages}
          streamingMessage={streamState.streamingMessage}
          scrollContainer={scrollContainerRef}
          messageRefs={messageRefs}
        />
      </div>

      <div className="relative">
        {chatInputElement}
      </div>
      </>
      )}

      {/* Pipeline panel — renders in ALL cases (empty new session or existing) */}
      {pipelineActive && (
        <div style={{
          position: "fixed",
          top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(15, 23, 42, 0.55)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 9999, padding: 16,
        }}>
          <div style={{ width: "100%", maxWidth: 640 }}>
            <PipelinePanel
              state={pipeline.state}
              config={pipeline.config}
              onConfigChange={pipeline.setConfig}
              onStart={pipeline.start}
              onStartWithLink={pipeline.startWithLink}
              onRewrite={pipeline.startRewrite}
              onRetry={pipeline.retry}
              onReset={pipeline.reset}
              onTriggerTts={pipeline.triggerTts}
              onClose={() => onPipelineDeactivate?.()}
              modelList={modelList}
              currentModelKey={displayModelValue ? `${displayModelValue.provider}/${displayModelValue.modelId}` : undefined}
              onModelChange={handleModelChange}
              onOpenCookieConfig={() => setCookieModalOpen(true)}
            />
          </div>
        </div>
      )}

      {/* Design Tools panel */}
      {designToolsActive && (
        <div style={{
          position: "fixed",
          top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(15, 23, 42, 0.55)",
          backdropFilter: "blur(16px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 9999, padding: 16,
        }}>
          <DesignCriticPanel
            state={designCritic.state}
            config={designCritic.config}
            onConfigChange={designCritic.setConfig}
            onAnalyze={designCritic.analyze}
            onReset={designCritic.reset}
            onClose={() => onDesignToolsDeactivate?.()}
            onGenerateManualFix={handleGenerateManualFix}
            onGenerateReplica={handleGenerateReplica}
            onGenerateCritique={handleGenerateCritique}
            modelList={modelList}
            currentModelKey={displayModelValue ? `${displayModelValue.provider}/${displayModelValue.modelId}` : undefined}
            onModelChange={handleModelChange}
            workspaceCwd={session?.cwd || newSessionCwd}
          />
        </div>
      )}

      {/* ⚙️ Bilibili Cookie Configuration Modal */}
      <BilibiliCookieModal isOpen={cookieModalOpen} onClose={() => setCookieModalOpen(false)} />
    </div>
  );
}
