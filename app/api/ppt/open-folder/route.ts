import { NextResponse } from "next/server";
import { spawn } from "child_process";
import { existsSync } from "fs";

export async function POST(req: Request) {
  try {
    const { filePath } = await req.json() as { filePath: string };
    if (!filePath) {
      return NextResponse.json({ error: "filePath is required" }, { status: 400 });
    }

    // Safety check: ensure the file exists
    if (!existsSync(filePath)) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // Spawn Windows Explorer to select/highlight the file
    // Using spawn is safe from shell injection because args are passed directly.
    spawn("explorer.exe", [`/select,${filePath}`], { detached: true, stdio: "ignore" });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
