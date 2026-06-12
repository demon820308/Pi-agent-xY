import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";

export const dynamic = "force-dynamic";

const getCookiesPaths = () => {
  const localPath = path.join(process.cwd(), "cookies.txt");
  const persistentPath = path.join(os.homedir(), ".pi", "agent", "cookies.txt");
  return { localPath, persistentPath };
};

export async function GET() {
  try {
    const { localPath, persistentPath } = getCookiesPaths();
    
    let exists = false;
    let mtime: string | null = null;
    let source: "local" | "persistent" | null = null;

    if (fs.existsSync(localPath)) {
      exists = true;
      mtime = fs.statSync(localPath).mtime.toISOString();
      source = "local";
    } else if (fs.existsSync(persistentPath)) {
      exists = true;
      mtime = fs.statSync(persistentPath).mtime.toISOString();
      source = "persistent";
    }

    return NextResponse.json({ exists, mtime, source });
  } catch (error) {
    console.error("[cookies] GET error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { content } = await req.json() as { content?: string };
    if (!content) {
      return NextResponse.json({ error: "Cookie content is required" }, { status: 400 });
    }

    const { persistentPath } = getCookiesPaths();
    
    // Ensure parent directories exist
    const dir = path.dirname(persistentPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write file content
    fs.writeFileSync(persistentPath, content, "utf-8");
    console.log(`[cookies] Saved Bilibili cookies.txt to persistent path: ${persistentPath}`);

    return NextResponse.json({ success: true, mtime: fs.statSync(persistentPath).mtime.toISOString() });
  } catch (error) {
    console.error("[cookies] POST error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const { persistentPath } = getCookiesPaths();
    if (fs.existsSync(persistentPath)) {
      fs.unlinkSync(persistentPath);
      console.log(`[cookies] Deleted Bilibili cookies.txt from persistent path: ${persistentPath}`);
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ success: true, message: "No persistent cookies file found to delete" });
  } catch (error) {
    console.error("[cookies] DELETE error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

