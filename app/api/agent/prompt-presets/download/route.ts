import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import JSZip from "jszip";
import { getAppRoot } from "@/lib/app-root";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: any) => {
        try {
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch (e) {
          // Stream already closed or client disconnected
        }
      };

      try {
        const repoRoot = path.join(getAppRoot(), "awesome-gpt-image-2-API-and-Prompts-main");
        
        // If repoRoot already exists, check if cases and images exist
        if (fs.existsSync(repoRoot) && fs.existsSync(path.join(repoRoot, "cases"))) {
          send({ stage: "done", progress: 100, message: "资源已存在" });
          controller.close();
          return;
        }

        send({ stage: "downloading", progress: 0, message: "正在获取下载地址..." });

        const zipUrl = "https://github.com/demon820308/awesome-gpt-image-2-API-and-Prompts/archive/refs/heads/main.zip";
        const response = await fetch(zipUrl);
        if (!response.ok) {
          throw new Error(`下载请求失败，HTTP状态码: ${response.status}`);
        }

        const totalBytesStr = response.headers.get("content-length");
        const totalBytes = totalBytesStr ? parseInt(totalBytesStr, 10) : 0;
        
        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("无法读取响应体流");
        }

        const chunks: Uint8Array[] = [];
        let bytesReceived = 0;
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
            bytesReceived += value.length;
            
            const progress = totalBytes > 0 ? Math.round((bytesReceived / totalBytes) * 100) : 0;
            send({
              stage: "downloading",
              progress,
              loaded: bytesReceived,
              total: totalBytes,
              message: totalBytes > 0 
                ? `正在下载: ${(bytesReceived / 1024 / 1024).toFixed(2)}MB / ${(totalBytes / 1024 / 1024).toFixed(2)}MB`
                : `正在下载: ${(bytesReceived / 1024 / 1024).toFixed(2)}MB`
            });
          }
        }

        send({ stage: "extracting", progress: 0, message: "下载完成，正在解析 ZIP 文件..." });

        const zipBuffer = new Uint8Array(bytesReceived);
        let offset = 0;
        for (const chunk of chunks) {
          zipBuffer.set(chunk, offset);
          offset += chunk.length;
        }

        const zip = await JSZip.loadAsync(zipBuffer);
        const allFiles = Object.keys(zip.files);
        
        const targetPrefixes = [
          "awesome-gpt-image-2-API-and-Prompts-main/cases/",
          "awesome-gpt-image-2-API-and-Prompts-main/images/"
        ];
        
        const filesToExtract = allFiles.filter(name => {
          const isTarget = targetPrefixes.some(pref => name.startsWith(pref));
          const isDir = zip.files[name].dir;
          return isTarget && !isDir;
        });

        const totalFiles = filesToExtract.length;
        if (totalFiles === 0) {
          throw new Error("ZIP 文件中未找到 cases 或 images 目录");
        }

        send({ stage: "extracting", progress: 0, message: `开始解压，共 ${totalFiles} 个文件...` });

        const installDir = getAppRoot();

        for (let i = 0; i < totalFiles; i++) {
          const fileName = filesToExtract[i];
          const file = zip.files[fileName];
          
          const destPath = path.join(installDir, fileName);

          const destDir = path.dirname(destPath);
          if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
          }

          const content = await file.async("nodebuffer");
          fs.writeFileSync(destPath, content);

          const progress = Math.round(((i + 1) / totalFiles) * 100);
          send({
            stage: "extracting",
            progress,
            current: i + 1,
            total: totalFiles,
            message: `正在解压: ${i + 1} / ${totalFiles} (${progress}%)`
          });
        }

        send({ stage: "done", progress: 100, message: "解压完成，资源已就绪" });
        controller.close();
      } catch (err: any) {
        console.error("[prompt-presets-download] Error:", err);
        send({ stage: "error", message: err.message || "未知错误" });
        try {
          controller.close();
        } catch {}
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no"
    }
  });
}
