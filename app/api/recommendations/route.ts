import { NextResponse } from "next/server";
import { pptOrchestrator } from "@/lib/ppt-orchestrator";
import { readFileSync } from "fs";
import { join } from "path";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("sessionId");
    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    const session = pptOrchestrator.getSession(sessionId);
    if (!session || !session.projectPath) {
      return NextResponse.json({ error: "session not found" }, { status: 404 });
    }

    const recPath = join(session.projectPath, "confirm_ui", "recommendations.json");
    const data = JSON.parse(readFileSync(recPath, "utf-8"));
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
