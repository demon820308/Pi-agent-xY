import { NextResponse } from "next/server";
import { isSessionLocked, setSessionLock } from "@/lib/session-lock";

// GET /api/sessions/[id]/lock - Get session lock status
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const locked = isSessionLocked(id);
    return NextResponse.json({ locked });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// POST /api/sessions/[id]/lock - Set session lock status
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const { locked } = await req.json() as { locked: boolean };
    if (typeof locked !== "boolean") {
      return NextResponse.json({ error: "locked (boolean) is required" }, { status: 400 });
    }

    setSessionLock(id, locked);
    return NextResponse.json({ ok: true, locked });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
