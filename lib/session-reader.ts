import { SessionManager, buildSessionContext as piBuildSessionContext, getAgentDir } from "@earendil-works/pi-coding-agent";
import type { SessionEntry, SessionInfo, SessionContext, SessionTreeNode, AssistantMessage } from "./types";
import type { SessionEntry as PiSessionEntry, SessionInfo as PiSessionInfo } from "@earendil-works/pi-coding-agent";
import { normalizeToolCalls } from "./normalize";
import { getLockedSessionIds } from "./session-lock";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

export { getAgentDir };

export function getSessionsDir(): string {
  try {
    return `${getAgentDir()}/sessions`;
  } catch {
    const userHome = process.env.USERPROFILE || process.env.HOMEPATH || process.env.HOME || "";
    return join(userHome, ".pi", "agent", "sessions");
  }
}

/**
 * Read gem_info entry from a session file (first 20 lines only for performance).
 * Returns gemId, gemName, gemAvatar if found.
 */
function readGemInfoFromFile(filePath: string): { gemId?: string; gemName?: string; gemAvatar?: string } {
  try {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n").slice(0, 20); // Only check first 20 lines
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        if (entry.type === "gem_info" && entry.gemId) {
          return {
            gemId: entry.gemId,
            gemName: entry.gemName,
            gemAvatar: entry.gemAvatar,
          };
        }
      } catch {
        // Skip malformed lines
      }
    }
  } catch {
    // File read error - ignore
  }
  return {};
}

function readDesignInfoFromFile(filePath: string): { designSystemId?: string; designSystemName?: string } {
  try {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n").slice(0, 20);
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        if (entry.type === "design_info" && entry.designSystemId) {
          return {
            designSystemId: entry.designSystemId,
            designSystemName: entry.designSystemName,
          };
        }
      } catch {
        // Skip malformed lines
      }
    }
  } catch {
    // File read error - ignore
  }
  return {};
}

export async function listAllSessions(): Promise<SessionInfo[]> {
  const sessionsDir = getSessionsDir();
  const allSessions: SessionInfo[] = [];

  // Scan all subdirectories under sessions/ and read session files directly
  try {
    const entries = readdirSync(sessionsDir);
    for (const entry of entries) {
      const fullPath = join(sessionsDir, entry);
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          // Scan .jsonl files in this directory
          const files = readdirSync(fullPath).filter((f) => f.endsWith(".jsonl"));
          for (const file of files) {
            const filePath = join(fullPath, file);
            try {
              const content = readFileSync(filePath, "utf-8");
              const firstLine = content.split("\n")[0];
              if (!firstLine) continue;

              const header = JSON.parse(firstLine);
              if (header.type !== "session") continue;

              // Read gem info from first 20 lines
              const gemInfo = readGemInfoFromFile(filePath);
              const designInfo = readDesignInfoFromFile(filePath);

              // Extract first user message for display
              const lines = content.split("\n");
              let firstMessage = "";
              let messageCount = 0;
              for (const line of lines.slice(0, 50)) {
                try {
                  const entry = JSON.parse(line);
                  if (entry.type === "message" && entry.message?.role === "user") {
                    const c = entry.message.content;
                    firstMessage = typeof c === "string" ? c : (Array.isArray(c) ? (c.find((b: { type: string }) => b.type === "text") as { text: string } | undefined)?.text ?? "" : "");
                    break;
                  }
                  if (entry.type === "message") messageCount++;
                } catch {
                  // Skip malformed lines
                }
              }

              allSessions.push({
                path: filePath,
                id: header.id,
                cwd: header.cwd || "",
                name: undefined, // Will be read from session_info entries if needed
                created: header.timestamp || new Date().toISOString(),
                modified: stat.mtime.toISOString(),
                messageCount,
                firstMessage: firstMessage || "(no messages)",
                parentSessionId: header.parentSession ? undefined : undefined, // Will be resolved later
                locked: false,
                ...gemInfo,
                ...designInfo,
              });
            } catch {
              // Skip invalid session files
            }
          }
        }
      } catch {
        // Skip invalid directories
      }
    }
  } catch {
    // Fallback: use default listAll() which only returns current cwd sessions
    const defaultSessions = await SessionManager.listAll();
    const pathToId = new Map<string, string>();
    for (const s of defaultSessions) pathToId.set(s.path, s.id);

    const lockedIds = new Set(getLockedSessionIds());

    for (const s of defaultSessions) {
      const gemInfo = readGemInfoFromFile(s.path);
      const designInfo = readDesignInfoFromFile(s.path);
      allSessions.push({
        path: s.path,
        id: s.id,
        cwd: s.cwd,
        name: s.name,
        created: s.created instanceof Date ? s.created.toISOString() : String(s.created),
        modified: s.modified instanceof Date ? s.modified.toISOString() : String(s.modified),
        messageCount: s.messageCount,
        firstMessage: s.firstMessage || "(no messages)",
        parentSessionId: s.parentSessionPath ? pathToId.get(s.parentSessionPath) : undefined,
        locked: lockedIds.has(s.id),
        ...gemInfo,
        ...designInfo,
      });
    }
  }

  // Deduplicate by id (in case same session appears in multiple scans)
  const seen = new Set<string>();
  const uniqueSessions = allSessions.filter((s) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });

  // Sort by modified date (newest first), tie-break by created date (newest first)
  uniqueSessions.sort((a, b) => {
    const diff = new Date(b.modified).getTime() - new Date(a.modified).getTime();
    if (diff !== 0) return diff;
    return new Date(b.created).getTime() - new Date(a.created).getTime();
  });

  const cache = getPathCache();
  for (const s of uniqueSessions) {
    cache.set(s.id, s.path);
  }

  return uniqueSessions;
}

