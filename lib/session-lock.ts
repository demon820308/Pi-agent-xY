import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

function getLockFilePath(): string {
  return join(getAgentDir(), "locked-sessions.json");
}

export function getLockedSessionIds(): string[] {
  const path = getLockFilePath();
  if (!existsSync(path)) return [];
  try {
    const content = readFileSync(path, "utf-8");
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error("Failed to read locked-sessions.json:", e);
    return [];
  }
}

export function isSessionLocked(sessionId: string): boolean {
  return getLockedSessionIds().includes(sessionId);
}

export function setSessionLock(sessionId: string, locked: boolean): void {
  const ids = getLockedSessionIds();
  const index = ids.indexOf(sessionId);
  if (locked) {
    if (index === -1) {
      ids.push(sessionId);
    }
  } else {
    if (index !== -1) {
      ids.splice(index, 1);
    }
  }
  try {
    writeFileSync(getLockFilePath(), JSON.stringify(ids, null, 2), "utf-8");
  } catch (e) {
    console.error("Failed to write locked-sessions.json:", e);
  }
}
