import { NextResponse } from "next/server";

// We use globalThis to survive Next.js dev hot-reloads
const reportsMap = (globalThis as any).__pdfReports || new Map();
(globalThis as any).__pdfReports = reportsMap;

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { html, title } = await req.json() as { html?: string; title?: string };
    if (!html) {
      return NextResponse.json({ error: "HTML content is required" }, { status: 400 });
    }
    const id = Math.random().toString(36).substring(2, 15);
    reportsMap.set(id, { html, title: title || "深度研究报告", timestamp: Date.now() });
    
    // Periodically clean up old reports (e.g. older than 10 minutes)
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    for (const [key, val] of reportsMap.entries()) {
      if (val.timestamp < tenMinutesAgo) {
        reportsMap.delete(key);
      }
    }

    return NextResponse.json({ id });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id || !reportsMap.has(id)) {
      return new Response("Report not found or expired", { status: 404 });
    }

    const { html, title } = reportsMap.get(id);
    
    // Return HTML page with a script that automatically calls print()
    const pageHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>
    @page { margin: 2cm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; color: #1a1a1a; line-height: 1.7; font-size: 14px; max-width: 800px; margin: 0 auto; padding: 0 20px; }
    h1 { font-size: 28px; margin-top: 0; page-break-before: avoid; }
    h2 { font-size: 22px; margin-top: 2em; page-break-after: avoid; }
    h3 { font-size: 18px; page-break-after: avoid; }
    table { border-collapse: collapse; width: 100%; margin: 1em 0; page-break-inside: avoid; }
    th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
    th { background: #f5f5f5; font-weight: 600; }
    tr:nth-child(even) { background: #fafafa; }
    a { color: #2563eb; text-decoration: none; }
    img { max-width: 100%; }
    hr { border: none; border-top: 1px solid #ddd; margin: 2em 0; }
    pre { background: #f5f5f5; padding: 12px; border-radius: 6px; overflow-x: auto; font-size: 13px; }
    code { background: #f0f0f0; padding: 1px 4px; border-radius: 3px; font-size: 13px; }
    pre code { background: none; padding: 0; }
    @media print { body { max-width: none; } }
  </style>
</head>
<body>
  ${html}
  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 500);
    };
  </script>
</body>
</html>`;

    return new Response(pageHtml, {
      headers: {
        "Content-Type": "text/html; charset=utf-8"
      }
    });
  } catch (error: any) {
    return new Response("Internal Server Error", { status: 500 });
  }
}
