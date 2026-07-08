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

    // Open file manager and highlight/reveal the file (cross-platform)
    if (process.platform === "darwin") {
      spawn("open", ["-R", filePath], { detached: true, stdio: "ignore" });
    } else if (process.platform === "win32") {
      spawn("explorer.exe", [`/select,${filePath}`], { detached: true, stdio: "ignore" });
    } else {
      // Linux: open the containing directory
      const { dirname } = require("path");
      spawn("xdg-open", [dirname(filePath)], { detached: true, stdio: "ignore" });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
