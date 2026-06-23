import { NextResponse } from "next/server";
import { pptOrchestrator } from "@/lib/ppt-orchestrator";

export async function POST(req: Request) {
  try {
    const { sessionId } = await req.json() as { sessionId: string };
    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    pptOrchestrator.shutdownConfirmUI(sessionId);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
