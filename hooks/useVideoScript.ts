"use client";

import { useCallback, useRef, useState } from "react";
import { isVideoFile } from "@/lib/video-file";

type PipelineState = "idle" | "extracting" | "transcribing" | "polishing" | "done" | "error";

interface UseVideoScriptOptions {
  language?: string;
  onComplete?: (text: string) => void;
  onError?: (error: string) => void;
}

interface UseVideoScriptReturn {
  state: PipelineState;
  progress: number;
  statusText: string;
  result: string;
  process: (file: File, polishModel?: { provider: string; modelId: string } | null) => Promise<string>;
  processLink: (url: string, polishModel?: { provider: string; modelId: string } | null) => Promise<string>;
  reset: () => void;
}

export function useVideoScript(opts: UseVideoScriptOptions = {}): UseVideoScriptReturn {
  const [state, setState] = useState<PipelineState>("idle");
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("");
  const [result, setResult] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const runPipeline = useCallback(async (
    file: File,
    polishModel: { provider: string; modelId: string } | null | undefined,
    abortCtrl: AbortController,
  ): Promise<string> => {
    setState("extracting");
    setStatusText("Loading audio extractor (first time ~30MB)...");
    setProgress(0.02);

    const { extractAudioFromVideo } = await import("@/lib/video-audio-extractor");
    const { data: audioData } = await extractAudioFromVideo(file, {
      format: "wav",
      sampleRate: 16000,
      channels: 1,
      onProgress: (p) => setProgress(0.05 + p * 0.45),
    });

    if (abortCtrl.signal.aborted) return "";

    setState("transcribing");
    setStatusText("Loading Whisper model...");
    setProgress(0.5);

    const { transcribeWithWhisper } = await import("@/lib/whisper-transcribe");
    let text = await transcribeWithWhisper(audioData, opts.language || "zh-CN", (p) => {
      setProgress(0.5 + p * 0.4);
    });

    if (abortCtrl.signal.aborted) return "";
    if (!text.trim()) throw new Error("No speech detected in the video");

    if (polishModel) {
      setState("polishing");
      setStatusText("Adding punctuation and polishing with LLM...");
      setProgress(0.92);
      try {
        const polishRes = await fetch("/api/pipeline/polish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text,
            provider: polishModel.provider,
            modelId: polishModel.modelId,
          }),
          signal: abortCtrl.signal,
        });

        if (polishRes.ok) {
          const data = await polishRes.json();
          if (data.text) text = data.text;
        } else {
          const errData = await polishRes.json().catch(() => ({}));
          console.warn("[useVideoScript] Polishing failed:", errData.error || `HTTP ${polishRes.status}`);
        }
      } catch (e) {
        console.warn("[useVideoScript] Error during polishing:", e);
      }
    }

    setResult(text);
    setState("done");
    setStatusText(`Extracted ${text.length} characters`);
    setProgress(1);
    opts.onComplete?.(text);
    return text;
  }, [opts]);

  const process = useCallback(async (
    file: File,
    polishModel?: { provider: string; modelId: string } | null,
  ): Promise<string> => {
    if (!isVideoFile(file)) {
      const err = `Not a video file: ${file.name}`;
      setState("error");
      setStatusText(err);
      opts.onError?.(err);
      return "";
    }

    const abortCtrl = new AbortController();
    abortRef.current = abortCtrl;
    setResult("");
    setProgress(0);

    try {
      return await runPipeline(file, polishModel, abortCtrl);
    } catch (e: unknown) {
      if (abortCtrl.signal.aborted) {
        setState("idle");
        return "";
      }
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[useVideoScript]", msg);
      setState("error");
      setStatusText(msg);
      opts.onError?.(msg);
      return "";
    }
  }, [opts, runPipeline]);

  const processLink = useCallback(async (
    url: string,
    polishModel?: { provider: string; modelId: string } | null,
  ): Promise<string> => {
    const abortCtrl = new AbortController();
    abortRef.current = abortCtrl;
    setResult("");
    setProgress(0.01);
    setState("extracting");
    setStatusText("Resolving link and downloading audio...");

    try {
      const res = await fetch("/api/pipeline/parse-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
        signal: abortCtrl.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Failed to resolve link: HTTP ${res.status}`);
      }

      if (abortCtrl.signal.aborted) return "";

      const blob = await res.blob();
      const contentType = res.headers.get("content-type") || "audio/mpeg";
      const ext = contentType.includes("wav")
        ? "wav"
        : contentType.includes("webm")
          ? "webm"
          : contentType.includes("mp4")
            ? "mp4"
            : contentType.includes("m4a")
              ? "m4a"
              : "mp3";
      const file = new File([blob], `parsed_audio.${ext}`, { type: contentType });

      return await runPipeline(file, polishModel, abortCtrl);
    } catch (e: unknown) {
      if (abortCtrl.signal.aborted) {
        setState("idle");
        return "";
      }
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[useVideoScript]", msg);
      setState("error");
      setStatusText(msg);
      opts.onError?.(msg);
      return "";
    }
  }, [opts, runPipeline]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState("idle");
    setProgress(0);
    setStatusText("");
    setResult("");
  }, []);

  return { state, progress, statusText, result, process, processLink, reset };
}