// ============================================================================
// Session path cache: sessionId → absolute file path
// Stored in globalThis for hot-reload safety
// ============================================================================
declare global {
  var __piSessionPathCache: Map<string, string> | undefined;
}

function getPathCache(): Map<string, string> {
  if (!globalThis.__piSessionPathCache) globalThis.__piSessionPathCache = new Map();
  return globalThis.__piSessionPathCache;
}

export async function resolveSessionPath(sessionId: string): Promise<string | null> {
  const cached = getPathCache().get(sessionId);
  if (cached) return cached;

  // Cache miss: scan all sessions to populate cache, then retry
  await listAllSessions();
  const scanned = getPathCache().get(sessionId);
  if (scanned) return scanned;

  // Direct filename fallback: look for *_${sessionId}.jsonl directly
  const sessionsDir = getSessionsDir();
  try {
    const entries = readdirSync(sessionsDir);
    for (const entry of entries) {
      const fullPath = join(sessionsDir, entry);
      if (statSync(fullPath).isDirectory()) {
        const files = readdirSync(fullPath);
        const match = files.find((f: string) => f.endsWith(`_${sessionId}.jsonl`));
        if (match) {
          const matchedPath = join(fullPath, match);
          cacheSessionPath(sessionId, matchedPath);
          return matchedPath;
        }
      }
    }
  } catch {
    // Ignore fallback errors
  }

  return null;
}

export function cacheSessionPath(sessionId: string, filePath: string): void {
  getPathCache().set(sessionId, filePath);
}

export function invalidateSessionPathCache(sessionId: string): void {
  getPathCache().delete(sessionId);
}

export function getSessionEntries(filePath: string): SessionEntry[] {
  const entries = SessionManager.open(filePath).getEntries();
  return entries as unknown as SessionEntry[];
}

