import { getPiAgentDefaultModel } from "@/lib/deep-research/credentials";

export async function callLLM(
  systemPrompt: string,
  userPrompt: string,
  jsonMode = false,
  model?: { provider: string; modelId: string }
): Promise<string> {
  const config = await getPiAgentDefaultModel(model?.provider, model?.modelId);

  let endpoint = `${config.baseURL}/chat/completions`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...config.headers
  };

  if (config.apiKey) {
    headers["Authorization"] = `Bearer ${config.apiKey}`;
  }

  const isGoogle = config.provider === "google" || config.provider === "gemini" || config.provider.includes("google") || config.provider.includes("gemini");
  const isAnthropic = config.provider === "anthropic" ||
                      config.provider.includes("anthropic") ||
                      config.provider.startsWith("minimax") ||
                      config.baseURL.includes("/anthropic");

  // Normalization for custom endpoints / baseUrls
  if (isAnthropic) {
    let baseUrl = config.baseURL;
    if (config.provider.startsWith("minimax") && !baseUrl.includes("/anthropic")) {
      if (baseUrl.includes("api.minimaxi.com")) {
        baseUrl = "https://api.minimaxi.com/anthropic";
      } else if (baseUrl.includes("api.minimax.io")) {
        baseUrl = "https://api.minimax.io/anthropic";
      }
    }
    endpoint = `${baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl}/v1/messages`;
    if (!config.headers["x-api-key"] && config.apiKey) {
      headers["x-api-key"] = config.apiKey;
      headers["anthropic-version"] = "2023-06-01";
    }
  }

  let responseText = "";

  try {
    if (isGoogle) {
      // Google Gemini API Format
      const modelId = config.modelId.startsWith("models/") ? config.modelId : `models/${config.modelId}`;
      const googleUrl = `https://generativelanguage.googleapis.com/v1beta/${modelId}:generateContent?key=${config.apiKey}`;

      const payload = {
        contents: [
          {
            role: "user",
            parts: [
              { text: `${systemPrompt}\n\n[USER INPUT]:\n${userPrompt}` }
            ]
          }
        ],
        generationConfig: {
          maxOutputTokens: 4000,
          responseMimeType: jsonMode ? "application/json" : "text/plain"
        }
      };

      const res = await fetch(googleUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(600000)
      });
      if (!res.ok) {
        throw new Error(`Google API returned status ${res.status}: ${await res.text()}`);
      }
      const data = await res.json() as any;
      responseText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

    } else if (isAnthropic) {
      // Anthropic Messages API Format
      const payload = {
        model: config.modelId,
        system: systemPrompt,
        max_tokens: 4000,
        messages: [
          { role: "user", content: userPrompt }
        ]
      };

      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(600000)
      });
      if (!res.ok) {
        throw new Error(`Anthropic API returned status ${res.status}: ${await res.text()}`);
      }
      const data = await res.json() as any;
      responseText = data.content?.[0]?.text?.trim() || "";

    } else {
      // OpenAI / standard chat completion format
      const payload = {
        model: config.modelId,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        max_tokens: 4000,
        ...(jsonMode ? { response_format: { type: "json_object" } } : {})
      };

      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(600000)
      });
      if (!res.ok) {
        throw new Error(`Chat Completion API returned status ${res.status}: ${await res.text()}`);
      }
      const data = await res.json() as any;
      responseText = data.choices?.[0]?.message?.content?.trim() || "";
    }

    return responseText;
  } catch (err: any) {
    console.error("callLLM error:", err);
    throw err;
  }
}
