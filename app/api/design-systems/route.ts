import { NextRequest, NextResponse } from "next/server";
import { scanDesignSystems, loadDesignMd } from "@/lib/design-loader";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");

  if (id) {
    const content = loadDesignMd(id);
    if (!content) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ id, content });
  }

  const systems = scanDesignSystems();
  return NextResponse.json({ systems });
}
