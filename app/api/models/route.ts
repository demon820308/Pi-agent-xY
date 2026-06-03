import { AuthStorage, ModelRegistry, SettingsManager, getAgentDir } from "@earendil-works/pi-coding-agent";
import { getSupportedThinkingLevels } from "@earendil-works/pi-ai";
import { writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { triggerBackgroundModelsSync, loadCache } from "../../../lib/model-resolver";

export const dynamic = "force-dynamic";

export async function GET() {
  const nameMap = new Map<string, string>();
  let modelList: { id: string; name: string; provider: string; supportsVision?: boolean }[] = [];
  let defaultModel: { provider: string; modelId: string } | null = null;
  const thinkingLevels: Record<string, string[]> = {};
  const thinkingLevelMaps: Record<string, Record<string, string | null>> = {};

  try {
    const agentDir = getAgentDir();
    const authStorage = AuthStorage.create();
    const registry = ModelRegistry.create(authStorage);
    const available = registry.getAvailable();
    modelList = available.map((m) => ({
      id: m.id,
      name: m.name,
      provider: m.provider,
      supportsVision: Array.isArray(m.input) && m.input.includes("image"),
    }));
    for (const m of available) {
      const key = `${m.provider}:${m.id}`;
      nameMap.set(key, m.name);
      thinkingLevels[key] = getSupportedThinkingLevels(m);
      if (m.thinkingLevelMap) thinkingLevelMaps[key] = m.thinkingLevelMap;
    }
    // Post-process / augment model lists
    
    // Trigger background synchronization of models list from active providers
    try {
      triggerBackgroundModelsSync(registry);
    } catch (e) {
      console.error("[api/models] Failed to trigger background models sync:", e);
    }

    // Merge cached models into the model list
    try {
      const cache = loadCache();
      for (const provider of Object.keys(cache)) {
        const cached = cache[provider];
        if (cached && Array.isArray(cached.models)) {
          for (const m of cached.models) {
            // Append if not already in list
            if (!modelList.some(x => x.provider === m.provider && x.id === m.id)) {
              modelList.push(m);
              const key = `${m.provider}:${m.id}`;
              nameMap.set(key, m.name);
              thinkingLevels[key] = ["off"];
            }
          }
        }
      }
    } catch (e) {
      console.error("[api/models] Failed to load cached models:", e);
    }
    
    // 1. Remove unusable MiniMax-M2.7-highspeed and add MiniMax-M3
    modelList = modelList.filter(m => !(m.provider.startsWith("minimax") && m.id === "MiniMax-M2.7-highspeed"));
    
    const minimaxProviders = Array.from(new Set(modelList.filter(m => m.provider.startsWith("minimax")).map(m => m.provider)));
    if (minimaxProviders.length === 0) {
      minimaxProviders.push("minimax-cn");
    }
    
    for (const provider of minimaxProviders) {
      if (!modelList.some(m => m.provider === provider && m.id === "MiniMax-M3")) {
        modelList.push({
          id: "MiniMax-M3",
          name: "MiniMax-M3",
          provider: provider,
          supportsVision: false
        });
        const key = `${provider}:MiniMax-M3`;
        nameMap.set(key, "MiniMax-M3");
        thinkingLevels[key] = ["off"];
      }
    }

    // 2. Set up the exact 9 mimo models for xiaomi-token-plan-cn and xiaomi-token-plan and any other mimo provider
    const mimoProviders = Array.from(new Set(modelList.filter(m => m.provider.includes("xiaomi-token-plan") || m.provider.includes("mimo")).map(m => m.provider)));
    if (mimoProviders.length === 0) {
      mimoProviders.push("xiaomi-token-plan-cn", "xiaomi-token-plan");
    }

    const exactMimoModels = [
      { id: "mimo-v2.5-pro", name: "MiMo-V2.5-Pro", supportsVision: true },
      { id: "mimo-v2.5", name: "MiMo-V2.5", supportsVision: false },
      { id: "mimo-v2.5-asr", name: "MiMo-V2.5-ASR", supportsVision: false },
      { id: "mimo-v2.5-tts-voiceclone", name: "MiMo-V2.5-TTS-VoiceClone", supportsVision: false },
      { id: "mimo-v2.5-tts-voicedesign", name: "MiMo-V2.5-TTS-VoiceDesign", supportsVision: false },
      { id: "mimo-v2.5-tts", name: "MiMo-V2.5-TTS", supportsVision: false },
      { id: "mimo-v2-pro", name: "MiMo-V2-Pro", supportsVision: true },
      { id: "mimo-v2-omni", name: "MiMo-V2-Omni", supportsVision: true },
      { id: "mimo-v2-tts", name: "MiMo-V2-TTS", supportsVision: false }
    ];

    modelList = modelList.filter(m => !(m.provider.includes("xiaomi-token-plan") || m.provider.toLowerCase().includes("mimo")));

    for (const provider of mimoProviders) {
      for (const model of exactMimoModels) {
        modelList.push({
          id: model.id,
          name: model.name,
          provider: provider,
          supportsVision: model.supportsVision
        });
        const key = `${provider}:${model.id}`;
        nameMap.set(key, model.name);
        thinkingLevels[key] = ["off"];
      }
    }

    const settings = SettingsManager.create(process.cwd(), agentDir);
    const provider = settings.getDefaultProvider();
    const modelId = settings.getDefaultModel();
    if (provider) {
      defaultModel = { provider, modelId: modelId ?? available[0]?.id ?? "" };
    }
  } catch { /* return empty */ }

  return Response.json({ models: Object.fromEntries(nameMap), modelList, defaultModel, thinkingLevels, thinkingLevelMaps });
}

export async function POST(request: Request) {
  try {
    const { provider, modelId } = await request.json();
    if (!provider || !modelId) {
      return Response.json({ error: "provider and modelId are required" }, { status: 400 });
    }

    const agentDir = getAgentDir();
    const settingsPath = join(agentDir, "settings.json");
    
    let settings: any = {};
    if (existsSync(settingsPath)) {
      try {
        settings = JSON.parse(readFileSync(settingsPath, "utf8")) || {};
      } catch {
        // ignore
      }
    }
    
    settings = {
      ...settings,
      defaultProvider: provider,
      defaultModel: modelId
    };
    
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf8");
    return Response.json({ success: true });
  } catch (e: any) {
    return Response.json({ error: e.message || String(e) }, { status: 500 });
  }
}
