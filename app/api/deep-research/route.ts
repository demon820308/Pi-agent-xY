import { deepResearch, generateReport, ResearchProgress } from "@/lib/deep-research/agent";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { query, depth, breadth, model } = await req.json() as {
      query?: string;
      depth?: number;
      breadth?: number;
      model?: { provider: string; modelId: string };
    };

    if (!query || !query.trim()) {
      return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }

    const activeDepth = Math.max(1, Math.min(5, depth || 2));
    const activeBreadth = Math.max(1, Math.min(5, breadth || 2));

    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (data: ResearchProgress) => {
          try {
            const text = `data: ${JSON.stringify(data)}\n\n`;
            controller.enqueue(new TextEncoder().encode(text));
          } catch {
            // controller might already be closed/aborted
          }
        };

        sendEvent({ type: "status", message: "Initializing agent and resolving default model..." });

        try {
          const { facts, visitedUrls, outline } = await deepResearch({
            query: query.trim(),
            depth: activeDepth,
            breadth: activeBreadth,
            onProgress: sendEvent,
            model
          });

          sendEvent({ type: "writing", message: "Synthesizing final Markdown report..." });
          const report = await generateReport(query.trim(), outline, facts, visitedUrls, model, sendEvent);

          sendEvent({
            type: "done",
            message: "Deep Research completed successfully!",
            report
          });
        } catch (e: any) {
          sendEvent({
            type: "error",
            message: e.message || String(e)
          });
        } finally {
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive"
      }
    });
  } catch (error: any) {
    console.error("Error starting deep research stream:", error);
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
}
