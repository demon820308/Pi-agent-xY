import { NextResponse } from "next/server";
import { runNpx } from "@/lib/npx";

export const dynamic = "force-dynamic";

const ANSI_RE = /\x1B\[[0-9;]*m/g;

// POST /api/skills/install  body: { package: string; scope: "global" | "project"; cwd?: string }
export async function POST(req: Request) {
  try {
    const { package: pkg, scope, cwd } = await req.json() as { package?: string; scope?: string; cwd?: string };
    if (!pkg?.trim()) return NextResponse.json({ error: "package required" }, { status: 400 });

    const isGlobal = scope !== "project";
    const installTarget = pkg.includes("@") ? pkg.split("@")[0] : pkg;
    const args = ["skills", "add", installTarget.trim(), "-y", "--agent", "pi"];
    if (isGlobal) args.push("-g");

    console.log(`[skills/install] running: npx ${args.join(" ")}`);
    const { stdout, stderr } = await runNpx(args, {
      timeout: 60000,
      cwd: !isGlobal && cwd ? cwd : undefined,
      env: { ...process.env, FORCE_COLOR: "0" },
    });

    const output = (stdout + stderr).replace(ANSI_RE, "");
    const success = /Installation complete|Installed \d+ skill/.test(output);
    if (!success) {
      return NextResponse.json({ error: output.slice(-300) || "Install failed" }, { status: 500 });
    }
    return NextResponse.json({ success: true, output });
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; message?: string; code?: string };
    const output = ((err.stdout ?? "") + (err.stderr ?? "")).replace(ANSI_RE, "");
    
    // Check if Node.js/npx is missing on the system (ENOENT)
    const isEnoent = err.code === "ENOENT" || (err.message && err.message.includes("ENOENT"));
    if (isEnoent) {
      return NextResponse.json({
        error: "系统未检测到 Node.js 环境。安装技能需要 Node.js，请前往 https://nodejs.org 下载安装后重启应用。"
      }, { status: 500 });
    }
    
    return NextResponse.json({ error: output || (err.message ?? String(e)) }, { status: 500 });
  }
}
