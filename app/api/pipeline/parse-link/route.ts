import { NextResponse } from "next/server";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { url } = await req.json() as { url?: string };
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    const trimmedUrl = url.trim();
    if (!trimmedUrl.startsWith("http://") && !trimmedUrl.startsWith("https://")) {
      return NextResponse.json({ error: "Invalid URL protocol. Must start with http:// or https://" }, { status: 400 });
    }

    console.log(`[parse-link] Resolving audio stream URL for: ${trimmedUrl}`);

    let targetUrl = trimmedUrl;
    let initialReferer = "https://www.douyin.com/";

    try {
      const parsedInputUrl = new URL(trimmedUrl);
      if (parsedInputUrl.hostname.includes("bilibili.com") || parsedInputUrl.hostname.includes("b23.tv")) {
        initialReferer = "https://www.bilibili.com/";
      } else if (parsedInputUrl.hostname.includes("youtube.com") || parsedInputUrl.hostname.includes("youtu.be")) {
        initialReferer = "https://www.youtube.com/";
      } else if (parsedInputUrl.hostname.includes("xiaohongshu.com") || parsedInputUrl.hostname.includes("xhslink.com")) {
        initialReferer = "https://www.xiaohongshu.com/";
      } else if (parsedInputUrl.hostname.includes("kuaishou.com") || parsedInputUrl.hostname.includes("chengjiazhuang.cn")) {
        initialReferer = "https://www.kuaishou.com/";
      }
    } catch (e) {
      // ignore
    }

    // 1. Resolve redirect to handle short links and find the final URL
    try {
      const response = await fetch(targetUrl, {
        method: "HEAD",
        redirect: "follow",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Referer": initialReferer
        }
      });
      targetUrl = response.url;
    } catch (e) {
      console.warn(`[parse-link] Failed to resolve redirect via HEAD, trying GET:`, e);
      try {
        const response = await fetch(targetUrl, {
          method: "GET",
          redirect: "follow",
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Referer": initialReferer
          }
        });
        targetUrl = response.url;
      } catch (e2) {
        console.error(`[parse-link] Redirection resolution failed completely:`, e2);
      }
    }

    console.log(`[parse-link] Resolved redirect URL: ${targetUrl}`);

    // 2. Normalize and rewrite unsupported Douyin URL formats (e.g. jingxuan course modals)
    const modalIdMatch = targetUrl.match(/[?&]modal_id=(\d+)/);
    if (modalIdMatch) {
      const videoId = modalIdMatch[1];
      targetUrl = `https://www.douyin.com/video/${videoId}`;
      console.log(`[parse-link] Rewrote modal_id URL to standard video URL: ${targetUrl}`);
    }

    // Build yt-dlp arguments dynamically, adding cookies if cookies.txt is present in project root or system home
    const args = ["-g", "-f", "bestaudio/best"];
    const localCookiesPath = path.join(process.cwd(), "cookies.txt");
    const persistentCookiesPath = path.join(os.homedir(), ".pi", "agent", "cookies.txt");
    
    let cookiesPath = "";
    if (fs.existsSync(localCookiesPath)) {
      cookiesPath = localCookiesPath;
      console.log(`[parse-link] Using local cookies.txt from: ${cookiesPath}`);
    } else if (fs.existsSync(persistentCookiesPath)) {
      cookiesPath = persistentCookiesPath;
      console.log(`[parse-link] Using persistent cookies.txt from: ${cookiesPath}`);
    }

    if (cookiesPath) {
      args.push("--cookies", cookiesPath);
    }
    args.push(targetUrl);

    // Spawn yt-dlp to get the direct audio URL without downloading the file
    const child = spawn("yt-dlp", args);
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    const exitCode = await new Promise<number | null>((resolve) => {
      child.on("close", resolve);
    });

    if (exitCode !== 0) {
      console.error(`[parse-link] yt-dlp failed with code ${exitCode}. Stderr: ${stderr}`);
      return NextResponse.json({
        error: `Failed to resolve video stream: ${stderr.trim() || "Unknown error from yt-dlp"}`
      }, { status: 400 });
    }

    const audioUrl = stdout.trim();
    if (!audioUrl) {
      return NextResponse.json({ error: "Could not find audio track in this video" }, { status: 400 });
    }

    console.log(`[parse-link] Successfully resolved audio stream URL: ${audioUrl.substring(0, 80)}...`);

    // 3. Determine correct Referer for downloading the CDN stream
    let downloadReferer = "https://www.douyin.com/";
    try {
      const urlObj = new URL(targetUrl);
      if (urlObj.hostname.includes("bilibili.com") || urlObj.hostname.includes("bilivideo.com")) {
        downloadReferer = "https://www.bilibili.com/";
      } else if (urlObj.hostname.includes("youtube.com") || urlObj.hostname.includes("youtu.be")) {
        downloadReferer = "https://www.youtube.com/";
      } else if (urlObj.hostname.includes("xiaohongshu.com") || urlObj.hostname.includes("xhslink.com")) {
        downloadReferer = "https://www.xiaohongshu.com/";
      } else if (urlObj.hostname.includes("kuaishou.com") || urlObj.hostname.includes("gifshow.com")) {
        downloadReferer = "https://www.kuaishou.com/";
      } else {
        const audioUrlObj = new URL(audioUrl);
        downloadReferer = `${audioUrlObj.protocol}//${audioUrlObj.hostname}/`;
      }
    } catch (e) {
      // ignore
    }

    // Fetch the audio stream from the CDN
    const audioResponse = await fetch(audioUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": downloadReferer
      }
    });

    if (!audioResponse.ok) {
      return NextResponse.json({
        error: `Failed to fetch audio stream from CDN: HTTP ${audioResponse.status}`
      }, { status: 502 });
    }

    // Get content type and audio data
    const contentType = audioResponse.headers.get("content-type") || "audio/mpeg";
    const arrayBuffer = await audioResponse.arrayBuffer();

    // Stream the audio data back to the client
    return new NextResponse(arrayBuffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-cache"
      }
    });

  } catch (error) {
    console.error("[parse-link] Unexpected error:", error);
    return NextResponse.json({ error: `Server error: ${String(error)}` }, { status: 500 });
  }
}