export function buildTree(entries: SessionEntry[]): SessionTreeNode[] {
  const nodeMap = new Map<string, SessionTreeNode>();
  const labelsById = new Map<string, string>();

  for (const entry of entries) {
    if (entry.type === "label") {
      const l = entry as { type: "label"; targetId: string; label?: string };
      if (l.label) labelsById.set(l.targetId, l.label);
      else labelsById.delete(l.targetId);
    }
  }

  const roots: SessionTreeNode[] = [];
  for (const entry of entries) {
    nodeMap.set(entry.id, { entry, children: [], label: labelsById.get(entry.id) });
  }
  for (const entry of entries) {
    const node = nodeMap.get(entry.id)!;
    if (!entry.parentId) {
      roots.push(node);
    } else {
      const parent = nodeMap.get(entry.parentId);
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
  }

  const stack = [...roots];
  while (stack.length > 0) {
    const node = stack.pop()!;
    node.children.sort((a, b) => new Date(a.entry.timestamp).getTime() - new Date(b.entry.timestamp).getTime());
    stack.push(...node.children);
  }
  return roots;
}

export function buildSessionContext(entries: SessionEntry[], leafId?: string | null): SessionContext {
  const byId = new Map<string, SessionEntry>();
  for (const e of entries) byId.set(e.id, e);

  const piEntries = entries as unknown as PiSessionEntry[];
  const piCtx = piBuildSessionContext(piEntries, leafId, byId as unknown as Map<string, PiSessionEntry>);

  // Build entryIds: parallel array to messages[], mapping each message back to its entry id.
  // Needed for fork and navigate_tree calls from the UI.
  let targetLeaf: SessionEntry | undefined;
  if (leafId === null) {
    return { messages: [], entryIds: [], thinkingLevel: piCtx.thinkingLevel, model: piCtx.model };
  }
  if (leafId) targetLeaf = byId.get(leafId);
  if (!targetLeaf) targetLeaf = entries[entries.length - 1];
  if (!targetLeaf) {
    return { messages: [], entryIds: [], thinkingLevel: piCtx.thinkingLevel, model: piCtx.model };
  }

  // Walk path from target leaf to root
  const path: SessionEntry[] = [];
  let cur: SessionEntry | undefined = targetLeaf;
  while (cur) {
    path.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }

  // Find the last compaction on path (mirrors pi's buildSessionContext logic)
  let compactionId: string | undefined;
  let firstKeptEntryId: string | undefined;
  for (const e of path) {
    if (e.type === "compaction") {
      compactionId = e.id;
      firstKeptEntryId = (e as { firstKeptEntryId: string }).firstKeptEntryId;
    }
  }

  const entryIds: string[] = [];
  if (compactionId) {
    // The first message in piCtx.messages is the synthetic compaction summary — map to compaction entry id
    entryIds.push(compactionId);
    const compactionIdx = path.findIndex((e) => e.id === compactionId);
    const firstKeptIdx = firstKeptEntryId
      ? path.findIndex((e, i) => i < compactionIdx && e.id === firstKeptEntryId)
      : -1;
    const startIdx = firstKeptIdx >= 0 ? firstKeptIdx : compactionIdx;
    for (let i = startIdx; i < compactionIdx; i++) {
      if (path[i].type === "message") entryIds.push(path[i].id);
    }
    for (let i = compactionIdx + 1; i < path.length; i++) {
      if (path[i].type === "message") entryIds.push(path[i].id);
    }
  } else {
    for (const e of path) {
      if (e.type === "message") entryIds.push(e.id);
    }
  }

  // pi injects compaction summary as {role:"compactionSummary", summary, tokensBefore}.
  // Convert to {role:"user"} so MessageView can render it the same as before.
  const messages = (piCtx.messages as AssistantMessage[]).map((msg) => {
    const raw = msg as unknown as Record<string, unknown>;
    if (raw.role === "compactionSummary") {
      return {
        role: "user" as const,
        content: `*The conversation history before this point was compacted into the following summary:*\n\n${raw.summary ?? ""}`,
        timestamp: raw.timestamp as number | undefined,
      };
    }
    return normalizeToolCalls(msg);
  });

  return {
    messages,
    entryIds,
    thinkingLevel: piCtx.thinkingLevel,
    model: piCtx.model,
  };
}

export function getLeafId(entries: SessionEntry[]): string | null {
  if (entries.length === 0) return null;
  return entries[entries.length - 1].id;
}



