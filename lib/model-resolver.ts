/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { isVisionModel } from "./vision";

// Path to cache file
function getCachePath(): string {
  return join(getAgentDir(), "fetched-models-cache.json");
}

interface CachedProviderModels {
  updatedAt: number;
  models: { id: string; name: string; provider: string; supportsVision: boolean }[];
}

let memoryCache: Record<string, CachedProviderModels> | null = null;

export function loadCache(): Record<string, CachedProviderModels> {
  if (memoryCache) return memoryCache;
  const path = getCachePath();
  if (existsSync(path)) {
    try {
      memoryCache = JSON.parse(readFileSync(path, "utf8"));
      return memoryCache!;
    } catch {
      // ignore
    }
  }
  memoryCache = {};
  return memoryCache;
}

function saveCache(cache: Record<string, CachedProviderModels>) {
  memoryCache = cache;
  try {
    writeFileSync(getCachePath(), JSON.stringify(cache, null, 2), "utf8");
  } catch (e) {
    console.error("Failed to save models cache:", e);
  }
}

function getModelsEndpoint(provider: string, baseUrl: string): string {
  const pid = provider.toLowerCase();
  if (pid.startsWith("minimax")) {
    return "https://api.minimaxi.com/v1/models";
  }
  if (pid.includes("google") || pid.includes("gemini")) {
    return "https://generativelanguage.googleapis.com/v1beta/models";
  }
  
  // Standard OpenAI-compatible format
  let url = baseUrl;
  if (url.endsWith("/anthropic")) {
    url = url.replace("/anthropic", "/v1");
  }
  if (url.endsWith("/")) {
    url = url.slice(0, -1);
  }
  if (!url.endsWith("/models")) {
    url = `${url}/models`;
  }
  return url;
}

export function triggerBackgroundModelsSync(registry: any) {
  setTimeout(async () => {
    try {
      const cache = loadCache();
      const now = Date.now();
      
      const authPath = join(getAgentDir(), "auth.json");
      if (!existsSync(authPath)) return;
      const authData = JSON.parse(readFileSync(authPath, "utf8"));
      const providers = Object.keys(authData);
      
      let cacheUpdated = false;
      
      for (const provider of providers) {
        const apiKey = authData[provider]?.key;
        if (!apiKey) continue;
        
        // Sync cache every 1 hour
        const existing = cache[provider];
        if (existing && (now - existing.updatedAt) < 60 * 60 * 1000) {
          continue;
        }
        
        console.log(`[model-resolver] Background syncing models list for provider: "${provider}"...`);
        
        const baseModel = (registry as any).models?.find((m: any) => m.provider === provider);
        const rawBaseUrl = baseModel?.baseUrl || "";
        
        const endpoint = getModelsEndpoint(provider, rawBaseUrl);
        const headers: Record<string, string> = {};
        
        let url = endpoint;
        const pid = provider.toLowerCase();
        if (pid.includes("google") || pid.includes("gemini")) {
          url = `${endpoint}?key=${apiKey}`;
        } else {
          headers["Authorization"] = `Bearer ${apiKey}`;
        }
        
        try {
          const res = await fetch(url, { headers, signal: AbortSignal.timeout(6000) });
          if (!res.ok) {
            console.error(`[model-resolver] Failed to fetch models for "${provider}": HTTP ${res.status}`);
            continue;
          }
          const data = await res.json() as any;
          let modelIds: string[] = [];
          
          if (pid.includes("google") || pid.includes("gemini")) {
            const list = data.models || [];
            modelIds = list.map((m: any) => {
              const name = m.name || "";
              return name.startsWith("models/") ? name.replace("models/", "") : name;
            }).filter((id: string) => id.includes("gemini"));
          } else {
            const list = data.data || [];
            modelIds = list.map((m: any) => m.id).filter(Boolean);
          }
          
          if (modelIds.length > 0) {
            const models = modelIds.map(id => {
              const isVision = isVisionModel(provider, id);
              return {
                id,
                name: id,
                provider,
                supportsVision: isVision
              };
            });
            
            cache[provider] = {
              updatedAt: now,
              models
            };
            cacheUpdated = true;
            console.log(`[model-resolver] Successfully synced ${modelIds.length} models for "${provider}".`);
          }
        } catch (err) {
          console.error(`[model-resolver] Fetch failed for "${provider}":`, err);
        }
      }
      
      if (cacheUpdated) {
        saveCache(cache);
      }
    } catch (e) {
      console.error("[model-resolver] Error in triggerBackgroundModelsSync:", e);
    }
  }, 100);
}

export function findModel(registry: any, provider: string, modelId: string): any {
  // Try standard registry first
  const model = registry.find(provider, modelId);
  if (model) return model;

  const pid = provider.toLowerCase();
  const mid = modelId.toLowerCase();

  // 1. Resolve MiniMax-M3 override (MiniMax-M3 uses openai-completions API format, M2.7 uses anthropic-messages)
  if (pid === "minimax-cn" && modelId === "MiniMax-M3") {
    const base = registry.find("minimax-cn", "MiniMax-M2.7") || 
                 registry.find("minimax-cn", "MiniMax-M2.7-highspeed");
    return base ? {
      ...base,
      id: "MiniMax-M3",
      name: "MiniMax-M3",
      api: "openai-completions",
      baseUrl: base.baseUrl.includes("anthropic") ? base.baseUrl.replace("/anthropic", "/v1") : "https://api.minimaxi.com/v1",
      reasoning: true,
    } : {
      id: "MiniMax-M3",
      name: "MiniMax-M3",
      api: "openai-completions",
      provider: "minimax-cn",
      baseUrl: "https://api.minimaxi.com/v1",
      reasoning: true,
      input: ["text"],
      cost: { input: 0.3, output: 1.2, cacheRead: 0.06, cacheWrite: 0.375 },
      contextWindow: 204800,
      maxTokens: 131072
    };
  }

  // 2. Generic provider fallback (Clones base model for same provider)
  const regModels = (registry as any).models || [];
  const base = regModels.find((m: any) => m.provider === provider) ||
               (typeof registry.getAll === "function" ? registry.getAll().find((m: any) => m.provider === provider) : undefined);

  if (base) {
    const isVision = isVisionModel(provider, modelId);
    return {
      ...base,
      id: modelId,
      name: modelId,
      reasoning: mid.includes("reasoning") || mid.includes("thinking") || mid.includes("-r1") || base.reasoning,
      input: isVision ? ["text", "image"] : ["text"]
    };
  }

  return undefined;
}
