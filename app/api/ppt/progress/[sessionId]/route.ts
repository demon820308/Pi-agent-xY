import { NextRequest } from "next/server";
import { pptOrchestrator } from "@/lib/ppt-orchestrator";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const session = pptOrchestrator.getSession(sessionId);

  if (!session) {
    return new Response(
      `data: ${JSON.stringify({ type: "error", error: `PPT session not found: ${sessionId}` })}\n\n`,
      {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          "Connection": "keep-alive",
        },
      },
    );
  }

  const responseStream = new TransformStream();
  const writer = responseStream.writable.getWriter();
  const encoder = new TextEncoder();

  const sendEvent = (data: object) => {
    try {
      writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
    } catch (e) {
      console.error("[SSE] Failed to write event:", e);
    }
  };

  // Stream current initial state
  sendEvent({ type: "init", session });

  if (session.step === "confirming" && session.cwd) {
    pptOrchestrator.ensureConfirmUiRunning(session, session.cwd).catch((e) => {
      console.error("[api/ppt/progress] Failed to ensure Confirm UI is running:", e);
    });
  }

  // Bind event listeners for real-time progress updates
  const updateListener = (updatedSession: any) => {
    sendEvent({ type: "update", session: updatedSession });
  };

  const logListener = (logLine: string) => {
    sendEvent({ type: "log", log: logLine });
  };

  pptOrchestrator.on(`update:${sessionId}`, updateListener);
  pptOrchestrator.on(`log:${sessionId}`, logListener);

  req.signal.addEventListener("abort", () => {
    pptOrchestrator.off(`update:${sessionId}`, updateListener);
    pptOrchestrator.off(`log:${sessionId}`, logListener);
    try {
      writer.close();
    } catch (e) {
      // Ignored if already closed
    }
  });

  return new Response(responseStream.readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
