import { NextResponse } from "next/server";
import { AuthStorage, ModelRegistry, getAgentDir } from "@earendil-works/pi-coding-agent";
import { cleanSpeechText } from "@/lib/tts-utils";
import fs from "fs";
import path from "path";
import { resolveSessionPath } from "@/lib/session-reader";

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
      cwd?: string;
      sessionId?: string;
    };

    text = cleanSpeechText(body.text);
    style = body.style;
    if (typeof body.voice !== "undefined") voice = body.voice;
    if (typeof body.modelId !== "undefined") modelId = body.modelId;
    voiceDesignPrompt = body.voiceDesignPrompt;

    // Normalize model ID to lowercase for MiMo API compatibility
    finalModelId = modelId.toLowerCase();
    finalVoice = voice;

    if (!text) {
      return NextResponse.json({ error: "Text is required for speech synthesis" }, { status: 400 });
    }

    const isLocalModel = modelId.toLowerCase().includes("-local-tts-");
    let isLocalServerRunning = false;

    if (isLocalModel) {
      const midLower = modelId.toLowerCase();
      let localKey = "";
      let scriptName = "";
      
      if (midLower.includes("voxcpm")) {
        localKey = "VOXCPM2";
        scriptName = "voxcpm_server.py";
      } else if (midLower.includes("cosyvoice")) {
        localKey = "COSYVOICE";
        scriptName = "cosyvoice_server.py";
      } else if (midLower.includes("gptsovits")) {
        localKey = "GPT-SOVITS";
        scriptName = "gpt_sovits_server.py";
      }
      
      if (localKey) {
        const agentDir = getAgentDir();
        const modelPath = path.join(agentDir, "local-models", localKey);
        const scriptPath = path.join(process.cwd(), "scripts", scriptName);
        
        // Check if server is already running on port 9880
        isLocalServerRunning = await new Promise<boolean>((resolve) => {
          const client = require("http").request({
            host: "127.0.0.1",
            port: 9880,
            path: "/v1/chat/completions",
            method: "OPTIONS",
            timeout: 400
          }, () => {
            resolve(true);
          });
          client.on("error", () => resolve(false));
          client.on("timeout", () => resolve(false));
          client.end();
        });
        
        if (!isLocalServerRunning) {
          // Terminate any running local servers first to avoid port conflicts
          const localProcesses = (globalThis as any).__localTtsProcesses || new Map();
          (globalThis as any).__localTtsProcesses = localProcesses;
          
          for (const [k, p] of localProcesses.entries()) {
            console.log(`[tts-synthesize] Killing active local server for ${k} to switch to ${localKey}`);
            try {
              (p as any).kill();
            } catch {}
            localProcesses.delete(k);
          }
          
          console.log(`[tts-synthesize] Launching local server for ${localKey} using script ${scriptName}...`);
          const { spawn } = require("child_process");
          
          // Prepend ffmpeg-static binary path to PATH to support decoding WebM/MP3 formats
          const ffmpegStaticPath = path.join(process.cwd(), "node_modules", "ffmpeg-static");
          const pathKey = Object.keys(process.env).find(k => k.toLowerCase() === "path") || "PATH";
          const oldPath = process.env[pathKey] || "";
          
          const spawnEnv = {
            ...process.env,
            [pathKey]: `${ffmpegStaticPath}${path.delimiter}${oldPath}`
          };
          
          const child = spawn("python", [scriptPath, "--port", "9880", "--model", modelPath], {
            detached: false,
            stdio: "inherit",
            env: spawnEnv
          });
          
          localProcesses.set(localKey, child);
          
          // Poll port 9880 until the adapter API is ready (up to 15 seconds)
          console.log(`[tts-synthesize] Waiting for local adapter ${localKey} to bind to port 9880...`);
          let adapterReady = false;
          for (let i = 0; i < 30; i++) {
            adapterReady = await new Promise<boolean>((resolve) => {
              const client = require("http").request({
                host: "127.0.0.1",
                port: 9880,
                path: "/v1/chat/completions",
                method: "OPTIONS",
                timeout: 300
              }, () => resolve(true));
              client.on("error", () => resolve(false));
              client.on("timeout", () => resolve(false));
              client.end();
            });
            if (adapterReady) {
              console.log(`[tts-synthesize] Local adapter ${localKey} is ready on port 9880.`);
              break;
            }
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
          if (!adapterReady) {
            console.warn(`[tts-synthesize] Warning: Local adapter did not respond on port 9880 within 15 seconds. Proceeding anyway.`);
          }
        }
      }
      
      baseUrl = "http://127.0.0.1:9880/v1";
      apiKey = "local-tts-dummy-key";
    }

    // 1. Resolve credentials (similar to describe-image endpoint)
    const authStorage = AuthStorage.create();
    const registry = ModelRegistry.create(authStorage);
    
    if (!isLocalModel) {
      apiKey = "";
      baseUrl = "https://token-plan-cn.xiaomimimo.com/v1";
    } else {
      // Keep local baseUrl and apiKey
    }

    if (!isLocalModel) {
      const availableModels = registry.getAvailable();
      const modelIdLower = modelId.toLowerCase();
      const model = availableModels.find(m => m.id.toLowerCase() === modelIdLower) || registry.getAll().find(m => m.id.toLowerCase() === modelIdLower);

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
    }
    
    if (!apiKey) {
      return NextResponse.json({
        error: "未检测到 MiMo/Lingya/Xiaomi API Key，请先在侧边栏底部的 Models 中配置 API Key，或在系统环境变量中设置 LINGYA_API_KEY。"
      }, { status: 400 });
    }

    // 2. Build the messages block and payload for MiMo v2.5 TTS
    // - User role: provides instructions for style, emotion, tone, or dialect
    // - Assistant role: provides the actual text to be synthesized into speech
    
    const isClone = modelId.toLowerCase().includes("voiceclone") || modelId.toLowerCase().includes("clone");

    // Normalize model ID to lowercase for MiMo API compatibility
    finalModelId = modelId.toLowerCase();
    finalVoice = voice;

    // Handle voice clone model fallback when reference audio is not a DataURL
    if (isClone) {
      let isVoiceDataUrl = voice && voice.startsWith("data:");

      // If it's a file path on the server, read it and convert to DataURL
      if (!isVoiceDataUrl && voice) {
        try {
          const fs = await import("fs");
          const path = await import("path");
          if (fs.existsSync(voice) && fs.statSync(voice).isFile()) {
            const buffer = fs.readFileSync(voice);
            const ext = path.extname(voice).toLowerCase().replace(".", "");
            const mimeType = ext === "mp3" ? "audio/mp3" : "audio/wav";
            voice = `data:${mimeType};base64,${buffer.toString("base64")}`;
            isVoiceDataUrl = true;
            console.log(`[tts-synthesize] Resolved voice clone file path successfully: ${voice.substring(0, 80)}...`);
          }
        } catch (err) {
          console.error("[tts-synthesize] Failed to load voice clone file from path:", voice, err);
        }
      }

      if (!isVoiceDataUrl) {
        console.log(`[tts-synthesize] Voice clone selected but voice parameter is not a DataURL or valid file path. Falling back to standard mimo-v2.5-tts.`);
        finalModelId = "mimo-v2.5-tts";
        finalVoice = "mimo_default";
      } else {
        // Automatically translate unsupported but common browser formats (like webm, ogg, m4a)
        // by trans-labeling their DataURL prefix to audio/wav.
        // This leverages the backend decoder's ability to decode multi-format streams.
        if (voice.startsWith("data:audio/") && !voice.startsWith("data:audio/wav;")) {
          console.log(`[tts-synthesize] Translating unsupported browser audio format ${voice.substring(0, 30)} to wav header for MiMo compatibility.`);
          finalVoice = voice.replace(/^data:audio\/[^;]+;/, "data:audio/wav;");
        } else {
          finalVoice = voice;
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

    const requestBody: {
      model: string;
      messages: { role: string; content: string }[];
      audio: {
        format: string;
        voice?: string;
      };
    } = {
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
      audio: {
        format: "mp3"
      }
    };

    // For voice design, we MUST NOT supply audio.voice parameter as it causes HTTP 400 Param Incorrect
    if (!finalIsDesign && finalVoice) {
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
      const responseText = await response.text();
      let errorData: {
        error?: string | {
          message?: string;
          param?: string;
        };
      } = {};
      try {
        errorData = JSON.parse(responseText);
      } catch {
        errorData = { error: responseText };
      }
      console.error("[tts-synthesize] Xiaomi API error response:", JSON.stringify(errorData));
      
      const errorMsg = typeof errorData.error === "object"
        ? errorData.error?.message
        : errorData.error || JSON.stringify(errorData);
      const errorParam = typeof errorData.error === "object" && errorData.error?.param
        ? ` (参数错误字段: ${errorData.error.param})`
        : "";
      
      return NextResponse.json({
        error: `Xiaomi TTS API 返回错误 (HTTP ${response.status}): ${errorMsg}${errorParam}`
      }, { status: response.status });
    }

    const responseText = await response.text();
    let data: {
      choices?: {
        message?: {
          audio?: {
            data?: string;
          };
        };
      }[];
    };
    try {
      data = JSON.parse(responseText);
    } catch {
      console.error("[tts-synthesize] Failed to parse JSON response:", responseText);
      return NextResponse.json({
        error: `Xiaomi TTS API 返回了非 JSON 格式的响应: ${responseText.substring(0, 500)}`
      }, { status: 500 });
    }

    const audioData = data.choices?.[0]?.message?.audio?.data;
    if (!audioData) {
      console.error("[tts-synthesize] Response is missing audio data:", JSON.stringify(data));
      return NextResponse.json({
        error: "小米 API 响应中缺少 audio.data 字段，请确认使用的是 mimo-v2.5-tts 模型。"
      }, { status: 500 });
    }

    // 3. Save to Temp and return local file URL if cwd is provided
    if (body.cwd) {
      try {
        const tempDir = path.join(body.cwd, "Temp");
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
          fs.writeFileSync(path.join(tempDir, ".gitignore"), "*\n");
        }
        
        const fileName = `tts_${Date.now()}.mp3`;
        const filePath = path.join(tempDir, fileName);
        fs.writeFileSync(filePath, Buffer.from(audioData, "base64"));
        console.log(`[tts-synthesize] Saved audio to workspace Temp: ${filePath}`);

        const duration = Math.max(1, Math.round(text.length / 3.5));
        
        // Try linking to session if sessionId is provided
        if (body.sessionId) {
          const sessionFile = await resolveSessionPath(body.sessionId);
          if (sessionFile && fs.existsSync(sessionFile)) {
            try {
              const fileContent = fs.readFileSync(sessionFile, "utf-8");
              const lines = fileContent.split("\n");
              let assistantLineIdx = -1;
              for (let i = lines.length - 1; i >= 0; i--) {
                const line = lines[i].trim();
                if (!line) continue;
                try {
                  const parsed = JSON.parse(line);
                  if (parsed.type === "message" && parsed.message?.role === "assistant") {
                    assistantLineIdx = i;
                    break;
                  }
                } catch {}
              }

              if (assistantLineIdx !== -1) {
                const entry = JSON.parse(lines[assistantLineIdx]);
                const attachmentText = `\n\n<!-- PI_FILE_ATTACHMENTS_START -->\n- Temp/${fileName} (${duration}s)\n<!-- PI_FILE_ATTACHMENTS_END -->`;
                
                if (typeof entry.message.content === "string") {
                  entry.message.content += attachmentText;
                } else if (Array.isArray(entry.message.content)) {
                  const lastTextBlock = entry.message.content.findLast((b: any) => b.type === "text");
                  if (lastTextBlock) {
                    lastTextBlock.text += attachmentText;
                  } else {
                    entry.message.content.push({ type: "text", text: attachmentText });
                  }
                }
                
                lines[assistantLineIdx] = JSON.stringify(entry);
                fs.writeFileSync(sessionFile, lines.join("\n"), "utf-8");
                console.log(`[tts-synthesize] Linked audio attachment to session file: ${sessionFile}`);
              }
            } catch (err) {
              console.error("[tts-synthesize] Failed to append attachment to session file:", err);
            }
          }
        }

        const normalizedPath = filePath.replace(/\\/g, "/");
        const encodedPath = normalizedPath
          .split("/")
          .filter(Boolean)
          .map(encodeURIComponent)
          .join("/");
        const localUrl = `/api/files/${encodedPath}?type=read`;

        return NextResponse.json({
          audioUrl: localUrl
        });
      } catch (err) {
        console.error("[tts-synthesize] Failed to save TTS audio to local disk, falling back to base64:", err);
      }
    }

    // Fallback: Return base64 audio data URL directly
    return NextResponse.json({
      audioUrl: `data:audio/mp3;base64,${audioData}`
    });

  } catch (error: unknown) {
    const err = error as Error & { cause?: unknown };
    console.error("[tts-synthesize] Unexpected error:", err);
    return NextResponse.json({ 
      error: `TTS 接口出错: ${String(err)}`,
      debug: {
        modelId,
        finalModelId: typeof finalModelId !== "undefined" ? finalModelId : undefined,
        voice: typeof voice !== "undefined" ? voice : undefined,
        finalVoice: typeof finalVoice !== "undefined" && finalVoice ? (finalVoice.startsWith("data:") ? `DataURL(${finalVoice.length}B)` : finalVoice) : undefined,
        baseUrl: typeof baseUrl !== "undefined" ? baseUrl : undefined,
        endpoint: typeof baseUrl !== "undefined" ? `${baseUrl}/chat/completions` : undefined,
        hasApiKey: typeof apiKey !== "undefined" ? !!apiKey : false,
        apiKeyPrefix: typeof apiKey !== "undefined" && apiKey ? apiKey.substring(0, 10) : undefined,
        errorStack: err?.stack || String(err),
        errorCause: err?.cause ? String(err.cause) : (err?.message || String(err))
      }
    }, { status: 500 });
  }
}
