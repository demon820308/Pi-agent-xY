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
  if (!url) return "";
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

function isLiteralApiKey(key: string): boolean {
  if (!key || typeof key !== "string") return false;
  if (key.startsWith("!")) return false; // shell command
  if (/^[A-Z_][A-Z0-9_]*$/.test(key)) return false; // env var name
  return true;
}

export async function syncModelsInternal(registry: any, force = false) {
  try {
    const cache = loadCache();
    const now = Date.now();
    
    const authPath = join(getAgentDir(), "auth.json");
    let authData: Record<string, any> = {};
    if (existsSync(authPath)) {
      try {
        authData = JSON.parse(readFileSync(authPath, "utf8"));
      } catch (e) {
        console.error("Failed to parse auth.json:", e);
      }
    }
    const providers = Object.keys(authData);
    
    const modelsPath = join(getAgentDir(), "models.json");
    let modelsData: any = { providers: {} };
    if (existsSync(modelsPath)) {
      try {
        modelsData = JSON.parse(readFileSync(modelsPath, "utf8")) || { providers: {} };
        if (!modelsData.providers) modelsData.providers = {};
      } catch (e) {
        console.error("Failed to parse models.json:", e);
      }
    }
    
    // Collect all providers to sync
    interface ProviderSyncInfo {
      name: string;
      apiKey: string;
      baseUrl: string;
      isCustom: boolean;
    }
    const providersToSync: ProviderSyncInfo[] = [];

    // From auth.json
    for (const name of providers) {
      const apiKey = authData[name]?.key;
      if (apiKey) {
        const baseModel = (registry as any).models?.find((m: any) => m.provider === name);
        const baseUrl = baseModel?.baseUrl || "";
        providersToSync.push({ name, apiKey, baseUrl, isCustom: false });
      }
    }

    // From models.json
    for (const name of Object.keys(modelsData.providers)) {
      const providerEntry = modelsData.providers[name];
      const apiKey = providerEntry?.apiKey;
      const baseUrl = providerEntry?.baseUrl || "";
      if (apiKey && isLiteralApiKey(apiKey)) {
        if (!providersToSync.some(p => p.name === name)) {
          providersToSync.push({ name, apiKey, baseUrl, isCustom: true });
        }
      }
    }
    
    let cacheUpdated = false;
    let modelsUpdated = false;
    
    for (const pInfo of providersToSync) {
      const { name: provider, apiKey, baseUrl, isCustom } = pInfo;
      
      // Sync cache every 1 hour, unless forced
      const cacheCheck = cache[provider];
      if (!force && cacheCheck && (now - cacheCheck.updatedAt) < 60 * 60 * 1000) {
        continue;
      }
      
      const endpoint = getModelsEndpoint(provider, baseUrl);
      if (!endpoint || (!endpoint.startsWith("http://") && !endpoint.startsWith("https://"))) {
        continue;
      }
      
      console.log(`[model-resolver] Syncing models list for provider: "${provider}" (force=${force})...`);
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
          
          if (isCustom) {
            const existingModels = modelsData.providers[provider].models || [];
            const updatedModels = modelIds.map(id => {
              const existing = existingModels.find((m: any) => m.id === id);
              if (existing) return existing;
              const isVision = isVisionModel(provider, id);
              const isReasoning = id.toLowerCase().includes("pro") || id.toLowerCase().includes("omni") || id.toLowerCase().includes("reasoning") || id.toLowerCase().includes("thinking") || id.toLowerCase().includes("-r1");
              const newModel: any = { id, name: id };
              if (isReasoning) newModel.reasoning = true;
              if (isVision) {
                newModel.input = ["text", "image"];
              } else {
                newModel.input = ["text"];
              }
              return newModel;
            });
            modelsData.providers[provider].models = updatedModels;
            modelsUpdated = true;
          }
          
          console.log(`[model-resolver] Successfully synced ${modelIds.length} models for "${provider}".`);
        }
      } catch (err) {
        console.error(`[model-resolver] Fetch failed for "${provider}":`, err);
      }
    }
    
    if (cacheUpdated) {
      saveCache(cache);
    }
    if (modelsUpdated) {
      try {
        writeFileSync(modelsPath, JSON.stringify(modelsData, null, 2), "utf8");
      } catch (e) {
        console.error("Failed to save models.json:", e);
      }
    }
  } catch (e) {
    console.error("[model-resolver] Error in syncModelsInternal:", e);
  }
}

export function triggerBackgroundModelsSync(registry: any) {
  setTimeout(async () => {
    try {
      await syncModelsInternal(registry, false);
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
