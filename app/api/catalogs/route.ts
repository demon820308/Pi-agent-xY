import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";
import { getAppRoot } from "@/lib/app-root";

const catalogsPath = join(getAppRoot(), "public", "confirm_ui", "catalogs.json");
let cached: object | null = null;

export async function GET() {
  try {
    if (!cached) {
      cached = JSON.parse(readFileSync(catalogsPath, "utf-8"));
    }
    return NextResponse.json(cached);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
