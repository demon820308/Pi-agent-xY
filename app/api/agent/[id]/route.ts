import { NextResponse } from "next/server";
import { resolveSessionPath } from "@/lib/session-reader";
import { startRpcSession, getRpcSession } from "@/lib/rpc-manager";
import { SessionManager } from "@earendil-works/pi-coding-agent";

// Commands that trigger long-running generation and emit SSE events.
// These must NOT be awaited — fire-and-forget so the POST returns immediately
// and the frontend can receive events via its already-open SSE connection.
const ASYNC_COMMANDS = new Set(["prompt", "steer", "follow_up"]);

// POST /api/agent/[id] - Send a command to an existing session
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const body = await req.json() as { type: string; [key: string]: unknown };

    // Fast path: already-running session
    const existing = getRpcSession(id);
    if (existing?.isAlive()) {
      if (ASYNC_COMMANDS.has(body.type)) {
        // Fire-and-forget: return immediately so SSE events aren't missed
        existing.send(body).catch((err) => {
          console.error(`[agent/${id}] async ${body.type} error:`, err);
        });
        return NextResponse.json({ success: true, data: null });
      }
      const result = await existing.send(body);
      return NextResponse.json({ success: true, data: result });
    }

    const filePath = await resolveSessionPath(id);
    if (!filePath) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const cwd = SessionManager.open(filePath).getHeader()?.cwd ?? process.cwd();

    const { session } = await startRpcSession(id, filePath, cwd);
    if (ASYNC_COMMANDS.has(body.type)) {
      session.send(body).catch((err) => {
        console.error(`[agent/${id}] async ${body.type} error (cold start):`, err);
      });
      return NextResponse.json({ success: true, data: null });
    }
    const result = await session.send(body);

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// GET /api/agent/[id] - Get current agent state
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const session = getRpcSession(id);
    if (!session || !session.isAlive()) {
      return NextResponse.json({ running: false });
    }

    const state = await session.send({ type: "get_state" });
    return NextResponse.json({ running: true, state });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
