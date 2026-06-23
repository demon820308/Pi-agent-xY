import { NextResponse } from "next/server";
import { pptOrchestrator } from "@/lib/ppt-orchestrator";
import { join } from "path";

export async function POST(req: Request) {
  try {
    const { cwd, sourceFile } = await req.json() as { cwd: string; sourceFile: string };
    if (!cwd || !sourceFile) {
      return NextResponse.json({ error: "cwd and sourceFile are required" }, { status: 400 });
    }

    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const HH = String(now.getHours()).padStart(2, "0");
    const MM = String(now.getMinutes()).padStart(2, "0");
    const SS = String(now.getSeconds()).padStart(2, "0");
    const timestamp = `${yyyy}${mm}${dd}${HH}${MM}${SS}`;

    const projectName = `ppt_${timestamp}`;
    const dateStamp = `${yyyy}${mm}${dd}`;
    const projectPath = join(cwd, "projects", `${projectName}_ppt169_${dateStamp}`);
    const sessionId = `ppt_session_${timestamp}`;

    // Fire generation process asynchronously
    pptOrchestrator.startSession(sessionId, cwd, sourceFile, projectPath, projectName);

    return NextResponse.json({ success: true, sessionId, projectPath });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
