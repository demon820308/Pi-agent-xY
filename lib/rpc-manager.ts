/* eslint-disable @typescript-eslint/no-explicit-any */
import { createAgentSession, SessionManager } from "@earendil-works/pi-coding-agent";
import { cacheSessionPath } from "./session-reader";
import type { AgentSessionLike, ToolInfo } from "./pi-types";
import { isVisionModel } from "./vision";

function injectSystemGuidelines(inner: any) {
  const model = inner.model;
  if (!model) return;

  const supportsVision = isVisionModel(model.provider, model.id);

  const visionGuideline = `\n\n## Multimodal Vision Guidance
- When you are asked to analyze or describe an image, the image is passed natively in your multimodal context block.
- You can directly see and analyze this image.
- DO NOT use the 'read' or 'bash' tools to search for or read files like '用户上传的图片' or scan directory paths unless you are explicitly looking for a specific project file mentioned by path.`;

  const tempGuideline = `\n\n## Workspace Clutter & Temporary Files Management
- You MUST store all temporary execution scripts (e.g. search scripts, scratchpads, throwaway files) and their data results/outputs (e.g. text/JSON results, logs, fetched data files) inside the "Temp/" folder at the workspace root directory.
- For example, if you create a search script, write it to "Temp/search_something.py" instead of "search_something.py".
- If you write data results, output them to "Temp/result.txt" instead of "result.txt".
- DO NOT write any temporary, scrap, or execution files directly in the root workspace directory to prevent clutter.`;

  const stripGuidelines = (prompt: string) => {
    return (prompt || "").replace(/\\n\\n## Multimodal Vision Guidance[\\s\\S]*?mentioned by path\\./g, "")
                         .replace(/\n\n## Multimodal Vision Guidance[\s\S]*?mentioned by path\./g, "")
                         .replace(/\\n\\n## Workspace Clutter & Temporary Files Management[\\s\\S]*?to prevent clutter\\./g, "")
                         .replace(/\n\n## Workspace Clutter & Temporary Files Management[\s\S]*?to prevent clutter\./g, "");
  };

  let newPromptAdditions = tempGuideline;
  if (supportsVision) {
    newPromptAdditions += visionGuideline;
  }

  if (typeof inner._baseSystemPrompt === "string") {
    inner._baseSystemPrompt = stripGuidelines(inner._baseSystemPrompt) + newPromptAdditions;
  }
  if (inner.agent?.state && typeof inner.agent.state.systemPrompt === "string") {
    inner.agent.state.systemPrompt = stripGuidelines(inner.agent.state.systemPrompt) + newPromptAdditions;
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
        const model = registry.find(provider, modelId);
        if (!model) throw new Error(`Model not found: ${provider}/${modelId}`);
        console.log("Model debug - found in registry:", JSON.stringify(model, null, 2));

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
  var __piStartLocks: Map<string, Promise<{ session: AgentSessionWrapper; realSessionId: string }>> | undefined;
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

function getLocks(): Map<string, Promise<{ session: AgentSessionWrapper; realSessionId: string }>> {
  if (!globalThis.__piStartLocks) globalThis.__piStartLocks = new Map();
  return globalThis.__piStartLocks;
}

export function getRpcSession(sessionId: string): AgentSessionWrapper | undefined {
  return getRegistry().get(sessionId);
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
  customSystemPrompt?: string
): Promise<{ session: AgentSessionWrapper; realSessionId: string }> {
  const registry = getRegistry();
  const locks = getLocks();

  const existing = registry.get(sessionId);
  if (existing?.isAlive()) return { session: existing, realSessionId: sessionId };

  const inflight = locks.get(sessionId);
  if (inflight) return inflight;

  const starting = (async () => {
    const { SessionManager, getAgentDir } = await import("@earendil-works/pi-coding-agent");
    const agentDir = getAgentDir();

    const sessionManager = sessionFile
      ? SessionManager.open(sessionFile, undefined)
      : SessionManager.create(cwd, undefined);

    // Determine which tools to pass based on requested toolNames.
    // Since v0.68.0, createAgentSession expects string[] tool names instead of Tool[] instances.
    // Pass all built-in coding tool names by default; for "all off", pass empty array.
    const allCodingToolNames = ["read", "bash", "edit", "write", "grep", "find", "ls"];
    let toolsOption: string[] | undefined;
    if (toolNames !== undefined) {
      toolsOption = toolNames.length === 0 ? [] : allCodingToolNames;
    }

    const { session: inner } = await createAgentSession({
      cwd,
      agentDir,
      sessionManager,
      ...(toolsOption !== undefined ? { tools: toolsOption } : {}),
    });

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

    // If specific tool names were requested (non-empty), narrow active tools now
    if (toolNames && toolNames.length > 0) {
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

    const wrapper = new AgentSessionWrapper(inner);
    wrapper.start();
    injectSystemGuidelines(inner);

    const realSessionId = inner.sessionId as string;
    const realSessionFile = inner.sessionFile as string | undefined;
    if (realSessionFile) cacheSessionPath(realSessionId, realSessionFile);

    wrapper.onDestroy(() => registry.delete(realSessionId));
    registry.set(realSessionId, wrapper);

    return { session: wrapper, realSessionId };
  })().finally(() => locks.delete(sessionId));

  locks.set(sessionId, starting);
  return starting;
}
