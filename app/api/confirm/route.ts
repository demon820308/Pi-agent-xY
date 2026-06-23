import { NextResponse } from "next/server";
import { pptOrchestrator } from "@/lib/ppt-orchestrator";
import { writeFileSync } from "fs";
import { join } from "path";

export async function POST(req: Request) {
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

    const payload = await req.json();
    const resultPath = join(session.projectPath, "confirm_ui", "result.json");
    writeFileSync(resultPath, JSON.stringify(payload, null, 2), "utf-8");

    return NextResponse.json({ status: "ok" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
