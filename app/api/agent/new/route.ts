import { NextResponse } from "next/server";
import { existsSync, readFileSync } from "fs";
import { basename } from "path";
import { startRpcSession } from "@/lib/rpc-manager";
import { getGemById } from "@/lib/gem-xy";

// POST /api/agent/new  body: { cwd: string; type: string; message: string; ... }
// Spawns a brand-new pi session and immediately sends the first command.
// Returns { sessionId, data } where sessionId is pi's real session id.
export async function POST(req: Request) {
  try {
    const body = await req.json() as { cwd?: string; [key: string]: unknown };
    console.log("POST /api/agent/new body:", JSON.stringify(body, null, 2));
    const { cwd, ...command } = body;

    if (!cwd || typeof cwd !== "string") {
      return NextResponse.json({ error: "cwd is required" }, { status: 400 });
    }
    if (!existsSync(cwd)) {
      return NextResponse.json({ error: `Directory does not exist: ${cwd}` }, { status: 400 });
    }

    // Use a one-time key so startRpcSession's lock doesn't conflict with real session ids
    const { provider: reqProvider, modelId: reqModelId, toolNames: reqToolNames, thinkingLevel, gemId, ...promptCommand } = command as {
      provider?: string;
      modelId?: string;
      toolNames?: string[];
      thinkingLevel?: string;
      gemId?: string;
      [key: string]: unknown;
    };

    let activeToolNames = reqToolNames;
    let activeProvider = reqProvider;
    let activeModelId = reqModelId;
    let customSystemPrompt: string | undefined;

    if (gemId) {
      const gem = getGemById(gemId);
      if (gem) {
        // Apply Gem-xY custom model if configured
        if (gem.provider && gem.modelId) {
          activeProvider = gem.provider;
          activeModelId = gem.modelId;
        }

        // Apply Gem-xY custom tool filter if configured
        if (gem.allowedTools && gem.allowedTools.length > 0) {
          activeToolNames = gem.allowedTools;
        }

        // Build Custom System Prompt (with simple RAG Knowledge Files)
        let systemPromptText = gem.systemPrompt || "";
        if (gem.knowledgeFiles && gem.knowledgeFiles.length > 0) {
          let knowledgeContext = "";
          for (const filePath of gem.knowledgeFiles) {
            if (existsSync(filePath)) {
              try {
                const content = readFileSync(filePath, "utf-8");
                const fileName = basename(filePath);
                knowledgeContext += `\n\n--- KNOWLEDGE FILE: ${fileName} ---\n${content}\n`;
              } catch (e) {
                console.error(`Failed to read knowledge file ${filePath}:`, e);
              }
            }
          }
          if (knowledgeContext) {
            systemPromptText += `\n\n[KNOWLEDGE BASE]\nBelow is reference information from the files attached to this custom agent. Use this information to guide your answers where relevant:${knowledgeContext}`;
          }
        }
        customSystemPrompt = systemPromptText;
      }
    }

    const tempKey = `__new__${Date.now()}`;
    const { session, realSessionId } = await startRpcSession(tempKey, "", cwd, activeToolNames, customSystemPrompt);

    // Keep the files-route allowed-roots cache (see app/api/files/[...path]/route.ts)
    // in sync so the new cwd is immediately readable via /api/files. Without this,
    // a file request under a brand-new cwd would 403 for up to the cache TTL.
    globalThis.__piAllowedRootsCache?.roots.add(cwd);

    // Apply pre-selected model before sending the prompt
    if (activeProvider && activeModelId) {
      try {
        console.log(`[new/route] Attempting to set model: ${activeProvider}/${activeModelId}`);
        await session.send({ type: "set_model", provider: activeProvider, modelId: activeModelId });
        console.log("[new/route] set_model success");
      } catch (err) {
        console.error("[new/route] Error setting model in route, continuing anyway:", err);
      }
    }

    // Apply pre-selected thinking level before sending the prompt
    if (thinkingLevel) {
      try {
        console.log(`[new/route] Attempting to set thinking level: ${thinkingLevel}`);
        await session.send({ type: "set_thinking_level", level: thinkingLevel });
        console.log("[new/route] set_thinking_level success");
      } catch (err) {
        console.error("[new/route] Error setting thinking level in route, continuing anyway:", err);
      }
    }

    // Fire prompt WITHOUT awaiting — the frontend needs the sessionId immediately
    // so it can connect SSE *before* events start firing.  If we await here,
    // the HTTP response is delayed until the entire generation finishes, meaning
    // the frontend only opens SSE after all events have already been emitted,
    // causing the "Waiting for model…" hang.
    console.log("[new/route] Firing promptCommand (non-blocking)...");
    session.send(promptCommand).catch((err) => {
      console.error("[new/route] promptCommand error (async):", err);
    });

    return NextResponse.json({ success: true, sessionId: realSessionId });
  } catch (error) {
    console.error("Error in POST /api/agent/new:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

