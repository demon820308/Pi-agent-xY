export function isVisionModel(provider: string, modelId: string): boolean {
  const pid = provider.toLowerCase();
  const mid = modelId.toLowerCase();
  // If it's explicitly a TTS (Text-To-Speech) or audio-only/voice cloning model, it doesn't support vision
  if (mid.includes("tts") || mid.includes("voiceclone") || mid.includes("voicedesign") || mid.includes("audio-gen")) {
    return false;
  }

  // If it's a mimo-v2-flash or a text-only flash model, it doesn't support vision on the completions API
  if (mid.includes("mimo") && mid.includes("flash")) {
    return false;
  }

  // If it's explicitly deepseek, it doesn't support vision (except for deepseek-vl, deepseek-vl2, deepseek-v4, janus, deepseek-ocr)
  if (pid.includes("deepseek") || mid.includes("deepseek")) {
    if (
      mid.includes("vl") ||
      mid.includes("v4") ||
      mid.includes("janus") ||
      mid.includes("ocr")
    ) {
      return true;
    }
    return false;
  }

  // 1. OpenAI Vision Models
  if (pid.includes("openai")) {
    if (mid.includes("o1-mini")) return false;
    if (
      mid.includes("gpt-4o") ||
      mid.includes("gpt-5") ||
      mid.includes("gpt-4.5") ||
      mid.includes("gpt-4-turbo") ||
      mid.includes("vision") ||
      mid.includes("multimodal") ||
      mid === "o1" ||
      mid.startsWith("o1-202")
    ) {
      return true;
    }
    return false;
  }

  // 2. Anthropic Vision Models (Claude 3 / 3.5 / 4 / 5 series)
  if (pid.includes("anthropic")) {
    if (
      mid.includes("claude-3") ||
      mid.includes("claude-4") ||
      mid.includes("claude-5") ||
      mid.includes("claude-sonnet") ||
      mid.includes("claude-opus") ||
      (mid.includes("claude-") && (mid.includes("vision") || mid.includes("multimodal")))
    ) {
      return true;
    }
    return false;
  }

  // 3. Gemini / Google Vision Models
  if (pid.includes("google") || pid.includes("gemini")) {
    if (
      mid.includes("gemini-") ||
      mid.includes("omni") ||
      mid.includes("vision") ||
      mid.includes("multimodal")
    ) {
      return true;
    }
    return false;
  }

  // 4. Other models (e.g. OpenRouter, Groq, local models, specialized Chinese gateways)
  if (
    mid.includes("vision") ||
    mid.includes("multimodal") ||
    mid.includes("vlm") ||
    mid.includes("vla") ||
    mid.includes("gpt-4o") ||
    mid.includes("gpt-5") ||
    mid.includes("gpt-4.5") ||
    mid.includes("claude-3") ||
    mid.includes("claude-4") ||
    mid.includes("gemini-") ||
    mid.includes("pixtral") ||
    mid === "mimo-v2.5" || (mid.includes("mimo") && (mid.includes("v2-pro") || mid.includes("v2-omni"))) ||
    mid.includes("-vl") ||
    mid.includes("molmo") ||
    mid.includes("paligemma") ||
    mid.includes("gemma-3") ||
    mid.includes("gemma-4") ||
    mid.includes("gemma-5") ||
    // Llama vision models (Llama 3.2 11B/90B, Llama 3.3/4 Vision, etc.)
    (mid.includes("llama") && (mid.includes("11b") || mid.includes("90b") || mid.includes("vision") || mid.includes("multimodal"))) ||
    // Qwen VL models
    (mid.includes("qwen") && mid.includes("vl")) ||
    // Zhipu GLM Vision models (using robust regex for glm-4v, glm-4.5v, glm-edge-v, etc.)
    (mid.includes("glm") && (mid.includes("vision") || mid.includes("vl") || mid.includes("thinking") || /glm-(?:\d+(?:\.\d+)?v|edge-v|omni)/i.test(mid))) ||
    mid.includes("cogvlm") ||
    mid.includes("internvl") ||
    // Yi VL models
    (mid.includes("yi") && mid.includes("vl")) ||
    // StepFun Vision models
    (mid.includes("step-") && (mid.includes("v") || mid.includes("vision"))) ||
    // Tencent Hunyuan Vision models
    (mid.includes("hunyuan") && (mid.includes("vision") || mid.includes("vl"))) ||
    // ByteDance Doubao Vision models
    (mid.includes("doubao") && (mid.includes("vision") || mid.includes("vl"))) ||
    // Kimi / Moonshot models (matching Kimi K2.6, kimi-2.6, etc.)
    ((mid.includes("kimi") || mid.includes("moonshot")) && (mid.includes("vision") || mid.includes("vl") || mid.includes("2.6") || mid.includes("k2"))) ||
    (mid.includes("abab") && (mid.includes("vision") || mid.includes("vl"))) ||
    (mid.includes("minimax") && (mid.includes("vision") || mid.includes("vl") || mid.includes("m3"))) ||
    mid.includes("hailuo")
  ) {
    return true;
  }

  return false;
}
