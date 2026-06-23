import { NextResponse } from "next/server";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";

export const dynamic = "force-dynamic";

// Global process registry to track running download processes
if (!(globalThis as any).__modelDownloads) {
  (globalThis as any).__modelDownloads = new Map<string, any>();
}
const downloadsRegistry = (globalThis as any).__modelDownloads;

function getLocalModelsDir() {
  return path.join(getAgentDir(), "local-models");
}

function getModelStatus(modelId: string) {
  const modelDir = path.join(getLocalModelsDir(), modelId.toUpperCase());
  const statusFile = path.join(modelDir, ".status.json");
  
  if (fs.existsSync(statusFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(statusFile, "utf-8"));
      // Check if process is still active if it says "downloading"
      if (data.status === "downloading" && !downloadsRegistry.has(modelId)) {
        // If it says downloading but no process exists, it likely crashed or server restarted
        data.status = "failed";
        data.speed = "";
        fs.writeFileSync(statusFile, JSON.stringify(data, null, 2), "utf-8");
      }
      return data;
    } catch {
      return { status: "not_downloaded", progress: 0 };
    }
  }
  return { status: "not_downloaded", progress: 0 };
}

export async function GET() {
  try {
    const models = ["voxcpm2", "cosyvoice", "gpt-sovits"];
    const result: Record<string, any> = {};
    
    for (const m of models) {
      result[m] = getModelStatus(m);
    }
    
    return NextResponse.json({ models: result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { modelId, action, mirror = "modelscope" } = body;
    
    if (!modelId || !action) {
      return NextResponse.json({ error: "modelId and action are required" }, { status: 400 });
    }
    
    const validModels = ["voxcpm2", "cosyvoice", "gpt-sovits"];
    if (!validModels.includes(modelId)) {
      return NextResponse.json({ error: "Invalid modelId" }, { status: 400 });
    }
    
    const modelDir = path.join(getLocalModelsDir(), modelId.toUpperCase());
    if (!fs.existsSync(modelDir)) {
      fs.mkdirSync(modelDir, { recursive: true });
    }
    const statusFile = path.join(modelDir, ".status.json");
    
    if (action === "download") {
      if (downloadsRegistry.has(modelId)) {
        return NextResponse.json({ error: "Download already in progress for this model" }, { status: 400 });
      }
      
      // Initialize status
      fs.writeFileSync(statusFile, JSON.stringify({
        status: "downloading",
        progress: 0,
        speed: "Initializing...",
        updatedAt: Math.floor(Date.now() / 1000)
      }, null, 2), "utf-8");
      
      const scriptPath = path.join(process.cwd(), "scripts", "download_model.py");
      
      console.log(`[manage-models] Spawning download process: python ${scriptPath} --model ${modelId} --mirror ${mirror}`);
      
      const child = spawn("python", [scriptPath, "--model", modelId, "--mirror", mirror], {
        detached: false,
        stdio: "inherit"
      });
      
      downloadsRegistry.set(modelId, child);
      
      child.on("close", (code) => {
        downloadsRegistry.delete(modelId);
        console.log(`[manage-models] Download process for ${modelId} exited with code ${code}`);
        
        // Read final status
        try {
          const statusData = JSON.parse(fs.readFileSync(statusFile, "utf-8"));
          if (code === 0) {
            statusData.status = "completed";
            statusData.progress = 100;
            statusData.speed = "";
          } else if (statusData.status === "downloading") {
            statusData.status = "failed";
            statusData.speed = "";
          }
          fs.writeFileSync(statusFile, JSON.stringify(statusData, null, 2), "utf-8");
        } catch {}
      });
      
      child.on("error", (err) => {
        downloadsRegistry.delete(modelId);
        console.error(`[manage-models] Failed to start download process for ${modelId}:`, err);
        try {
          fs.writeFileSync(statusFile, JSON.stringify({
            status: "failed",
            progress: 0,
            speed: "",
            error: String(err),
            updatedAt: Math.floor(Date.now() / 1000)
          }, null, 2), "utf-8");
        } catch {}
      });
      
      return NextResponse.json({ success: true, message: "Download started" });
      
    } else if (action === "cancel") {
      const child = downloadsRegistry.get(modelId);
      if (child) {
        console.log(`[manage-models] Killing download process for ${modelId}`);
        child.kill();
        downloadsRegistry.delete(modelId);
      }
      
      // Update status to failed/cancelled
      try {
        fs.writeFileSync(statusFile, JSON.stringify({
          status: "failed",
          progress: 0,
          speed: "",
          updatedAt: Math.floor(Date.now() / 1000)
        }, null, 2), "utf-8");
      } catch {}
      
      return NextResponse.json({ success: true, message: "Download cancelled" });
    }
    
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
