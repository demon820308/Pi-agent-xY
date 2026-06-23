import { NextResponse } from "next/server";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { join } from "path";
import { readFile, unlink } from "fs/promises";

function getHistoryPath(id: string) {
  return join(getAgentDir(), "deep-research-history", `${id}.json`);
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const filePath = getHistoryPath(id);
    const raw = await readFile(filePath, "utf-8");
    const data = JSON.parse(raw);
    return NextResponse.json(data);
  } catch (error: any) {
    if (error.code === "ENOENT") {
      return NextResponse.json({ error: "History entry not found" }, { status: 404 });
    }
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const filePath = getHistoryPath(id);
    await unlink(filePath);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    if (error.code === "ENOENT") {
      return NextResponse.json({ error: "History entry not found" }, { status: 404 });
    }
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
}
