import { NextResponse } from "next/server";
import { deleteGem } from "@/lib/gem-xy";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// DELETE /api/gem-xy/[id]
// Deletes a specific custom Gem-xY profile
export async function DELETE(req: Request, context: RouteParams) {
  try {
    // Next.js 15 route params are async Promises
    const resolvedParams = await context.params;
    const { id } = resolvedParams;

    if (!id) {
      return NextResponse.json({ error: "id parameter is required" }, { status: 400 });
    }

    const success = deleteGem(id);
    if (!success) {
      return NextResponse.json({ error: `Gem-xY with id ${id} not found` }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
