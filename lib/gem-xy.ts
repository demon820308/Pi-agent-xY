import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import type { GemProfile } from "./types";
import { PPT_GEM_DEFAULTS } from "./ppt-gem";

export function getGemsFilePath(): string {
  return join(getAgentDir(), "gem_xy.json");
}

export function readGems(): GemProfile[] {
  const filePath = getGemsFilePath();
  if (!existsSync(filePath)) {
    const initialPresets = [
      { id: "ppt-master-preset", ...PPT_GEM_DEFAULTS, created: new Date().toISOString(), modified: new Date().toISOString() }
    ];
    return initialPresets as GemProfile[];
  }
  try {
    const data = readFileSync(filePath, "utf-8");
    const gems = JSON.parse(data) as GemProfile[];
    // Ensure PPT preset is always present
    if (!gems.some(g => g.id === "ppt-master-preset")) {
      gems.unshift({ id: "ppt-master-preset", ...PPT_GEM_DEFAULTS, created: new Date().toISOString(), modified: new Date().toISOString() } as GemProfile);
    }
    return gems;
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

  // Check if a preset Gem-xY 文案助手 already exists
  const existingPreset = gems.find((g) => g.name === "Gem-xY 文案助手");
  if (existingPreset) {
    // Block modifying the existing preset
    if (gemData.id && gemData.id === existingPreset.id) {
      throw new Error("不能修改预置的 \"Gem-xY 文案助手\" 智能体");
    }
    // Block creating a new one with the same name
    if (gemData.name === "Gem-xY 文案助手" && gemData.id !== existingPreset.id) {
      throw new Error("不能创建同名智能体 \"Gem-xY 文案助手\"");
    }
  }

  // Protect PPT preset from modifications
  if (gemData.id === "ppt-master-preset") {
    throw new Error("不能修改预置的 \"Gem-xY PPT 排版大师\" 智能体");
  }
  if (gemData.name === "Gem-xY PPT 排版大师" && gemData.id !== "ppt-master-preset") {
    throw new Error("不能创建同名智能体 \"Gem-xY PPT 排版大师\"");
  }

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
  
  const target = gems.find((g) => g.id === id);
  if (target && target.name === "Gem-xY 文案助手") {
    throw new Error("不能删除预置的 \"Gem-xY 文案助手\" 智能体");
  }
  if (id === "ppt-master-preset") {
    throw new Error("不能删除预置的 \"Gem-xY PPT 排版大师\" 智能体");
  }

  const initialLength = gems.length;
  const filtered = gems.filter((g) => g.id !== id);

  if (filtered.length < initialLength) {
    writeGems(filtered);
    return true;
  }
  return false;
}
