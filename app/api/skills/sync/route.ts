import { NextResponse } from "next/server";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { syncBuiltInSkills } from "@/lib/skills-util";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { cwd } = body as { cwd?: string };
    const agentDir = getAgentDir();
    const result = await syncBuiltInSkills(agentDir, cwd);
    if (!result.success) {
      return NextResponse.json({ error: result.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, message: result.message });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
