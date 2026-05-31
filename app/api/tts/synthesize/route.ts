import { NextResponse } from "next/server";
import { AuthStorage, ModelRegistry } from "@earendil-works/pi-coding-agent";
import { cleanSpeechText } from "@/lib/tts-utils";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let text = "";
  let style: string | undefined = undefined;
  let voice = "mimo_default";
  let modelId = "mimo-v2.5-tts";
  let voiceDesignPrompt: string | undefined = undefined;
  let finalModelId = "mimo-v2.5-tts";
  let finalVoice: string | undefined = "mimo_default";
  let baseUrl = "https://token-plan-cn.xiaomimimo.com/v1";
  let apiKey = "";

  try {
    const body = await req.json() as {
      text: string;
      style?: string;
      voice?: string;
      modelId?: string;
      voiceDesignPrompt?: string;
    };

    text = cleanSpeechText(body.text);
    style = body.style;
    if (typeof body.voice !== "undefined") voice = body.voice;
    if (typeof body.modelId !== "undefined") modelId = body.modelId;
    voiceDesignPrompt = body.voiceDesignPrompt;

    finalModelId = modelId;
    finalVoice = voice;

    if (!text) {
      return NextResponse.json({ error: "Text is required for speech synthesis" }, { status: 400 });
    }

    // 1. Resolve credentials (similar to describe-image endpoint)
    const authStorage = AuthStorage.create();
    const registry = ModelRegistry.create(authStorage);
    
    let apiKey = "";
    let baseUrl = "https://token-plan-cn.xiaomimimo.com/v1";

    const availableModels = registry.getAvailable();
    const model = availableModels.find(m => m.id === modelId) || registry.getAll().find(m => m.id === modelId);

    if (model) {
      const auth = await registry.getApiKeyAndHeaders(model);
      if (auth.ok && auth.apiKey) {
        apiKey = auth.apiKey;
      }
      if (model.baseUrl) {
        baseUrl = model.baseUrl;
      }
    }

    // Fallback lookup in auth storage and env if not resolved via ModelRegistry
    if (!apiKey) {
      const mimoAuth = authStorage.get("mimo") as { key?: string } | undefined;
      const lingyaAuth = authStorage.get("lingya") as { key?: string } | undefined;
      const xiaomiAuth = authStorage.get("xiaomi-token-plan") as { key?: string } | undefined;
      const xiaomiCnAuth = authStorage.get("xiaomi-token-plan-cn") as { key?: string } | undefined;

      apiKey = mimoAuth?.key || lingyaAuth?.key || xiaomiAuth?.key || xiaomiCnAuth?.key || "";
      if (!apiKey) {
        apiKey = process.env.LINGYA_API_KEY || process.env.OPENAI_API_KEY || "";
      }

      // Dynamically align the base URL with the exact API key being used
      if (apiKey === process.env.LINGYA_API_KEY && process.env.LINGYA_API_URL) {
        baseUrl = process.env.LINGYA_API_URL;
      } else if (xiaomiCnAuth?.key && apiKey === xiaomiCnAuth.key) {
        baseUrl = "https://token-plan-cn.xiaomimimo.com/v1";
      } else if (xiaomiAuth?.key && apiKey === xiaomiAuth.key) {
        baseUrl = "https://token-plan.api.xiaomi.net/v1";
      }
    }
    
    if (!apiKey) {
      return NextResponse.json({
        error: "未检测到 MiMo/Lingya/Xiaomi API Key，请先在侧边栏底部的 Models 中配置 API Key，或在系统环境变量中设置 LINGYA_API_KEY。"
      }, { status: 400 });
    }

    // 2. Build the messages block and payload for MiMo v2.5 TTS
    // - User role: provides instructions for style, emotion, tone, or dialect
    // - Assistant role: provides the actual text to be synthesized into speech
    
    const isDesign = modelId.toLowerCase().includes("voicedesign") || modelId.toLowerCase().includes("design");
    const isClone = modelId.toLowerCase().includes("voiceclone") || modelId.toLowerCase().includes("clone");

    finalModelId = modelId;
    finalVoice = voice;

    // Handle voice clone model fallback when reference audio is not a DataURL
    if (isClone) {
      const isVoiceDataUrl = voice && voice.startsWith("data:");
      if (!isVoiceDataUrl) {
        console.log(`[tts-synthesize] Voice clone selected but voice parameter is not a DataURL. Falling back to standard mimo-v2.5-tts.`);
        finalModelId = "mimo-v2.5-tts";
        finalVoice = "mimo_default";
      } else {
        // Automatically translate unsupported but common browser formats (like webm, ogg, m4a)
        // by trans-labeling their DataURL prefix to audio/wav.
        // This leverages the backend decoder's ability to decode multi-format streams.
        if (
          voice.startsWith("data:audio/webm;") || 
          voice.startsWith("data:audio/ogg;") || 
          voice.startsWith("data:audio/m4a;") || 
          voice.startsWith("data:audio/webm,")
        ) {
          console.log(`[tts-synthesize] Translating unsupported browser audio format to wav header for MiMo compatibility.`);
          finalVoice = voice.replace(/^data:audio\/[^;]+;/, "data:audio/wav;");
        }
      }
    }

    // Fuse voice design prompt with style instructions if voice design model is used
    const finalIsDesign = finalModelId.toLowerCase().includes("voicedesign") || finalModelId.toLowerCase().includes("design");
    let userPrompt = "";
    if (finalIsDesign) {
      const designPrompt = voiceDesignPrompt?.trim() || "A warm natural conversational voice";
      const styleText = style?.trim() ? `, in this style: ${style}` : "";
      userPrompt = `${designPrompt}${styleText}`.trim();
    } else {
      userPrompt = style?.trim() 
        ? `Speak in this style: ${style}` 
        : "speak naturally in a warm conversational tone.";
    }

    const requestBody: Record<string, any> = {
      model: finalModelId,
      messages: [
        {
          role: "user",
          content: userPrompt
        },
        {
          role: "assistant",
          content: text
        }
      ],
      audio: {}
    };

    // For voice design, we MUST NOT supply audio.voice parameter as it causes HTTP 400 Param Incorrect
    if (!finalIsDesign) {
      requestBody.audio.voice = finalVoice;
    }

    const endpoint = `${baseUrl}/chat/completions`;
    console.log(`[tts-synthesize] Sending request to endpoint: ${endpoint}`);
    console.log("[tts-synthesize] Request Body:", JSON.stringify(requestBody, null, 2));

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("[tts-synthesize] Xiaomi API error response:", JSON.stringify(errorData));
      
      const errorMsg = errorData.error?.message || errorData.error || JSON.stringify(errorData);
      const errorParam = errorData.error?.param ? ` (参数错误字段: ${errorData.error.param})` : "";
      
      return NextResponse.json({
        error: `Xiaomi TTS API 返回错误 (HTTP ${response.status}): ${errorMsg}${errorParam}`
      }, { status: response.status });
    }

    const data = await response.json() as {
      choices?: {
        message?: {
          audio?: {
            data?: string;
          };
        };
      }[];
    };

    const audioData = data.choices?.[0]?.message?.audio?.data;
    if (!audioData) {
      console.error("[tts-synthesize] Response is missing audio data:", JSON.stringify(data));
      return NextResponse.json({
        error: "小米 API 响应中缺少 audio.data 字段，请确认使用的是 mimo-v2.5-tts 模型。"
      }, { status: 500 });
    }

    // 3. Return base64 audio data URL directly
    return NextResponse.json({
      audioUrl: `data:audio/mp3;base64,${audioData}`
    });

  } catch (error: any) {
    console.error("[tts-synthesize] Unexpected error:", error);
    return NextResponse.json({ 
      error: `TTS 接口出错: ${String(error)}`,
      debug: {
        modelId,
        finalModelId: typeof finalModelId !== "undefined" ? finalModelId : undefined,
        voice: typeof voice !== "undefined" ? voice : undefined,
        finalVoice: typeof finalVoice !== "undefined" && finalVoice ? (finalVoice.startsWith("data:") ? `DataURL(${finalVoice.length}B)` : finalVoice) : undefined,
        baseUrl: typeof baseUrl !== "undefined" ? baseUrl : undefined,
        endpoint: typeof baseUrl !== "undefined" ? `${baseUrl}/chat/completions` : undefined,
        hasApiKey: typeof apiKey !== "undefined" ? !!apiKey : false,
        apiKeyPrefix: typeof apiKey !== "undefined" && apiKey ? apiKey.substring(0, 10) : undefined,
        errorStack: error?.stack || String(error),
        errorCause: error?.cause ? String(error.cause) : (error?.message || String(error))
      }
    }, { status: 500 });
  }
}
