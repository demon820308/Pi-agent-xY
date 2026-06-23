/* eslint-disable @typescript-eslint/no-explicit-any */
import { createAgentSession, SessionManager } from "@earendil-works/pi-coding-agent";
import { cacheSessionPath } from "./session-reader";
import { findModel } from "./model-resolver";
import type { AgentSessionLike, ToolInfo } from "./pi-types";
import { isVisionModel } from "./vision";
import { loadDesignMd, extractKeyTokens } from "./design-loader";
import { existsSync, readdirSync, statSync, mkdirSync, copyFileSync } from "fs";
import { join } from "path";
import { createResourceLoader } from "./skills-util";

function formatTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `New_${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function extractFolderNameFromSessionFile(sessionFile: string): string | null {
  try {
    const { readFileSync, existsSync } = require("fs");
    if (existsSync(sessionFile)) {
      const content = readFileSync(sessionFile, "utf-8");
      const firstLine = content.split("\n")[0];
      if (firstLine) {
        const header = JSON.parse(firstLine);
        if (header.cwd) {
          const normalized = header.cwd.replace(/\\/g, "/");
          const match = normalized.match(/\/Temp\/([^/]+)$/i);
          if (match) return match[1];
        }
        if (header.timestamp) {
          const date = new Date(header.timestamp);
          if (!isNaN(date.getTime())) return formatTimestamp(date);
        }
      }
    }
  } catch (e) {
    console.error("[rpc-manager] Failed to extract folder name from session file:", e);
  }
  return null;
}

function injectSystemGuidelines(inner: any) {
  const model = inner.model;
  if (!model) return;

  const sm = inner.sessionManager;
  const supportsVision = isVisionModel(model.provider, model.id);

  const visionGuideline = `\n\n## Multimodal Vision Guidance
- When you are asked to analyze or describe an image, the image is passed natively in your multimodal context block.
- You can directly see and analyze this image.
- DO NOT use the 'read' or 'bash' tools to search for or read files like '用户上传的图片' or scan directory paths unless you are explicitly looking for a specific project file mentioned by path.`;

  const folderName = inner.__sessionFolderName || inner.sessionId;
  const tempFolder = `Temp/${folderName}`;
  const tempGuideline = `\n\n## Workspace Clutter & Temporary Files Management
