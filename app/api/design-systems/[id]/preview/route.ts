import { NextRequest, NextResponse } from "next/server";
import { loadDesignMd } from "@/lib/design-loader";
import { renderDesignSystemPreview } from "@/lib/design-system-preview";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const raw = loadDesignMd(id);
  if (!raw) return new NextResponse("Not found", { status: 404 });
  const html = renderDesignSystemPreview(id, raw);
  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
