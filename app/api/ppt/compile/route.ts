import { NextResponse } from "next/server";
import { pptOrchestrator } from "@/lib/ppt-orchestrator";

export async function POST(req: Request) {
  try {
    const { sessionId, cwd, projectPath, agentSessionId } = await req.json() as { 
      sessionId: string; 
      cwd: string; 
      projectPath: string;
      agentSessionId?: string | null;
    };
    if (!sessionId || !cwd || !projectPath) {
      return NextResponse.json({ error: "sessionId, cwd, and projectPath are required" }, { status: 400 });
    }

    // Fire compilation process asynchronously
    pptOrchestrator.compileSession(sessionId, cwd, projectPath, agentSessionId);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
