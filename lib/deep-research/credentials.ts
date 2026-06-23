import { AuthStorage, ModelRegistry, SettingsManager, getAgentDir } from "@earendil-works/pi-coding-agent";
import { findModel } from "../model-resolver";

export interface ResolvedModelConfig {
  modelId: string;
  provider: string;
  apiKey: string;
  baseURL: string;
  headers: Record<string, string>;
}

export async function getPiAgentDefaultModel(customProvider?: string, customModelId?: string): Promise<ResolvedModelConfig> {
  const agentDir = getAgentDir();
  const authStorage = AuthStorage.create();
  const registry = ModelRegistry.create(authStorage);
  const settings = SettingsManager.create(process.cwd(), agentDir);

  const provider = customProvider || settings.getDefaultProvider();
  const modelId = customModelId || settings.getDefaultModel();

  if (!provider || !modelId) {
    throw new Error("No default model configured in pi-agent settings.");
  }

  const model = findModel(registry, provider, modelId);
  if (!model) {
    throw new Error(`Model not found in registry: ${provider}/${modelId}`);
  }

  const auth = await registry.getApiKeyAndHeaders(model);
  if (!auth.ok) {
    throw new Error(`Failed to resolve credentials for ${provider}: ${auth.error}`);
  }

  return {
    modelId: model.id,
    provider: model.provider,
    apiKey: auth.apiKey || "",
    baseURL: model.baseUrl || "",
    headers: auth.headers || {}
  };
}

export async function getApiKeyForProvider(provider: string): Promise<string> {
  // Check process.env first
  const envName = `${provider.toUpperCase()}_API_KEY`;
  if (process.env[envName]) {
    return process.env[envName]!;
  }
  
  // Then check AuthStorage (stored in auth.json)
  try {
    const authStorage = AuthStorage.create();
    const auth = authStorage.get(provider) as { key?: string } | undefined;
    return auth?.key || "";
  } catch (e) {
    console.error(`Failed to read API key for ${provider} from AuthStorage:`, e);
    return "";
  }
}
