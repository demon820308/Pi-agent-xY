import { NextResponse } from "next/server";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { join } from "path";
import { readdir, readFile, mkdir, writeFile } from "fs/promises";

export const dynamic = "force-dynamic";

function getHistoryDir() {
  return join(getAgentDir(), "deep-research-history");
}

export interface HistoryEntry {
  id: string;
  query: string;
  timestamp: string;
  model?: { provider: string; modelId: string };
  depth: number;
  breadth: number;
}

export async function GET() {
  try {
    const dir = getHistoryDir();
    try {
      await readdir(dir);
    } catch {
      return NextResponse.json({ entries: [] });
    }

    const files = await readdir(dir);
    const jsonFiles = files.filter(f => f.endsWith(".json"));

    const entries: HistoryEntry[] = [];
    for (const file of jsonFiles) {
      try {
        const raw = await readFile(join(dir, file), "utf-8");
        const data = JSON.parse(raw);
        entries.push({
          id: data.id,
          query: data.query,
          timestamp: data.timestamp,
          model: data.model,
          depth: data.depth,
          breadth: data.breadth,
        });
      } catch {
        // skip corrupted files
      }
    }

    entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return NextResponse.json({ entries });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { id, query, depth, breadth, model, logs, report, timestamp } = body;

    if (!id || !query) {
      return NextResponse.json({ error: "id and query are required" }, { status: 400 });
    }

    const dir = getHistoryDir();
    await mkdir(dir, { recursive: true });

    const entry = { id, query, depth, breadth, model, logs, report, timestamp: timestamp || new Date().toISOString() };
    await writeFile(join(dir, `${id}.json`), JSON.stringify(entry, null, 2), "utf-8");

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
}
