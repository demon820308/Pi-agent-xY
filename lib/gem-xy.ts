import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import type { GemProfile } from "./types";

export function getGemsFilePath(): string {
  return join(getAgentDir(), "gem_xy.json");
}

export function readGems(): GemProfile[] {
  const filePath = getGemsFilePath();
  if (!existsSync(filePath)) {
    return [];
  }
  try {
    const data = readFileSync(filePath, "utf-8");
    return JSON.parse(data) as GemProfile[];
  } catch (error) {
    console.error("Failed to read gem_xy.json:", error);
    return [];
  }
}

export function writeGems(gems: GemProfile[]): void {
  const filePath = getGemsFilePath();
  try {
    writeFileSync(filePath, JSON.stringify(gems, null, 2), "utf-8");
  } catch (error) {
    console.error("Failed to write gem_xy.json:", error);
    throw error;
  }
}

export function getGemById(id: string): GemProfile | null {
  const gems = readGems();
  return gems.find((g) => g.id === id) ?? null;
}

export function saveGem(gemData: Partial<GemProfile> & { name: string; systemPrompt: string }): GemProfile {
  const gems = readGems();
  const now = new Date().toISOString();

  let targetGem: GemProfile;

  if (gemData.id) {
    const index = gems.findIndex((g) => g.id === gemData.id);
    if (index !== -1) {
      targetGem = {
        ...gems[index],
        ...gemData,
        modified: now,
      } as GemProfile;
      gems[index] = targetGem;
    } else {
      targetGem = {
        id: gemData.id,
        name: gemData.name,
        description: gemData.description || "",
        avatar: gemData.avatar || "🤖",
        systemPrompt: gemData.systemPrompt,
        modelId: gemData.modelId || "",
        provider: gemData.provider || "",
        allowedTools: gemData.allowedTools || [],
        knowledgeFiles: gemData.knowledgeFiles || [],
        created: now,
        modified: now,
      };
      gems.push(targetGem);
    }
  } else {
    // Generate UUID simple version since crypto is built-in
    const uuid = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    targetGem = {
      id: uuid,
      name: gemData.name,
      description: gemData.description || "",
      avatar: gemData.avatar || "🤖",
      systemPrompt: gemData.systemPrompt,
      modelId: gemData.modelId || "",
      provider: gemData.provider || "",
      allowedTools: gemData.allowedTools || [],
      knowledgeFiles: gemData.knowledgeFiles || [],
      created: now,
      modified: now,
    };
    gems.push(targetGem);
  }

  writeGems(gems);
  return targetGem;
}

export function deleteGem(id: string): boolean {
  const gems = readGems();
  const initialLength = gems.length;
  const filtered = gems.filter((g) => g.id !== id);

  if (filtered.length < initialLength) {
    writeGems(filtered);
    return true;
  }
  return false;
}
