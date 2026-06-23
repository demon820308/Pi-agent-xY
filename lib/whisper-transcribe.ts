"use client";

let whisperPipeline: unknown = null;
let whisperLoadPromise: Promise<unknown> | null = null;

async function getWhisperPipeline() {
  if (whisperPipeline) return whisperPipeline;
  if (whisperLoadPromise) return whisperLoadPromise;

  whisperLoadPromise = (async () => {
    try {
      const { pipeline } = await import("@huggingface/transformers");
      try {
        whisperPipeline = await pipeline("automatic-speech-recognition", "Xenova/whisper-small", { device: "webgpu" });
      } catch {
        whisperPipeline = await pipeline("automatic-speech-recognition", "Xenova/whisper-small");
      }
      return whisperPipeline;
    } catch (e) {
      console.error("[Whisper] Failed to load model:", e);
      throw new Error("Whisper model could not be loaded.");
    }
  })();

  return whisperLoadPromise;
}

export async function transcribeWithWhisper(
  audioData: Uint8Array,
  language = "zh-CN",
  onProgress?: (p: number) => void,
): Promise<string> {
  onProgress?.(0.1);
  const transcriber = await getWhisperPipeline() as (
    audio: Float32Array,
    options: Record<string, unknown>,
  ) => Promise<{ text?: string }>;
  onProgress?.(0.5);

  const samples = decodeWavToFloat32(audioData);
  onProgress?.(0.6);

  const lang = language === "zh-CN" ? "chinese" : language === "en-US" ? "english" : language || undefined;
  const chunkDuration = 30 * 16000;
  const totalChunks = Math.ceil(samples.length / chunkDuration);
  const texts: string[] = [];

  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkDuration;
    const end = Math.min(start + chunkDuration, samples.length);
    const chunk = samples.slice(start, end);
    const result = await transcriber(chunk, {
      ...(lang ? { language: lang } : {}),
      task: "transcribe",
      initial_prompt: lang === "chinese" ? "以下是普通话的句子。" : undefined,
    });
    texts.push((result?.text ?? "").trim());
    onProgress?.(0.6 + 0.4 * ((i + 1) / totalChunks));
  }

  return texts.filter(Boolean).join("\n");
}

function decodeWavToFloat32(wavData: Uint8Array): Float32Array {
  let dataOffset = 44;
  for (let i = 0; i < wavData.length - 4; i++) {
    if (wavData[i] === 0x64 && wavData[i + 1] === 0x61 && wavData[i + 2] === 0x74 && wavData[i + 3] === 0x61) {
      dataOffset = i + 8;
      break;
    }
  }

  const dataView = new DataView(wavData.buffer, wavData.byteOffset + dataOffset);
  const numSamples = Math.floor((wavData.length - dataOffset) / 2);
  const samples = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    samples[i] = dataView.getInt16(i * 2, true) / 32768.0;
  }
  return samples;
}