- You MUST store all temporary execution scripts (e.g. search scripts, scratchpads, throwaway files) and their data results/outputs (e.g. HTML/CSS web previews, text/JSON results, logs, fetched data files) inside the "${tempFolder}/" folder at the workspace root directory.
- For example, if you create a search script or temporary preview page, write it to "${tempFolder}/index.html" or "${tempFolder}/search_something.py" instead of "index.html" or "search_something.py".
- If you write data results, output them to "${tempFolder}/result.txt" instead of "result.txt".
- DO NOT write any temporary, scrap, or execution files directly in the root workspace directory to prevent clutter. All files generated during this conversation session MUST be written inside "${tempFolder}/".<!-- workspace-clutter-end -->`;

  // Load design system if configured in the session
  let dsBlock = "";
  if (sm && Array.isArray(sm.fileEntries)) {
    const dsEntry = sm.fileEntries.find((e: any) => e.type === "design_info");
    if (dsEntry && dsEntry.designSystemId) {
      try {
        const designSystemMd = loadDesignMd(dsEntry.designSystemId);
        if (designSystemMd) {
          const keyTokens = extractKeyTokens(designSystemMd);
          dsBlock = `\n\n---\n## Design System — ABSOLUTE MANDATE\nThis session has a locked design system. You MUST apply it to ALL output, NO EXCEPTIONS.\n\n### NON-NEGOTIABLE RULES:\n1. **IGNORE CONTENT BRAND**: Even if the user asks about a different brand (e.g. Xiaomi, Nike, Tesla), you MUST still use THIS design system's colors, fonts, and shapes. The design system defines the VISUAL STYLE, not the content topic.\n2. **COLORS**: Use the EXACT hex values below. Do NOT invent brand-appropriate colors. Do NOT use Tailwind/Bootstrap defaults.\n3. **TYPOGRAPHY**: Use the EXACT font-family and font-weight below. Do NOT substitute.\n4. **BORDER RADIUS**: Use the EXACT pixel values below.\n5. **ZERO DEVIATION**: Every CSS value must trace back to a token below. If a value isn't in the tokens, use the closest token — but NEVER substitute with a framework default or "brand-appropriate" alternative.\n\n${keyTokens}\n\n### Full Design System Reference:\n${designSystemMd}\n\n### PRE-OUTPUT CHECKLIST (mandatory):\n- [ ] All colors are from the token list above — NOT from Tailwind, NOT invented\n- [ ] Font family matches the design system — NOT Inter, NOT system-ui default\n- [ ] Font weight matches — especially thin/300 if specified\n- [ ] Letter-spacing matches\n- [ ] Border-radius matches (pill = specified px)\n---\n`;
        }
      } catch (e) {
        console.error("Failed to load design system inside injectSystemGuidelines:", e);
      }
    }
  }

  const stripGuidelines = (prompt: string) => {
    return (prompt || "").replace(/\\n\\n## Multimodal Vision Guidance[\\s\\S]*?mentioned by path\\./g, "")
                         .replace(/\n\n## Multimodal Vision Guidance[\s\S]*?mentioned by path\./g, "")
                         .replace(/\\n\\n## Workspace Clutter & Temporary Files Management[\\s\\S]*?<!-- workspace-clutter-end -->/g, "")
                         .replace(/\n\n## Workspace Clutter & Temporary Files Management[\s\S]*?<!-- workspace-clutter-end -->/g, "")
                         .replace(/\\n\\n## Workspace Clutter & Temporary Files Management[\\s\\S]*?(?:to prevent clutter|isolated folder)\\./g, "")
                         .replace(/\n\n## Workspace Clutter & Temporary Files Management[\s\S]*?(?:to prevent clutter|isolated folder)\./g, "")
                         .replace(/\\n\\n---\\n## Design System — ABSOLUTE MANDATE[\\s\\S]*?---\\n/g, "")
                         .replace(/\n\n---\n## Design System — ABSOLUTE MANDATE[\s\S]*?---\n/g, "");
  };

  let newPromptAdditions = tempGuideline;
  if (supportsVision) {
    newPromptAdditions += visionGuideline;
  }
  newPromptAdditions += dsBlock;

  if (typeof inner._baseSystemPrompt === "string") {
    inner._baseSystemPrompt = stripGuidelines(inner._baseSystemPrompt) + newPromptAdditions;
  }
  if (inner.agent?.state && typeof inner.agent.state.systemPrompt === "string") {
    inner.agent.state.systemPrompt = stripGuidelines(inner.agent.state.systemPrompt) + newPromptAdditions;
  }

  // Intercept the resource loader dynamically to prevent the underlying library from overwriting our guidelines on new turns!
  if (inner.resourceLoader && typeof inner.resourceLoader.getSystemPrompt === "function") {
    const loader = inner.resourceLoader;
    if (!loader.getSystemPrompt.__wrapped) {
      const originalGet = loader.getSystemPrompt;
      const wrappedFn = function (this: any, ...args: any[]) {
        const originalPrompt = originalGet.apply(this, args);
        const activeModel = inner.model;
        const supportsVisionActive = activeModel ? isVisionModel(activeModel.provider, activeModel.id) : false;
        let additions = tempGuideline;
        if (supportsVisionActive) {
          additions += visionGuideline;
        }
        additions += dsBlock;
        return stripGuidelines(originalPrompt) + additions;
      };
      (wrappedFn as any).__wrapped = true;
      (wrappedFn as any).originalGet = originalGet;
      loader.getSystemPrompt = wrappedFn;
    }
  }
}

// ============================================================================
// Types
// ============================================================================

export interface AgentEvent {
  type: string;
  [key: string]: unknown;
}

type EventListener = (event: AgentEvent) => void;

// ============================================================================
// AgentSessionWrapper
// Wraps AgentSession with the same interface the rest of the app expects
// ============================================================================

export class AgentSessionWrapper {
  private listeners: EventListener[] = [];
  private unsubscribe: (() => void) | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private onDestroyCallback: (() => void) | null = null;
  private _alive = true;

  constructor(public readonly inner: AgentSessionLike) {}

  get sessionId(): string {
    return this.inner.sessionId;
  }

  get sessionFile(): string {
    return this.inner.sessionFile ?? "";
  }

  isAlive(): boolean {
    return this._alive;
  }

  start(): void {
    this.unsubscribe = this.inner.subscribe((event: AgentEvent) => {
      this.resetIdleTimer();
      for (const l of this.listeners) l(event);
    });
    this.resetIdleTimer();
  }

  private resetIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.destroy(), 10 * 60 * 1000);
  }

  onEvent(listener: EventListener): () => void {
    this.listeners.push(listener);
    return () => {
      const i = this.listeners.indexOf(listener);
      if (i !== -1) this.listeners.splice(i, 1);
    };
  }

  onDestroy(cb: () => void): void {
    this.onDestroyCallback = cb;
  }

  async send(command: Record<string, unknown>): Promise<unknown> {
    this.resetIdleTimer();
    const type = command.type as string;

    switch (type) {
      case "prompt": {
        const promptImages = command.images as Array<{ type: "image"; data: string; mimeType: string }> | undefined;
        
        // Preflight check: Verify that the current active model has configured authentication
        // before passing to the underlying session. This prevents native Rust code from
        // throwing 'invalid type: unit value' during API key resolution when no key is configured.
        const activeModel = this.inner.model;
        if (activeModel && !(this.inner.modelRegistry as any).hasConfiguredAuth(activeModel as any)) {
          throw new Error(`No API key found for provider "${activeModel.provider}". Please configure it in Models config.`);
        }

        injectSystemGuidelines(this.inner);

        // Do not silently swallow synchronous preflight errors (like missing API keys).
        // Awaiting prompt() allows these errors to bubble up so the API router can catch them
        // and return an HTTP error, preventing the UI from hanging indefinitely on "Waiting for model...".
        try {
          await this.inner.prompt(command.message as string, promptImages?.length ? { images: promptImages } : undefined);
        } catch (err: any) {
          console.error("Detailed Prompt Error Stack:", err && err.stack ? err.stack : err);
          throw err;
        }
        return null;
      }

      case "abort":
        await this.inner.abort();
        return null;

      case "get_state": {
        const model = this.inner.model;
        const contextUsage = this.inner.getContextUsage();
        return {
          sessionId: this.inner.sessionId,
          sessionFile: this.inner.sessionFile ?? "",
          isStreaming: this.inner.isStreaming,
          isCompacting: this.inner.isCompacting,
          autoCompactionEnabled: this.inner.autoCompactionEnabled,
          autoRetryEnabled: this.inner.autoRetryEnabled,
          model: model ? { id: model.id, provider: model.provider } : undefined,
          messageCount: 0,
          pendingMessageCount: 0,
          contextUsage: contextUsage
            ? { percent: contextUsage.percent, contextWindow: contextUsage.contextWindow, tokens: contextUsage.tokens }
            : null,
          systemPrompt: this.inner.agent.state?.systemPrompt ?? "",
          thinkingLevel: this.inner.agent.state?.thinkingLevel ?? "off",
        };
      }

      case "set_model": {
        const { provider, modelId } = command as { provider: string; modelId: string };
        const registry = this.inner.modelRegistry;
        const model = findModel(registry, provider, modelId);
        if (!model) throw new Error(`Model not found: ${provider}/${modelId}`);
        console.log("Model debug - resolved model:", JSON.stringify(model, null, 2));

        const currentModel = this.inner.model;
        if (currentModel && currentModel.id === model.id && currentModel.provider === model.provider) {
          console.log("Model debug - already in selected model, skipping setModel call, but ensuring clean assignment");
          if (this.inner.agent.state) {
            (this.inner.agent.state as any).model = model;
          }
          injectSystemGuidelines(this.inner);
          return { id: model.id, provider: model.provider };
        }

        // Clean model object: remove all undefined properties using JSON serialization.
        // This prevents the Rust WASM/Native side from getting 'undefined' values which
        // it parses as 'unit value', causing 'expected usize' deserialization crashes.
        const cleanModel = JSON.parse(JSON.stringify(model));

        await this.inner.setModel(cleanModel);
        injectSystemGuidelines(this.inner);
        return { id: model.id, provider: model.provider };
      }

      case "fork": {
        const entryId = command.entryId as string;
        const sessionManager = this.inner.sessionManager;
        const currentSessionFile = this.inner.sessionFile;

        if (!sessionManager.isPersisted()) return { cancelled: true };
        if (!currentSessionFile) throw new Error("Persisted session is missing a session file");

        const entry = sessionManager.getEntry(entryId);
        if (!entry) throw new Error("Invalid entry ID for forking");

        const sessionDir = sessionManager.getSessionDir();
        let newSessionFile: string;

        if (!entry.parentId) {
          // Fork before the first message: create an empty session linked to this one
          const newManager = SessionManager.create(sessionManager.getCwd(), sessionDir);
          newManager.newSession({ parentSession: currentSessionFile });
          newSessionFile = newManager.getSessionFile() as string;
        } else {
          // Fork after some history: copy path up to (but not including) the fork point
          const sourceManager = SessionManager.open(currentSessionFile, sessionDir);
          const forkedPath = sourceManager.createBranchedSession(entry.parentId);
          if (!forkedPath) throw new Error("Failed to create forked session");
          newSessionFile = forkedPath;
        }

        const newSessionId = SessionManager.open(newSessionFile, sessionDir).getSessionId();
        cacheSessionPath(newSessionId, newSessionFile);
        this.destroy();
        return { cancelled: false, newSessionId };
      }

      case "navigate_tree": {
        const result = await this.inner.navigateTree(command.targetId as string, {});
        return { cancelled: result.cancelled };
      }

      case "set_thinking_level": {
        const level = command.level as string;
        this.inner.setThinkingLevel(level);
        // setThinkingLevel clamps xhigh→high for models where supportsXhigh()===false.
        // If the model has DeepSeek thinking compat (reasoningEffortMap maps xhigh→max),
        // force the state back so the compat layer can use it correctly.
        if (level === "xhigh" && (this.inner.model as { compat?: { thinkingFormat?: string } } | null)?.compat?.thinkingFormat === "deepseek" && this.inner.agent?.state) {
          this.inner.agent.state.thinkingLevel = "xhigh";
        }
        return null;
      }

      case "compact": {
        // pi's compact() does not guard against empty messagesToSummarize — use findCutPoint
        // to pre-check and throw a clean error instead of generating a useless empty summary.
        const { findCutPoint, DEFAULT_COMPACTION_SETTINGS } = await import("@earendil-works/pi-coding-agent");
        const pathEntries = this.inner.sessionManager.getBranch() as Array<{ type: string }>;
        const settings = { ...DEFAULT_COMPACTION_SETTINGS, ...this.inner.settingsManager.getCompactionSettings() };
        let prevCompactionIndex = -1;
        for (let i = pathEntries.length - 1; i >= 0; i--) {
          if (pathEntries[i].type === "compaction") { prevCompactionIndex = i; break; }
        }
        const boundaryStart = prevCompactionIndex + 1;
        const cutPoint = findCutPoint(pathEntries as never, boundaryStart, pathEntries.length, settings.keepRecentTokens);
        const historyEnd = cutPoint.isSplitTurn ? cutPoint.turnStartIndex : cutPoint.firstKeptEntryIndex;
        if (historyEnd <= boundaryStart) {
          throw new Error("Conversation too short to compact");
        }
        const result = await this.inner.compact(command.customInstructions as string | undefined);
        return result;
      }

      case "set_auto_compaction": {
        this.inner.setAutoCompactionEnabled(command.enabled as boolean);
        return null;
      }

      case "steer": {
        const steerImages = command.images as Array<{ type: "image"; data: string; mimeType: string }> | undefined;
        injectSystemGuidelines(this.inner);
        await this.inner.steer(command.message as string, steerImages?.length ? steerImages : undefined);
        return null;
      }

      case "follow_up": {
        const followImages = command.images as Array<{ type: "image"; data: string; mimeType: string }> | undefined;
        injectSystemGuidelines(this.inner);
        await this.inner.followUp(command.message as string, followImages?.length ? followImages : undefined);
        return null;
      }

      case "get_tools": {
        const all: ToolInfo[] = this.inner.getAllTools();
        const active = new Set<string>(this.inner.getActiveToolNames());
        return all.map((t) => ({
          name: t.name,
          description: t.description,
          active: active.has(t.name),
        }));
      }

      case "set_tools": {
        this.inner.setActiveToolsByName(command.toolNames as string[]);
        return null;
      }

      case "abort_compaction": {
        this.inner.abortCompaction();
        return null;
      }

      case "set_auto_retry": {
        this.inner.setAutoRetryEnabled(command.enabled as boolean);
        return null;
      }

      default:
        throw new Error(`Unsupported command: ${type}`);
    }
  }

  destroy(): void {
    if (!this._alive) return;
    this._alive = false;
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.unsubscribe?.();
    this.onDestroyCallback?.();
  }
}

// ============================================================================
// Session registry
// ============================================================================

declare global {
  var __piSessions: Map<string, AgentSessionWrapper> | undefined;
  var __piStartLocks: Map<string, Promise<{ session: AgentSessionWrapper; realSessionId: string; folderName: string }>> | undefined;
}

function getRegistry(): Map<string, AgentSessionWrapper> {
  if (!globalThis.__piSessions) {
    globalThis.__piSessions = new Map();
    const cleanup = () => globalThis.__piSessions?.forEach((s) => s.destroy());
    process.once("exit", cleanup);
    process.once("SIGINT", cleanup);
    process.once("SIGTERM", cleanup);
  }
  return globalThis.__piSessions;
}

function getLocks(): Map<string, Promise<{ session: AgentSessionWrapper; realSessionId: string; folderName: string }>> {
  if (!globalThis.__piStartLocks) globalThis.__piStartLocks = new Map();
  return globalThis.__piStartLocks;
}

export function getRpcSession(sessionId: string): AgentSessionWrapper | undefined {
  return getRegistry().get(sessionId);
}

function copyDirSync(src: string, dest: string) {
  if (!existsSync(src)) return;
  if (!existsSync(dest)) {
    mkdirSync(dest, { recursive: true });
  }
  const entries = readdirSync(src);
  for (const entry of entries) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    const stat = statSync(srcPath);
    if (stat.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Get or create an AgentSession for the given session.
 * For new sessions (sessionFile === ""), pi generates its own id.
 * Pass toolNames to pre-configure active tools (empty array = all tools disabled).
 */
export async function startRpcSession(
  sessionId: string,
  sessionFile: string,
  cwd: string,
  toolNames?: string[],
  customSystemPrompt?: string,
  gemInfo?: { gemId: string; gemName: string; gemAvatar: string },
  designSystemMd?: string,
  designInfo?: { designSystemId: string; designSystemName: string }
): Promise<{ session: AgentSessionWrapper; realSessionId: string; folderName: string }> {
  const registry = getRegistry();
  const locks = getLocks();

  const existing = registry.get(sessionId);
  if (existing?.isAlive()) {
    const fName = (existing.inner as any).__sessionFolderName || sessionId;
    return { session: existing, realSessionId: sessionId, folderName: fName };
  }

  const inflight = locks.get(sessionId);
  if (inflight) return inflight;

  const starting = (async () => {
    const { SessionManager, getAgentDir } = await import("@earendil-works/pi-coding-agent");
    const agentDir = getAgentDir();

    const folderName = sessionFile 
      ? (extractFolderNameFromSessionFile(sessionFile) || formatTimestamp(new Date()))
      : formatTimestamp(new Date());

    const agentCwd = cwd;

    // Auto-initialize built-in skills in workspace if not present or empty
    const workspaceSkillsDir = join(agentCwd, ".agents", "skills");
    const sourceSkillsDir = join(process.cwd(), "skills-main", "skills");

    if (existsSync(sourceSkillsDir)) {
      try {
        if (!existsSync(workspaceSkillsDir) || readdirSync(workspaceSkillsDir).length === 0) {
          console.log(`[rpc-manager] Initializing built-in skills from ${sourceSkillsDir} to ${workspaceSkillsDir}`);
          for (const bucket of ["engineering", "productivity", "misc"]) {
            const srcBucket = join(sourceSkillsDir, bucket);
            if (existsSync(srcBucket)) {
              const entries = readdirSync(srcBucket);
              for (const entry of entries) {
                const srcSkill = join(srcBucket, entry);
                const destSkill = join(workspaceSkillsDir, entry);
                if (statSync(srcSkill).isDirectory()) {
                  copyDirSync(srcSkill, destSkill);
                }
              }
            }
          }
        }
      } catch (err) {
        console.error("[rpc-manager] Failed to auto-initialize built-in skills:", err);
      }
    }

    const sessionManager = sessionFile
      ? SessionManager.open(sessionFile, undefined)
      : SessionManager.create(agentCwd, undefined);

    // We will force-flush the session header after createAgentSession is fully initialized,
    // which prevents duplicate session header writes.


    // Determine which tools to pass based on requested toolNames.
    // Since v0.68.0, createAgentSession expects string[] tool names instead of Tool[] instances.
    // Pass all built-in coding tool names by default; for "all off", pass empty array.
    const allCodingToolNames = ["read", "bash", "edit", "write", "grep", "find", "ls"];
    let toolsOption: string[] | undefined;
    if (toolNames !== undefined) {
      toolsOption = toolNames.length === 0 ? [] : allCodingToolNames;
    }

    const loader = createResourceLoader(agentCwd, agentDir);
    await loader.reload();

    const { session: inner } = await createAgentSession({
      cwd: agentCwd,
      agentDir,
      sessionManager,
      resourceLoader: loader,
      ...(toolsOption !== undefined ? { tools: toolsOption } : {}),
    });
    (inner as any).__sessionFolderName = folderName;

    // Hijack inner.agent.state.model property to dynamically strip undefined values
    // while preserving and invoking the original descriptor's getter/setter.
    // This completely prevents the Rust WASM/Native side from getting 'undefined' properties
    // which it parses as 'unit value', causing 'expected usize' deserialization crashes.
    if (inner.agent.state) {
      let targetObj: any = inner.agent.state;
      let desc = Object.getOwnPropertyDescriptor(targetObj, "model");
      while (!desc && targetObj) {
        targetObj = Object.getPrototypeOf(targetObj);
        if (targetObj) {
          desc = Object.getOwnPropertyDescriptor(targetObj, "model");
        }
      }

      if (desc) {
        const originalGet = desc.get;
        const originalSet = desc.set;

        if (originalGet || originalSet) {
          Object.defineProperty(inner.agent.state, "model", {
            get() {
              const val = originalGet ? originalGet.call(this) : undefined;
              return val ? JSON.parse(JSON.stringify(val)) : val;
            },
            set(newVal) {
              const cleanVal = newVal ? JSON.parse(JSON.stringify(newVal)) : newVal;
              if (originalSet) {
                originalSet.call(this, cleanVal);
              }
            },
            configurable: true,
            enumerable: true,
          });
        } else if (desc.writable) {
          let currentVal = desc.value;
          Object.defineProperty(inner.agent.state, "model", {
            get() {
              return currentVal ? JSON.parse(JSON.stringify(currentVal)) : currentVal;
            },
            set(newVal) {
              currentVal = newVal ? JSON.parse(JSON.stringify(newVal)) : newVal;
            },
            configurable: true,
            enumerable: true,
          });
        }
      }

      // Force trigger the clean setter once to ensure the initial model in Rust memory is also clean.
      if (inner.agent.state.model) {
        inner.agent.state.model = inner.agent.state.model;
      }
    }

    // If specific tool names were requested, narrow active tools now
    if (toolNames) {
      inner.setActiveToolsByName(toolNames);
    }

    // When all tools are disabled, clear the system prompt entirely.
    // pi's buildSystemPrompt always produces a non-empty prompt even with no tools;
    // the only way to truly clear it is to call agent.setSystemPrompt directly.
    if (toolNames?.length === 0) {
      inner.agent.state.systemPrompt = "";
    }

    if (customSystemPrompt !== undefined) {
      inner.agent.state.systemPrompt = customSystemPrompt;
      if (inner.resourceLoader) {
        inner.resourceLoader.getSystemPrompt = () => customSystemPrompt;
      }
      if (typeof (inner as any)._rebuildSystemPrompt === "function") {
        try {
          (inner as any)._baseSystemPrompt = (inner as any)._rebuildSystemPrompt(inner.getActiveToolNames());
          inner.agent.state.systemPrompt = (inner as any)._baseSystemPrompt;
        } catch (e) {
          console.error("Failed to rebuild custom system prompt:", e);
        }
      }
    }



    // Wrap inner.agent.streamFn to intercept network error events.
    // When a connection fails (e.g. timeout or DNS error), the JS fetch stream pushes an "error" event
    // with no HTTP status code. The underlying Rust WASM deserializer expects a status code (usize)
    // and throws 'invalid type: unit value, expected usize' causing a fatal crash.
    // Intercepting and injecting a default status code (500) completely prevents this.
    if (inner.agent && typeof (inner.agent as any).streamFn === "function") {
      const originalStreamFn = (inner.agent as any).streamFn;
      (inner.agent as any).streamFn = function (...args: any[]) {
        const stream = originalStreamFn.apply(this, args);
        if (stream && typeof (stream as any).push === "function") {
          const originalPush = (stream as any).push;
          (stream as any).push = function (event: any) {
            if (event && event.type === "error" && event.error) {
              if (event.error.status === undefined) event.error.status = 500;
              if (event.error.statusCode === undefined) event.error.statusCode = 500;
              if (event.error.status_code === undefined) event.error.status_code = 500;
            }
            return originalPush.call(this, event);
          };
        }
        return stream;
      };
    }

    // Dynamic recovery: Check if the default model configured in settings fell back due to registry lookup failure.
    // If so, force-set it using our synthetic model definition.
    try {
      const { SettingsManager } = await import("@earendil-works/pi-coding-agent");
      const settings = SettingsManager.create(cwd, agentDir);
      const defaultProvider = settings.getDefaultProvider();
      const defaultModelId = settings.getDefaultModel();
      if (defaultProvider && defaultModelId) {
        const currentModel = inner.model;
        if (currentModel && currentModel.id !== defaultModelId) {
          const synthetic = findModel(inner.modelRegistry, defaultProvider, defaultModelId);
          if (synthetic) {
            console.log(`[rpc-manager] Default model "${defaultModelId}" fell back to "${currentModel.id}" in createAgentSession. Re-applying synthetic model.`);
            const cleanModel = JSON.parse(JSON.stringify(synthetic));
            await inner.setModel(cleanModel);
          }
        }
      }
    } catch (e) {
      console.error("[rpc-manager] Failed to auto-recover synthetic default model:", e);
    }

    const wrapper = new AgentSessionWrapper(inner);
    wrapper.start();

    // For new sessions, deduplicate any double session headers in fileEntries,
    // then force-flush to ensure the file is written immediately (fixes cold-start fallback).
    if (!sessionFile) {
      const sm = (inner as any).sessionManager;
      if (sm && typeof sm._rewriteFile === "function") {
        try {
          if (Array.isArray(sm.fileEntries)) {
            const firstSessionIdx = sm.fileEntries.findIndex((e: any) => e.type === "session");
            if (firstSessionIdx !== -1) {
              sm.fileEntries = sm.fileEntries.filter((e: any, idx: number) => {
                return e.type !== "session" || idx === firstSessionIdx;
              });
            }
          }
          sm._rewriteFile();
          sm.flushed = true;
          console.log(`[rpc-manager] Force-flushed deduplicated session header to: ${sm.sessionFile}`);
        } catch (err) {
          console.error("[rpc-manager] Failed to force-flush session header:", err);
        }
      }
    }

    const realSessionId = inner.sessionId as string;
    const realSessionFile = inner.sessionFile as string | undefined;
    if (realSessionFile) cacheSessionPath(realSessionId, realSessionFile);

    // Write gem_info entry if this session uses a Gem-xY agent
    if (gemInfo) {
      try {
        const gemEntry = {
          type: "gem_info",
          id: `gem_${Date.now()}`,
          parentId: null,
          timestamp: new Date().toISOString(),
          gemId: gemInfo.gemId,
          gemName: gemInfo.gemName,
          gemAvatar: gemInfo.gemAvatar,
        };
        const sm = (inner as any).sessionManager;
        if (sm) {
          sm.fileEntries.push(gemEntry);
          sm.byId.set(gemEntry.id, gemEntry);
          // If the session is already flushed, append it. Otherwise, let SessionManager's own flush mechanism handle it.
          if (sm.flushed && realSessionFile) {
            const { appendFileSync } = await import("fs");
            appendFileSync(realSessionFile, JSON.stringify(gemEntry) + "\n");
          }
          console.log(`[rpc-manager] Registered gem_info entry in SessionManager for session ${realSessionId}`);
        }
      } catch (e) {
        console.error("[rpc-manager] Failed to write gem_info entry:", e);
      }
    }

    // Write design_info entry if this session uses a design system
    console.log(`[rpc-manager] designInfo:`, designInfo ? JSON.stringify(designInfo) : "undefined");
    if (designInfo) {
      try {
        const dsEntry = {
          type: "design_info",
          id: `ds_${Date.now()}`,
          parentId: null,
          timestamp: new Date().toISOString(),
          designSystemId: designInfo.designSystemId,
          designSystemName: designInfo.designSystemName,
        };
        const sm = (inner as any).sessionManager;
        if (sm) {
          sm.fileEntries.push(dsEntry);
          sm.byId.set(dsEntry.id, dsEntry);
          if (sm.flushed && realSessionFile) {
            const { appendFileSync } = await import("fs");
            appendFileSync(realSessionFile, JSON.stringify(dsEntry) + "\n");
          }
          console.log(`[rpc-manager] Registered design_info entry for session ${realSessionId}`);
        }
      } catch (e) {
        console.error("[rpc-manager] Failed to write design_info entry:", e);
      }
    }



    injectSystemGuidelines(inner);

    wrapper.onDestroy(() => registry.delete(realSessionId));
    registry.set(realSessionId, wrapper);

    return { session: wrapper, realSessionId, folderName };
  })().finally(() => locks.delete(sessionId));

  locks.set(sessionId, starting);
  return starting;
}
