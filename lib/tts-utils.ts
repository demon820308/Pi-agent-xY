/**
 * Utilities for detecting and classifying Xiaomi MiMo and other TTS / Speech models.
 */

export function isTtsModel(provider: string | undefined | null, modelId: string | undefined | null): boolean {
  if (!modelId) return false;
  const mid = modelId.toLowerCase();
  const pid = provider?.toLowerCase() || "";
  
  // Broad detection for any speech synthesis or audio-generation models
  return (
    mid.includes("tts") ||
    mid.includes("voiceclone") ||
    mid.includes("voicedesign") ||
    mid.includes("audio-gen") ||
    pid.includes("mimo-tts")
  );
}

export function isVoiceCloneModel(provider: string | undefined | null, modelId: string | undefined | null): boolean {
  if (!modelId) return false;
  const mid = modelId.toLowerCase();
  return mid.includes("voiceclone") || mid.includes("clone");
}

export function isVoiceDesignModel(provider: string | undefined | null, modelId: string | undefined | null): boolean {
  if (!modelId) return false;
  const mid = modelId.toLowerCase();
  return mid.includes("voicedesign") || mid.includes("design");
}

export function isBaseTtsModel(provider: string | undefined | null, modelId: string | undefined | null): boolean {
  if (!modelId) return false;
  return isTtsModel(provider, modelId) && !isVoiceCloneModel(provider, modelId) && !isVoiceDesignModel(provider, modelId);
}

/**
 * Clean up text content to remove file attachment notes or upload headers before synthesis.
 */
export function cleanSpeechText(text: string): string {
  if (!text) return "";
  
  let cleaned = text;

  // 1. Prioritize HTML comment tag-based extraction
  const startMarker = "<!-- PI_FILE_ATTACHMENTS_START -->";
  const endMarker = "<!-- PI_FILE_ATTACHMENTS_END -->";

  if (cleaned.includes(startMarker)) {
    const startIndex = cleaned.indexOf(startMarker);
    const endIndex = cleaned.indexOf(endMarker);
    if (endIndex !== -1 && endIndex > startIndex) {
      cleaned = cleaned.substring(0, startIndex) + cleaned.substring(endIndex + endMarker.length);
    } else {
      cleaned = cleaned.substring(0, startIndex);
    }
  }
  
  // 2. Fallback to regular expression replacement for older session compatibility
  // 2.1 Strip the block starting with the upload banner emoji and everything after it (since it's appended at the end)
  cleaned = cleaned.replace(/📄\s*\[已上传文件到工作区\][\s\S]*/g, "");
  
  // 2.2 Also strip any individual Temp file lines like: "- Temp/seedtts_ref_zh_3.wav (544.32 KB)" or similar variants
  cleaned = cleaned.replace(/^[-\*\s•]*temp\/[^\r\n]*/gim, "");
  
  // 2.3 Strip standalone upload banner lines
  cleaned = cleaned.replace(/^📄\s*\[已上传文件到工作区\][^\r\n]*/gim, "");
  
  return cleaned.trim();
}
