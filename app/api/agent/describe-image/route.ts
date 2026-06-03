import { NextResponse } from "next/server";
import { AuthStorage, ModelRegistry } from "@earendil-works/pi-coding-agent";
import { findModel } from "../../../../lib/model-resolver";

export const dynamic = "force-dynamic";

function normalizeDescription(text: string): string {
  return text.replace(
    /(好的，作为顶级\s*AI\s*图像提示词工程专家.*?[。！!])[\s\r\n]*[-*~_]{3,}[\s\r\n]*(###\s*(?:🖼️\s*)?深度图像拆解分析)/gi,
    "$1\n$2"
  );
}

export async function POST(req: Request) {
  try {
    const { image, mimeType, provider: reqProvider, modelId: reqModelId } = await req.json() as {
      image: string;
      mimeType: string;
      provider?: string;
      modelId?: string;
    };

    if (!image || !mimeType) {
      return NextResponse.json({ error: "image and mimeType are required" }, { status: 400 });
    }

    // 1. Sanitize image base64 data — strip any data URL prefix and whitespace
    let base64Data = image.trim();
    if (base64Data.startsWith("data:")) {
      const commaIndex = base64Data.indexOf(",");
      if (commaIndex !== -1) {
        base64Data = base64Data.substring(commaIndex + 1);
      }
    }
    base64Data = base64Data.replace(/\s/g, "");

    // 2. Decode base64 → raw bytes, then re-encode to get perfectly clean base64.
    //    This eliminates any corruption or encoding artifacts from the client side.
    let imageBuffer: Buffer;
    try {
      imageBuffer = Buffer.from(base64Data, "base64");
      if (imageBuffer.length === 0) {
        return NextResponse.json({ error: "Image data decoded to empty buffer — the base64 payload may be corrupt." }, { status: 400 });
      }
      // Re-encode from the decoded buffer for guaranteed clean base64
      base64Data = imageBuffer.toString("base64");
    } catch {
      return NextResponse.json({ error: "Failed to decode base64 image data." }, { status: 400 });
    }

    // 3. Detect true image format from magic bytes (overrides browser-supplied MIME type).
    //    Some files have a mismatched extension/MIME type that confuses vision APIs.
    const SUPPORTED_MIME_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/bmp"] as const;
    let normalizedMimeType: string = mimeType.toLowerCase().trim().split(";")[0].trim();
    if (normalizedMimeType === "image/jpg") normalizedMimeType = "image/jpeg";

    const b = imageBuffer;
    if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) {
      normalizedMimeType = "image/jpeg";
    } else if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) {
      normalizedMimeType = "image/png";
    } else if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) {
      normalizedMimeType = "image/gif";
    } else if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
               b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
      normalizedMimeType = "image/webp";
    } else if (b[0] === 0x42 && b[1] === 0x4D) {
      normalizedMimeType = "image/bmp";
    } else if (!SUPPORTED_MIME_TYPES.includes(normalizedMimeType as typeof SUPPORTED_MIME_TYPES[number])) {
      // Unknown magic bytes and unsupported MIME type — default to JPEG as last resort
      console.warn(`[describe-image] Unknown image magic bytes 0x${b[0]?.toString(16)} 0x${b[1]?.toString(16)} 0x${b[2]?.toString(16)} and unsupported mimeType "${normalizedMimeType}", defaulting to image/jpeg`);
      normalizedMimeType = "image/jpeg";
    }

    // 4. Debug logging
    console.log(`[describe-image] buffer=${imageBuffer.length}B, detectedMime=${normalizedMimeType}, first4=0x${b[0]?.toString(16)}${b[1]?.toString(16)}${b[2]?.toString(16)}${b[3]?.toString(16)}, base64Len=${base64Data.length}`);

    const authStorage = AuthStorage.create();
    const registry = ModelRegistry.create(authStorage);

    let provider = reqProvider ? reqProvider.toLowerCase().trim() : "";
    let modelId = reqModelId ? reqModelId.trim() : "";
    let apiKey = "";
    let endpoint = "";
    let headers: Record<string, string> = { "Content-Type": "application/json" };
    let useGoogleApi = false;

    // 3. Try to find the model in the registry to get authentic endpoint + headers
    const model = reqProvider && reqModelId ? findModel(registry, reqProvider, reqModelId) : undefined;

    if (model) {
      const auth = await registry.getApiKeyAndHeaders(model);
      if (!auth.ok) {
        return NextResponse.json({ error: `无法解析模型认证: ${auth.error}` }, { status: 400 });
      }

      endpoint = `${model.baseUrl}/chat/completions`;
      if (auth.apiKey) {
        apiKey = auth.apiKey;
        headers["Authorization"] = `Bearer ${apiKey}`;
      }
      if (auth.headers) {
        headers = { ...headers, ...auth.headers };
      }
      modelId = model.id;
      provider = model.provider;

      if (provider.toLowerCase() === "google" || provider.toLowerCase() === "gemini") {
        useGoogleApi = true;
      }
    } else {
      // 4. Fallback to manual resolution if not found in registry
      if (provider) {
        const auth = authStorage.get(provider) as { key?: string } | undefined;
        if (auth?.key) {
          apiKey = auth.key;
        } else {
          const envNames = [
            `${provider.toUpperCase()}_API_KEY`,
            `${provider.toUpperCase().replace("-", "_")}_API_KEY`
          ];
          for (const name of envNames) {
            if (process.env[name]) {
              apiKey = process.env[name]!;
              break;
            }
          }
        }
      }

      // Check LINGYA_API_KEY override for Xiaomi / mimo endpoints
      const isXiaomiOrMimo = provider.includes("xiaomi-token-plan") || provider.includes("mimo") || provider.includes("lingya");
      if (isXiaomiOrMimo && process.env.LINGYA_API_KEY) {
        apiKey = process.env.LINGYA_API_KEY;
      }

      // Fall back to first configured OpenAI / Anthropic key
      if (!apiKey) {
        const openaiAuth = authStorage.get("openai") as { key?: string } | undefined;
        if (openaiAuth?.key) {
          apiKey = openaiAuth.key;
          provider = "openai";
          modelId = "gpt-4o-mini";
        } else {
          const anthropicAuth = authStorage.get("anthropic") as { key?: string } | undefined;
          if (anthropicAuth?.key) {
            apiKey = anthropicAuth.key;
            provider = "anthropic";
            modelId = "claude-3-5-sonnet-20241022";
          }
        }
      }

      // Fall back to general environment variables
      if (!apiKey) {
        if (process.env.OPENAI_API_KEY) {
          apiKey = process.env.OPENAI_API_KEY;
          provider = "openai";
          modelId = "gpt-4o-mini";
        } else if (process.env.ANTHROPIC_API_KEY) {
          apiKey = process.env.ANTHROPIC_API_KEY;
          provider = "anthropic";
          modelId = "claude-3-5-sonnet-20241022";
        } else if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) {
          apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
          provider = "google";
          modelId = "gemini-1.5-flash";
        }
      }

      if (!apiKey) {
        return NextResponse.json({
          error: "未配置可用视觉模型的 API 密钥（OpenAI 或 Anthropic）。请先在侧边栏底部的 Models 中配置 API Key，或在系统环境变量中设置 OPENAI_API_KEY。"
        }, { status: 400 });
      }

      headers["Authorization"] = `Bearer ${apiKey}`;
      endpoint = "https://api.openai.com/v1/chat/completions";

      if (provider === "openrouter") {
        endpoint = "https://openrouter.ai/api/v1/chat/completions";
      } else if (provider.includes("xiaomi-token-plan") || provider.includes("mimo") || provider.includes("lingya")) {
        if (process.env.LINGYA_API_URL) {
          endpoint = `${process.env.LINGYA_API_URL}/chat/completions`;
        } else {
          endpoint = "https://token-plan.api.xiaomi.net/v1/chat/completions";
        }
      } else if (provider === "google" || provider === "gemini") {
        useGoogleApi = true;
      }
    }

    const promptText = `请作为顶级的 AI 图像提示词工程专家（Img2Prompt Expert），为我深度拆解我所上传的这张图片。

请严格按照以下精细化结构对图片进行拆解分析：

1. 核心主体 (core_subject): 画面里主要有什么人或物、在做什么、神态表情如何。
2. 服装/材质 (clothing): 主体的衣着打扮、配饰、或者核心物体的表面材质与细节。
3. 具体地点 (location): 画面所处的具体环境、城市、地标或空间场所。
4. 画面背景 (background): 主体身后的远景、天际线、陪衬元素及空间的左右布局。
5. 光照与色彩 (lighting): 光源方向（如逆光、侧光）、光效类型、色调基调与色彩氛围。
6. 艺术风格 (style): 是什么画风或视觉流派（如：电影感写实摄影、新海诚动漫风、3D渲染、极简主义 UI、胶片摄影等），以及具体的镜头和构图方式（如中景、大光圈虚化、垂直构图）。

---

## 🛠️ 【最终直调用 Prompt】
请根据上述分析，直接组合出可直接复制的流利中文 Prompt。请使用纯英文自然语言或短语（用逗号隔开），以便我直接复制粘贴：`;

    // 5. Make API Call based on resolved provider
    if (useGoogleApi) {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: promptText },
                {
                  inlineData: {
                    mimeType: normalizedMimeType,
                    data: base64Data,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            maxOutputTokens: 1000,
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json() as unknown;
        throw new Error(`Gemini API returned status ${response.status}: ${JSON.stringify(errorData)}`);
      }

      const data = await response.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const description = normalizeDescription(data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "");
      return NextResponse.json({ description });
    } else if (provider === "anthropic") {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: modelId || "claude-3-5-sonnet-20241022",
          max_tokens: 1000,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: normalizedMimeType,
                    data: base64Data,
                  },
                },
                { type: "text", text: promptText },
              ],
            },
          ],
        }),
      });

      if (!response.ok) {
        const errorData = await response.json() as unknown;
        throw new Error(`Anthropic API returned status ${response.status}: ${JSON.stringify(errorData)}`);
      }

      const data = await response.json() as { content?: { text?: string }[] };
      const description = normalizeDescription(data.content?.[0]?.text?.trim() || "");
      return NextResponse.json({ description });
    } else {
      const imageUrl = `data:${normalizedMimeType};base64,${base64Data}`;
      if (modelId && modelId.toLowerCase().includes("mimo") && modelId.toLowerCase().includes("flash")) {
        modelId = "mimo-v2-omni";
      }
      const requestBody = {
        model: modelId,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: promptText },
              {
                type: "image_url",
                image_url: {
                  url: imageUrl,
                },
              },
            ],
          },
        ],
        max_tokens: 1000,
      };
      console.log(`[describe-image] Sending to: ${endpoint}`);
      console.log(`[describe-image] model: ${modelId}, provider: ${provider}`);
      console.log(`[describe-image] imageUrl prefix: ${imageUrl.substring(0, 60)}...`);
      console.log(`[describe-image] headers (keys): ${Object.keys(headers).join(", ")}`);

      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json() as unknown;
        throw new Error(`${provider.toUpperCase()} API returned status ${response.status}: ${JSON.stringify(errorData)}`);
      }

      const data = await response.json() as {
        choices?: {
          message?: {
            content?: string;
            reasoning_content?: string;
            thinking_content?: string;
            thinking?: string;
          }
        }[]
      };

      const message = data.choices?.[0]?.message;
      let description = message?.content?.trim() || "";

      // Fallback for reasoning models (e.g. MiMo-V2.5, DeepSeek-R1) which place
      // their output inside reasoning/thinking fields when content is empty.
      // We only extract the LAST non-empty paragraph as the conclusion — the
      // earlier paragraphs are internal thinking/deliberation that should not
      // be returned as the description.
      if (!description && message) {
        const reasoning = (
          message.reasoning_content?.trim() ||
          message.thinking_content?.trim() ||
          message.thinking?.trim() ||
          ""
        );
        if (reasoning) {
          // Split into paragraphs, pick the last substantive one
          const paragraphs = reasoning
            .split(/\n\n+/)
            .map((p: string) => p.trim())
            .filter(Boolean);
          // Walk backwards to find the first paragraph that looks like a
          // conclusion (long enough and doesn't start with uncertainty markers)
          const uncertaintyMarkers = ["不对", "等等", "可能", "但是我", "然而我", "让我", "先得", "首先得", "再想"];
          for (let i = paragraphs.length - 1; i >= 0; i--) {
            const para = paragraphs[i];
            const startsWithUncertainty = uncertaintyMarkers.some(m => para.startsWith(m));
            if (para.length >= 40 && !startsWithUncertainty) {
              description = para;
              break;
            }
          }
          // Last resort: use the whole reasoning text
          if (!description) description = reasoning;
        }
      }

      return NextResponse.json({ description: normalizeDescription(description) });
    }
  } catch (error) {
    console.error("Error in describe-image API:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
