import { NextResponse } from "next/server";
import { readGems, saveGem } from "@/lib/gem-xy";
import type { GemProfile } from "@/lib/types";

// GET /api/gem-xy
// Returns all custom Gem-xY profiles
export async function GET() {
  try {
    const gems = readGems();
    return NextResponse.json(gems);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// POST /api/gem-xy
// Creates or updates a Gem-xY profile
export async function POST(req: Request) {
  try {
    const body = await req.json() as Partial<GemProfile> & { name: string; systemPrompt: string };
    
    if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json({ error: "name is required and must be a string" }, { status: 400 });
    }
    if (!body.systemPrompt || typeof body.systemPrompt !== "string" || !body.systemPrompt.trim()) {
      return NextResponse.json({ error: "systemPrompt is required and must be a string" }, { status: 400 });
    }

    const saved = saveGem(body);
    return NextResponse.json(saved);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
